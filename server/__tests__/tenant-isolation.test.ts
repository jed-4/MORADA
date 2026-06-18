/**
 * Cross-tenant isolation integration tests.
 *
 * Verifies that the server-side ownership checks added for the estimate /
 * selection / schedule by-id routes (enforceProjectCompany) and the checklist
 * template / group / item routes (getOwnedTemplate / getOwnedGroup /
 * getOwnedItem) actually prevent one company from reading or mutating another
 * company's data:
 *   - a user in company B gets 403 when targeting company A's record
 *   - any user gets 404 when targeting a non-existent id
 *   - created / imported / duplicated checklist templates are stamped with the
 *     caller's companyId
 *
 * The test boots the real Express app (registerRoutes) on an ephemeral port
 * with NODE_ENV=test so authentication and the ownership guards are strictly
 * enforced (the development auth bypass only fires for NODE_ENV=development,
 * and the production DB guard only fires for NODE_ENV=production — so "test"
 * gives us strict auth against the dev database). It creates two companies with
 * their own users + records directly through the storage layer, logs in over
 * HTTP, and exercises every protected route as company B.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/tenant-isolation.test.ts
 *
 * NOTE: this is an integration test — it talks to the same database the dev
 * server uses. All rows it creates are namespaced to two throwaway companies
 * and are deleted again in the cleanup phase.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import express from "express";
import assert from "node:assert";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { pool } from "../db";

const NONE = "00000000-0000-0000-0000-000000000000";

let baseUrl = "";
let httpServer: any = null;

// ---------------------------------------------------------------------------
// Tiny test harness (custom, so we control process exit — the session store's
// internal prune timer + pg pool would otherwise keep node:test from exiting).
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.error(`  \u2717 ${name}\n      ${err?.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function extractCookie(res: Response): string | null {
  const setCookies = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of setCookies) {
    if (c.startsWith("connect.sid=")) return c.split(";")[0];
  }
  return null;
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string | null; body?: any } = {},
): Promise<{ status: number; body: any; raw: Response }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // Required: cookie is `secure` + app uses `trust proxy`, so express-session
      // only issues / accepts the session cookie when it believes the connection
      // is HTTPS. Spoof the proxy header so the session is established over the
      // plain-HTTP test connection.
      "X-Forwarded-Proto": "https",
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, raw: res };
}

interface Tenant {
  userId: string;
  email: string;
  password: string;
  companyId: string;
  cookie: string;
}

async function createTenant(label: string): Promise<Tenant> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `tenant-test-${label}-${unique}@tenanttest.local`;
  const password = "TenantTest123!";

  const reg = await api("POST", "/api/auth/register", {
    body: { email, password, firstName: label, lastName: "TenantTest" },
  });
  assert.strictEqual(reg.status, 200, `register ${label} failed: ${JSON.stringify(reg.body)}`);
  const userId = reg.body.user.id;

  // Attaching a company also assigns the user the General Manager (admin) role,
  // which clears requirePermission gates so the ownership checks are what's
  // actually under test.
  const company = await storage.createCompany(
    { name: `Tenant Test Co ${label} ${unique}` } as any,
    userId,
  );

  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.strictEqual(login.status, 200, `login ${label} failed: ${JSON.stringify(login.body)}`);
  const cookie = extractCookie(login.raw);
  assert.ok(cookie, `no session cookie for ${label}`);

  return { userId, email, password, companyId: company.id, cookie: cookie! };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = await registerRoutes(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = httpServer.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  console.log(`\nCross-tenant isolation tests (server on ${baseUrl})\n`);

  const A = await createTenant("A");
  const B = await createTenant("B");

  // --- Company A's records (the "victim" data B will try to reach) ---
  const projectA = await storage.createProject({
    name: "Tenant A Project",
    companyId: A.companyId,
    ownerId: A.userId,
    projectSubStatus: "lead_new",
  } as any);
  const estimateA = await storage.createEstimate({ name: "Estimate A", projectId: projectA.id } as any);
  const selectionA = await storage.createSelection({ name: "Selection A", projectId: projectA.id } as any);
  const scheduleA = await storage.createSchedule({ projectId: projectA.id } as any);
  const templateA = await storage.createChecklistTemplate({
    name: "Template A",
    type: "Job",
    companyId: A.companyId,
  } as any);
  const groupA = await storage.createChecklistTemplateGroup({ templateId: templateA.id, name: "Group A" } as any);
  const itemA = await storage.createChecklistTemplateItem({ groupId: groupA.id, description: "Item A" } as any);

  // --- Company B owns its own template/group so we can prove that even when
  //     the *source* is owned, a cross-tenant *target* is rejected. ---
  const templateB = await storage.createChecklistTemplate({
    name: "Template B",
    type: "Job",
    companyId: B.companyId,
  } as any);
  const groupB = await storage.createChecklistTemplateGroup({ templateId: templateB.id, name: "Group B" } as any);

  // Helper: assert a route returns 403 for A's record and 404 for a missing id,
  // when called as company B.
  async function crossTenant(
    label: string,
    method: string,
    pathForA: string,
    pathForMissing: string,
    body?: any,
  ) {
    await test(`${label}: company B \u2192 403 on company A's record`, async () => {
      const r = await api(method, pathForA, { cookie: B.cookie, body });
      assert.strictEqual(r.status, 403, `expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test(`${label}: \u2192 404 on non-existent id`, async () => {
      const r = await api(method, pathForMissing, { cookie: B.cookie, body });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
  }

  try {
    // ---- Positive controls: company A reaches its own data ----
    await test("control: company A can GET its own estimate", async () => {
      const r = await api("GET", `/api/estimates/${estimateA.id}`, { cookie: A.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("control: company A can GET its own checklist template", async () => {
      const r = await api("GET", `/api/checklist-templates/${templateA.id}`, { cookie: A.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("control: unauthenticated request is rejected (401)", async () => {
      const r = await api("GET", `/api/estimates/${estimateA.id}`);
      assert.strictEqual(r.status, 401, `expected 401, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    // ---- Estimates (enforceProjectCompany) ----
    await crossTenant("GET /api/estimates/:id", "GET", `/api/estimates/${estimateA.id}`, `/api/estimates/${NONE}`);
    await crossTenant("PATCH /api/estimates/:id", "PATCH", `/api/estimates/${estimateA.id}`, `/api/estimates/${NONE}`, { notes: "hacked" });
    await crossTenant("DELETE /api/estimates/:id", "DELETE", `/api/estimates/${estimateA.id}`, `/api/estimates/${NONE}`);

    // ---- Selections (enforceProjectCompany) ----
    await crossTenant("GET /api/selections/:id", "GET", `/api/selections/${selectionA.id}`, `/api/selections/${NONE}`);
    await crossTenant("PATCH /api/selections/:id", "PATCH", `/api/selections/${selectionA.id}`, `/api/selections/${NONE}`, { notes: "hacked" });
    await crossTenant("DELETE /api/selections/:id", "DELETE", `/api/selections/${selectionA.id}`, `/api/selections/${NONE}`);

    // ---- Schedules (enforceProjectCompany) ----
    await crossTenant("PATCH /api/schedules/:id", "PATCH", `/api/schedules/${scheduleA.id}`, `/api/schedules/${NONE}`, { notes: "hacked" });
    await crossTenant("PATCH /api/schedules/:id/working-days", "PATCH", `/api/schedules/${scheduleA.id}/working-days`, `/api/schedules/${NONE}/working-days`, { includeSaturday: true });
    await crossTenant("PUT /api/schedules/:id/status", "PUT", `/api/schedules/${scheduleA.id}/status`, `/api/schedules/${NONE}/status`, { status: "online" });
    await crossTenant("PATCH /api/schedules/:id/online", "PATCH", `/api/schedules/${scheduleA.id}/online`, `/api/schedules/${NONE}/online`, { isOnline: true });
    await crossTenant("DELETE /api/schedules/:id", "DELETE", `/api/schedules/${scheduleA.id}`, `/api/schedules/${NONE}`);

    // ---- Checklist templates (getOwnedTemplate) ----
    await crossTenant("GET /api/checklist-templates/:id", "GET", `/api/checklist-templates/${templateA.id}`, `/api/checklist-templates/${NONE}`);
    await crossTenant("PATCH /api/checklist-templates/:id", "PATCH", `/api/checklist-templates/${templateA.id}`, `/api/checklist-templates/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/checklist-templates/:id", "DELETE", `/api/checklist-templates/${templateA.id}`, `/api/checklist-templates/${NONE}`);
    await crossTenant("POST /api/checklist-templates/:id/duplicate", "POST", `/api/checklist-templates/${templateA.id}/duplicate`, `/api/checklist-templates/${NONE}/duplicate`);
    await crossTenant("GET /api/checklist-templates/:templateId/groups", "GET", `/api/checklist-templates/${templateA.id}/groups`, `/api/checklist-templates/${NONE}/groups`);
    await crossTenant("POST /api/checklist-templates/:templateId/groups/reorder", "POST", `/api/checklist-templates/${templateA.id}/groups/reorder`, `/api/checklist-templates/${NONE}/groups/reorder`, { orderedGroupIds: [groupA.id] });

    // ---- Checklist groups (getOwnedGroup; create takes templateId in the body) ----
    await test("POST /api/checklist-template-groups: company B \u2192 403 targeting company A's template", async () => {
      const r = await api("POST", "/api/checklist-template-groups", { cookie: B.cookie, body: { templateId: templateA.id, name: "x" } });
      assert.strictEqual(r.status, 403, `expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("POST /api/checklist-template-groups: \u2192 404 non-existent template", async () => {
      const r = await api("POST", "/api/checklist-template-groups", { cookie: B.cookie, body: { templateId: NONE, name: "x" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    await crossTenant("PATCH /api/checklist-template-groups/:id", "PATCH", `/api/checklist-template-groups/${groupA.id}`, `/api/checklist-template-groups/${NONE}`, { name: "hacked" });
    await crossTenant("DELETE /api/checklist-template-groups/:id", "DELETE", `/api/checklist-template-groups/${groupA.id}`, `/api/checklist-template-groups/${NONE}`);

    // move-to: source in path, target in body
    await crossTenant("POST /api/checklist-template-groups/:id/move-to (source A)", "POST", `/api/checklist-template-groups/${groupA.id}/move-to`, `/api/checklist-template-groups/${NONE}/move-to`, { targetGroupId: groupB.id });
    await test("POST move-to: company B \u2192 403 when target group belongs to A", async () => {
      const r = await api("POST", `/api/checklist-template-groups/${groupB.id}/move-to`, { cookie: B.cookie, body: { targetGroupId: groupA.id } });
      assert.strictEqual(r.status, 403, `expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    // move-to-template: source group in path, target template in body
    await crossTenant("POST /api/checklist-template-groups/:id/move-to-template (source A)", "POST", `/api/checklist-template-groups/${groupA.id}/move-to-template`, `/api/checklist-template-groups/${NONE}/move-to-template`, { targetTemplateId: templateB.id });
    await test("POST move-to-template: company B \u2192 403 when target template belongs to A", async () => {
      const r = await api("POST", `/api/checklist-template-groups/${groupB.id}/move-to-template`, { cookie: B.cookie, body: { targetTemplateId: templateA.id } });
      assert.strictEqual(r.status, 403, `expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
    });

    // ---- Checklist items (getOwnedItem; create takes groupId in body) ----
    await crossTenant("GET /api/checklist-template-groups/:groupId/items", "GET", `/api/checklist-template-groups/${groupA.id}/items`, `/api/checklist-template-groups/${NONE}/items`);
    await test("POST /api/checklist-template-items: company B \u2192 403 targeting company A's group", async () => {
      const r = await api("POST", "/api/checklist-template-items", { cookie: B.cookie, body: { groupId: groupA.id, description: "x" } });
      assert.strictEqual(r.status, 403, `expected 403, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await test("POST /api/checklist-template-items: \u2192 404 non-existent group", async () => {
      const r = await api("POST", "/api/checklist-template-items", { cookie: B.cookie, body: { groupId: NONE, description: "x" } });
      assert.strictEqual(r.status, 404, `expected 404, got ${r.status}: ${JSON.stringify(r.body)}`);
    });
    await crossTenant("PATCH /api/checklist-template-items/:id", "PATCH", `/api/checklist-template-items/${itemA.id}`, `/api/checklist-template-items/${NONE}`, { description: "hacked" });
    await crossTenant("DELETE /api/checklist-template-items/:id", "DELETE", `/api/checklist-template-items/${itemA.id}`, `/api/checklist-template-items/${NONE}`);

    // ---- Stamping: created / imported / duplicated templates carry caller's company ----
    await test("POST /api/checklist-templates stamps the caller's companyId", async () => {
      const r = await api("POST", "/api/checklist-templates", { cookie: B.cookie, body: { name: `B Created ${Date.now()}`, type: "Job" } });
      assert.strictEqual(r.status, 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.companyId, B.companyId, "created template not stamped with company B");
    });

    await test("POST /api/checklist-templates/import stamps the caller's companyId (and is invisible to A)", async () => {
      const name = `B Imported ${Date.now()}`;
      const r = await api("POST", "/api/checklist-templates/import", {
        cookie: B.cookie,
        body: { items: [{ templateName: name, type: "Job", groupName: "G1", itemDescription: "I1" }] },
      });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.templatesCreated, 1, "import did not create the template");
      const bTemplates = await storage.getChecklistTemplates(undefined, B.companyId);
      const found = bTemplates.find((t) => t.name === name);
      assert.ok(found, "imported template not visible to company B");
      assert.strictEqual(found!.companyId, B.companyId, "imported template not stamped with company B");
      const aTemplates = await storage.getChecklistTemplates(undefined, A.companyId);
      assert.ok(!aTemplates.find((t) => t.name === name), "imported template leaked to company A");
    });

    await test("POST /api/checklist-templates/:id/duplicate stamps the caller's companyId", async () => {
      const r = await api("POST", `/api/checklist-templates/${templateB.id}/duplicate`, { cookie: B.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.companyId, B.companyId, "duplicated template not stamped with company B");
    });

    // ---- Export is company-scoped: B's export must not leak A's templates/items ----
    await test("GET /api/checklist-templates/export: company B export excludes company A's data", async () => {
      const r = await api("GET", "/api/checklist-templates/export", { cookie: B.cookie });
      assert.strictEqual(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.ok(Array.isArray(r.body), "export did not return an array");
      const leakedTemplate = r.body.some((row: any) => row.templateName === templateA.name);
      assert.ok(!leakedTemplate, "company A's template name leaked into company B's export");
      const leakedItem = r.body.some((row: any) => row.itemDescription === itemA.description);
      assert.ok(!leakedItem, "company A's item leaked into company B's export");
    });

    // ---- Final proof company A's records were never mutated/deleted by B ----
    await test("company A's estimate still exists after B's attempts", async () => {
      const e = await storage.getEstimate(estimateA.id);
      assert.ok(e, "company A's estimate was deleted by company B");
    });
    await test("company A's checklist template still exists after B's attempts", async () => {
      const t = await storage.getChecklistTemplate(templateA.id);
      assert.ok(t, "company A's template was deleted by company B");
    });
  } finally {
    await cleanup([A.companyId, B.companyId], [A.userId, B.userId]);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error("Failed tests:\n  - " + failures.join("\n  - "));
  }
}

async function cleanup(companyIds: string[], userIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM checklist_template_items WHERE group_id IN (SELECT g.id FROM checklist_template_groups g JOIN checklist_templates t ON g.template_id = t.id WHERE t.company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM checklist_template_groups WHERE template_id IN (SELECT id FROM checklist_templates WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM checklist_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM estimates WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM schedules WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM selections WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM projects WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM user_roles WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM sessions WHERE sess->>'userId' = ANY($1)`, [userIds]],
    [`DELETE FROM users WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM user_roles WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM companies WHERE id = ANY($1)`, [companyIds]],
  ];
  for (const [sql, params] of stmts) {
    try {
      await pool.query(sql, params);
    } catch (err: any) {
      console.warn(`[cleanup] skipped: ${err?.message || err}`);
    }
  }
}

main()
  .then(async () => {
    try {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("\nFATAL: test harness crashed\n", err);
    try {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });

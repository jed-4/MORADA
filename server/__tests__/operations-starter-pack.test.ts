/**
 * Operations starter pack: what a company gets, that it gets it once, that a
 * deleted copy stays deleted, that nothing lands in another company, and who
 * may install it.
 *
 * Same harness as operations-tenancy.test.ts: the real Express app on an
 * ephemeral port, NODE_ENV=test (strict auth and permission checks), the dev
 * database, throwaway companies deleted at the end.
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/operations-starter-pack.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import express from "express";
import assert from "node:assert";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { pool } from "../db";
import { readFileSync } from "node:fs";
import { STARTER_DOCS, STARTER_TASKS, STARTER_FOLDERS, installStarterPack } from "../services/operationsStarterPack";

let baseUrl = "";
let httpServer: any = null;
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

const HEADERS = { "Content-Type": "application/json", "X-Forwarded-Proto": "https" };

async function api(method: string, path: string, cookie: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...HEADERS, Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

async function register(label: string) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `ops-starter-${label}-${unique}@tenanttest.local`;
  const password = "TenantTest123!";
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email, password, firstName: label, lastName: "OpsStarter", agreeToTerms: true }),
  });
  const regText = await reg.text();
  assert.strictEqual(reg.status, 200, `register ${label}: ${regText}`);
  return { userId: JSON.parse(regText).user.id as string, email, password, unique };
}

async function login(email: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: HEADERS, body: JSON.stringify({ email, password }) });
  assert.strictEqual(res.status, 200, `login ${email}`);
  const cookie = ((res.headers as any).getSetCookie?.() ?? [])
    .find((c: string) => c.startsWith("connect.sid="))?.split(";")[0];
  assert.ok(cookie, `no session cookie for ${email}`);
  return cookie as string;
}

async function createTenant(label: string) {
  const u = await register(label);
  const company = await storage.createCompany({ name: `Ops Starter Co ${label} ${u.unique}` } as any, u.userId);
  return { userId: u.userId, companyId: company.id as string, cookie: await login(u.email, u.password) };
}

const count = async (table: string, companyId: string) =>
  Number((await pool.query(`SELECT count(*) FROM ${table} WHERE company_id = $1`, [companyId])).rows[0].count);

async function main() {
  const app = express();
  app.use(express.json());
  httpServer = await registerRoutes(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  console.log(`\nStarter pack tests (server on ${baseUrl})\n`);

  const A = await createTenant("A"); // General Manager → admin
  const B = await createTenant("B");
  const companyIds = [A.companyId, B.companyId];
  try {
    await test("the pack's own references are consistent", async () => {
      const docKeys = new Set(STARTER_DOCS.map((d) => d.key));
      const folderKeys = new Set(STARTER_FOLDERS.map((f) => f.key));
      const all = [...STARTER_FOLDERS, ...STARTER_DOCS, ...STARTER_TASKS].map((i) => i.key);
      assert.strictEqual(new Set(all).size, all.length, "duplicate item key");
      for (const d of STARTER_DOCS) assert.ok(folderKeys.has(d.folderKey), `${d.key} → unknown folder ${d.folderKey}`);
      for (const t of STARTER_TASKS) {
        assert.ok(docKeys.has(t.sopKey), `${t.key} → unknown SOP ${t.sopKey}`);
        assert.ok(t.days.length > 0, `${t.key} has no days, so it would never generate`);
      }
    });

    await test("status before install offers the whole pack", async () => {
      const r = await api("GET", "/api/operations/starter-pack", A.cookie);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body.available, { docs: STARTER_DOCS.length, tasks: STARTER_TASKS.length });
    });

    await test("install copies everything in: draft docs, inactive tasks linked to their SOPs", async () => {
      const r = await api("POST", "/api/operations/starter-pack", A.cookie);
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body, { folders: STARTER_FOLDERS.length, docs: STARTER_DOCS.length, tasks: STARTER_TASKS.length });

      const docs = (await api("GET", "/api/docs", A.cookie)).body;
      assert.strictEqual(docs.length, STARTER_DOCS.length);
      assert.ok(docs.every((d: any) => d.status === "draft" && d.currentVersion === 0), "every starter doc should be an unapproved draft");
      assert.ok(docs.every((d: any) => d.folderId), "every starter doc should be filed");
      const folders = (await api("GET", "/api/doc-folders", A.cookie)).body;
      assert.deepStrictEqual(folders.map((f: any) => f.name).sort(), STARTER_FOLDERS.map((f) => f.name).sort());

      const templates = (await api("GET", "/api/systems/task-templates", A.cookie)).body;
      assert.strictEqual(templates.length, STARTER_TASKS.length);
      const docIds = new Set(docs.map((d: any) => d.id));
      for (const t of templates) {
        assert.strictEqual(t.isActive, false, `${t.title} should start switched off`);
        assert.ok(t.sopDocId && docIds.has(t.sopDocId), `${t.title} should link to its own company's SOP`);
        assert.strictEqual(t.defaultRoleId, null);
      }
      const bills = templates.find((t: any) => t.title === "Weekly bills review");
      const sop = await api("GET", `/api/systems/task-templates/${bills.id}/sop`, A.cookie);
      assert.strictEqual(sop.body?.title, "Weekly bills review");
    });

    await test("an inactive starter task generates no To-Dos", async () => {
      await api("POST", "/api/systems/task-templates/generate-recurring", A.cookie);
      const n = Number((await pool.query(`SELECT count(*) FROM notes WHERE company_id = $1 AND template_id IS NOT NULL`, [A.companyId])).rows[0].count);
      assert.strictEqual(n, 0);
    });

    await test("installing again adds nothing, and the button has nothing left to offer", async () => {
      const r = await api("POST", "/api/operations/starter-pack", A.cookie);
      assert.strictEqual(r.status, 201);
      assert.deepStrictEqual(r.body, { folders: 0, docs: 0, tasks: 0 });
      assert.strictEqual(await count("docs", A.companyId), STARTER_DOCS.length);
      const status = await api("GET", "/api/operations/starter-pack", A.cookie);
      assert.deepStrictEqual(status.body.available, { docs: 0, tasks: 0 });
    });

    await test("a deleted starter SOP stays deleted", async () => {
      const docs = (await api("GET", "/api/docs", A.cookie)).body;
      const target = docs.find((d: any) => d.title === "Toolbox talk");
      assert.ok([200, 204].includes((await api("DELETE", `/api/docs/${target.id}`, A.cookie)).status));
      const r = await api("POST", "/api/operations/starter-pack", A.cookie);
      assert.deepStrictEqual(r.body, { folders: 0, docs: 0, tasks: 0 });
      assert.strictEqual(await count("docs", A.companyId), STARTER_DOCS.length - 1);
    });

    await test("nothing lands in the other company", async () => {
      assert.strictEqual(await count("docs", B.companyId), 0);
      assert.strictEqual(await count("task_templates", B.companyId), 0);
      assert.strictEqual(await count("doc_folders", B.companyId), 0);
      const status = await api("GET", "/api/operations/starter-pack", B.cookie);
      assert.deepStrictEqual(status.body.available, { docs: STARTER_DOCS.length, tasks: STARTER_TASKS.length });
    });

    await test("two installs at once still give one copy", async () => {
      const results = await Promise.all([
        installStarterPack(B.companyId, { id: B.userId, name: "B" }),
        installStarterPack(B.companyId, { id: B.userId, name: "B" }),
      ]);
      assert.strictEqual(results[0].docs + results[1].docs, STARTER_DOCS.length);
      assert.strictEqual(await count("docs", B.companyId), STARTER_DOCS.length);
      assert.strictEqual(await count("task_templates", B.companyId), STARTER_TASKS.length);
    });

    await test("a partial install resolves to the company's existing copies, and skips deleted ones", async () => {
      // Pretend the pack grew: forget two items, delete one SOP's copy, re-run.
      const sopKey = STARTER_TASKS[0].sopKey;
      const taskKey = STARTER_TASKS[0].key;
      const sopRow = (await pool.query(`SELECT target_id FROM operations_starter_installs WHERE company_id = $1 AND item_key = $2`, [B.companyId, sopKey])).rows[0];
      await pool.query(`DELETE FROM task_templates WHERE id = (SELECT target_id FROM operations_starter_installs WHERE company_id = $1 AND item_key = $2)`, [B.companyId, taskKey]);
      await pool.query(`DELETE FROM operations_starter_installs WHERE company_id = $1 AND item_key = ANY($2)`, [B.companyId, [taskKey, STARTER_TASKS[1].key]]);
      await pool.query(`DELETE FROM task_templates WHERE id = (SELECT target_id FROM operations_starter_installs WHERE company_id = $1 AND item_key = $2)`, [B.companyId, STARTER_TASKS[1].key]);
      const secondSop = (await pool.query(`SELECT target_id FROM operations_starter_installs WHERE company_id = $1 AND item_key = $2`, [B.companyId, STARTER_TASKS[1].sopKey])).rows[0];
      await pool.query(`DELETE FROM docs WHERE id = $1`, [secondSop.target_id]);

      const r = await installStarterPack(B.companyId, { id: B.userId, name: "B" });
      assert.deepStrictEqual(r, { folders: 0, docs: 0, tasks: 2 });
      const rows = (await pool.query(`SELECT title, sop_doc_id FROM task_templates WHERE company_id = $1 AND title = ANY($2)`, [B.companyId, [STARTER_TASKS[0].title, STARTER_TASKS[1].title]])).rows;
      const first = rows.find((x: any) => x.title === STARTER_TASKS[0].title);
      const second = rows.find((x: any) => x.title === STARTER_TASKS[1].title);
      assert.strictEqual(first.sop_doc_id, sopRow.target_id, "should link to the SOP installed earlier");
      assert.strictEqual(second.sop_doc_id, null, "the deleted SOP should not be linked");
    });

    // A team member with Library add but not Tasks add can't install.
    const editor = await register("Editor");
    const role = await storage.createUserRole({ name: `Library only ${editor.unique}`, companyId: B.companyId, userCategory: "team", isBuiltIn: false } as any);
    const perms = await storage.getPermissions();
    const libraryPerm = perms.find((x) => x.key === "operations.library");
    await storage.setRolePermissions(role.id, [{ permissionId: libraryPerm!.id, allowedActions: ["view", "add", "edit"] }]);
    await storage.updateUser(editor.userId, { companyId: B.companyId, roleId: role.id, userCategory: "team" } as any);
    const editorCookie = await login(editor.email, editor.password);

    await test("installing needs add on both Library and Tasks", async () => {
      assert.strictEqual((await api("GET", "/api/operations/starter-pack", editorCookie)).status, 200);
      assert.strictEqual((await api("POST", "/api/operations/starter-pack", editorCookie)).status, 403);
    });

    await test("signup installs the pack only when ticked", async () => {
      const src = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
      const handler = src.slice(src.indexOf('app.post("/api/companies"'), src.indexOf("app.get('/api/demo-data/status'"));
      assert.ok(/if \(body\.starterPack === true\)[\s\S]*installStarterPack\(company\.id/.test(handler), "POST /api/companies should install only on starterPack === true");
    });
  } finally {
    await cleanup(companyIds);
  }
}

async function cleanup(companyIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM operations_starter_installs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notes WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM task_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM doc_versions WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM docs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM doc_folders WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM activities WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM user_roles WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM sessions WHERE sess->>'userId' IN (SELECT id FROM users WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM company_settings WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM users WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM user_roles WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM companies WHERE id = ANY($1)`, [companyIds]],
  ];
  for (const [sql, params] of stmts) {
    try { await pool.query(sql, params); } catch (err: any) { console.warn(`[cleanup] skipped: ${err?.message || err}`); }
  }
}

async function shutdown(code: number) {
  try { await new Promise<void>((resolve) => httpServer?.close(() => resolve())); } catch {}
  try { await pool.end(); } catch {}
  console.log(`\noperations-starter-pack: ${passed} passed, ${failed} failed`);
  process.exit(code);
}

main()
  .then(() => shutdown(failed > 0 ? 1 : 0))
  .catch((err) => { console.error("\nFATAL: test harness crashed\n", err); shutdown(1); });

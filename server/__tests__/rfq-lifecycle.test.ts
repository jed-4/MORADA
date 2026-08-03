/**
 * RFQ lifecycle integration tests.
 *
 * Covers the defects fixed in the RFQ Phase 1 pass (see docs/RFQ_AUDIT.md).
 * Every assertion here failed before that change:
 *   - line items sent inline with POST /api/rfqs were stripped by Zod and lost
 *   - GET items had no reachable route from the detail page's query key
 *   - creating an item with a numeric quantity 400'd (numeric column → z.string)
 *   - a create or save carrying a dueDate 500'd (ISO string reached Drizzle's
 *     timestamp mapper, which calls .toISOString() on it)
 *   - PATCH { status, sentAt } parsed to {} because insertRfqSchema omits both,
 *     so every RFQ was pinned to "draft" forever
 *   - accepting / declining a quote 400'd on an ISO string vs z.date()
 *   - RFQ numbers came from the project name + a count of existing rows, so
 *     deleting one freed its number for reuse
 *   - POST /api/rfqs never checked that the project belonged to the caller
 *
 * Same harness shape as tenant-isolation.test.ts: boots the real app on an
 * ephemeral port with NODE_ENV=test so auth and the ownership guards are
 * strictly enforced, then drives it over HTTP. Rows are namespaced to throwaway
 * companies and deleted in cleanup.
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/rfq-lifecycle.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import express from "express";
import assert from "node:assert";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { pool } from "../db";

let baseUrl = "";
let httpServer: any = null;

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

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
      // The session cookie is `secure` and the app trusts the proxy header, so
      // spoof HTTPS or express-session never establishes a session over the
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
  companyId: string;
  cookie: string;
}

async function createTenant(label: string): Promise<Tenant> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `rfq-test-${label}-${unique}@rfqtest.local`;
  const password = "RfqTest123!";

  const reg = await api("POST", "/api/auth/register", {
    body: { email, password, firstName: label, lastName: "RfqTest", agreeToTerms: true },
  });
  assert.strictEqual(reg.status, 200, `register ${label} failed: ${JSON.stringify(reg.body)}`);
  const userId = reg.body.user.id;

  const company = await storage.createCompany(
    { name: `RFQ Test Co ${label} ${unique}` } as any,
    userId,
  );

  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.strictEqual(login.status, 200, `login ${label} failed: ${JSON.stringify(login.body)}`);
  const cookie = extractCookie(login.raw);
  assert.ok(cookie, `no session cookie for ${label}`);

  return { userId, companyId: company.id, cookie: cookie! };
}

async function main() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = await registerRoutes(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  console.log(`\nRFQ lifecycle tests (server on ${baseUrl})\n`);

  const A = await createTenant("A");
  const B = await createTenant("B");

  const projectA = await storage.createProject({
    name: "Highgate Road",
    companyId: A.companyId,
    ownerId: A.userId,
    projectSubStatus: "lead_new",
  } as any);
  const projectB = await storage.createProject({
    name: "Other Co Project",
    companyId: B.companyId,
    ownerId: B.userId,
    projectSubStatus: "lead_new",
  } as any);

  const dueDate = new Date(Date.now() + 7 * 86400000).toISOString();
  let rfqId = "";
  let quoteId = "";

  // --- create, with inline items and a due date ---------------------------
  await test("POST /api/rfqs accepts a dueDate (used to 500 on the ISO string)", async () => {
    const res = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: {
        title: "Concrete Pour - Slab",
        projectId: projectA.id,
        dueDate,
        supplierIds: ["s1"],
        supplierNames: ["Smith Concrete"],
      },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.dueDate, "dueDate was not persisted");
    rfqId = res.body.id;
  });

  await test("POST /api/rfqs persists inline line items", async () => {
    const res = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: {
        title: "RFQ with items",
        projectId: projectA.id,
        items: [
          { description: "N32 concrete", quantity: 24.5, unit: "m3" },
          { description: "Pump hire", quantity: 1, unit: "each", unitPrice: 95000 },
        ],
      },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const items = await api("GET", `/api/rfqs/${res.body.id}/items`, { cookie: A.cookie });
    assert.strictEqual(items.status, 200);
    assert.strictEqual(items.body.length, 2, `expected 2 items, got ${items.body.length}`);
    assert.strictEqual(items.body[0].description, "N32 concrete");
  });

  await test("POST /api/rfqs rejects another company's project", async () => {
    const res = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: { title: "Cross-tenant", projectId: projectB.id },
    });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  // --- numbering ----------------------------------------------------------
  await test("RFQ numbers use the settings prefix, not the project name", async () => {
    const res = await api("GET", `/api/rfqs/${rfqId}`, { cookie: A.cookie });
    assert.strictEqual(res.status, 200);
    assert.ok(
      !/^HIGH/i.test(res.body.rfqNumber),
      `number still derived from project name: ${res.body.rfqNumber}`,
    );
    assert.ok(/\d+$/.test(res.body.rfqNumber), `no sequence suffix: ${res.body.rfqNumber}`);
  });

  await test("deleting an RFQ does not free its number for reuse", async () => {
    const mk = async () => {
      const r = await api("POST", "/api/rfqs", {
        cookie: A.cookie,
        body: { title: "Sequence probe", projectId: projectA.id },
      });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      return r.body;
    };
    const first = await mk();
    const del = await api("DELETE", `/api/rfqs/${first.id}`, { cookie: A.cookie });
    assert.strictEqual(del.status, 204);
    const second = await mk();
    assert.notStrictEqual(
      second.rfqNumber,
      first.rfqNumber,
      `number ${first.rfqNumber} was reused after delete`,
    );
  });

  // --- items --------------------------------------------------------------
  await test("POST /api/rfq-items accepts a numeric quantity", async () => {
    const res = await api("POST", "/api/rfq-items", {
      cookie: A.cookie,
      body: { rfqId, description: "Reo mesh", quantity: 12.5, unit: "each", displayOrder: 0 },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  await test("GET /api/rfqs/:id/items returns what was created", async () => {
    const res = await api("GET", `/api/rfqs/${rfqId}/items`, { cookie: A.cookie });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].description, "Reo mesh");
  });

  // --- status transitions -------------------------------------------------
  await test("PATCH /api/rfqs/:id moves status off draft", async () => {
    const sentAt = new Date().toISOString();
    const res = await api("PATCH", `/api/rfqs/${rfqId}`, {
      cookie: A.cookie,
      body: { status: "sent", sentAt },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, "sent", `status stayed ${res.body.status}`);
    assert.ok(res.body.sentAt, "sentAt was not persisted");
  });

  await test("PATCH /api/rfqs/:id rejects an invalid status", async () => {
    const res = await api("PATCH", `/api/rfqs/${rfqId}`, {
      cookie: A.cookie,
      body: { status: "not-a-status" },
    });
    assert.strictEqual(res.status, 400);
  });

  await test("PATCH /api/rfqs/:id cannot move an RFQ to another project", async () => {
    const res = await api("PATCH", `/api/rfqs/${rfqId}`, {
      cookie: A.cookie,
      body: { projectId: projectB.id },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.projectId, projectA.id, "projectId was reassigned");
  });

  await test("PATCH /api/rfqs/:id accepts a dueDate as an ISO string", async () => {
    const res = await api("PATCH", `/api/rfqs/${rfqId}`, {
      cookie: A.cookie,
      body: { dueDate: new Date(Date.now() + 14 * 86400000).toISOString() },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  // --- quotes -------------------------------------------------------------
  await test("POST /api/rfq-quotes creates a quote", async () => {
    const res = await api("POST", "/api/rfq-quotes", {
      cookie: A.cookie,
      body: {
        rfqId,
        supplierName: "Smith Concrete",
        totalAmount: 462000,
        status: "pending",
      },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    quoteId = res.body.id;
  });

  await test("PATCH /api/rfq-quotes/:id accepts a quote with an ISO acceptedAt", async () => {
    const res = await api("PATCH", `/api/rfq-quotes/${quoteId}`, {
      cookie: A.cookie,
      body: { status: "accepted", acceptedAt: new Date().toISOString() },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, "accepted");
    assert.ok(res.body.acceptedAt, "acceptedAt was not persisted");
  });

  await test("PATCH /api/rfq-quotes/:id declines with an ISO declinedAt", async () => {
    const res = await api("PATCH", `/api/rfq-quotes/${quoteId}`, {
      cookie: A.cookie,
      body: { status: "declined", declinedAt: new Date().toISOString() },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, "declined");
  });

  await test("company B cannot read company A's RFQ", async () => {
    const res = await api("GET", `/api/rfqs/${rfqId}`, { cookie: B.cookie });
    assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log(`Failed: ${failures.join(", ")}`);

  await cleanup([A.companyId, B.companyId], [A.userId, B.userId]);
}

async function cleanup(companyIds: string[], userIds: string[]) {
  const stmts: [string, any[]][] = [
    [`DELETE FROM rfq_quotes WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_items WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_follow_ups WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_portal_tokens WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfqs WHERE company_id = ANY($1)`, [companyIds]],
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

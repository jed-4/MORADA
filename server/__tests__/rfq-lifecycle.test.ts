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

  // =========================================================================
  // Recipients + derived status + per-line quote pricing (PR 2)
  // =========================================================================
  const contactA = await storage.createContact({
    name: "Smith Concrete",
    contactType: "supplier",
    companyId: A.companyId,
  } as any);
  const contactB = await storage.createContact({
    name: "Jones Concrete",
    contactType: "supplier",
    companyId: A.companyId,
  } as any);

  let recipRfqId = "";
  let recipSmithId = "";
  let recipJonesId = "";

  await test("creating an RFQ with suppliers materialises recipient rows", async () => {
    const res = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: {
        title: "Slab pour",
        projectId: projectA.id,
        supplierIds: [contactA.id, contactB.id],
        supplierNames: ["Smith Concrete", "Jones Concrete"],
        items: [{ description: "N32 concrete", quantity: 24, unit: "m3" }],
      },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    recipRfqId = res.body.id;

    const recips = await api("GET", `/api/rfqs/${recipRfqId}/recipients`, { cookie: A.cookie });
    assert.strictEqual(recips.status, 200);
    assert.strictEqual(recips.body.length, 2);
    assert.strictEqual(recips.body[0].supplierName, "Smith Concrete");
    assert.strictEqual(recips.body[0].status, "not_sent");
    recipSmithId = recips.body[0].id;
    recipJonesId = recips.body[1].id;
  });

  await test("duplicate supplierIds collapse to one recipient", async () => {
    const res = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: {
        title: "Dupe probe",
        projectId: projectA.id,
        supplierIds: [contactA.id, contactA.id],
        supplierNames: ["Smith Concrete", "Smith Concrete"],
      },
    });
    assert.strictEqual(res.status, 201);
    const recips = await api("GET", `/api/rfqs/${res.body.id}/recipients`, { cookie: A.cookie });
    assert.strictEqual(recips.body.length, 1, `expected dedupe, got ${recips.body.length}`);
  });

  await test("adding the same supplier twice is rejected with a message", async () => {
    const res = await api("POST", "/api/rfq-recipients", {
      cookie: A.cookie,
      body: { rfqId: recipRfqId, supplierId: contactA.id, supplierName: "Smith Concrete" },
    });
    assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    assert.ok(/already on this RFQ/i.test(res.body.error));
  });

  await test("all recipients unsent → RFQ derives to draft", async () => {
    const res = await api("GET", `/api/rfqs/${recipRfqId}`, { cookie: A.cookie });
    assert.strictEqual(res.body.status, "draft", `got ${res.body.status}`);
  });

  await test("marking a recipient sent derives the RFQ to sent", async () => {
    const res = await api("PATCH", `/api/rfq-recipients/${recipSmithId}`, {
      cookie: A.cookie,
      body: { status: "sent", sentAt: new Date().toISOString() },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const rfq = await api("GET", `/api/rfqs/${recipRfqId}`, { cookie: A.cookie });
    assert.strictEqual(rfq.body.status, "sent", `got ${rfq.body.status}`);
  });

  await test("recipient edits keep the mirrored supplier arrays in sync", async () => {
    const rfq = await api("GET", `/api/rfqs/${recipRfqId}`, { cookie: A.cookie });
    assert.deepStrictEqual(rfq.body.supplierNames, ["Smith Concrete", "Jones Concrete"]);
  });

  let smithQuoteId = "";
  let jonesQuoteId = "";

  await test("a quote moves its recipient to quoted and the RFQ to quoted", async () => {
    const res = await api("POST", "/api/rfq-quotes", {
      cookie: A.cookie,
      body: { rfqId: recipRfqId, supplierId: contactA.id, supplierName: "Smith Concrete", totalAmount: 480000, status: "pending" },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    smithQuoteId = res.body.id;

    const recips = await api("GET", `/api/rfqs/${recipRfqId}/recipients`, { cookie: A.cookie });
    const smith = recips.body.find((r: any) => r.id === recipSmithId);
    assert.strictEqual(smith.status, "quoted", `recipient status ${smith.status}`);
    assert.strictEqual(smith.quoteId, smithQuoteId, "quote not linked to recipient");

    const rfq = await api("GET", `/api/rfqs/${recipRfqId}`, { cookie: A.cookie });
    assert.strictEqual(rfq.body.status, "quoted", `got ${rfq.body.status}`);
  });

  await test("accepting a quote declines the others and awards the RFQ", async () => {
    const second = await api("POST", "/api/rfq-quotes", {
      cookie: A.cookie,
      body: { rfqId: recipRfqId, supplierId: contactB.id, supplierName: "Jones Concrete", totalAmount: 510000, status: "pending" },
    });
    assert.strictEqual(second.status, 201);
    jonesQuoteId = second.body.id;

    const accept = await api("PATCH", `/api/rfq-quotes/${smithQuoteId}`, {
      cookie: A.cookie,
      body: { status: "accepted", acceptedAt: new Date().toISOString() },
    });
    assert.strictEqual(accept.status, 200, JSON.stringify(accept.body));

    const quotes = await api("GET", `/api/rfqs/${recipRfqId}/quotes`, { cookie: A.cookie });
    const jones = quotes.body.find((q: any) => q.id === jonesQuoteId);
    assert.strictEqual(jones.status, "declined", `losing quote left as ${jones.status}`);

    const rfq = await api("GET", `/api/rfqs/${recipRfqId}`, { cookie: A.cookie });
    assert.strictEqual(rfq.body.status, "accepted", `got ${rfq.body.status}`);
  });

  await test("the losing recipient is marked declined, so reminders stop", async () => {
    const recips = await api("GET", `/api/rfqs/${recipRfqId}/recipients`, { cookie: A.cookie });
    const jones = recips.body.find((r: any) => r.id === recipJonesId);
    assert.strictEqual(jones.status, "declined", `got ${jones.status}`);
  });

  await test("removing a recipient re-syncs the mirrored arrays", async () => {
    const del = await api("DELETE", `/api/rfq-recipients/${recipJonesId}`, { cookie: A.cookie });
    assert.strictEqual(del.status, 204);
    const rfq = await api("GET", `/api/rfqs/${recipRfqId}`, { cookie: A.cookie });
    assert.deepStrictEqual(rfq.body.supplierNames, ["Smith Concrete"]);
  });

  await test("company B cannot add a recipient to company A's RFQ", async () => {
    const res = await api("POST", "/api/rfq-recipients", {
      cookie: B.cookie,
      body: { rfqId: recipRfqId, supplierName: "Intruder Supplies" },
    });
    assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
  });

  // --- per-line quote pricing ---------------------------------------------
  await test("PUT quote items stores per-line pricing", async () => {
    const items = await api("GET", `/api/rfqs/${recipRfqId}/items`, { cookie: A.cookie });
    assert.strictEqual(items.status, 200);
    const rfqItemId = items.body[0].id;

    const res = await api("PUT", `/api/rfq-quotes/${smithQuoteId}/items`, {
      cookie: A.cookie,
      body: {
        items: [
          { rfqItemId, description: "N32 concrete supplied", quantity: 24, unit: "m3", unitPrice: 18000, lineTotal: 432000 },
          { description: "Delivery", quantity: 1, unit: "each", unitPrice: 48000, lineTotal: 48000 },
        ],
      },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.length, 2);
    assert.strictEqual(res.body[0].rfqItemId, rfqItemId, "line not linked back to the RFQ item");
  });

  await test("PUT quote items replaces rather than appends", async () => {
    const res = await api("PUT", `/api/rfq-quotes/${smithQuoteId}/items`, {
      cookie: A.cookie,
      body: { items: [{ description: "Revised all-in price", quantity: 1, unitPrice: 470000, lineTotal: 470000 }] },
    });
    assert.strictEqual(res.status, 200);
    const items = await api("GET", `/api/rfq-quotes/${smithQuoteId}/items`, { cookie: A.cookie });
    assert.strictEqual(items.body.length, 1, `expected replace, got ${items.body.length} lines`);
  });

  await test("a quote line cannot reference another RFQ's item", async () => {
    const otherItems = await api("GET", `/api/rfqs/${rfqId}/items`, { cookie: A.cookie });
    const foreignItemId = otherItems.body[0].id;
    const res = await api("PUT", `/api/rfq-quotes/${smithQuoteId}/items`, {
      cookie: A.cookie,
      body: { items: [{ rfqItemId: foreignItemId, description: "Smuggled", quantity: 1 }] },
    });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test("company B cannot read company A's quote lines", async () => {
    const res = await api("GET", `/api/rfq-quotes/${smithQuoteId}/items`, { cookie: B.cookie });
    assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
  });

  // --- portal --------------------------------------------------------------
  await test("portal serves an RFQ by recipient token, including terms", async () => {
    await api("PATCH", `/api/rfqs/${recipRfqId}`, {
      cookie: A.cookie,
      body: { customTerms: "Payment 30 days from invoice." },
    });
    const token = `test-token-${Date.now()}`;
    await storage.updateRFQRecipient(recipSmithId, { portalToken: token } as any);

    const res = await api("GET", `/api/portal/rfq/${token}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.rfq.customTerms, "Payment 30 days from invoice.");
    assert.strictEqual(res.body.supplierName, "Smith Concrete");
    assert.ok(res.body.rfq.internalNotes === undefined, "internal notes leaked to the portal");
  });

  await test("a revoked portal token is refused", async () => {
    const token = `revoked-token-${Date.now()}`;
    await storage.updateRFQRecipient(recipSmithId, {
      portalToken: token,
      portalTokenRevoked: true,
    } as any);
    const res = await api("GET", `/api/portal/rfq/${token}`);
    assert.strictEqual(res.status, 404, `revoked token still served (${res.status})`);
    await storage.updateRFQRecipient(recipSmithId, { portalTokenRevoked: false } as any);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log(`Failed: ${failures.join(", ")}`);

  await cleanup([A.companyId, B.companyId], [A.userId, B.userId]);
}

async function cleanup(companyIds: string[], userIds: string[]) {
  const stmts: [string, any[]][] = [
    [`DELETE FROM rfq_quote_items WHERE quote_id IN (SELECT id FROM rfq_quotes WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1)))`, [companyIds]],
    [`DELETE FROM rfq_recipients WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_quotes WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_items WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_follow_ups WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_portal_tokens WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfqs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM contacts WHERE company_id = ANY($1)`, [companyIds]],
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

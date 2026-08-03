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

  // =========================================================================
  // Registry: project-less RFQs and ownership (PR 3)
  // =========================================================================
  let registryRfqId = "";

  await test("an RFQ can be created with no project at all", async () => {
    const res = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: { title: "General enquiry — bulk timber pricing" },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.projectId, null, `projectId was ${res.body.projectId}`);
    assert.ok(res.body.rfqNumber, "project-less RFQ still needs a number");
    registryRfqId = res.body.id;
  });

  await test("an empty-string projectId normalises to null", async () => {
    const res = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: { title: "Empty project probe", projectId: "" },
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.projectId, null);
  });

  await test("a project-less RFQ appears in the company-wide list", async () => {
    const res = await api("GET", "/api/rfqs", { cookie: A.cookie });
    assert.strictEqual(res.status, 200);
    assert.ok(
      res.body.some((r: any) => r.id === registryRfqId),
      "registry RFQ missing from the business-level list",
    );
  });

  await test("owner defaults to the creator so no row is unowned", async () => {
    const res = await api("GET", `/api/rfqs/${registryRfqId}`, { cookie: A.cookie });
    assert.strictEqual(res.body.ownerId, A.userId, `owner was ${res.body.ownerId}`);
    assert.ok(res.body.ownerName, "ownerName not stamped");
  });

  await test("a project-less RFQ can be attached to a project later", async () => {
    const res = await api("PATCH", `/api/rfqs/${registryRfqId}`, {
      cookie: A.cookie,
      body: { projectId: projectA.id },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.projectId, projectA.id, "attach did not take");
  });

  await test("but it cannot then be re-parented to another project", async () => {
    const other = await storage.createProject({
      name: "Second A Project",
      companyId: A.companyId,
      ownerId: A.userId,
      projectSubStatus: "lead_new",
    } as any);
    const res = await api("PATCH", `/api/rfqs/${registryRfqId}`, {
      cookie: A.cookie,
      body: { projectId: other.id },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.projectId, projectA.id, "RFQ was re-parented");
  });

  await test("attaching to another company's project is refused", async () => {
    const fresh = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: { title: "Cross-tenant attach probe" },
    });
    const res = await api("PATCH", `/api/rfqs/${fresh.body.id}`, {
      cookie: A.cookie,
      body: { projectId: projectB.id },
    });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });

  await test("owner can be reassigned to another user in the company", async () => {
    const res = await api("PATCH", `/api/rfqs/${registryRfqId}`, {
      cookie: A.cookie,
      body: { ownerId: A.userId },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.ownerId, A.userId);
  });

  await test("an owner from another company is rejected, not stored", async () => {
    const res = await api("PATCH", `/api/rfqs/${registryRfqId}`, {
      cookie: A.cookie,
      body: { ownerId: B.userId },
    });
    assert.strictEqual(res.status, 200);
    assert.notStrictEqual(res.body.ownerId, B.userId, "foreign user was assigned as owner");
  });

  // =========================================================================
  // Sending + reminders (PR 4)
  // =========================================================================
  let sendRfqId = "";
  let sendRecipientId = "";
  let externalRecipientId = "";

  await test("sending mints a portal token and marks the recipient sent", async () => {
    const created = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: {
        title: "Send flow",
        projectId: projectA.id,
        dueDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      },
    });
    assert.strictEqual(created.status, 201, JSON.stringify(created.body));
    sendRfqId = created.body.id;

    // No supplierEmail: the send still tokenises and marks sent, it just can't
    // email — which is the "copy the link yourself" path.
    const recip = await api("POST", "/api/rfq-recipients", {
      cookie: A.cookie,
      body: { rfqId: sendRfqId, supplierId: contactA.id, supplierName: "Smith Concrete" },
    });
    assert.strictEqual(recip.status, 201, JSON.stringify(recip.body));
    sendRecipientId = recip.body.id;

    const res = await api("POST", `/api/rfqs/${sendRfqId}/send`, { cookie: A.cookie, body: {} });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const after = await storage.getRFQRecipient(sendRecipientId);
    assert.strictEqual(after!.status, "sent", `recipient status ${after!.status}`);
    assert.ok(after!.sentAt, "sentAt not stamped");
    assert.ok(after!.portalToken, "no portal token minted");
  });

  await test("the minted token actually opens the portal", async () => {
    const recipient = await storage.getRFQRecipient(sendRecipientId);
    const res = await api("GET", `/api/portal/rfq/${recipient!.portalToken}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.supplierName, "Smith Concrete");
  });

  await test("sending derives the RFQ off draft", async () => {
    const res = await api("GET", `/api/rfqs/${sendRfqId}`, { cookie: A.cookie });
    assert.strictEqual(res.body.status, "sent", `status was ${res.body.status}`);
    assert.ok(res.body.sentAt, "RFQ sentAt not stamped");
  });

  await test("re-sending keeps the same portal token", async () => {
    const before = await storage.getRFQRecipient(sendRecipientId);
    await api("POST", `/api/rfqs/${sendRfqId}/send`, { cookie: A.cookie, body: {} });
    const after = await storage.getRFQRecipient(sendRecipientId);
    assert.strictEqual(after!.portalToken, before!.portalToken, "supplier's link changed on re-send");
  });

  await test("an external recipient is marked sent but never emailed", async () => {
    const recip = await api("POST", "/api/rfq-recipients", {
      cookie: A.cookie,
      body: {
        rfqId: sendRfqId,
        supplierName: "Phone-only Supplier",
        supplierEmail: "someone@example.test",
        isExternal: true,
      },
    });
    assert.strictEqual(recip.status, 201);
    externalRecipientId = recip.body.id;

    const res = await api("POST", `/api/rfqs/${sendRfqId}/send`, {
      cookie: A.cookie,
      body: { recipientIds: [externalRecipientId] },
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(
      res.body.skipped.some((s: any) => s.reason === "external"),
      "external recipient was not skipped",
    );

    const after = await storage.getRFQRecipient(externalRecipientId);
    assert.strictEqual(after!.status, "sent");
    assert.strictEqual(after!.portalToken, null, "external recipient should not get a portal token");
  });

  await test("sending with no suppliers is refused", async () => {
    const empty = await api("POST", "/api/rfqs", {
      cookie: A.cookie,
      body: { title: "Nobody to send to", projectId: projectA.id },
    });
    const res = await api("POST", `/api/rfqs/${empty.body.id}/send`, { cookie: A.cookie, body: {} });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test("company B cannot send company A's RFQ", async () => {
    const res = await api("POST", `/api/rfqs/${sendRfqId}/send`, { cookie: B.cookie, body: {} });
    assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
  });

  await test("reminder templates are seeded per company on first read", async () => {
    const res = await api("GET", "/api/rfq-reminder-templates", { cookie: A.cookie });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length >= 3, `expected seeded defaults, got ${res.body.length}`);
    assert.ok(res.body.every((t: any) => t.subject && t.body), "templates missing copy");
  });

  await test("a company only sees its own reminder templates", async () => {
    const a = await api("GET", "/api/rfq-reminder-templates", { cookie: A.cookie });
    const b = await api("GET", "/api/rfq-reminder-templates", { cookie: B.cookie });
    const aIds = new Set(a.body.map((t: any) => t.id));
    assert.ok(
      b.body.every((t: any) => !aIds.has(t.id)),
      "reminder templates leaked across companies",
    );
  });

  await test("company B cannot edit company A's reminder template", async () => {
    const a = await api("GET", "/api/rfq-reminder-templates", { cookie: A.cookie });
    const res = await api("PATCH", `/api/rfq-reminder-templates/${a.body[0].id}`, {
      cookie: B.cookie,
      body: { name: "Hijacked" },
    });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });

  await test("a supplier who has quoted is no longer remindable", async () => {
    const { remindableRecipients } = await import("../services/rfqReminderScheduler");
    const recipients = await storage.getRFQRecipients(sendRfqId);
    // Give the pending recipient an address so only status decides.
    await storage.updateRFQRecipient(sendRecipientId, { supplierEmail: "smith@example.test" } as any);

    const before = remindableRecipients(await storage.getRFQRecipients(sendRfqId));
    assert.ok(before.some((r) => r.id === sendRecipientId), "expected the awaiting supplier to be remindable");

    await api("POST", "/api/rfq-quotes", {
      cookie: A.cookie,
      body: { rfqId: sendRfqId, supplierId: contactA.id, supplierName: "Smith Concrete", totalAmount: 1000, status: "pending" },
    });

    const after = remindableRecipients(await storage.getRFQRecipients(sendRfqId));
    assert.ok(
      !after.some((r) => r.id === sendRecipientId),
      "a supplier who already quoted would still be chased",
    );
    assert.ok(recipients.length > 0);
  });

  await test("external recipients are never remindable", async () => {
    const { remindableRecipients } = await import("../services/rfqReminderScheduler");
    const list = remindableRecipients(await storage.getRFQRecipients(sendRfqId));
    assert.ok(
      !list.some((r) => r.id === externalRecipientId),
      "external recipient would be emailed a reminder",
    );
  });

  await test("a reminder can only be claimed once per recipient", async () => {
    const a = await api("GET", "/api/rfq-reminder-templates", { cookie: A.cookie });
    const templateId = a.body[0].id;
    const first = await storage.claimRFQReminder({
      rfqId: sendRfqId,
      recipientId: sendRecipientId,
      templateId,
      subject: "s",
      body: "b",
      toEmail: "smith@example.test",
      status: "sent",
    } as any);
    assert.ok(first, "first claim should succeed");

    const second = await storage.claimRFQReminder({
      rfqId: sendRfqId,
      recipientId: sendRecipientId,
      templateId,
      subject: "s",
      body: "b",
      toEmail: "smith@example.test",
      status: "sent",
    } as any);
    assert.strictEqual(second, null, "duplicate claim should be refused — this is the double-send guard");
  });

  await test("the scheduler work list excludes draft and awarded RFQs", async () => {
    const live = await storage.getRfqsAwaitingReminders();
    assert.ok(
      live.every((r) => r.status === "sent" && r.followUpEnabled),
      "work list included an RFQ that should not be chased",
    );
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
    [`DELETE FROM rfq_reminder_log WHERE rfq_id IN (SELECT id FROM rfqs WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM rfq_reminder_templates WHERE company_id = ANY($1)`, [companyIds]],
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

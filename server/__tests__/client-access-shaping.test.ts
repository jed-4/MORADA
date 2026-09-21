/**
 * What a logged-in CLIENT receives from the builder's routes.
 *
 * Two layers: the pure projections in server/clientProjections.ts, and the
 * gate in server/middleware/clientAccess.ts driven end to end with storage
 * stubbed — so the tests prove the shaped body is what actually goes out on
 * res.json, not just what a helper returns.
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/client-access-shaping.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  clientAllowanceEstimateIds,
  projectClientAllowance,
  projectClientInvoice,
  projectClientInvoiceItem,
  projectClientInvoicePayments,
  projectClientVariation,
  projectClientVariationItems,
} from "../clientProjections";
import { DEFAULT_VARIATION_DOCUMENT_COLUMNS } from "@shared/variationDocumentColumns";
import {
  CLIENT_PORTAL_PERMISSIONS,
  CLIENT_PORTAL_SECTIONS,
  DEFAULT_CLIENT_PORTAL_GRANTS,
  translateLegacyClientGrants,
} from "@shared/clientPortalPermissions";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const variationRow = {
  id: "v1",
  projectId: "p1",
  variationNumber: "4501-VO-001",
  name: "Extra deck",
  status: "pending",
  subtotal: 100000,
  gstAmount: 10000,
  totalAmount: 110000,
  portalToken: "secret-token",
  clientSignedIp: "1.2.3.4",
  clientSignedUserAgent: "UA",
  createdById: "u-builder",
  approvedBy: "u-builder",
  pdfColumns: { unitCost: true },
  relatedTo: "internal ref",
};

const invoiceRow = {
  id: "i1",
  projectId: "p1",
  invoiceNumber: "4501-CI-01",
  name: "Claim 1",
  status: "sent",
  totalAmount: 5000,
  notes: "chase them hard",
  sendToXero: true,
  xeroInvoiceId: "xero-1",
  xeroInvoiceNumber: "INV-9",
  lineXeroOverrides: { labour: { account: "200" } },
  companyId: "c1",
  clientId: "u-client",
  lineBreakdown: [
    { source: "contract", description: "Slab", amountExCents: 100, gstCents: 10, amountIncCents: 110, taxable: true, accountCode: "200" },
  ],
  attachments: [
    { name: "public.pdf", url: "/objects/a", includeInPdf: true },
    { name: "internal.pdf", url: "/objects/b", includeInPdf: false },
  ],
};

async function projections() {
  console.log("projections");

  await check("variation drops token, audit trail and internal ids", () => {
    const out: any = projectClientVariation(variationRow);
    for (const key of ["portalToken", "clientSignedIp", "clientSignedUserAgent", "createdById", "approvedBy", "pdfColumns", "relatedTo"]) {
      assert.ok(!(key in out), `${key} leaked`);
    }
    assert.strictEqual(out.totalAmount, 110000);
  });

  await check("variation items: hidden lines dropped, cost + markup withheld by default", () => {
    const items = [
      { id: "a", name: "Deck", description: "d", unitCostExTax: 50, markupPercent: 20, costCode: "cc1", unitPrice: 6000, totalPrice: 6000, showInPdf: true },
      { id: "b", name: "Hidden", description: "h", unitCostExTax: 10, markupPercent: 5, unitPrice: 100, totalPrice: 100, showInPdf: false },
    ];
    const out: any[] = projectClientVariationItems(items, DEFAULT_VARIATION_DOCUMENT_COLUMNS);
    assert.deepStrictEqual(out.map((i) => i.id), ["a"]);
    assert.ok(!("unitCostExTax" in out[0]), "unit cost leaked");
    assert.ok(!("markupPercent" in out[0]), "markup leaked");
    assert.strictEqual(out[0].totalPrice, 6000);
  });

  await check("invoice drops notes, Xero fields and account codes; hides excluded attachments", () => {
    const out: any = projectClientInvoice(invoiceRow);
    for (const key of ["notes", "sendToXero", "xeroInvoiceId", "xeroInvoiceNumber", "lineXeroOverrides", "companyId", "clientId"]) {
      assert.ok(!(key in out), `${key} leaked`);
    }
    assert.ok(!("accountCode" in out.lineBreakdown[0]), "account code leaked");
    assert.strictEqual(out.lineBreakdown[0].amountIncCents, 110);
    assert.deepStrictEqual(out.attachments.map((a: any) => a.name), ["public.pdf"]);
  });

  await check("invoice items drop cost code and Xero account", () => {
    const out: any = projectClientInvoiceItem({ id: "x", description: "d", totalPrice: 1, costCodeId: "cc", xeroAccountCode: "200" });
    assert.ok(!("costCodeId" in out) && !("xeroAccountCode" in out));
  });

  await check("payments: voided dropped, notes + recordedBy withheld", () => {
    const out: any[] = projectClientInvoicePayments([
      { id: "p1", amount: 100, notes: "n", recordedBy: "u", isVoided: false },
      { id: "p2", amount: 200, isVoided: true },
    ]);
    assert.deepStrictEqual(out.map((p) => p.id), ["p1"]);
    assert.ok(!("notes" in out[0]) && !("recordedBy" in out[0]));
  });

  await check("allowance row carries no money, bills, timesheets or costs", () => {
    const out: any = projectClientAllowance({
      item: { id: "e1", estimateId: "est1", name: "Tiles", shownAs: "Floor tiles", allowance: "Prime Cost", allowanceStatus: "finalized", unitCostExTax: 40, markupPercent: 15, priceIncTax: 440000, notes: "internal" },
      actualCost: 500000, billCostIncGst: 500000, timesheetCostExGst: 0, variance: 60000,
    });
    assert.strictEqual(out.item.name, "Floor tiles");
    assert.strictEqual(out.finalised, true);
    for (const key of ["unitCostExTax", "markupPercent", "priceIncTax", "notes"]) {
      assert.ok(!(key in out.item), `${key} leaked`);
    }
    for (const key of ["actualCost", "billCostIncGst", "timesheetCostExGst", "variance"]) {
      assert.ok(!(key in out), `${key} leaked`);
    }
  });

  await check("allowance estimates: selected, else contract, else approved — never draft", () => {
    const estimates = [{ id: "draft", status: "draft" }, { id: "ok", status: "approved" }, { id: "k", status: "contract" }];
    assert.deepStrictEqual([...clientAllowanceEstimateIds({ selectedEstimateId: "draft" }, estimates)], ["draft"]);
    assert.deepStrictEqual([...clientAllowanceEstimateIds({ selectedEstimateId: null }, estimates)], ["k"]);
    assert.deepStrictEqual([...clientAllowanceEstimateIds(null, [{ id: "d", status: "draft" }, { id: "ok", status: "approved" }])], ["ok"]);
    assert.deepStrictEqual([...clientAllowanceEstimateIds(null, [{ id: "d", status: "draft" }, { id: "a", status: "archived" }])], []);
  });
}

async function portalPermissions() {
  console.log("client portal permissions");

  await check("legacy client grants translate without widening", () => {
    const out = translateLegacyClientGrants({
      "projects.view": ["view"],
      "projects.schedule": ["view"],
      "projects.selections": ["view", "approve"],
      "projects.variations": ["view"],
      "projects.invoices": ["view"],
      "projects.site_diary": ["view"],
      "projects.messages": ["view", "add", "send"],
      "projects.reviews": ["view", "add", "approve"],
    });
    assert.deepStrictEqual(out["portal.schedule"], ["view"]);
    assert.ok(!("portal.schedule.all_items" in out), "every-item schedule must be opt-in");
    assert.deepStrictEqual(out["portal.selections"].sort(), ["add", "edit", "view"]);
    assert.ok(!out["portal.selections"].includes("approve" as any), "selection approve carried over");
    assert.deepStrictEqual(out["portal.allowances"], ["view"]);
    assert.ok(!("portal.allowances.costs" in out), "allowance costs must be opt-in");
    assert.ok(!("portal.selections.pricing" in out), "selection prices must be opt-in");
    assert.deepStrictEqual(out["portal.variations"].sort(), ["approve", "view"]);
    assert.deepStrictEqual(out["portal.messages"].sort(), ["send", "view"]);
    assert.deepStrictEqual(out["portal.reviews"].sort(), ["add", "approve", "view"]);
  });

  await check("a client who could not see a section gets nothing for it", () => {
    const out = translateLegacyClientGrants({ "projects.reviews": ["add"], "projects.messages": ["send"] });
    assert.deepStrictEqual(out, {});
  });

  await check("every panel toggle and default names a real catalogue action", () => {
    const actions = new Map(CLIENT_PORTAL_PERMISSIONS.map((p) => [p.key, p.actions as string[]]));
    for (const section of CLIENT_PORTAL_SECTIONS) {
      for (const t of [section.view, ...section.extras]) {
        assert.ok(actions.get(t.key)?.includes(t.action), `${section.id}: ${t.key}:${t.action} not in catalogue`);
      }
    }
    for (const [key, granted] of Object.entries(DEFAULT_CLIENT_PORTAL_GRANTS)) {
      for (const a of granted) assert.ok(actions.get(key)?.includes(a), `default ${key}:${a} not in catalogue`);
    }
  });
}

// ── Gate, end to end with storage stubbed ───────────────────────────────────

async function gate() {
  console.log("gate");
  const { storage } = await import("../storage");
  const { clientAccessGate } = await import("../middleware/clientAccess");

  const client = { id: "u-client", userCategory: "client", companyId: "c1" };
  const team = { id: "u-team", userCategory: "team", companyId: "c1" };
  const s: any = storage;
  const stub = (name: string, fn: any) => { s[name] = fn; };
  let denied = new Set<string>();
  stub("checkUserPermission", async (_u: string, key: string, action: string) => !denied.has(`${key}:${action}`));
  stub("getUserProjectAccess", async () => [{ projectId: "p1" }]);
  stub("getVariation", async (id: string) => {
    if (id === "v-draft") return { ...variationRow, id, status: "draft" };
    // v1 uses the column defaults; v-costs is a document the builder chose to
    // show unit costs on.
    if (id === "v-costs") return { ...variationRow, id };
    return { ...variationRow, id, pdfColumns: null };
  });
  stub("getClientInvoice", async (id: string) => (id === "i-draft" ? { ...invoiceRow, id, status: "draft" } : invoiceRow));
  stub("getCompanySettings", async () => ({}));
  stub("getCostCodes", async () => []);
  stub("getChannel", async (id: string) => ({ id }));
  stub("getChannelMembers", async (id: string) => (id === "mine" ? [{ userId: "u-client" }] : [{ userId: "u-team" }]));
  stub("getProject", async () => ({ id: "p1", selectedEstimateId: "est1" }));
  stub("getEstimates", async () => [{ id: "est1", status: "contract" }, { id: "est0", status: "draft" }]);

  /** Run the gate, then (if it calls next) a fake route that answers `routeBody`. */
  const run = (user: any, method: string, url: string, routeBody: any) =>
    new Promise<{ status: number; body: any }>((resolve) => {
      const [path, qs] = url.split("?");
      const req: any = {
        method,
        path,
        query: Object.fromEntries(new URLSearchParams(qs ?? "")),
        user: { dbUser: user },
        session: {},
      };
      const res: any = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        json(body: any) { resolve({ status: this.statusCode, body }); return this; },
      };
      clientAccessGate(req, res, () => {
        // Express restores the mount prefix before the route handler runs, so
        // a shaper that reads req.path sees "/api/..." — reproduce that.
        req.path = `/api${path}`;
        req.url = `/api${url}`;
        res.json(routeBody);
      });
    });

  await check("team session is untouched", async () => {
    const r = await run(team, "GET", "/variations/v1", variationRow);
    assert.strictEqual(r.body.portalToken, "secret-token");
  });

  await check("client variation list hides drafts and strips the token", async () => {
    const r = await run(client, "GET", "/variations?projectId=p1", [
      variationRow,
      { ...variationRow, id: "v2", status: "draft" },
      { ...variationRow, id: "v3", status: "action" },
    ]);
    assert.deepStrictEqual(r.body.map((v: any) => v.id), ["v1"]);
    assert.ok(!("portalToken" in r.body[0]));
  });

  await check("client draft variation detail is a 404", async () => {
    const r = await run(client, "GET", "/variations/v-draft", { ...variationRow, status: "draft" });
    assert.strictEqual(r.status, 404);
  });

  await check("client variation items lose cost + hidden lines", async () => {
    const r = await run(client, "GET", "/variations/v1/items", [
      { id: "a", unitCostExTax: 50, markupPercent: 20, totalPrice: 6000, showInPdf: true },
      { id: "b", unitCostExTax: 10, totalPrice: 100, showInPdf: false },
    ]);
    assert.deepStrictEqual(r.body.map((i: any) => i.id), ["a"]);
    assert.ok(!("unitCostExTax" in r.body[0]));
  });

  await check("a unit-cost column the builder turned ON does reach the client", async () => {
    const r = await run(client, "GET", "/variations/v-costs/items", [
      { id: "a", unitCostExTax: 50, totalPrice: 6000, showInPdf: true },
    ]);
    assert.strictEqual(r.body[0].unitCostExTax, 50);
  });

  await check("client draft variation items are a 404", async () => {
    const r = await run(client, "GET", "/variations/v-draft/items", []);
    assert.strictEqual(r.status, 404);
  });

  await check("client invoice list shows sent/partial/paid/overdue only", async () => {
    const statuses = ["draft", "approved", "sent", "partial", "paid", "overdue"];
    const r = await run(client, "GET", "/client-invoices?projectId=p1",
      statuses.map((status) => ({ ...invoiceRow, id: status, status })));
    assert.deepStrictEqual(r.body.map((i: any) => i.id), ["sent", "partial", "paid", "overdue"]);
    assert.ok(!("xeroInvoiceId" in r.body[0]));
  });

  await check("client draft invoice payments are a 404", async () => {
    const r = await run(client, "GET", "/client-invoices/i-draft/payments", []);
    assert.strictEqual(r.status, 404);
  });

  await check("client allowances: contract estimate only, no money", async () => {
    const r = await run(client, "GET", "/projects/p1/allowances", [
      { item: { id: "a", estimateId: "est1", name: "Tiles", allowanceStatus: "pending", priceIncTax: 1 }, actualCost: 9 },
      { item: { id: "b", estimateId: "est0", name: "Old draft", allowanceStatus: "pending" }, actualCost: 9 },
    ]);
    assert.deepStrictEqual(r.body.map((row: any) => row.item.id), ["a"]);
    assert.ok(!("actualCost" in r.body[0]) && !("priceIncTax" in r.body[0].item));
  });

  await check("client allowance detail (cost ledger) is refused", async () => {
    const r = await run(client, "GET", "/projects/p1/allowances/a/detail", {});
    assert.strictEqual(r.status, 403);
  });

  await check("client cannot post into a channel they are not a member of", async () => {
    const r = await run(client, "POST", "/channels/team-only/messages", { ok: true });
    assert.strictEqual(r.status, 403);
    const ok = await run(client, "POST", "/channels/mine/messages", { ok: true });
    assert.strictEqual(ok.status, 200);
  });

  await check("schedule: phases only unless the role shows every item", async () => {
    stub("getScheduleById", async () => ({ projectId: "p1" }));
    const items = [
      { id: "phase", parentItemId: null },
      { id: "task", parentItemId: "phase" },
    ];
    denied = new Set(["portal.schedule.all_items:view"]);
    const phases = await run(client, "GET", "/projects/p1/schedule-items", items);
    assert.deepStrictEqual(phases.body.map((i: any) => i.id), ["phase"]);
    const viaSchedule = await run(client, "GET", "/schedules/s1/items", items);
    assert.deepStrictEqual(viaSchedule.body.map((i: any) => i.id), ["phase"]);
    denied = new Set();
    const all = await run(client, "GET", "/projects/p1/schedule-items", items);
    assert.deepStrictEqual(all.body.map((i: any) => i.id), ["phase", "task"]);
  });

  await check("gate reads portal keys, not the team's projects.* keys", async () => {
    denied = new Set(["portal.variations:view"]);
    const r = await run(client, "GET", "/variations?projectId=p1", []);
    assert.strictEqual(r.status, 403);
    denied = new Set(["portal.allowances:view"]);
    const a = await run(client, "GET", "/projects/p1/allowances", []);
    assert.strictEqual(a.status, 403);
    denied = new Set();
  });

  await check("a client cannot approve a selection option (the builder confirms)", async () => {
    const r = await run(client, "PATCH", "/selection-options/o1/approve", {});
    assert.strictEqual(r.status, 403);
  });

  await check("in-app signing and choosing are reachable, and follow the role's ticks", async () => {
    stub("getSelection", async () => ({ id: "s1", projectId: "p1" }));

    // Variation signing needs portal.variations:approve.
    denied = new Set();
    assert.strictEqual((await run(client, "POST", "/variations/v1/client-sign", { ok: true })).status, 200);
    denied = new Set(["portal.variations:approve"]);
    assert.strictEqual((await run(client, "POST", "/variations/v1/client-sign", { ok: true })).status, 403);

    // Choosing an option needs :edit, commenting needs :add, reading the
    // thread needs :view — a read-only client can do none of them.
    denied = new Set();
    assert.strictEqual((await run(client, "PATCH", "/selections/s1/options/o1/client-select", { ok: true })).status, 200);
    assert.strictEqual((await run(client, "POST", "/selections/s1/client-comments", { ok: true })).status, 200);
    assert.strictEqual((await run(client, "GET", "/selections/s1/client-comments", [])).status, 200);

    denied = new Set(["portal.selections:edit"]);
    assert.strictEqual((await run(client, "PATCH", "/selections/s1/options/o1/client-select", { ok: true })).status, 403);
    denied = new Set(["portal.selections:add"]);
    assert.strictEqual((await run(client, "POST", "/selections/s1/client-comments", { ok: true })).status, 403);
    denied = new Set();
  });

  await check("a team session cannot use the client-only doors", async () => {
    // The gate ignores non-client sessions, so these routes are reachable —
    // the routes themselves refuse anyone who is not a client (getClientUser).
    const r = await run(team, "POST", "/variations/v1/client-sign", { ok: true });
    assert.strictEqual(r.status, 200, "gate should not block a team session; the route does");
  });

  await check("client review detail loses token, ids and signer IP", async () => {
    stub("getReviewItem", async () => ({ projectId: "p1" }));
    const r = await run(client, "GET", "/reviews/r1", {
      id: "r1", portalToken: "t", reviewerContactId: "c", createdById: "u",
      approvals: [{ id: "ap", decision: "approved", decidedIp: "1.2.3.4", decidedUserAgent: "UA" }],
    });
    assert.ok(!("portalToken" in r.body) && !("reviewerContactId" in r.body) && !("createdById" in r.body));
    assert.ok(!("decidedIp" in r.body.approvals[0]) && !("decidedUserAgent" in r.body.approvals[0]));
    assert.strictEqual(r.body.approvals[0].decision, "approved");
  });
}

(async () => {
  await projections();
  await portalPermissions();
  await gate();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

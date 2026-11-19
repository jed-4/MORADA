/**
 * Delivery check-in: the crew's routes never return a price, and the
 * received/outstanding/status rules hold.
 *
 * Two halves:
 *   1. The projectors in shared/deliveries.ts are fed rows FULL of price
 *      fields and the output is scanned, at every depth, for any key that
 *      looks like money.
 *   2. server/deliveries.ts is read as text: every .json(...) a delivery route
 *      sends must be an error or one of the projector-built shapes, and the
 *      route code must not touch a price column.
 *
 * Run with:  npx tsx server/__tests__/delivery-check-in.test.ts
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  computeDeliveryStatus,
  computeLineProgress,
  isCompanyObjectPath,
  parseCheckInRequest,
  projectDeliveryPO,
  projectDeliveryRecord,
  receivedValueCents,
  supplierIssueEmail,
} from "../../shared/deliveries";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

const PRICE_KEY = /price|cost|total|amount|gst|tax|subtotal|markup|margin|rate|cents|value|paid|xero|internal/i;

function priceKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => priceKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(PRICE_KEY.test(k) ? [`${path}.${k}`] : []),
      ...priceKeys(v, `${path}.${k}`),
    ]);
  }
  return [];
}

// A PO row as the database returns it: every money column populated.
const po = {
  id: "po1", companyId: "c1", projectId: "p1", poNumber: "PO-2026-001", poType: "main",
  title: "Framing timber", supplierName: "Timber Co", status: "sent",
  requiredByDate: new Date("2026-11-20T00:00:00Z"), deliveryAddress: "1 Site St", deliveryInstructions: "Gate code 1234",
  subtotal: 100000, gstAmount: 10000, total: 110000, gstMode: "exclusive", internalNotes: "margin 20%",
  approvalThreshold: 50000, xeroPurchaseOrderId: "x1", deliveryStatus: "none", createdById: "u1",
};
const lines = [
  { id: "l1", purchaseOrderId: "po1", description: "90x45 MGP10", unit: "lm", quantity: "100.00", unitPrice: 500, total: 50000, gstAmount: 5000, isGstFree: false, costCodeId: "cc1", displayOrder: 1 },
  { id: "l2", purchaseOrderId: "po1", description: "Nails", unit: "box", quantity: "10.00", unitPrice: 5000, total: 50000, gstAmount: 5000, isGstFree: false, costCodeId: "cc1", displayOrder: 2 },
];
const delivery = {
  id: "d1", companyId: "c1", projectId: "p1", purchaseOrderId: "po1", receivedAt: new Date("2026-11-18T22:00:00Z"),
  receivedById: "u2", receivedByName: "Sam", docketNumber: "D-77", notes: null, hasIssues: true,
  clientRequestId: "req-1", createdAt: new Date("2026-11-18T22:01:00Z"),
};
const dItems = [
  { id: "i1", deliveryId: "d1", purchaseOrderItemId: "l1", descriptionSnapshot: "90x45 MGP10", qtyOrderedSnapshot: "100.00", qtyReceived: "60.00", condition: "short", note: "rest Friday", photoUrls: [] },
  { id: "i2", deliveryId: "d1", purchaseOrderItemId: "l2", descriptionSnapshot: "Nails", qtyOrderedSnapshot: "10.00", qtyReceived: "10.00", condition: "damaged", note: "boxes split", photoUrls: ["/objects/company/c1/uploads/a"] },
];

console.log("delivery check-in");

check("the PO view carries no price field at any depth", () => {
  const view = projectDeliveryPO(po as any, lines as any, dItems as any, [delivery]);
  assert.deepStrictEqual(priceKeys(view), []);
  assert.strictEqual(view.lines.length, 2);
});

check("the delivery record carries no price field at any depth", () => {
  const rec = projectDeliveryRecord(delivery as any, dItems as any, ["/objects/company/c1/uploads/docket"]);
  assert.deepStrictEqual(priceKeys(rec), []);
});

check("short counts toward received; damaged and wrong do not", () => {
  const p = computeLineProgress(lines, dItems);
  assert.deepStrictEqual(p.map((l) => [l.id, l.qtyReceived, l.qtyOutstanding]), [["l1", 60, 40], ["l2", 0, 10]]);
});

check("status: none / partial / issues / delivered", () => {
  const p0 = computeLineProgress(lines, []);
  assert.strictEqual(computeDeliveryStatus(p0, []), "none");
  const half = [{ purchaseOrderItemId: "l1", qtyReceived: "50", condition: "ok" }];
  assert.strictEqual(computeDeliveryStatus(computeLineProgress(lines, half), [{ hasIssues: false }]), "partial");
  assert.strictEqual(computeDeliveryStatus(computeLineProgress(lines, dItems), [{ hasIssues: true }]), "issues");
  const all = [
    ...dItems,
    { purchaseOrderItemId: "l1", qtyReceived: "40", condition: "ok" },
    { purchaseOrderItemId: "l2", qtyReceived: "10", condition: "ok" },
  ];
  // The damaged nails were replaced: complete wins over the earlier issue.
  assert.strictEqual(computeDeliveryStatus(computeLineProgress(lines, all), [{ hasIssues: true }, { hasIssues: false }]), "delivered");
});

check("received value is received qty × unit price through the PO's GST rule, capped at ordered", () => {
  const p = computeLineProgress(lines, [{ purchaseOrderItemId: "l1", qtyReceived: "60", condition: "ok" }]);
  // 60 × $5.00 = $300 ex, + GST = $330 on an exclusive PO.
  assert.strictEqual(receivedValueCents(lines, p, "exclusive"), 33000);
  assert.strictEqual(receivedValueCents(lines, p, "inclusive"), 30000);
  const over = computeLineProgress(lines, [{ purchaseOrderItemId: "l1", qtyReceived: "150", condition: "ok" }]);
  assert.strictEqual(receivedValueCents(lines, over, "inclusive"), 50000);
  // A lump-sum line (no unit price) is valued from its total.
  const lump = [{ id: "x", description: "Kit", quantity: "2", unitPrice: 0, total: 2000 }];
  assert.strictEqual(receivedValueCents(lump, computeLineProgress(lump, [{ purchaseOrderItemId: "x", qtyReceived: "1", condition: "ok" }]), "inclusive"), 1000);
});

check("photos must be this company's uploads", () => {
  assert.ok(isCompanyObjectPath("/objects/company/c1/uploads/abc", "c1"));
  assert.ok(!isCompanyObjectPath("/objects/company/c2/uploads/abc", "c1"));
  assert.ok(!isCompanyObjectPath("/objects/company/c1/", "c1"));
  assert.ok(!isCompanyObjectPath("/objects/company/c1/../c2/x", "c1"));
  assert.ok(!isCompanyObjectPath("https://evil.example/x.jpg", "c1"));
});

check("check-in parsing: docket photo, lines, quantities, request id", () => {
  const opts = { companyId: "c1", lineIds: new Set(["l1", "l2"]), docketPhotoRequired: true };
  const good = {
    clientRequestId: "r1",
    docketPhotoUrls: ["/objects/company/c1/uploads/d"],
    items: [{ purchaseOrderItemId: "l1", qtyReceived: 5, condition: "ok" }],
  };
  assert.ok(parseCheckInRequest(good, opts).ok);
  const code = (b: any, o = opts) => { const r = parseCheckInRequest(b, o); return r.ok ? "ok" : r.code; };
  assert.strictEqual(code({ ...good, docketPhotoUrls: [] }), "DOCKET_PHOTO_REQUIRED");
  assert.strictEqual(code({ ...good, docketPhotoUrls: [] }, { ...opts, docketPhotoRequired: false }), "ok");
  assert.strictEqual(code({ ...good, docketPhotoUrls: ["/objects/company/c2/x"] }), "BAD_PHOTO_PATH");
  assert.strictEqual(code({ ...good, items: [] }), "NO_ITEMS");
  assert.strictEqual(code({ ...good, items: [{ purchaseOrderItemId: "other", qtyReceived: 1 }] }), "BAD_LINE");
  assert.strictEqual(code({ ...good, items: [{ purchaseOrderItemId: "l1", qtyReceived: -1 }] }), "BAD_QTY");
  assert.strictEqual(code({ ...good, items: [{ purchaseOrderItemId: "l1", qtyReceived: 1, condition: "lost" }] }), "BAD_CONDITION");
  assert.strictEqual(code({ ...good, clientRequestId: "" }), "BAD_REQUEST");
  // A future receivedAt (a phone clock gone wrong) is clamped to now.
  const now = new Date("2026-11-19T00:00:00Z");
  const r = parseCheckInRequest({ ...good, receivedAt: "2027-01-01T00:00:00Z" }, { ...opts, now });
  assert.ok(r.ok && r.value.receivedAt.getTime() === now.getTime());
});

check("the supplier email lists the problems and no prices", () => {
  const rec = projectDeliveryRecord(delivery as any, dItems as any, []);
  const { subject, body } = supplierIssueEmail({ poNumber: "PO-2026-001", supplierName: "Timber Co", delivery: rec });
  assert.ok(subject.includes("PO-2026-001") && subject.includes("D-77"));
  assert.ok(body.includes("Nails: Damaged") && body.includes("boxes split"));
  assert.ok(!/\$/.test(body));
});

// ── The route module, read as text ──────────────────────────────────────────

const src = readFileSync(fileURLToPath(new URL("../deliveries.ts", import.meta.url)), "utf8");
const start = src.indexOf("export function registerDeliveryRoutes");
const end = src.indexOf("async function notifyIssue");
const routes = src.slice(start, end);

check("the delivery routes were found", () => {
  assert.ok(start > 0 && end > start);
  assert.strictEqual((routes.match(/app\.(get|post|put|patch|delete)\(/g) || []).length, 3);
});

check("every delivery route is team-only and holds projects.deliveries", () => {
  const regs = routes.split(/app\.(?:get|post|put|patch|delete)\(/).slice(1);
  for (const r of regs) {
    assert.ok(/requireTeamMember/.test(r.slice(0, 300)), "requireTeamMember missing");
    assert.ok(/requirePermission\("projects\.deliveries", "(view|add)"\)/.test(r.slice(0, 300)), "permission missing");
  }
});

check("every response is an error or a projector-built shape", () => {
  const ALLOWED = [
    /^\{ error[:,]/,
    /^\{\s*projectId: project\.id,\s*docketPhotoRequired: required,\s*purchaseOrders: pos\.map\(\(po\) => poView\(po, data\)\),?\s*\}$/,
    /^\{\s*docketPhotoRequired: required,\s*po: poView\(po, data\),\s*deliveries: data\.deliveries\.map\(\(d\) => recordView\(d, data\)\),?\s*\}$/,
    /^\{ delivery: recordView\(delivery, data\), po: poView\([^)]*\), replayed: (true|false) \}$/,
  ];
  const calls = [...src.matchAll(/\.json\(([\s\S]*?)\);/g)].map((m) => m[1].trim());
  assert.ok(calls.length >= 8);
  const bad = calls.filter((c) => !ALLOWED.some((re) => re.test(c)));
  assert.deepStrictEqual(bad, []);
});

check("the route code never reads a price column", () => {
  const priceRefs = routes.match(/unitPrice|\.total\b|gstAmount|subtotal|internalNotes|receivedValueCents|deliverySummaryFor/g) || [];
  assert.deepStrictEqual(priceRefs, []);
});

console.log(`\n${passed} passed`);

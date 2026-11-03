// Run: npx tsx server/__tests__/po-totals.test.ts
import assert from "node:assert";
import { computePOTotalsCents, hasPricedLine, poLineCents } from "../../shared/poTotals";
import { insertPurchaseOrderSchema, updatePurchaseOrderSchema } from "../../shared/schema";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const line = (total: number, isGstFree = false) => ({ total, isGstFree });

console.log("GST modes");
check("exclusive adds GST on top", () => {
  assert.deepEqual(computePOTotalsCents([line(10000)], "exclusive"), { subtotal: 10000, gstAmount: 1000, total: 11000 });
});
check("inclusive never adds a second 10%", () => {
  assert.deepEqual(computePOTotalsCents([line(11000)], "inclusive"), { subtotal: 10000, gstAmount: 1000, total: 11000 });
});
check("inclusive total always equals the sum of its lines", () => {
  const lines = [line(336962), line(284799), line(184664)];
  assert.equal(computePOTotalsCents(lines, "inclusive").total, 806425);
});
check("gst_free mode carries no GST", () => {
  assert.deepEqual(computePOTotalsCents([line(10000)], "gst_free"), { subtotal: 10000, gstAmount: 0, total: 10000 });
});
check("a GST-free line is the same in every mode", () => {
  for (const mode of ["exclusive", "inclusive", "gst_free"]) {
    assert.deepEqual(computePOTotalsCents([line(10000, true)], mode), { subtotal: 10000, gstAmount: 0, total: 10000 });
  }
});
check("a mixed PO only taxes the taxable line", () => {
  assert.deepEqual(computePOTotalsCents([line(10000), line(5000, true)], "exclusive"), { subtotal: 15000, gstAmount: 1000, total: 16000 });
});

console.log("lines");
check("falls back to quantity x price when the line total is empty", () => {
  assert.equal(poLineCents({ quantity: "2.5", unitPrice: 1000, total: 0 }), 2500);
});
check("adding, editing and deleting a line each move the total", () => {
  const lines = [line(10000)];
  assert.equal(computePOTotalsCents(lines, "exclusive").total, 11000);
  lines.push(line(5000));
  assert.equal(computePOTotalsCents(lines, "exclusive").total, 16500);
  lines[1] = line(7000);
  assert.equal(computePOTotalsCents(lines, "exclusive").total, 18700);
  lines.pop();
  assert.equal(computePOTotalsCents(lines, "exclusive").total, 11000);
});
check("a draft with priced lines never totals $0", () => {
  for (const mode of ["exclusive", "inclusive", "gst_free"]) {
    assert.ok(computePOTotalsCents([{ quantity: "3", unitPrice: 1250 }], mode).total > 0);
  }
});
check("blank lines do not count as priced, so a site PO keeps its header", () => {
  assert.equal(hasPricedLine([{ quantity: "1", unitPrice: 0, total: 0 }]), false);
  assert.equal(hasPricedLine([line(1)]), true);
});

console.log("required by date");
const insertBase = { companyId: "c", projectId: "p", poNumber: "PO-1", createdById: "u" };
check("a blank date saves as null on edit, not 1970", () => {
  assert.strictEqual(updatePurchaseOrderSchema.parse({ requiredByDate: null }).requiredByDate, null);
});
check("a blank date saves as null on create, not 1970", () => {
  assert.strictEqual(insertPurchaseOrderSchema.parse({ ...insertBase, requiredByDate: null }).requiredByDate, null);
});
check("an old 1970 value sent back clears itself", () => {
  assert.strictEqual(updatePurchaseOrderSchema.parse({ requiredByDate: "1970-01-01T00:00:00.000Z" }).requiredByDate, null);
});
check("a real date still saves", () => {
  const out = updatePurchaseOrderSchema.parse({ requiredByDate: "2026-11-20" }).requiredByDate;
  assert.equal(out?.toISOString().slice(0, 10), "2026-11-20");
});
check("leaving the date out leaves it alone", () => {
  assert.equal(updatePurchaseOrderSchema.parse({ title: "x" }).requiredByDate, undefined);
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");

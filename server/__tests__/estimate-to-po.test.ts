// Run: npx tsx server/__tests__/estimate-to-po.test.ts
import assert from "node:assert";
import { estimateLineToPOLine } from "../../shared/estimateToPO";
import { computePOTotalsCents } from "../../shared/poTotals";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const base = { name: "Timber", quantity: 3, unitType: "m", unitCostExTax: 100, markupPercent: 25 };

check("carries the name, unit and quantity", () => {
  const line = estimateLineToPOLine(base, "exclusive");
  assert.equal(line.description, "Timber");
  assert.equal(line.unit, "m");
  assert.equal(line.quantity, "3");
});
check("dollars become cents, at cost with no markup", () => {
  const line = estimateLineToPOLine(base, "exclusive");
  assert.equal(line.unitPrice, 10000);
  assert.equal(line.total, 30000);
});
check("exclusive PO totals cost plus GST", () => {
  assert.equal(computePOTotalsCents([estimateLineToPOLine(base, "exclusive")], "exclusive").total, 33000);
});
check("inclusive PO comes to the same money", () => {
  const line = estimateLineToPOLine(base, "inclusive");
  assert.equal(line.total, 33000);
  assert.deepEqual(computePOTotalsCents([line], "inclusive"), { subtotal: 30000, gstAmount: 3000, total: 33000 });
});
check("wastage is what has to be bought", () => {
  const line = estimateLineToPOLine({ ...base, wastagePercent: 10 }, "exclusive");
  assert.equal(line.quantity, "3.3");
  assert.equal(line.total, 33000);
});
check("a typed inc-GST price stays exact", () => {
  const line = estimateLineToPOLine({ ...base, quantity: 1, unitCostExTax: 60 / 1.1, unitCostIncTax: 60 }, "inclusive");
  assert.equal(line.total, 6000);
});
check("a lump sum is one line at cost", () => {
  const line = estimateLineToPOLine({ name: "Hire", quantity: 0, unitCostExTax: 0, priceIncTax: 1375, markupPercent: 25 }, "exclusive");
  assert.equal(line.quantity, "1");
  assert.equal(line.total, 100000);
});
check("an unnamed line still has a description", () => {
  assert.equal(estimateLineToPOLine({ quantity: 1 }, "exclusive").description, "Untitled item");
});

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");

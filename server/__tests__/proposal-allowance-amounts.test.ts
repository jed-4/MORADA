/**
 * The Allowances page prints the allowance as entered in the estimate — never
 * with the line markup or the builder's margin added (allowanceLineAmounts).
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/proposal-allowance-amounts.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { allowanceLineAmounts, clientLineAmounts } from "../../shared/proposalTotals";

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

console.log("\nproposal-allowance-amounts");

const TAX = { taxRate: 10 };

check("a priced allowance prints qty x unit cost inc GST, not the marked-up figure", () => {
  const item = { unitCostExTax: 1000, quantity: 2, markupPercent: 15, priceIncTax: 2530 };
  const a = allowanceLineAmounts(item as any, TAX);
  assert.deepStrictEqual(a, { exTax: 2000, incTax: 2200, unitExTax: 1000, unitIncTax: 1100 });
  // The client price for the same line still carries both markups.
  const c = clientLineAmounts(item as any, { projectMarkupPercent: 20, taxRate: 10 });
  assert.strictEqual(c.incTax, 3036);
});

check("a fixed-price allowance prints its typed amount with no margin", () => {
  const a = allowanceLineAmounts({ unitCostExTax: 0, quantity: 1, markupPercent: 10, priceIncTax: 5000 } as any, TAX);
  assert.deepStrictEqual(a, { incTax: 5000, exTax: 4545.45, unitExTax: null, unitIncTax: null });
});

check("blank markup and quantity are harmless", () => {
  const a = allowanceLineAmounts({ unitCostExTax: 250, quantity: null, markupPercent: null } as any, TAX);
  assert.strictEqual(a.incTax, 0);
  assert.strictEqual(a.unitIncTax, 275);
});

console.log(`\nproposal-allowance-amounts: ${passed} checks passed\n`);

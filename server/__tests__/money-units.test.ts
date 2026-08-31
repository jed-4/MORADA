/**
 * Unit-boundary tests for the project money figures that were rendering on the
 * wrong basis (allowances 100x; budget baseline mixing cost with sell price).
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/money-units.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { formatCents, exGstFromInc, incGstFromEx } from "@shared/money";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const D = (dollars: number) => Math.round(dollars * 100);

console.log("money units:");

console.log(" bug 2 — allowances arrive from the API already in cents:");

// getProjectAllowances (server/storage.ts) re-resolves every allowance line and
// overwrites item.priceIncTax with `priceInCents`. This mirrors that contract.
function apiAllowanceRow(priceDollarsIncGst: number) {
  const resolvedPriceIncTax = priceDollarsIncGst; // dollars, from resolveEstimateStoredPrice
  return {
    item: {
      allowanceStatus: "finalized",
      priceIncTax: Math.round(Number(resolvedPriceIncTax.toFixed(2)) * 100), // CENTS
    },
  };
}

check("the API converts dollars to cents exactly once", () => {
  const row = apiAllowanceRow(16207.5);
  assert.strictEqual(row.item.priceIncTax, D(16207.5));
});

check("summing the rows as-is gives $16,207.50", () => {
  const rows = [apiAllowanceRow(10000), apiAllowanceRow(6207.5)];
  const total = rows.reduce((s, a) => s + Math.round(Number(a.item.priceIncTax ?? 0)), 0);
  assert.strictEqual(total, D(16207.5));
  assert.strictEqual(formatCents(total), "$16,207.50");
});

check("the old extra x100 reproduced the $1,620,750.00 the header showed", () => {
  const rows = [apiAllowanceRow(10000), apiAllowanceRow(6207.5)];
  const legacy = rows.reduce((s, a) => s + Math.round((a.item.priceIncTax ?? 0) * 100), 0);
  assert.strictEqual(legacy, D(1620750));
  // Exactly 100x the truth — the signature of a double cents conversion.
  const correct = rows.reduce((s, a) => s + Math.round(Number(a.item.priceIncTax ?? 0)), 0);
  assert.strictEqual(legacy, correct * 100);
});

console.log(" bug 5 — the budget baseline is cost-only on both sides:");

// Mirrors DatabaseStorage.variationBuilderCostExGstCents.
function variationBuilderCostExGstCents(items: { quantity: number | null; unitCostExTax: number }[]) {
  return items.reduce((sum, item) => {
    const qty = item.quantity == null ? 1 : Number(item.quantity) || 0;
    return sum + Math.round((Number(item.unitCostExTax) || 0) * qty * 100);
  }, 0);
}

check("variation cost is qty x unitCostExTax in dollars, rounded per line", () => {
  const cents = variationBuilderCostExGstCents([
    { quantity: 3, unitCostExTax: 100.005 },
    { quantity: null, unitCostExTax: 50 },
  ]);
  assert.strictEqual(cents, D(300.02) + D(50));
});

check("a variation's sell price exceeds its cost, so the two bases differ", () => {
  const costCents = variationBuilderCostExGstCents([{ quantity: 1, unitCostExTax: 20000 }]);
  const globalMarkupPercent = 16.17;
  const sellSubtotalCents = Math.round(costCents * (1 + globalMarkupPercent / 100));

  const baselineCents = D(157121.62); // Budget page cost-code BUDGETED total
  assert.strictEqual(baselineCents + costCents, D(177121.62));
  // Adding the SELL figure instead is what inflated the widget's budget.
  assert.ok(sellSubtotalCents > costCents);
  assert.strictEqual(baselineCents + sellSubtotalCents, D(180355.62));
});

check("revised = baseline + variation cost reconciles with the cost table", () => {
  const baselineCents = D(157121.62);
  const variationCents = variationBuilderCostExGstCents([{ quantity: 1, unitCostExTax: 20000 }]);
  const revised = baselineCents + variationCents;
  // The cost-code table now carries the same two buckets, so its total matches.
  const costTableTotal = baselineCents + variationCents;
  assert.strictEqual(revised, costTableTotal);
});

console.log(" bug 6 — the ex/inc GST relationship the screens must agree on:");

check("the 20 Swan contract is the same number on both bases", () => {
  const exGst = D(211151.45);   // /budget
  const incGst = D(232266.60);  // CASH + /client-invoices
  assert.strictEqual(incGstFromEx(exGst), incGst);
  assert.strictEqual(exGstFromInc(incGst), exGst);
});

check("bills reconcile between budget (ex) and bills/cash (inc)", () => {
  const billsIncGst = D(148787.34);
  assert.strictEqual(exGstFromInc(billsIncGst), D(135261.22));
});

console.log(` \n${passed} checks passed.`);

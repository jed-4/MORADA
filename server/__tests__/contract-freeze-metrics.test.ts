/**
 * Contract-freeze tests — pure half (shared/projectMetrics.ts).
 *
 * No DB, no server. These lock in the seam that makes the freeze work:
 * `computeContractMetricsCents(..., frozen)` — when a frozen contract sum is
 * supplied it REPLACES the live estimate recomputation as the original
 * contract price.
 *
 * Business rule: once a job is contracted the contract sum must not change —
 * only an approved variation may change what the client owes. Morada used to
 * recompute the "original contract" live from the selected estimate on every
 * read, so editing a contracted estimate silently moved the client's number.
 * The sharpest symptom was a DOUBLE-CREDIT: excluding an allowance shrank the
 * live estimate (credit #1, silent, no paperwork) and the deduction variation
 * raised for it credited the same amount again (credit #2). Check 4 below is
 * that scenario end to end.
 *
 * The DB/HTTP plumbing is covered by contract-freeze.test.ts.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/contract-freeze-metrics.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  computeContractMetricsCents,
  frozenContractTotalFrom,
} from "@shared/projectMetrics";

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

console.log("\nContract freeze — pure (shared/projectMetrics)\n");

// One $100,000 ex-GST priced line + one $10,000 inc-GST flat allowance
// (unitCost 0 => fixed-price line, priced off the cache).
// Ex: 100,000 + 9,090.91 = 109,090.91 -> inc 120,000.00
const items = [
  { priceIncTax: 110000, taxAmount: 10000, unitCostExTax: 100000, quantity: 1, markupPercent: 0 },
  { priceIncTax: 10000, taxAmount: 909.09, unitCostExTax: 0, quantity: 1, markupPercent: null },
];

check("without a frozen sum the original is recomputed from the estimate", () => {
  const m = computeContractMetricsCents(items, [], 0, 10);
  assert.strictEqual(m.originalContractPriceIncGstCents, 12000000);
  assert.strictEqual(m.revisedContractPriceIncGstCents, 12000000);
});

check("with a frozen sum the original IS the frozen sum, whatever the items say", () => {
  // Items that would recompute to a completely different number.
  const wildlyDifferent = [
    { priceIncTax: 1, taxAmount: 0, unitCostExTax: 1, quantity: 1, markupPercent: 0 },
  ];
  const m = computeContractMetricsCents(wildlyDifferent, [], 0, 10, {
    exGstCents: 10909091,
    incGstCents: 12000000,
  });
  assert.strictEqual(m.originalContractPriceExGstCents, 10909091);
  assert.strictEqual(m.originalContractPriceIncGstCents, 12000000);
});

check("revised = frozen + approved variations (variations apply ON TOP)", () => {
  const m = computeContractMetricsCents(
    items,
    [
      { status: "approved", subtotal: 454545, totalAmount: 500000 },
      { status: "released", subtotal: 90909, totalAmount: 100000 },
      // Neither of these may touch the contract.
      { status: "pending", subtotal: 909091, totalAmount: 1000000 },
      { status: "rejected", subtotal: 909091, totalAmount: 1000000 },
    ],
    0,
    10,
    { exGstCents: 10909091, incGstCents: 12000000 },
  );
  assert.strictEqual(m.approvedVariationsIncGstCents, 600000);
  assert.strictEqual(m.revisedContractPriceIncGstCents, 12000000 + 600000);
  assert.strictEqual(m.revisedContractPriceExGstCents, 10909091 + 545454);
});

check("double-credit is eliminated: excluding an allowance no longer moves the contract", () => {
  const frozen = { exGstCents: 10909091, incGstCents: 12000000 };

  // The allowance is excluded — shared/pricing zeroes the line, so a LIVE
  // recompute drops the estimate by the full $10,000 allowance.
  const itemsAfterExclusion = [
    items[0],
    { priceIncTax: 0, taxAmount: 0, unitCostExTax: 0, quantity: 1, markupPercent: null },
  ];
  const live = computeContractMetricsCents(itemsAfterExclusion, [], 0, 10);
  assert.strictEqual(
    live.originalContractPriceIncGstCents,
    11000000,
    "precondition: the live estimate really does drop by the allowance",
  );

  // The deduction variation credits the client the allowance's ORIGINAL amount.
  const deduction = [{ status: "approved", subtotal: -909091, totalAmount: -1000000 }];

  // BEFORE (no freeze): $120,000 -> $110,000 by exclusion, then again by the
  // variation. $10,000 credited twice — the bug.
  const doubleCredited = computeContractMetricsCents(itemsAfterExclusion, deduction, 0, 10);
  assert.strictEqual(doubleCredited.revisedContractPriceIncGstCents, 10000000);

  // AFTER (frozen): the exclusion cannot move the contract, so the variation is
  // the SOLE credit. $10,000 credited exactly once.
  const frozenResult = computeContractMetricsCents(itemsAfterExclusion, deduction, 0, 10, frozen);
  assert.strictEqual(frozenResult.originalContractPriceIncGstCents, 12000000);
  assert.strictEqual(frozenResult.approvedVariationsIncGstCents, -1000000);
  assert.strictEqual(frozenResult.revisedContractPriceIncGstCents, 11000000);
});

check("frozenContractTotalFrom only reports a freeze on a complete row", () => {
  assert.strictEqual(frozenContractTotalFrom(null), null);
  assert.strictEqual(frozenContractTotalFrom({}), null);
  // Not contracted.
  assert.strictEqual(
    frozenContractTotalFrom({
      contractedAt: null,
      contractedTotalExGstCents: 1,
      contractedTotalIncGstCents: 2,
    }),
    null,
  );
  // Contracted but half-written — must fall back to live rather than report $0.
  assert.strictEqual(
    frozenContractTotalFrom({
      contractedAt: new Date(),
      contractedTotalExGstCents: null,
      contractedTotalIncGstCents: 2,
    }),
    null,
  );
  assert.deepStrictEqual(
    frozenContractTotalFrom({
      contractedAt: new Date(),
      contractedTotalExGstCents: 10909091,
      contractedTotalIncGstCents: 12000000,
    }),
    { exGstCents: 10909091, incGstCents: 12000000 },
  );
});

check("a zero frozen sum is still a freeze (it is not treated as absent)", () => {
  const m = computeContractMetricsCents(items, [], 0, 10, { exGstCents: 0, incGstCents: 0 });
  assert.strictEqual(m.originalContractPriceIncGstCents, 0);
});

console.log(`\ncontract-freeze-metrics: ${passed} checks passed\n`);

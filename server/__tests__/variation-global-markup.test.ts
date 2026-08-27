/**
 * Variation global-markup tests — pure functions over shared/variationTotals.ts.
 * No DB, no server.
 *
 * Markup on a variation has two independent layers and the whole point of this
 * change is that they stay independent:
 *
 *   - Per-line markup is baked into the line's totalPrice upstream, so by the
 *     time these totals run it is indistinguishable from cost. Untouched here.
 *   - Global markup is applied once, in computeVariationTotals, to the ex-GST
 *     value of everything being on-charged.
 *
 * The cases that matter, and why:
 *
 *   1. No global markup reproduces the old numbers exactly — this function is
 *      called on every existing variation and must not move a cent.
 *   2. A fractional percentage does not truncate. Per-line markup is an integer
 *      column; this one is double precision precisely so 12.5% survives.
 *   3. Allowance rows stay OUT of the markup base. They are adjustments and are
 *      routinely negative — marking up a credit would enlarge the client's
 *      deduction.
 *   4. GST is apportioned pro-rata across the taxable and non-taxable slices of
 *      the base. Charging GST on all the markup (or none) misstates the tax the
 *      moment a variation mixes both.
 *   5. A part-taxable bill contributes to each slice by the GST actually
 *      charged, not by an all-or-nothing guess.
 *   6. subtotal + gst == total at every percentage, including ugly ones.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/variation-global-markup.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { computeVariationTotals } from "@shared/variationTotals";

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

check("no global markup reproduces the pre-change totals exactly", () => {
  const t = computeVariationTotals({
    items: [
      { totalPrice: 144000, taxable: true },
      { totalPrice: 53900, taxable: true },
    ],
  });
  assert.strictEqual(t.subtotalCents, 197900);
  assert.strictEqual(t.gstCents, 19790);
  assert.strictEqual(t.totalCents, 217690);
  assert.strictEqual(t.globalMarkupCents, 0);
});

check("an explicit 0% is the same as none", () => {
  const none = computeVariationTotals({ items: [{ totalPrice: 100000, taxable: true }] });
  const zero = computeVariationTotals({
    items: [{ totalPrice: 100000, taxable: true }],
    globalMarkupPercent: 0,
  });
  assert.deepStrictEqual(zero, none);
});

check("10% on an all-taxable variation marks up and taxes the markup", () => {
  const t = computeVariationTotals({
    items: [{ totalPrice: 100000, taxable: true }],
    globalMarkupPercent: 10,
  });
  assert.strictEqual(t.markupBaseCents, 100000);
  assert.strictEqual(t.globalMarkupCents, 10000);
  assert.strictEqual(t.subtotalCents, 110000);
  assert.strictEqual(t.gstCents, 11000);
  assert.strictEqual(t.totalCents, 121000);
});

check("a fractional percentage does not truncate to a whole number", () => {
  const t = computeVariationTotals({
    items: [{ totalPrice: 100000, taxable: true }],
    globalMarkupPercent: 12.5,
  });
  assert.strictEqual(t.globalMarkupCents, 12500); // 12000 would mean an int cast
});

check("allowance rows are excluded from the base but stay in the subtotal", () => {
  const t = computeVariationTotals({
    items: [
      { totalPrice: 100000, taxable: true, itemType: "cost_line" },
      { totalPrice: -20000, taxable: true, itemType: "allowance" },
    ],
    globalMarkupPercent: 10,
  });
  assert.strictEqual(t.markupBaseCents, 100000);
  assert.strictEqual(t.globalMarkupCents, 10000); // NOT 8000
  assert.strictEqual(t.subtotalCents, 90000); // 100000 - 20000 + 10000
});

check("a negative allowance never enlarges itself via markup", () => {
  const t = computeVariationTotals({
    items: [{ totalPrice: -50000, taxable: true, itemType: "allowance" }],
    globalMarkupPercent: 50,
  });
  assert.strictEqual(t.markupBaseCents, 0);
  assert.strictEqual(t.globalMarkupCents, 0);
  assert.strictEqual(t.subtotalCents, -50000);
});

check("GST on the markup is pro-rata across taxable and non-taxable value", () => {
  const t = computeVariationTotals({
    items: [
      { totalPrice: 100000, taxable: true },
      { totalPrice: 100000, taxable: false },
    ],
    globalMarkupPercent: 10,
  });
  assert.strictEqual(t.markupBaseCents, 200000);
  assert.strictEqual(t.globalMarkupCents, 20000);
  assert.strictEqual(t.subtotalCents, 220000);
  // 10% of the taxable 100000, plus 10% of the taxable HALF of the markup.
  // Taxing the whole markup would give 12000; taxing none would give 10000.
  assert.strictEqual(t.gstCents, 11000);
});

check("a part-taxable bill splits by the GST actually charged", () => {
  const t = computeVariationTotals({
    items: [],
    bills: [{ subtotal: 100000, tax: 4000, total: 104000 }],
    globalMarkupPercent: 10,
  });
  assert.strictEqual(t.markupBaseCents, 100000);
  assert.strictEqual(t.globalMarkupCents, 10000);
  // Taxable slice is 4000/0.1 = 40000, so 4000 of the markup attracts GST.
  assert.strictEqual(t.gstCents, 4400);
});

check("a bill without usable components falls back to a 1/11 split", () => {
  const t = computeVariationTotals({
    items: [],
    bills: [{ subtotal: null, tax: null, total: 110000 }],
    globalMarkupPercent: 10,
  });
  assert.strictEqual(t.markupBaseCents, 100000);
  assert.strictEqual(t.gstCents, 11000);
});

check("on-charged labour is in the base and is taxable", () => {
  const t = computeVariationTotals({
    items: [],
    timesheets: [{ total: "1000.00" }],
    globalMarkupPercent: 10,
  });
  assert.strictEqual(t.markupBaseCents, 100000);
  assert.strictEqual(t.subtotalCents, 110000);
  assert.strictEqual(t.gstCents, 11000);
});

check("subtotal + gst == total at every percentage, mixed inputs", () => {
  for (const pct of [0, 5, 7.5, 10, 12.5, 33.333, 100]) {
    const t = computeVariationTotals({
      items: [
        { totalPrice: 12345, taxable: true },
        { totalPrice: 6789, taxable: false },
        { totalPrice: -999, taxable: true, itemType: "allowance" },
      ],
      bills: [{ subtotal: 5555, tax: 555, total: 6110 }],
      timesheets: [{ total: "77.77" }],
      globalMarkupPercent: pct,
    });
    assert.strictEqual(
      t.subtotalCents + t.gstCents,
      t.totalCents,
      `parts must sum to whole at ${pct}%`,
    );
    assert.ok(Number.isInteger(t.subtotalCents), `subtotal must be whole cents at ${pct}%`);
    assert.ok(Number.isInteger(t.gstCents), `gst must be whole cents at ${pct}%`);
  }
});

console.log(`\nvariation-global-markup: ${passed} checks passed\n`);

/**
 * Estimate pricing tests (Task #437 — zero-quantity total bug + integrity net).
 *
 * These are pure-function tests over shared/pricing.ts — no DB, no server.
 * They lock in the corrected fixed-price classification and the parts-sum-to-
 * whole guarantee:
 *
 *   1. A normal priced line prices correctly.
 *   2. A priced line (unitCost > 0) with quantity 0 prices to $0 (the bug).
 *   3. A Prime Cost allowance (unitCost 0, typed amount) keeps its typed price.
 *   4. A Provisional Sum allowance keeps its typed price.
 *   5. A line with per-line markup prices with its own markup.
 *   6. A mix under a project-level markup sums correctly (parts == whole).
 *   7. Bulk-zeroing every priced line drops the whole estimate to $0 while an
 *      allowance line retains its typed amount.
 *   8. isFixedPriceLine / resolveEstimateStoredPrice classify on unitCost alone.
 *   9. The total-integrity reporter fires on a genuine divergence and never on
 *      legitimate rounding across many lines.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/estimate-pricing.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  computeEstimateItemPrice,
  computeEstimateSummary,
  estimateItemBuilderCostExTax,
  isFixedPriceLine,
  resolveEstimateStoredPrice,
  round2,
  setEstimateTotalIntegrityReporter,
  type EstimateItemSummaryInput,
  type EstimateTotalIntegrityViolation,
} from "@shared/pricing";

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

// Helper: sum the on-screen per-line inc-tax totals (no global markup).
function sumLineIncTax(items: EstimateItemSummaryInput[], taxRate = 10): number {
  let sum = 0;
  for (const item of items) {
    const unitCost = Number(item.unitCostExTax ?? 0);
    if (!isFixedPriceLine(unitCost)) {
      sum += computeEstimateItemPrice({
        unitCostExTax: unitCost,
        quantity: Number(item.quantity ?? 0),
        markupPercent: item.markupPercent ?? null,
        projectMarkupPercent: 0,
        taxRate,
      }).lineIncTax;
    } else {
      sum += Number(item.priceIncTax ?? 0);
    }
  }
  return round2(sum);
}

console.log("estimate-pricing:");

// ---------------------------------------------------------------------------
// 1. Classification: unitCost alone, NOT qty × unitCost.
// ---------------------------------------------------------------------------
check("isFixedPriceLine is true only when unitCost is 0", () => {
  assert.strictEqual(isFixedPriceLine(0), true);
  assert.strictEqual(isFixedPriceLine(null), true);
  assert.strictEqual(isFixedPriceLine(undefined), true);
  assert.strictEqual(isFixedPriceLine(100), false);
  // The bug: a priced line whose qty is 0 must NOT be fixed-price. The
  // classifier no longer takes quantity into account at all.
  assert.strictEqual(isFixedPriceLine(100), false);
});

// ---------------------------------------------------------------------------
// 2. Normal priced line.
// ---------------------------------------------------------------------------
check("normal priced line prices at qty × unitCost + GST", () => {
  const p = computeEstimateItemPrice({
    unitCostExTax: 100,
    quantity: 3,
    markupPercent: 0,
    projectMarkupPercent: 0,
    taxRate: 10,
  });
  assert.strictEqual(p.builderCost, 300);
  assert.strictEqual(p.lineExTax, 300);
  assert.strictEqual(p.lineIncTax, 330);
});

// ---------------------------------------------------------------------------
// 3. THE BUG: priced line with quantity 0 must price to $0.
// ---------------------------------------------------------------------------
check("priced line (unitCost>0) with quantity 0 prices to $0 on save", () => {
  const resolved = resolveEstimateStoredPrice({
    unitCostExTax: 250,
    quantity: 0,
    markupPercent: 15,
    projectMarkupPercent: 20,
    taxRate: 10,
    // Stale cached price from before the qty was zeroed — MUST be ignored.
    existingPriceIncTax: 316.25,
  });
  assert.strictEqual(resolved.priceIncTax, 0);
  assert.strictEqual(resolved.taxAmount, 0);
});

check("priced line with quantity 0 contributes $0 to the summary", () => {
  const items: EstimateItemSummaryInput[] = [
    { unitCostExTax: 250, quantity: 0, markupPercent: 15, priceIncTax: 316.25, taxAmount: 28.75 },
  ];
  const s = computeEstimateSummary(items, { projectMarkupPercent: 20, taxRate: 10 });
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.builderCostTotal, 0);
  assert.strictEqual(estimateItemBuilderCostExTax(items[0]), 0);
});

// ---------------------------------------------------------------------------
// 4 & 5. Genuine allowances keep their typed amount.
// ---------------------------------------------------------------------------
check("Prime Cost allowance (unitCost 0) keeps its typed amount", () => {
  const resolved = resolveEstimateStoredPrice({
    unitCostExTax: 0,
    quantity: 1,
    markupPercent: null,
    projectMarkupPercent: 20,
    taxRate: 10,
    existingPriceIncTax: 5500,
  });
  assert.strictEqual(resolved.priceIncTax, 5500);
  assert.strictEqual(resolved.taxAmount, 500); // 5500 - 5500/1.1
});

check("Provisional Sum allowance keeps its typed amount in the summary", () => {
  const items: EstimateItemSummaryInput[] = [
    { unitCostExTax: 0, quantity: 1, priceIncTax: 5500, taxAmount: 500 },
  ];
  const s = computeEstimateSummary(items, { projectMarkupPercent: 0, taxRate: 10 });
  assert.strictEqual(s.total, 5500);
  assert.strictEqual(estimateItemBuilderCostExTax(items[0]), 5000);
});

// ---------------------------------------------------------------------------
// 6. Per-line markup + mix under a project-level markup: parts == whole.
// ---------------------------------------------------------------------------
check("per-line markup line prices with its own markup", () => {
  const p = computeEstimateItemPrice({
    unitCostExTax: 100,
    quantity: 2,
    markupPercent: 25,
    projectMarkupPercent: 0,
    taxRate: 10,
  });
  assert.strictEqual(p.builderCost, 200);
  assert.strictEqual(p.lineMarkupAmount, 50);
  assert.strictEqual(p.lineExTax, 250);
  assert.strictEqual(p.lineIncTax, 275);
});

check("mix under project markup: grand total == sum of lines + builder margin", () => {
  const items: EstimateItemSummaryInput[] = [
    { unitCostExTax: 100, quantity: 2, markupPercent: 25 },   // priced, own markup
    { unitCostExTax: 500, quantity: 1, markupPercent: null },  // priced, project fallback in UI
    { unitCostExTax: 0, quantity: 1, priceIncTax: 1100, taxAmount: 100 }, // PC allowance
  ];
  const s = computeEstimateSummary(items, { projectMarkupPercent: 10, taxRate: 10 });

  // Independent reconstruction: per-line inc-tax + builder's-margin inc-tax.
  const lineSum = sumLineIncTax(items, 10);
  const gmIncTax = round2(s.globalMarkupAmount * 1.1);
  const reconstructed = round2(lineSum + gmIncTax);
  assert.ok(
    Math.abs(reconstructed - s.total) <= 0.01,
    `parts (${reconstructed}) must equal whole (${s.total})`,
  );
});

// ---------------------------------------------------------------------------
// 7. End-to-end bulk zero: every priced line -> $0, allowance retained.
// ---------------------------------------------------------------------------
check("bulk-zeroing priced lines drops total; allowance retained", () => {
  // Before: two priced lines + one allowance.
  const before: EstimateItemSummaryInput[] = [
    { unitCostExTax: 100, quantity: 5, markupPercent: 0, priceIncTax: 550, taxAmount: 50 },
    { unitCostExTax: 200, quantity: 3, markupPercent: 0, priceIncTax: 660, taxAmount: 60 },
    { unitCostExTax: 0, quantity: 1, priceIncTax: 2200, taxAmount: 200 }, // allowance
  ];
  const sBefore = computeEstimateSummary(before, { projectMarkupPercent: 0, taxRate: 10 });
  assert.strictEqual(sBefore.total, round2(550 + 660 + 2200));

  // After bulk-editing the two priced lines' quantity to 0 (cache still stale).
  const after: EstimateItemSummaryInput[] = [
    { unitCostExTax: 100, quantity: 0, markupPercent: 0, priceIncTax: 550, taxAmount: 50 },
    { unitCostExTax: 200, quantity: 0, markupPercent: 0, priceIncTax: 660, taxAmount: 60 },
    { unitCostExTax: 0, quantity: 1, priceIncTax: 2200, taxAmount: 200 }, // allowance retained
  ];
  const sAfter = computeEstimateSummary(after, { projectMarkupPercent: 0, taxRate: 10 });
  assert.strictEqual(sAfter.total, 2200);
});

// ---------------------------------------------------------------------------
// 8. Total-integrity invariant.
// ---------------------------------------------------------------------------
check("integrity reporter does NOT fire on legitimate rounding (many lines)", () => {
  const violations: EstimateTotalIntegrityViolation[] = [];
  setEstimateTotalIntegrityReporter((v) => violations.push(v));
  try {
    const items: EstimateItemSummaryInput[] = [];
    for (let i = 0; i < 200; i++) {
      items.push({ unitCostExTax: 33.33, quantity: 1, markupPercent: 7.5 });
    }
    computeEstimateSummary(items, { projectMarkupPercent: 12.5, taxRate: 10, estimateId: "e-rounding" });
    assert.strictEqual(violations.length, 0, "rounding must not trip the invariant");
  } finally {
    setEstimateTotalIntegrityReporter(null);
  }
});

check("integrity reporter fires on a genuine stale-price divergence", () => {
  const violations: EstimateTotalIntegrityViolation[] = [];
  setEstimateTotalIntegrityReporter((v) => violations.push(v));
  try {
    // Simulate an inconsistent fixed-price line: cached priceIncTax and
    // taxAmount disagree with each other so the ex-tax used for the total and
    // the inc-tax shown per line diverge by dollars.
    const items: EstimateItemSummaryInput[] = [
      { unitCostExTax: 0, quantity: 1, priceIncTax: 100, taxAmount: 900 },
    ];
    computeEstimateSummary(items, { projectMarkupPercent: 0, taxRate: 10, estimateId: "e-stale" });
    assert.strictEqual(violations.length, 1, "a real divergence must be reported");
    assert.strictEqual(violations[0].estimateId, "e-stale");
    assert.ok(violations[0].diff > 0.01);
  } finally {
    setEstimateTotalIntegrityReporter(null);
  }
});

// ---------------------------------------------------------------------------
// 10. Global-once markup model: the builder's margin is NEVER baked into the
//     per-line cache. A blank line markup means ZERO line markup (no project
//     fallback), so editing the project margin can never staleify a cached row.
// ---------------------------------------------------------------------------
check("null-markup priced line stores its PRE-margin amount (project margin not baked)", () => {
  const resolved = resolveEstimateStoredPrice({
    unitCostExTax: 1000,
    quantity: 1,
    markupPercent: null,        // blank line markup
    projectMarkupPercent: 10,   // builder's margin — must NOT enter the line cache
    taxRate: 10,
    existingPriceIncTax: 1210,  // stale margin-baked value must be recomputed away
  });
  // 1000 ex, no line markup, +GST = 1100. NOT 1210 (which would bake the 10% margin).
  assert.strictEqual(resolved.priceIncTax, 1100);
  assert.strictEqual(resolved.taxAmount, 100);
});

check("blank line markup applies zero line markup (no project fallback)", () => {
  const p = computeEstimateItemPrice({
    unitCostExTax: 1000, quantity: 1, markupPercent: null,
    projectMarkupPercent: 25, taxRate: 10,
  });
  assert.strictEqual(p.lineExTax, 1000);  // no markup at the line level
  assert.strictEqual(p.lineIncTax, 1100);
});

// ---------------------------------------------------------------------------
// 11. Rows sum to subtotalExTax; the builder's margin applies ONCE on top and
//     covers PC/PS allowance lines too (per the confirmed business rule).
// ---------------------------------------------------------------------------
check("line ex-tax amounts sum to subtotalExTax; margin applies once, PC/PS included", () => {
  const items: EstimateItemSummaryInput[] = [
    { unitCostExTax: 1000, quantity: 1, markupPercent: null },            // 1000 ex
    { unitCostExTax: 1000, quantity: 1, markupPercent: 5 },               // 1050 ex
    { unitCostExTax: 0, quantity: 1, priceIncTax: 2200, taxAmount: 200 }, // PC: 2000 ex
  ];
  const s = computeEstimateSummary(items, { projectMarkupPercent: 10, taxRate: 10 });
  assert.strictEqual(s.subtotalExTax, 4050);      // 1000 + 1050 + 2000
  assert.strictEqual(s.globalMarkupAmount, 405);  // 10% of 4050 — PC's 2000 is in the base
  assert.strictEqual(s.totalExTax, 4455);
  assert.strictEqual(s.total, round2(4455 * 1.1)); // 4900.5
});

// ---------------------------------------------------------------------------
// 12. Wastage raises the builder cost on priced lines (confirmed: wastage means
//     you buy more material). Fixed-price allowances ignore it.
// ---------------------------------------------------------------------------
check("wastage inflates builder cost on a priced line", () => {
  const p = computeEstimateItemPrice({
    unitCostExTax: 100, quantity: 10, markupPercent: 0,
    projectMarkupPercent: 0, taxRate: 10, wastagePercent: 10,
  });
  assert.strictEqual(p.builderCost, 1100);  // 100 × 10 × 1.10
  assert.strictEqual(p.lineExTax, 1100);    // no line markup
  assert.strictEqual(p.lineIncTax, 1210);   // + GST
});

check("wastage does NOT affect a fixed-price allowance", () => {
  const resolved = resolveEstimateStoredPrice({
    unitCostExTax: 0, quantity: 1, markupPercent: null,
    projectMarkupPercent: 0, taxRate: 10, wastagePercent: 20,
    existingPriceIncTax: 5500,
  });
  assert.strictEqual(resolved.priceIncTax, 5500);
});

check("wastage flows into the summary and the builder-cost helper", () => {
  const items: EstimateItemSummaryInput[] = [
    { unitCostExTax: 100, quantity: 10, markupPercent: 0, wastagePercent: 10 },
  ];
  const s = computeEstimateSummary(items, { projectMarkupPercent: 0, taxRate: 10 });
  assert.strictEqual(s.builderCostTotal, 1100);
  assert.strictEqual(estimateItemBuilderCostExTax(items[0]), 1100);
});

console.log(`\nestimate-pricing: ${passed} checks passed\n`);

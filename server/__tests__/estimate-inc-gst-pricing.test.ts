/**
 * Typed inc-GST prices round-trip exactly, and nothing else moves.
 *
 * Unit costs are stored ex-GST to the cent and shown inc-GST as round2(ex × 1.1).
 * No cent value of ex lands on $60.00 (54.54 → 59.99, 54.55 → 60.01), and the
 * same is true of exactly one inc-GST price in eleven. Typing $60 inc-GST
 * therefore showed $60.01 in the grid, the totals and the proposal.
 *
 * The fix remembers the typed inc-GST price (estimate_items.unit_cost_inc_tax,
 * migration 0085) and treats it as authoritative: the line is built from it and
 * GST = inc − ex, the rule shared/money.ts's gstSplit and flat allowance lines
 * already use.
 *
 * The guarantee pinned here as much as the fix: an estimate with NO typed
 * inc-GST line is priced exactly as before. The GOLDEN values below were produced
 * by the pricing code as it was before this change — including the $60.01 of the
 * first case, which is the pre-existing behaviour for a line priced ex-GST.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/estimate-inc-gst-pricing.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  computeEstimateItemPrice,
  computeEstimateSummary,
  resolveEstimateStoredPrice,
  resolveUnitCostBasis,
  typedUnitCostIncTax,
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

const TAX = 10;
const incLine = (typed: number, extra: Record<string, unknown> = {}) => ({
  unitCostExTax: typed / 1.1,
  unitCostIncTax: typed,
  quantity: 1,
  markupPercent: 0,
  projectMarkupPercent: 0,
  taxRate: TAX,
  ...extra,
});
const summary = (items: any[], margin = 0) =>
  computeEstimateSummary(items, { projectMarkupPercent: margin, taxRate: TAX });

console.log("\nestimate-inc-gst-pricing");

// ── The reported case ────────────────────────────────────────────────────────

check("$60 typed inc-GST stays $60.00 — unit, line and estimate total", () => {
  const p = computeEstimateItemPrice(incLine(60));
  assert.strictEqual(p.unitCostIncTax, 60);
  assert.strictEqual(p.lineIncTax, 60);
  assert.strictEqual(summary([incLine(60)]).total, 60);
});

check("the parts always sum to what was typed (GST = inc − ex)", () => {
  const p = computeEstimateItemPrice(incLine(60));
  assert.strictEqual(p.lineExTax, 54.55);
  assert.strictEqual(p.taxAmount, 5.45);
  assert.strictEqual(Math.round((p.lineExTax + p.taxAmount) * 100), 6000);
  const s = summary([incLine(60)]);
  assert.strictEqual(Math.round((s.totalExTax + s.taxAmount) * 100), Math.round(s.total * 100));
});

check("the proposal's stored line amount is the typed figure", () => {
  const stored = resolveEstimateStoredPrice({ ...incLine(60), existingPriceIncTax: null });
  assert.deepStrictEqual(stored, { priceIncTax: 60, taxAmount: 5.45 });
});

// ── Common and previously drifting prices ────────────────────────────────────

check("common round inc-GST prices round-trip", () => {
  for (const typed of [0.05, 5.5, 11, 55, 60, 99.99, 110, 1100, 2750, 3300, 12999.95, 66000]) {
    assert.strictEqual(computeEstimateItemPrice(incLine(typed)).lineIncTax, typed, `line ${typed}`);
    assert.strictEqual(summary([incLine(typed)]).total, typed, `total ${typed}`);
  }
});

check("every inc-GST price from $0.01 to $2,000.00 round-trips (was 1 in 11 a cent out)", () => {
  let drift = 0;
  for (let c = 1; c <= 200_000; c++) {
    const typed = c / 100;
    if (summary([incLine(typed)]).total !== typed) drift++;
  }
  assert.strictEqual(drift, 0);
});

check("quantity, markup and wastage are applied to the typed price, then split once", () => {
  assert.strictEqual(computeEstimateItemPrice(incLine(60, { quantity: 3 })).lineIncTax, 180);
  assert.strictEqual(computeEstimateItemPrice(incLine(60, { markupPercent: 10 })).lineIncTax, 66);
  assert.strictEqual(computeEstimateItemPrice(incLine(60, { wastagePercent: 10 })).lineIncTax, 66);
  const p = computeEstimateItemPrice(incLine(60, { quantity: 2, markupPercent: 10 }));
  assert.strictEqual(p.builderCostIncTax, 120);
  assert.strictEqual(p.lineIncTax, 132);
  assert.strictEqual(Math.round((p.builderCost + p.lineMarkupAmount) * 100), Math.round(p.lineExTax * 100));
});

check("the builder's margin applies to a typed price without a stray cent", () => {
  assert.strictEqual(summary([incLine(60)], 10).total, 66);
  assert.strictEqual(summary([incLine(1100)], 18.5).total, 1303.5);
});

check("a typed credit (negative) price nets exactly", () => {
  assert.strictEqual(summary([incLine(110), incLine(-60)]).total, 50);
});

check("an estimate mixing typed inc-GST and ex-GST lines keeps the typed amount", () => {
  const exLine = { unitCostExTax: 100, quantity: 1, markupPercent: 0 };
  // 100 ex → 110 inc, plus a typed $60 inc: 170.00, not 170.01.
  assert.strictEqual(summary([exLine, incLine(60)]).total, 170);
});

// ── Nothing else moves ───────────────────────────────────────────────────────

check("no typed price — null, undefined or 0 — is the ex-GST path", () => {
  for (const v of [null, undefined, 0]) {
    assert.strictEqual(typedUnitCostIncTax(v as any), null);
    const withField = computeEstimateItemPrice({ unitCostExTax: 54.55, unitCostIncTax: v as any, quantity: 1, markupPercent: 0, projectMarkupPercent: 0, taxRate: TAX });
    const without = computeEstimateItemPrice({ unitCostExTax: 54.55, quantity: 1, markupPercent: 0, projectMarkupPercent: 0, taxRate: TAX });
    assert.deepStrictEqual(withField, without);
  }
});

// ── Which price a write leaves authoritative ─────────────────────────────────

check("saving a typed inc-GST price remembers it and derives ex-GST", () => {
  const b = resolveUnitCostBasis({ unitCostIncTax: 60 }, { unitCostExTax: 10, unitCostIncTax: null }, TAX);
  assert.strictEqual(b.unitCostIncTax, 60);
  assert.ok(Math.abs(b.unitCostExTax - 60 / 1.1) < 1e-9);
});

check("saving an ex-GST cost clears a remembered inc-GST price", () => {
  assert.deepStrictEqual(
    resolveUnitCostBasis({ unitCostExTax: 50 }, { unitCostExTax: 54.5454, unitCostIncTax: 60 }, TAX),
    { unitCostExTax: 50, unitCostIncTax: null },
  );
});

check("a write that touches neither price keeps the typed one (qty, markup, name…)", () => {
  assert.deepStrictEqual(
    resolveUnitCostBasis({}, { unitCostExTax: 54.5454, unitCostIncTax: 60 }, TAX),
    { unitCostExTax: 54.5454, unitCostIncTax: 60 },
  );
});

check("the edit dialog re-sending both prices keeps the typed one", () => {
  // The dialog submits the whole form, so a rename sends the unchanged prices.
  const b = resolveUnitCostBasis({ unitCostIncTax: 60, unitCostExTax: 60 / 1.1 }, { unitCostExTax: 60 / 1.1, unitCostIncTax: 60 }, TAX);
  assert.strictEqual(b.unitCostIncTax, 60);
});

check("the dialog on an ex-priced line (inc null + ex) stays ex-priced", () => {
  assert.deepStrictEqual(
    resolveUnitCostBasis({ unitCostIncTax: null, unitCostExTax: 42.5 }, { unitCostExTax: 40, unitCostIncTax: null }, TAX),
    { unitCostExTax: 42.5, unitCostIncTax: null },
  );
});

check("typing an inc-GST price of 0 zeroes the line and clears the typed price", () => {
  assert.deepStrictEqual(
    resolveUnitCostBasis({ unitCostIncTax: 0 }, { unitCostExTax: 54.5454, unitCostIncTax: 60 }, TAX),
    { unitCostExTax: 0, unitCostIncTax: null },
  );
});

const GOLDEN: Array<{ name: string; items: any[]; m: number; expected: any }> = [
  {
    "name": "plain line",
    "items": [
      {
        "unitCostExTax": 54.55,
        "quantity": 1,
        "markupPercent": 0
      }
    ],
    "m": 0,
    "expected": {
      "builderCostTotal": 54.55,
      "lineItemMarkupAmount": 0,
      "subtotalExTax": 54.55,
      "globalMarkupPercent": 0,
      "globalMarkupAmount": 0,
      "totalExTax": 54.55,
      "taxAmount": 5.46,
      "total": 60.01,
      "itemCount": 1,
      "subtotal": 54.55,
      "markupAmount": 0,
      "subtotalWithMarkup": 54.55
    }
  },
  {
    "name": "qty, markup, wastage",
    "items": [
      {
        "unitCostExTax": 123.45,
        "quantity": 12.5,
        "markupPercent": 12.5,
        "wastagePercent": 10
      }
    ],
    "m": 0,
    "expected": {
      "builderCostTotal": 1697.44,
      "lineItemMarkupAmount": 212.18,
      "subtotalExTax": 1909.62,
      "globalMarkupPercent": 0,
      "globalMarkupAmount": 0,
      "totalExTax": 1909.62,
      "taxAmount": 190.96,
      "total": 2100.58,
      "itemCount": 1,
      "subtotal": 1697.44,
      "markupAmount": 212.18,
      "subtotalWithMarkup": 1909.62
    }
  },
  {
    "name": "builder margin",
    "items": [
      {
        "unitCostExTax": 1999.99,
        "quantity": 3,
        "markupPercent": 15
      }
    ],
    "m": 18.5,
    "expected": {
      "builderCostTotal": 5999.97,
      "lineItemMarkupAmount": 900,
      "subtotalExTax": 6899.97,
      "globalMarkupPercent": 18.5,
      "globalMarkupAmount": 1276.49,
      "totalExTax": 8176.46,
      "taxAmount": 817.65,
      "total": 8994.11,
      "itemCount": 1,
      "subtotal": 5999.97,
      "markupAmount": 900,
      "subtotalWithMarkup": 6899.97
    }
  },
  {
    "name": "credit line nets",
    "items": [
      {
        "unitCostExTax": 500,
        "quantity": 2,
        "markupPercent": 10
      },
      {
        "unitCostExTax": -120.33,
        "quantity": 1,
        "markupPercent": 0
      }
    ],
    "m": 10,
    "expected": {
      "builderCostTotal": 879.67,
      "lineItemMarkupAmount": 100,
      "subtotalExTax": 979.67,
      "globalMarkupPercent": 10,
      "globalMarkupAmount": 97.97,
      "totalExTax": 1077.64,
      "taxAmount": 107.76,
      "total": 1185.4,
      "itemCount": 2,
      "subtotal": 879.67,
      "markupAmount": 100,
      "subtotalWithMarkup": 979.67
    }
  },
  {
    "name": "flat allowance",
    "items": [
      {
        "unitCostExTax": 0,
        "quantity": 1,
        "markupPercent": 20,
        "priceIncTax": 60,
        "taxAmount": 5.45
      }
    ],
    "m": 0,
    "expected": {
      "builderCostTotal": 54.55,
      "lineItemMarkupAmount": 0,
      "subtotalExTax": 54.55,
      "globalMarkupPercent": 0,
      "globalMarkupAmount": 0,
      "totalExTax": 54.55,
      "taxAmount": 5.46,
      "total": 60.01,
      "itemCount": 1,
      "subtotal": 54.55,
      "markupAmount": 0,
      "subtotalWithMarkup": 54.55
    }
  },
  {
    "name": "mixed with allowance and margin",
    "items": [
      {
        "unitCostExTax": 87.12,
        "quantity": 4.5,
        "markupPercent": 10,
        "wastagePercent": 5
      },
      {
        "unitCostExTax": 0,
        "quantity": 1,
        "priceIncTax": 5000,
        "taxAmount": 454.55
      },
      {
        "unitCostExTax": 33.33,
        "quantity": 26,
        "markupPercent": 0
      }
    ],
    "m": 12,
    "expected": {
      "builderCostTotal": 5823.67,
      "lineItemMarkupAmount": 41.16,
      "subtotalExTax": 5864.83,
      "globalMarkupPercent": 12,
      "globalMarkupAmount": 703.78,
      "totalExTax": 6568.61,
      "taxAmount": 656.86,
      "total": 7225.47,
      "itemCount": 3,
      "subtotal": 5823.67,
      "markupAmount": 41.16,
      "subtotalWithMarkup": 5864.83
    }
  }
];

for (const g of GOLDEN) {
  check(`unchanged from before: ${g.name}`, () => {
    assert.deepStrictEqual(summary(g.items, g.m), g.expected);
  });
}

console.log(`\nestimate-inc-gst-pricing: ${passed} checks passed\n`);

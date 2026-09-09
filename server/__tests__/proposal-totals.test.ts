/**
 * Proposal totals — pure functions over shared/proposalTotals.ts. No DB, no server.
 *
 * These three columns were written as 0 at creation and never again, so
 * everything downstream printed $0.00 — including every percentage-based
 * payment milestone on the client's document, which derives from totalAmount.
 * Now that they carry real money, the cases that matter are:
 *
 *   1. The project margin is applied. Summing the priceIncTax cache instead
 *      would quote the client the cost base — that column is deliberately
 *      pre-margin, and the margin lands once at the subtotal.
 *   2. Dollars become cents at exactly one boundary. estimate_items price
 *      fields are doublePrecision DOLLARS; proposals.total_amount is an
 *      integer of CENTS.
 *   3. proposalVisible: false takes a line out of the total, not just out of
 *      the printed table. A line the user hid must not be inside the number
 *      at the bottom of the page.
 *   4. shownAs "excluded" contributes nothing, while "included" and "empty"
 *      still contribute — they change how the line is PRINTED, not whether
 *      the client is paying for it.
 *   5. Fixed-price allowance lines (unitCost 0) keep their typed value rather
 *      than recomputing to zero.
 *   6. The milestone case end to end: a percentage of the total is real money.
 */
import assert from "node:assert";
import {
  computeProposalTotals,
  lineCountsTowardProposalTotal,
  EMPTY_PROPOSAL_TOTALS,
} from "@shared/proposalTotals";

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

// A plain priced line: 10 units at $100 ex-tax, no line markup.
const pricedLine = { unitCostExTax: 100, quantity: 10, markupPercent: 0 };

check("no project margin: $1,000 ex + 10% GST = $1,100 inc, in cents", () => {
  const t = computeProposalTotals([pricedLine], { projectMarkupPercent: 0, taxRate: 10 });
  assert.strictEqual(t.subtotalCents, 100_000);
  assert.strictEqual(t.gstCents, 10_000);
  assert.strictEqual(t.totalCents, 110_000);
});

check("the project margin is applied once, at the subtotal", () => {
  const t = computeProposalTotals([pricedLine], { projectMarkupPercent: 20, taxRate: 10 });
  // $1,000 cost + 20% margin = $1,200 ex, $120 GST, $1,320 inc.
  assert.strictEqual(t.subtotalCents, 120_000);
  assert.strictEqual(t.gstCents, 12_000);
  assert.strictEqual(t.totalCents, 132_000);
});

check("summing the pre-margin cache would under-quote by the whole margin", () => {
  // priceIncTax is the PRE-margin figure: $1,000 + GST = $1,100. If the total
  // were derived from it, the client would be quoted $1,100 against a real
  // contract price of $1,320 — the exact bug this replaces.
  const withCache = { ...pricedLine, priceIncTax: 1100, taxAmount: 100 };
  const t = computeProposalTotals([withCache], { projectMarkupPercent: 20, taxRate: 10 });
  assert.strictEqual(t.totalCents, 132_000);
  assert.notStrictEqual(t.totalCents, 110_000);
});

check("a fractional margin does not truncate", () => {
  const t = computeProposalTotals([pricedLine], { projectMarkupPercent: 12.5, taxRate: 10 });
  // $1,000 + 12.5% = $1,125 ex, $112.50 GST, $1,237.50 inc.
  assert.strictEqual(t.subtotalCents, 112_500);
  assert.strictEqual(t.gstCents, 11_250);
  assert.strictEqual(t.totalCents, 123_750);
});

check("proposalVisible: false removes the line from the total", () => {
  const t = computeProposalTotals(
    [pricedLine, { ...pricedLine, proposalVisible: false }],
    { projectMarkupPercent: 0, taxRate: 10 },
  );
  assert.strictEqual(t.totalCents, 110_000, "the hidden line was billed to the client anyway");
  assert.strictEqual(t.includedItemCount, 1);
  assert.strictEqual(t.excludedItemCount, 1);
});

check('shownAs "excluded" contributes nothing', () => {
  const t = computeProposalTotals(
    [pricedLine, { ...pricedLine, shownAs: "excluded" }],
    { projectMarkupPercent: 0, taxRate: 10 },
  );
  assert.strictEqual(t.totalCents, 110_000);
  assert.strictEqual(t.excludedItemCount, 1);
});

check('shownAs "included" and "empty" still contribute — they only change the printed cell', () => {
  const t = computeProposalTotals(
    [{ ...pricedLine, shownAs: "included" }, { ...pricedLine, shownAs: "empty" }],
    { projectMarkupPercent: 0, taxRate: 10 },
  );
  assert.strictEqual(t.totalCents, 220_000);
  assert.strictEqual(t.excludedItemCount, 0);
});

check("an unset shownAs behaves as a priced line", () => {
  assert.strictEqual(lineCountsTowardProposalTotal({ shownAs: null }), true);
  assert.strictEqual(lineCountsTowardProposalTotal({ proposalVisible: null }), true);
  assert.strictEqual(lineCountsTowardProposalTotal({}), true);
});

check("a fixed-price allowance line keeps its typed value", () => {
  // unitCost 0 marks a fixed-price PC/PS line: its cached priceIncTax is
  // authoritative and must not recompute to $0.
  const allowance = { unitCostExTax: 0, quantity: 1, priceIncTax: 5500, taxAmount: 500 };
  const t = computeProposalTotals([allowance], { projectMarkupPercent: 0, taxRate: 10 });
  assert.strictEqual(t.totalCents, 550_000);
});

check("a fixed-price allowance line still takes the project margin", () => {
  const allowance = { unitCostExTax: 0, quantity: 1, priceIncTax: 5500, taxAmount: 500 };
  const t = computeProposalTotals([allowance], { projectMarkupPercent: 10, taxRate: 10 });
  // $5,000 ex + 10% = $5,500 ex, $550 GST, $6,050 inc.
  assert.strictEqual(t.subtotalCents, 550_000);
  assert.strictEqual(t.totalCents, 605_000);
});

check("no items yields zero rather than NaN", () => {
  const t = computeProposalTotals([], { projectMarkupPercent: 15, taxRate: 10 });
  assert.strictEqual(t.subtotalCents, 0);
  assert.strictEqual(t.gstCents, 0);
  assert.strictEqual(t.totalCents, 0);
  assert.strictEqual(EMPTY_PROPOSAL_TOTALS.totalCents, 0);
});

check("a percentage milestone off the total is real money, not $0.00", () => {
  // The end-to-end shape of the bug: PaymentScheduleSection derives each
  // milestone as totalAmount * pct / 100. With totalAmount stuck at 0 every
  // milestone printed $0.00 on the client's document.
  const t = computeProposalTotals([pricedLine], { projectMarkupPercent: 20, taxRate: 10 });
  const depositCents = Math.round(t.totalCents * 10 / 100);
  assert.strictEqual(depositCents, 13_200, "a 10% deposit on $1,320");
  assert.notStrictEqual(depositCents, 0);
});

check("a full milestone schedule sums back to the contract total", () => {
  const t = computeProposalTotals([pricedLine], { projectMarkupPercent: 20, taxRate: 10 });
  const schedule = [10, 15, 20, 25, 20, 10];
  const sum = schedule.reduce((acc, pct) => acc + Math.round(t.totalCents * pct / 100), 0);
  assert.strictEqual(schedule.reduce((a, b) => a + b, 0), 100);
  assert.strictEqual(sum, t.totalCents);
});

console.log(`\n${passed} proposal-totals checks passed`);

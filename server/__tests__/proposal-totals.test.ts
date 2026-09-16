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
 *   3. THE ESTIMATE IS THE SOURCE OF TRUTH FOR MONEY. proposalVisible (the eye
 *      toggle, on lines and groups) and shownAs decide what the client SEES,
 *      never the price. These tests used to assert the opposite — that hiding
 *      a line removed its money — and that is what priced 11 Coolum at
 *      $27,550.02 against a $41,030.03 estimate. Jed: the visible thing "has
 *      nothing to do with the money".
 *   4. The proposal total equals computeEstimateSummary over the same lines,
 *      whatever is hidden or however it is shown.
 *   5. Fixed-price allowance lines (unitCost 0) keep their typed value rather
 *      than recomputing to zero.
 *   6. The milestone case end to end: a percentage of the total is real money.
 */
import assert from "node:assert";
import {
  computeProposalTotals,
  lineAppearsOnProposal,
  collectHiddenGroupIds,
  EMPTY_PROPOSAL_TOTALS,
} from "@shared/proposalTotals";
import { computeEstimateSummary } from "@shared/pricing";

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

check("proposalVisible: false hides the row and KEEPS the money", () => {
  const t = computeProposalTotals(
    [pricedLine, { ...pricedLine, proposalVisible: false }],
    { projectMarkupPercent: 0, taxRate: 10 },
  );
  assert.strictEqual(t.totalCents, 220_000, "hiding a line took its cost out of the price");
  assert.strictEqual(t.includedItemCount, 1, "only one row prints");
  assert.strictEqual(t.excludedItemCount, 1, "one row is withheld from view");
});

check('shownAs "excluded" changes the printed cell, not the price', () => {
  // The estimate's own total counts this line, so the proposal must too.
  const t = computeProposalTotals(
    [pricedLine, { ...pricedLine, shownAs: "excluded" }],
    { projectMarkupPercent: 0, taxRate: 10 },
  );
  assert.strictEqual(t.totalCents, 220_000);
  assert.strictEqual(t.excludedItemCount, 0, "the line is still shown, labelled Excluded");
});

check('shownAs "included" and "empty" still contribute — they only change the printed cell', () => {
  const t = computeProposalTotals(
    [{ ...pricedLine, shownAs: "included" }, { ...pricedLine, shownAs: "empty" }],
    { projectMarkupPercent: 0, taxRate: 10 },
  );
  assert.strictEqual(t.totalCents, 220_000);
  assert.strictEqual(t.excludedItemCount, 0);
});

check("an unset visibility means the row prints", () => {
  assert.strictEqual(lineAppearsOnProposal({ shownAs: null }), true);
  assert.strictEqual(lineAppearsOnProposal({ proposalVisible: null }), true);
  assert.strictEqual(lineAppearsOnProposal({}), true);
});

check("the proposal total IS the estimate total, whatever is hidden or shown", () => {
  /* The rule itself, over the 11 Coolum shape: most lines hidden, a hidden
     group, every Shown As value, a fixed-price allowance, a zero-quantity
     line, a margin and fractional costs. Compared against
     computeEstimateSummary — the function behind the estimate page header —
     rather than a hand-computed number, so the two cannot drift. */
  const groups = [
    { id: "prelims", parentGroupId: null, proposalVisible: true },
    { id: "hidden", parentGroupId: null, proposalVisible: false },
    { id: "hidden-child", parentGroupId: "hidden", proposalVisible: true },
  ];
  const items = [
    { unitCostExTax: 3450, quantity: 1, markupPercent: 0, groupId: "prelims", proposalVisible: false },
    { unitCostExTax: 0, quantity: 1, markupPercent: 0, groupId: "prelims", shownAs: "empty" },
    { unitCostExTax: 7140, quantity: 1, markupPercent: 0, groupId: "hidden-child" },
    { unitCostExTax: 80, quantity: 16, markupPercent: 12.5, groupId: "hidden", shownAs: "included" },
    { unitCostExTax: 0, quantity: 1, priceIncTax: 1500, taxAmount: 136.36, shownAs: "excluded" },
    { unitCostExTax: 454.55, quantity: 1, markupPercent: 0, wastagePercent: 5 },
    { unitCostExTax: 99.99, quantity: 0, markupPercent: 0 },
  ];
  const opts = { projectMarkupPercent: 25, taxRate: 10 };
  const summary = computeEstimateSummary(items, opts);
  const t = computeProposalTotals(items, { ...opts, groups });
  assert.strictEqual(t.totalCents, Math.round(summary.total * 100), "total differs from the estimate");
  assert.strictEqual(t.subtotalCents, Math.round(summary.totalExTax * 100), "ex-GST differs from the estimate");
  assert.strictEqual(t.gstCents, Math.round(summary.taxAmount * 100), "GST differs from the estimate");
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

// --- group-level visibility -------------------------------------------------
//
// Hiding a whole section is the group-level counterpart of the per-line eye
// toggle. Groups NEST, so the risk is a half-applied rule: a hidden parent
// whose subgroup still prints. Money is never affected — see rule 3.

const GROUPS = [
  { id: "kitchen", parentGroupId: null, proposalVisible: true },
  { id: "kitchen-joinery", parentGroupId: "kitchen", proposalVisible: true },
  { id: "bathroom", parentGroupId: null, proposalVisible: false },
  { id: "bathroom-tiling", parentGroupId: "bathroom", proposalVisible: true },
];

check("hiding a group hides its descendants, however deep", () => {
  const hidden = collectHiddenGroupIds(GROUPS);
  assert.ok(hidden.has("bathroom"), "the hidden group itself");
  assert.ok(hidden.has("bathroom-tiling"), "a visible subgroup of a hidden parent must still be hidden");
  assert.ok(!hidden.has("kitchen"));
  assert.ok(!hidden.has("kitchen-joinery"));
});

check("a line inside a hidden group leaves the page but stays in the price", () => {
  const items = [
    { ...pricedLine, groupId: "kitchen" },
    { ...pricedLine, groupId: "bathroom" },
    { ...pricedLine, groupId: "bathroom-tiling" },
  ];
  const hidden = collectHiddenGroupIds(GROUPS);

  assert.strictEqual(lineAppearsOnProposal(items[0], hidden), true);
  assert.strictEqual(lineAppearsOnProposal(items[1], hidden), false);
  assert.strictEqual(lineAppearsOnProposal(items[2], hidden), false, "line in a nested hidden group still printed");

  const t = computeProposalTotals(items, { projectMarkupPercent: 0, taxRate: 10, groups: GROUPS });
  assert.strictEqual(t.totalCents, 330_000, "hiding a section took its cost out of the price");
  assert.strictEqual(t.includedItemCount, 1);
  assert.strictEqual(t.excludedItemCount, 2);
});

check("passing no groups leaves the per-line rule untouched", () => {
  // Callers that do not know about groups must behave exactly as before.
  const items = [{ ...pricedLine, groupId: "bathroom" }];
  const t = computeProposalTotals(items, { projectMarkupPercent: 0, taxRate: 10 });
  assert.strictEqual(t.totalCents, 110_000);
  assert.strictEqual(lineAppearsOnProposal(items[0]), true);
});

check("an ungrouped line is unaffected by hidden groups", () => {
  const hidden = collectHiddenGroupIds(GROUPS);
  assert.strictEqual(lineAppearsOnProposal({ ...pricedLine, groupId: null }, hidden), true);
  assert.strictEqual(lineAppearsOnProposal({ ...pricedLine }, hidden), true);
});

check("the per-line toggle still wins inside a visible group", () => {
  const hidden = collectHiddenGroupIds(GROUPS);
  const item = { ...pricedLine, groupId: "kitchen", proposalVisible: false };
  assert.strictEqual(lineAppearsOnProposal(item, hidden), false);
});

check("a cycle in the group tree terminates instead of hanging", () => {
  // Legacy data has produced corrupt parentGroupId chains before; a naive
  // ancestor walk would spin forever and take the PDF render with it.
  const cyclic = [
    { id: "a", parentGroupId: "b", proposalVisible: true },
    { id: "b", parentGroupId: "a", proposalVisible: true },
  ];
  const hidden = collectHiddenGroupIds(cyclic);
  assert.strictEqual(hidden.size, 0);
});

check("a hidden group in a cycle still hides its members", () => {
  const cyclic = [
    { id: "a", parentGroupId: "b", proposalVisible: false },
    { id: "b", parentGroupId: "a", proposalVisible: true },
  ];
  const hidden = collectHiddenGroupIds(cyclic);
  assert.ok(hidden.has("a"));
  assert.ok(hidden.has("b"), "b inherits through the cycle back to the hidden a");
});

console.log(`\n${passed} proposal-totals checks passed`);

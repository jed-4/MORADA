/**
 * Proposal totals — the client-facing contract price for a proposal, derived
 * from the estimate revision it is linked to.
 *
 * Until now `proposals.subtotal`, `gstAmount` and `totalAmount` were written
 * once as 0 at creation and never touched again, so the Summary page printed
 * $0.00, the list column read $0.00, and — worst — the payment schedule derived
 * every percentage milestone as `totalAmount x pct / 100` and printed a column
 * of zeroes on the client's document.
 *
 * Two rules matter here and are easy to get wrong:
 *
 *  1. Money comes from `computeEstimateSummary`, never from summing the
 *     `priceIncTax` column. That column is a PRE-MARGIN cache: it holds the
 *     line amount with per-line markup only, and the builder's project margin
 *     is applied once globally at the subtotal. Summing it directly quotes the
 *     client the cost base rather than the contract price.
 *
 *  2. THE ESTIMATE IS THE SOURCE OF TRUTH FOR MONEY. The proposal never changes
 *     a figure. Estimate lines carry two client-facing switches —
 *     `proposalVisible` (the eye toggle, on lines and groups) and `shownAs` —
 *     and both decide only what the client SEES: which rows print, and what
 *     goes in a row's amount cell. Neither removes money.
 *
 *     This used to be the opposite: a hidden line was dropped from the total.
 *     On 11 Coolum that priced the proposal at $27,550.02 against an estimate
 *     of $41,030.03 — 71 of 90 lines hidden, $13,480.01 under-quoted, and
 *     Preliminaries printed $0.00 because every dollar of it sat in hidden
 *     lines. Jed's rule: "the visible thing is only for line items to be
 *     visible to the client or not. It has nothing to do with the money."
 *
 *     So the proposal total is `computeEstimateSummary` over EVERY line — the
 *     same function, over the same lines, that produces the figure at the top
 *     of the estimate page. They are equal by construction, not by coincidence.
 *
 * Estimate money is in DOLLARS (estimate_items price fields are
 * doublePrecision); proposals store CENTS. The conversion happens here, once.
 */
import {
  computeEstimateSummary,
  computeEstimateItemPrice,
  isFixedPriceLine,
  round2,
  type EstimateItemSummaryInput,
} from "./pricing";
import { dollarsToCents, type Cents } from "./money";

/** How a line is presented to the client on the proposal. */
export type ProposalShownAs = "empty" | "price" | "included" | "excluded";

export interface ProposalTotalsItemInput extends EstimateItemSummaryInput {
  /** Estimate grid eye toggle. Null/undefined means visible (the column default). */
  proposalVisible?: boolean | null;
  /** Estimate grid "Shown As" cycle. Null/undefined behaves as "price". */
  shownAs?: string | null;
  /** The group this line sits in, if any — a hidden group takes its lines with it. */
  groupId?: string | null;
}

/** The shape of an estimate group needed to resolve proposal visibility. */
export interface ProposalGroupInput {
  id: string;
  parentGroupId?: string | null;
  /** Group-level eye toggle. Null/undefined means visible (the column default). */
  proposalVisible?: boolean | null;
}

/**
 * Every group id that is hidden from the proposal, directly or by inheritance.
 *
 * Groups nest, so hiding "Kitchen" must also hide "Kitchen > Joinery" and every
 * line inside it. Resolving that here — once, into a flat set — is what keeps
 * the renderer and the totals from disagreeing: both ask this same set rather
 * than each walking the tree their own way.
 *
 * Cycles are possible in legacy data (a corrupt parentGroupId chain), so the
 * walk is depth-capped by the group count rather than trusting the tree.
 */
export function collectHiddenGroupIds(groups: ProposalGroupInput[]): Set<string> {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const hidden = new Set<string>();

  for (const group of groups) {
    let cursor: ProposalGroupInput | undefined = group;
    let hops = 0;
    while (cursor && hops <= groups.length) {
      if (cursor.proposalVisible === false) {
        hidden.add(group.id);
        break;
      }
      cursor = cursor.parentGroupId ? byId.get(cursor.parentGroupId) : undefined;
      hops++;
    }
  }
  return hidden;
}

export interface ProposalTotals {
  /** Contract price excluding GST, in cents. */
  subtotalCents: Cents;
  /** GST on the subtotal, in cents. */
  gstCents: Cents;
  /** subtotal + GST, in cents. This is the figure milestones are a percentage of. */
  totalCents: Cents;
  /** Lines printed on the client's document. Display only — never a money filter. */
  includedItemCount: number;
  /**
   * Lines not printed, because they or their group are hidden. Their money is
   * STILL in the totals above; this only says how much detail the client is
   * not being shown.
   */
  excludedItemCount: number;
}

/**
 * True when the line is printed on the proposal at all.
 *
 * A line is withheld either by its own eye toggle or by sitting inside a hidden
 * group. Pass the set from `collectHiddenGroupIds` to honour the group level;
 * omit it and only the per-line flag applies.
 *
 * This decides ROWS, never money. There used to be a companion,
 * `lineCountsTowardProposalTotal`, that used this same test to drop lines from
 * the price; it was deleted rather than repurposed so nothing can go on calling
 * a function whose name promises a money filter. See rule 2 above.
 */
export function lineAppearsOnProposal(
  item: ProposalTotalsItemInput,
  hiddenGroupIds?: Set<string>,
): boolean {
  if (item.proposalVisible === false) return false;
  if (hiddenGroupIds && item.groupId && hiddenGroupIds.has(item.groupId)) return false;
  return true;
}

export function computeProposalTotals(
  items: ProposalTotalsItemInput[],
  options: {
    projectMarkupPercent: number | null | undefined;
    taxRate: number | null | undefined;
    estimateId?: string;
    /** Group tree — used only to COUNT what the client sees, never to price. */
    groups?: ProposalGroupInput[];
  },
): ProposalTotals {
  // Every line. Deliberately no filter: this must be the estimate's own figure.
  const summary = computeEstimateSummary(items, {
    projectMarkupPercent: options.projectMarkupPercent,
    taxRate: options.taxRate,
    estimateId: options.estimateId,
  });

  const hiddenGroupIds = options.groups ? collectHiddenGroupIds(options.groups) : undefined;
  const shown = items.filter((it) => lineAppearsOnProposal(it, hiddenGroupIds)).length;

  return {
    subtotalCents: dollarsToCents(summary.totalExTax),
    gstCents: dollarsToCents(summary.taxAmount),
    totalCents: dollarsToCents(summary.total),
    includedItemCount: shown,
    excludedItemCount: items.length - shown,
  };
}

/** Zero totals, for a proposal with no estimate linked yet. */
export const EMPTY_PROPOSAL_TOTALS: ProposalTotals = {
  subtotalCents: 0,
  gstCents: 0,
  totalCents: 0,
  includedItemCount: 0,
  excludedItemCount: 0,
};

/**
 * What ONE line is worth to the client, in dollars, with the project margin
 * applied.
 *
 * Every page that prints a per-line figure has to agree with every other and
 * with the grand total, so the rule lives here once rather than being
 * re-derived per section. The rules it encodes:
 *
 *  - Priced lines are RECOMPUTED from qty x unit cost x line markup. The stored
 *    `priceIncTax` is a pre-margin cache and a legacy row may have the margin
 *    baked in, which would double-count it.
 *  - Fixed-price lines (unit cost 0 — allowances quoted as a lump) trust their
 *    typed `priceIncTax`, which is authoritative for them.
 *  - The project margin is a flat percentage on the ex-GST subtotal, so
 *    distributing it proportionally across lines is exact: the parts still sum
 *    to the whole.
 */
/**
 * What the Allowances page prints for a Prime Cost / Provisional Sum line: the
 * allowance itself, as entered in the estimate — qty x unit cost inc GST, or
 * the typed amount of a fixed-price allowance. Jed's rule: the client sees the
 * allowance, not the allowance with the line markup and the builder's margin
 * on top. The margin is still in the contract price; this is a label, not a sum
 * that feeds any total.
 */
export function allowanceLineAmounts(
  item: EstimateItemSummaryInput,
  options: { taxRate?: number | null },
): { exTax: number; incTax: number; unitExTax: number | null; unitIncTax: number | null } {
  const taxRate = Number(options.taxRate ?? 10);
  const gross = 1 + taxRate / 100;

  if (isFixedPriceLine(item.unitCostExTax)) {
    const inc = round2(Number(item.priceIncTax ?? 0));
    return { incTax: inc, exTax: round2(inc / gross), unitExTax: null, unitIncTax: null };
  }

  // Builder cost only: no line markup, no project margin.
  const line = computeEstimateItemPrice({
    unitCostExTax: item.unitCostExTax ?? 0,
    quantity: item.quantity ?? 0,
    markupPercent: 0,
    projectMarkupPercent: 0,
    taxRate,
    wastagePercent: (item as { wastagePercent?: number | null }).wastagePercent ?? undefined,
  });
  return {
    exTax: line.builderCost,
    incTax: line.builderCostIncTax,
    unitExTax: round2(Number(item.unitCostExTax) || 0),
    unitIncTax: line.unitCostIncTax,
  };
}

export function clientLineAmounts(
  item: EstimateItemSummaryInput,
  options: { projectMarkupPercent?: number | null; taxRate?: number | null },
): { exTax: number; incTax: number } {
  const taxRate = Number(options.taxRate ?? 10);
  const marginFactor = 1 + Number(options.projectMarkupPercent ?? 0) / 100;

  if (isFixedPriceLine(item.unitCostExTax)) {
    const inc = round2(Number(item.priceIncTax ?? 0));
    return {
      incTax: round2(inc * marginFactor),
      exTax: round2((inc / (1 + taxRate / 100)) * marginFactor),
    };
  }

  const line = computeEstimateItemPrice({
    unitCostExTax: item.unitCostExTax ?? 0,
    quantity: item.quantity ?? 0,
    markupPercent: item.markupPercent,
    projectMarkupPercent: 0,
    taxRate,
    wastagePercent: (item as { wastagePercent?: number | null }).wastagePercent ?? undefined,
  });
  return {
    incTax: round2(line.lineIncTax * marginFactor),
    exTax: round2(line.lineExTax * marginFactor),
  };
}

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
 *  2. Estimate lines carry two client-facing switches that the proposal has
 *     always ignored — `proposalVisible` (the eye toggle in the estimate grid)
 *     and `shownAs`. A line the user hid must not appear in the document and
 *     must not be inside the number at the bottom of it.
 *
 * Estimate money is in DOLLARS (estimate_items price fields are
 * doublePrecision); proposals store CENTS. The conversion happens here, once.
 */
import { computeEstimateSummary, type EstimateItemSummaryInput } from "./pricing";
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
  /** Lines that actually reached the client's document. */
  includedItemCount: number;
  /** Lines withheld by proposalVisible or shownAs — surfaced so the UI can say so. */
  excludedItemCount: number;
}

/**
 * True when a line contributes money to the client's contract price.
 *
 * `shownAs: "excluded"` means the line is named on the proposal as NOT part of
 * this price, so it contributes nothing. "included" is the opposite case — the
 * line is covered by the price but shown without a figure, so it still counts.
 * "empty" only blanks the printed cell; the money stands.
 *
 * Exported because the PDF must make the same call: if the rendered lines and
 * the total at the bottom disagree, the document is wrong in a way a client
 * will notice.
 */
export function lineCountsTowardProposalTotal(
  item: ProposalTotalsItemInput,
  hiddenGroupIds?: Set<string>,
): boolean {
  if (!lineAppearsOnProposal(item, hiddenGroupIds)) return false;
  if ((item.shownAs ?? "price") === "excluded") return false;
  return true;
}

/**
 * True when the line is printed on the proposal at all.
 *
 * A line is withheld either by its own eye toggle or by sitting inside a hidden
 * group. Pass the set from `collectHiddenGroupIds` to honour the group level;
 * omit it and only the per-line flag applies.
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
    /** Group tree, so a hidden section drops out of the price with its lines. */
    groups?: ProposalGroupInput[];
  },
): ProposalTotals {
  const hiddenGroupIds = options.groups ? collectHiddenGroupIds(options.groups) : undefined;
  const counted = items.filter((it) => lineCountsTowardProposalTotal(it, hiddenGroupIds));

  const summary = computeEstimateSummary(counted, {
    projectMarkupPercent: options.projectMarkupPercent,
    taxRate: options.taxRate,
    estimateId: options.estimateId,
  });

  return {
    subtotalCents: dollarsToCents(summary.totalExTax),
    gstCents: dollarsToCents(summary.taxAmount),
    totalCents: dollarsToCents(summary.total),
    includedItemCount: counted.length,
    excludedItemCount: items.length - counted.length,
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

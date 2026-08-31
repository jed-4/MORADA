/**
 * Raise a draft variation when a review is approved.
 *
 * The promise the builder ticked in the composer — "raise a draft variation
 * when this is approved" — is kept here, and it is kept for BOTH ways a client
 * can approve (a logged-in session and an emailed link), which is why it lives
 * beside the shared decision rules rather than inside one route.
 *
 * Three deliberate choices:
 *
 * 1. OPT-IN, not derived. It fires on `createVariationOnApproval`, never on
 *    `costImpact === "confirmed"`. The composer auto-ticks it for a confirmed
 *    item, but the builder can untick it, and that override has to survive.
 *
 * 2. DRAFT, not pending. In this codebase `pending` means "issued to the
 *    client for signature" (VariationDetail's sendForApproval), so a $0,
 *    line-item-less variation landing there would tell the builder the client
 *    has already been asked to sign something that does not exist yet. `draft`
 *    matches the existing SEL-OA- auto-variation.
 *
 * 3. CONSERVATIVE money. A range books its LOW end and "TBC"/no estimate books
 *    zero (see variationSeedAmountCents). A variation that starts too low gets
 *    corrected before it is issued; one that starts too high quietly overstates
 *    what the client owes.
 *
 * Failure is non-fatal to the decision — the client's approval must never be
 * lost because variation upkeep broke — but it is NOT silent: the caller
 * reports it, and the builder has a repair route.
 */

import { gstSplit } from "@shared/money";
import { variationSeedAmountCents, type ReviewCostEstimate } from "@shared/reviewCostImpact";

/** The review fields the hook reads. */
export interface VariationSourceReview {
  id: string;
  name: string;
  projectId: string;
  createVariationOnApproval: boolean;
  costImpactEstimateMode: string | null;
  costImpactAmountCents: number | null;
  costImpactMinCents: number | null;
  costImpactMaxCents: number | null;
  costImpactNote: string | null;
}

/** Prefix marking a variation this hook raised. Mirrors SEL-OA- for selections. */
export const REVIEW_VARIATION_PREFIX = "REV-";

/**
 * Should approving this review raise a variation?
 *
 * `decision` is checked here rather than at the call site so a future decision
 * type cannot accidentally start raising variations.
 */
export function shouldRaiseVariation(
  review: Pick<VariationSourceReview, "createVariationOnApproval">,
  decision: string,
): boolean {
  return decision === "approved" && review.createVariationOnApproval === true;
}

/**
 * The variation row to insert.
 *
 * `variationNumber` follows the SEL-OA- precedent: a prefix plus a base36
 * timestamp rather than the sequential generator, because a draft raised
 * automatically should not consume a number in the client-visible sequence
 * before the builder has decided to keep it. The unique index on
 * (project_id, variation_number) is what actually guarantees no collision.
 */
export function buildVariationForReview(
  review: VariationSourceReview,
  now: number,
): Record<string, unknown> {
  const estimate: ReviewCostEstimate = {
    mode: review.costImpactEstimateMode as ReviewCostEstimate["mode"],
    amountCents: review.costImpactAmountCents,
    minCents: review.costImpactMinCents,
    maxCents: review.costImpactMaxCents,
    note: review.costImpactNote,
  };

  // The estimated impact is what the CLIENT was shown, which is inc GST like
  // every other client-facing figure — so it is split, not grossed up.
  const totalIncCents = variationSeedAmountCents(estimate);
  const { exGst, gst } = gstSplit(totalIncCents);

  return {
    projectId: review.projectId,
    variationNumber: `${REVIEW_VARIATION_PREFIX}${now.toString(36).toUpperCase()}`,
    name: `Review approved: ${review.name}`,
    status: "draft",
    // Free-text link back, matching how the selections hook uses relatedTo.
    // The authoritative link is review_approvals.createdVariationId; this is
    // for a human reading the variation.
    relatedTo: review.id,
    introductionText: review.costImpactNote
      ? `Raised automatically when the client approved “${review.name}”. ${review.costImpactNote}`
      : `Raised automatically when the client approved “${review.name}”.`,
    subtotal: exGst,
    gstAmount: gst,
    totalAmount: totalIncCents,
    paidAmount: 0,
    balanceAmount: totalIncCents,
  };
}

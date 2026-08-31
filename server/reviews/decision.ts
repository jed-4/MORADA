/**
 * The rules for recording a reviewer's decision.
 *
 * There are now two ways in — a logged-in client session and an emailed portal
 * token — and they must behave IDENTICALLY. The red gate and the snapshot are
 * the whole point of the module, so they live here once rather than being
 * written twice and drifting apart the first time one is edited.
 *
 * Deliberately pure: no database, no express. The routes do the I/O; this
 * decides what is allowed and what gets frozen.
 */

import {
  costImpactBannerText,
  isTerminalReviewStatus,
  requiresVariationAcknowledgement,
  REVIEW_BANNER_VERSION,
  REVIEW_DECISION_VALUES,
  VARIATION_ACKNOWLEDGEMENT_LABEL,
  type ReviewDecision,
} from "@shared/reviewCostImpact";

/** The fields of a review item these rules read. */
export interface DecidableReviewItem {
  id: string;
  status: string;
  currentRevisionId: string | null;
  costImpact: "none" | "possible" | "confirmed";
  costImpactEstimateMode: string | null;
  costImpactAmountCents: number | null;
  costImpactMinCents: number | null;
  costImpactMaxCents: number | null;
  costImpactNote: string | null;
}

export interface DecisionRequest {
  decision: unknown;
  comment?: unknown;
  acknowledgedVariationRequired?: unknown;
}

/** A refusal, shaped for `res.status(...).json(...)`. */
export interface DecisionRefusal {
  status: number;
  body: { error: string; code?: string };
}

/**
 * Everything that must be true before a decision is recorded.
 *
 * Returns a refusal, or null when the decision may proceed. Order matters only
 * for the message the caller sees; every check is independent.
 */
export function refuseDecision(
  item: DecidableReviewItem,
  input: DecisionRequest,
): DecisionRefusal | null {
  if (!REVIEW_DECISION_VALUES.includes(input.decision as ReviewDecision)) {
    return {
      status: 400,
      body: { error: "A decision of approved, changes_requested or rejected is required" },
    };
  }

  if (!item.currentRevisionId) {
    return { status: 409, body: { error: "Nothing has been issued for review yet." } };
  }

  // A second decision must never quietly overwrite the first.
  if (isTerminalReviewStatus(item.status)) {
    return {
      status: 409,
      body: { error: `This review is already ${item.status}.`, code: "review_terminal" },
    };
  }

  // THE RED GATE. The disabled button in the UI is a courtesy; this is the
  // enforcement, and it applies to the token path exactly as it does to a
  // logged-in session.
  if (
    input.decision === "approved" &&
    requiresVariationAcknowledgement(item.costImpact) &&
    input.acknowledgedVariationRequired !== true
  ) {
    return {
      status: 400,
      body: {
        error: VARIATION_ACKNOWLEDGEMENT_LABEL,
        code: "variation_acknowledgement_required",
      },
    };
  }

  return null;
}

/**
 * The columns frozen onto the approval row.
 *
 * The banner wording is DERIVED here from the item's own state — it is never
 * taken from the request, or a reviewer could author their own record of what
 * they agreed to. Stamped with the wording version so a later reword stays
 * attributable.
 */
export function buildDecisionSnapshot(item: DecidableReviewItem) {
  return {
    snapshotCostImpact: item.costImpact,
    snapshotBannerText: costImpactBannerText(item.costImpact),
    snapshotBannerVersion: REVIEW_BANNER_VERSION,
    snapshotEstimateMode: item.costImpactEstimateMode,
    snapshotEstimateAmountCents: item.costImpactAmountCents,
    snapshotEstimateMinCents: item.costImpactMinCents,
    snapshotEstimateMaxCents: item.costImpactMaxCents,
    snapshotEstimateNote: item.costImpactNote,
  };
}

/** Normalise the free-text note that rides along with a decision. */
export function normaliseDecisionComment(comment: unknown): string | null {
  return typeof comment === "string" && comment.trim() ? comment.trim().slice(0, 5000) : null;
}

/** Human label used in the audit line and the builder's notification. */
export function decisionLabel(decision: ReviewDecision): string {
  return decision === "changes_requested" ? "requested changes" : decision;
}

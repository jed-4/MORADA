/**
 * Cost impact on a client review item.
 *
 * A review item carries ONE cost-impact state, never a set of booleans. Three
 * states, one banner each, and at most one banner ever renders:
 *
 *   none      — no banner at all
 *   possible  — orange: this MAY change the price
 *   confirmed — red:    this WILL change the price
 *
 * This module is shared because the server and the client must produce
 * byte-identical banner text. When a client approves an item the server stamps
 * the exact wording it derived here into `review_approvals.snapshotBannerText`,
 * so a later reword of the copy below can never change what a historic approval
 * says the client agreed to. Bump REVIEW_BANNER_VERSION whenever any `text`
 * changes, so old snapshots stay attributable to the wording they were shown.
 *
 * Amounts here are CENTS (integers), matching the dominant money convention —
 * see shared/money.ts. Nothing in this file formats currency; callers use
 * formatCents so the AUD formatting stays in one place.
 */

/** The three cost-impact states. The DB column is a pgEnum of exactly these. */
export type ReviewCostImpact = "none" | "possible" | "confirmed";

export const REVIEW_COST_IMPACT_VALUES = ["none", "possible", "confirmed"] as const;

/**
 * Wording version stamped alongside every approval snapshot.
 *
 * This is NOT a schema version — it identifies the copy in COST_IMPACT_BANNERS
 * at the time an approval was recorded. Change any banner `text` below and this
 * must move with it.
 */
export const REVIEW_BANNER_VERSION = "v1";

/** Visual tone; the client maps these onto the design-system colours. */
export type ReviewBannerTone = "orange" | "red";

export interface ReviewCostBanner {
  tone: ReviewBannerTone;
  text: string;
}

/**
 * The single source of banner copy. `none` is null — the absence of a banner
 * is a state, not an empty string, so callers cannot accidentally render an
 * empty box for it.
 */
export const COST_IMPACT_BANNERS: Record<ReviewCostImpact, ReviewCostBanner | null> = {
  none: null,
  possible: {
    tone: "orange",
    text: "This may change the price and require a variation.",
  },
  confirmed: {
    tone: "red",
    text: "This will change the price and require a variation.",
  },
};

/** The banner for a state, or null when nothing should render. */
export function costImpactBanner(state: ReviewCostImpact | null | undefined): ReviewCostBanner | null {
  if (!state) return null;
  return COST_IMPACT_BANNERS[state] ?? null;
}

/** The exact text to freeze into an approval snapshot, or null for `none`. */
export function costImpactBannerText(state: ReviewCostImpact | null | undefined): string | null {
  return costImpactBanner(state)?.text ?? null;
}

/** True when this state requires the client to tick the acknowledgement. */
export function requiresVariationAcknowledgement(state: ReviewCostImpact | null | undefined): boolean {
  return state === "confirmed";
}

/** Label for the red-gate checkbox. Stored nowhere — the ack boolean is. */
export const VARIATION_ACKNOWLEDGEMENT_LABEL =
  "I understand this approval will require a variation.";

// ── Estimated impact ─────────────────────────────────────────────────────────
//
// Prompted (but optional) when the state is `confirmed`. Three shapes, so the
// builder is never forced to invent a number they do not have yet:
//
//   amount — a single figure
//   range  — a low/high band
//   tbc    — "we know it costs, we cannot say how much yet"
//
// `null` mode means the builder skipped the prompt entirely.

export type ReviewEstimateMode = "amount" | "range" | "tbc";

export const REVIEW_ESTIMATE_MODES = ["amount", "range", "tbc"] as const;

export interface ReviewCostEstimate {
  mode: ReviewEstimateMode | null;
  /** Cents. Used when mode === "amount". */
  amountCents?: number | null;
  /** Cents. Used when mode === "range". */
  minCents?: number | null;
  maxCents?: number | null;
  note?: string | null;
}

/**
 * Validate an estimated-impact payload. Returns an error string, or null when
 * the payload is acceptable.
 *
 * Deliberately permissive about ABSENCE — the field is optional, so a null mode
 * is always valid. It is strict about INCOHERENCE: a mode that names amounts it
 * does not carry, or a range that runs backwards, is a bug worth refusing.
 */
export function validateCostEstimate(estimate: ReviewCostEstimate | null | undefined): string | null {
  if (!estimate || estimate.mode == null) return null;

  if (!REVIEW_ESTIMATE_MODES.includes(estimate.mode)) {
    return `Unknown estimate mode "${estimate.mode}"`;
  }

  if (estimate.mode === "amount") {
    if (estimate.amountCents == null) return "An amount is required when the estimate mode is 'amount'";
    if (!Number.isInteger(estimate.amountCents)) return "Estimated amount must be a whole number of cents";
    if (estimate.amountCents < 0) return "Estimated amount cannot be negative";
  }

  if (estimate.mode === "range") {
    if (estimate.minCents == null || estimate.maxCents == null) {
      return "Both a low and a high figure are required when the estimate mode is 'range'";
    }
    if (!Number.isInteger(estimate.minCents) || !Number.isInteger(estimate.maxCents)) {
      return "Estimated range must be whole numbers of cents";
    }
    if (estimate.minCents < 0 || estimate.maxCents < 0) return "Estimated range cannot be negative";
    if (estimate.minCents > estimate.maxCents) return "The low figure cannot exceed the high figure";
  }

  return null;
}

/**
 * The cents figure a downstream draft variation should be raised at.
 *
 * Conservative by design: a range books its LOW end, and `tbc` / no estimate
 * books zero. A variation that starts too low gets corrected by the builder
 * before it is issued; one that starts too high can quietly overstate what the
 * client owes. Used by the PR5 approval hook.
 */
export function variationSeedAmountCents(estimate: ReviewCostEstimate | null | undefined): number {
  if (!estimate || estimate.mode == null) return 0;
  if (estimate.mode === "amount") return estimate.amountCents ?? 0;
  if (estimate.mode === "range") return estimate.minCents ?? 0;
  return 0; // tbc
}

// ── Status + decision vocabularies ───────────────────────────────────────────

/**
 * Review item lifecycle.
 *
 *   draft            — being prepared; the reviewer cannot see it
 *   awaiting_review  — issued; sitting with the reviewer  ← the "needs you" bucket
 *   changes_requested— reviewer asked for changes; back with the builder
 *   approved         — reviewer approved a specific revision
 *   rejected         — reviewer declined outright (terminal)
 *   closed           — filed away without a decision (terminal)
 */
export type ReviewItemStatus =
  | "draft"
  | "awaiting_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "closed";

export const REVIEW_ITEM_STATUSES = [
  "draft",
  "awaiting_review",
  "changes_requested",
  "approved",
  "rejected",
  "closed",
] as const;

/**
 * Statuses a REVIEWER may see.
 *
 * An allow-list, not "everything except draft": a status added later stays
 * invisible to the reviewer until someone deliberately admits it here, which is
 * the safe direction to fail.
 */
export const REVIEWER_VISIBLE_STATUSES: ReviewItemStatus[] = [
  "awaiting_review",
  "changes_requested",
  "approved",
  "rejected",
  "closed",
];

/** A reviewer's decision on one revision. The DB column is a pgEnum of these. */
export type ReviewDecision = "approved" | "changes_requested" | "rejected";

export const REVIEW_DECISION_VALUES = ["approved", "changes_requested", "rejected"] as const;

/** Terminal states — no further revision can be issued without an explicit reopen. */
export const TERMINAL_REVIEW_STATUSES: ReviewItemStatus[] = ["approved", "rejected", "closed"];

export function isTerminalReviewStatus(status: ReviewItemStatus | string | null | undefined): boolean {
  return TERMINAL_REVIEW_STATUSES.includes(status as ReviewItemStatus);
}

/** The item status a decision moves the item into. */
export function statusAfterDecision(decision: ReviewDecision): ReviewItemStatus {
  switch (decision) {
    case "approved": return "approved";
    case "rejected": return "rejected";
    case "changes_requested": return "changes_requested";
  }
}

// ── Revision labels ──────────────────────────────────────────────────────────

/**
 * Revision labels are STORED per revision, not derived on read, so renaming the
 * scheme later never rewrites history. This is only the default used when a new
 * revision is issued.
 *
 * "Rev A" is the house default (A, B, C … then AA, AB … past 26).
 */
export type RevisionLabelScheme = "alpha" | "numeric";

export const DEFAULT_REVISION_LABEL_SCHEME: RevisionLabelScheme = "alpha";

/**
 * Default label for revision N (1-based).
 *
 * Alpha runs A…Z, then AA…AZ, BA… — spreadsheet-column style, so it never runs
 * out and never collides.
 */
export function defaultRevisionLabel(
  revisionNumber: number,
  scheme: RevisionLabelScheme = DEFAULT_REVISION_LABEL_SCHEME,
): string {
  if (scheme === "numeric") return `Rev ${Math.max(1, revisionNumber)}`;

  let n = Math.max(1, Math.floor(revisionNumber));
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return `Rev ${label}`;
}

// ── Overdue ──────────────────────────────────────────────────────────────────

/**
 * Overdue is a DATE comparison in the company's local day, not a timestamp
 * comparison. An item due "today" is not overdue at 9am and overdue at 5pm —
 * it is overdue once the local day has rolled past its due date.
 *
 * Mirrors the timezone convention used by timesheets (see the tz helpers in
 * server/storage.ts).
 */
export const DEFAULT_REVIEW_TIMEZONE = "Australia/Sydney";

/** The calendar date, in `timeZone`, as YYYY-MM-DD. */
export function localCalendarDate(at: Date, timeZone: string = DEFAULT_REVIEW_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** True when `dueDate`'s local calendar day is strictly before today's. */
export function isOverdue(
  dueDate: Date | string | null | undefined,
  now: Date = new Date(),
  timeZone: string = DEFAULT_REVIEW_TIMEZONE,
): boolean {
  if (!dueDate) return false;
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return localCalendarDate(due, timeZone) < localCalendarDate(now, timeZone);
}

/**
 * Whole local days a due date is overdue by; 0 when not overdue.
 * Computed from the calendar dates, so DST never shifts the count.
 */
export function daysOverdue(
  dueDate: Date | string | null | undefined,
  now: Date = new Date(),
  timeZone: string = DEFAULT_REVIEW_TIMEZONE,
): number {
  if (!isOverdue(dueDate, now, timeZone)) return 0;
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate!);
  const dueUtc = Date.parse(`${localCalendarDate(due, timeZone)}T00:00:00.000Z`);
  const nowUtc = Date.parse(`${localCalendarDate(now, timeZone)}T00:00:00.000Z`);
  return Math.max(0, Math.round((nowUtc - dueUtc) / 86_400_000));
}

/**
 * Cross-invoice claim guard for progress claims.
 *
 * A variation (or a PC/PS allowance) may legitimately be claimed across
 * several client invoices — 40% on this month's claim, 60% on the next. The
 * junction rows (`invoice_variations` / `invoice_allowances`) carry a
 * `claimPercent` each, and the sum across every invoice on the project is what
 * the client has actually been billed.
 *
 * So the double-billing guard is CUMULATIVE PERCENT, not "is this line linked
 * to an invoice anywhere". A line already claimed to 100% elsewhere has
 * nothing left to bill and must not be selectable again; a line claimed to 40%
 * has 60% left and stays selectable for exactly that much.
 *
 * All amounts elsewhere are cents; these are percentages (0–100).
 */

/** A junction row: one line's claim on one invoice. */
export interface ClaimLink {
  invoiceId: string;
  invoiceNumber: string | null;
  claimPercent: number;
}

/** What the project's OTHER invoices have already claimed for one line. */
export interface ClaimedElsewhere {
  /** Cumulative claim percent booked on other invoices. */
  percent: number;
  /** Invoice numbers holding those claims, in first-seen order. */
  invoiceNumbers: string[];
}

/**
 * Percentage-point tolerance for "reaches 100%". Mirrors the closing-claim
 * tolerance in ClientInvoiceDetail so a 33/33/34 split reads as closed out
 * rather than leaving a phantom sliver claimable.
 */
export const CLAIM_CLOSE_TOLERANCE = 0.005;

/** Label used when a claim sits on an invoice that has no number yet. */
export const UNNUMBERED_INVOICE_LABEL = "another invoice";

/**
 * Group a project's claim links by line id, excluding the invoice currently
 * being edited so an invoice never counts its own claim against itself.
 *
 * `currentInvoiceId` is undefined when creating a new invoice — then every
 * existing link counts as "elsewhere", which is correct.
 */
export function summariseClaimsElsewhere<T extends ClaimLink>(
  links: T[],
  getLineId: (link: T) => string,
  currentInvoiceId?: string,
): Record<string, ClaimedElsewhere> {
  const byLine: Record<string, ClaimedElsewhere> = {};
  for (const link of links) {
    if (currentInvoiceId && link.invoiceId === currentInvoiceId) continue;
    const lineId = getLineId(link);
    const entry = (byLine[lineId] ||= { percent: 0, invoiceNumbers: [] });
    entry.percent += link.claimPercent || 0;
    const label = link.invoiceNumber || UNNUMBERED_INVOICE_LABEL;
    if (!entry.invoiceNumbers.includes(label)) entry.invoiceNumbers.push(label);
  }
  return byLine;
}

/** Claim percent still available on this invoice (0–100). */
export function remainingClaimPercent(claimed: ClaimedElsewhere | undefined): number {
  return Math.max(0, 100 - (claimed?.percent ?? 0));
}

/** True when a cumulative claim percent has closed the line out. */
export function isFullyClaimedPercent(percent: number): boolean {
  return percent >= 100 - CLAIM_CLOSE_TOLERANCE;
}

/**
 * True when other invoices have already claimed the whole line — selecting it
 * again would bill the client twice for the same work.
 */
export function isFullyClaimedElsewhere(claimed: ClaimedElsewhere | undefined): boolean {
  return isFullyClaimedPercent(claimed?.percent ?? 0);
}

// ── Server-side guard ────────────────────────────────────────────────────────
//
// The picker guard covers the UI, but it is not the only writer: the duplicate
// route copies claim rows wholesale, and POST /api/invoice-variations writes
// one directly. The rule below is what the API enforces.
//
// It is deliberately NOT "reject anything over 100%". Historic data may already
// hold over-claimed rows, and a flat rejection would lock those invoices out of
// being EDITED — i.e. it would block the very saves needed to fix them. Instead
// the rule is MONOTONIC: a save may leave a line's cumulative claim the same or
// lower, but never push it higher once it is over 100%.
//
//   allow if  after <= 100 (+tolerance)   — normal, in-budget claim
//   allow if  after <= before             — reducing or unchanged, even if bad
//   reject    otherwise                   — this save makes an over-claim worse

/** One line's claim on the invoice being written, before and after the save. */
export interface ClaimChange {
  lineId: string;
  /** This invoice's claim percent before the save (0 when newly added). */
  previousPercent: number;
  /** This invoice's claim percent after the save. */
  nextPercent: number;
}

/** A rejected change, with the numbers needed to explain it. */
export interface OverClaim {
  lineId: string;
  /** Cumulative claim on the project's OTHER invoices. */
  elsewherePercent: number;
  previousTotal: number;
  nextTotal: number;
}

/**
 * Return the changes that would push a line's cumulative claim further past
 * 100%. Empty means the save is safe to apply.
 *
 * `elsewhereByLine` is the cumulative claim percent per line across every
 * OTHER invoice on the project — the invoice being written must be excluded by
 * the caller, or it will count its own claim against itself.
 */
export function findWorsenedOverClaims(
  changes: ClaimChange[],
  elsewhereByLine: Record<string, number>,
): OverClaim[] {
  const rejected: OverClaim[] = [];
  for (const change of changes) {
    const elsewherePercent = elsewhereByLine[change.lineId] ?? 0;
    const previousTotal = elsewherePercent + (change.previousPercent || 0);
    const nextTotal = elsewherePercent + (change.nextPercent || 0);
    if (nextTotal <= 100 + CLAIM_CLOSE_TOLERANCE) continue; // within budget
    if (nextTotal <= previousTotal) continue; // not making it worse
    rejected.push({ lineId: change.lineId, elsewherePercent, previousTotal, nextTotal });
  }
  return rejected;
}

/**
 * Thrown by the storage layer when a save would worsen an over-claim. Routes
 * translate this into a 409 rather than a 500 — it is a business-rule refusal,
 * not a server fault.
 */
export class ClaimOverBillingError extends Error {
  readonly overClaims: OverClaim[];
  /** Human labels (variation numbers / item descriptions) when resolvable. */
  readonly labels: string[];

  constructor(overClaims: OverClaim[], labels: string[] = []) {
    const named = labels.length ? labels.join(", ") : `${overClaims.length} line(s)`;
    super(
      `This would bill ${named} beyond 100% of its value. ` +
      `Reduce the claim percent, or remove the line from this invoice.`,
    );
    this.name = "ClaimOverBillingError";
    this.overClaims = overClaims;
    this.labels = labels;
  }
}

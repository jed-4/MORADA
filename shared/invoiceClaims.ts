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

/**
 * True when other invoices have already claimed the whole line — selecting it
 * again would bill the client twice for the same work.
 */
export function isFullyClaimedElsewhere(claimed: ClaimedElsewhere | undefined): boolean {
  return (claimed?.percent ?? 0) >= 100 - CLAIM_CLOSE_TOLERANCE;
}

/**
 * The payment schedule a client sees.
 *
 * A client wants to know what is still to come, not only what has been billed.
 * The claims that answer that are DRAFTS — and a draft is live: its total moves
 * as variations are approved, as allowances reconcile, as the builder works on
 * it. Showing the client `totalAmount` would make every one of those edits read
 * to them as the price changing.
 *
 * So a shared claim carries two different numbers and this file is the only
 * place that decides which one the client gets:
 *
 *   - not yet sent → `clientSharedAmountCents`, frozen at the moment the
 *     builder shared it. Editing the draft never touches it.
 *   - sent, partly paid, paid → the real `totalAmount`, because the claim is
 *     now a document they have actually been given.
 *
 * There is no "swap the snapshot for the real one" step. The status IS the
 * switch: once a claim is sent, `isInvoiceClientVisible` is already true and
 * the normal projection takes over. Anything that tried to swap stored rows at
 * approval would be a second writer of the same money, and this codebase has
 * been bitten by that more than once.
 *
 * Supersede at SENT, not at approved (Jed, 2026-10-27): "approved" means
 * authorised internally and is also the point the claim pushes to Xero, so
 * superseding there would show the client the real claim before it was sent
 * to them.
 */

/** Claims that have actually gone to the client. Mirrors the server gate. */
const ISSUED_STATUSES = new Set(["sent", "partial", "paid", "overdue"]);

export type ClaimScheduleStage = "upcoming" | "issued" | "paid";

export type SharedClaimLike = {
  status?: string | null;
  totalAmount?: number | null;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  clientSharedAt?: Date | string | null;
  clientSharedAmountCents?: number | null;
};

/** Has a builder put this claim in front of the client? */
export function isClaimShared(claim: SharedClaimLike | null | undefined): boolean {
  return !!claim?.clientSharedAt;
}

/** Has this claim actually been issued to the client? */
export function isClaimIssued(claim: SharedClaimLike | null | undefined): boolean {
  return !!claim && ISSUED_STATUSES.has(String(claim.status));
}

/**
 * Does this claim belong in the client's payment schedule at all?
 *
 * Either it has been issued — which they can already see — or the builder has
 * deliberately shared it. Nothing a builder has not shared ever appears, which
 * is what makes a draft safe to keep editing.
 */
export function isClaimInClientSchedule(claim: SharedClaimLike | null | undefined): boolean {
  return isClaimIssued(claim) || isClaimShared(claim);
}

/**
 * Where a claim sits in the client's eyes.
 *
 * "upcoming" is deliberately not called "draft": a draft is the builder's word
 * for an unfinished document, and showing that to a client beside a dollar
 * figure invites them to read it as something owed.
 */
export function claimStage(claim: SharedClaimLike | null | undefined): ClaimScheduleStage {
  if (!isClaimIssued(claim)) return "upcoming";
  if (String(claim?.status) === "paid") return "paid";
  return "issued";
}

/**
 * The amount to show the client, in cents.
 *
 * The whole point of this module. An unissued claim shows the frozen shared
 * figure and NEVER the live total; an issued one shows what was actually
 * billed. Returns null when there is no honest number to show — a claim shared
 * before the amount was stamped, which should not happen but must not render
 * as $0.
 */
export function clientFacingClaimCents(claim: SharedClaimLike | null | undefined): number | null {
  if (!claim) return null;
  if (isClaimIssued(claim)) return claim.totalAmount ?? null;
  return claim.clientSharedAmountCents ?? null;
}

/**
 * Has the draft moved away from what the client was told?
 *
 * Drives the builder-side banner. Deliberately not shown to the client: the
 * point of the frozen figure is that they do not watch it move. A claim that
 * is already issued cannot drift — the number they see is the real one.
 */
export function sharedAmountDrift(claim: SharedClaimLike | null | undefined): number {
  if (!claim || !isClaimShared(claim) || isClaimIssued(claim)) return 0;
  const shared = claim.clientSharedAmountCents;
  if (shared == null) return 0;
  return (claim.totalAmount ?? 0) - shared;
}

export function hasSharedAmountDrift(claim: SharedClaimLike | null | undefined): boolean {
  return sharedAmountDrift(claim) !== 0;
}

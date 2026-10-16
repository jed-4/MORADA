/**
 * Is Xero refusing this edit because the bill is already settled there?
 *
 * Xero rejects changes to a PAID, VOIDED or credit-noted invoice with a
 * validation error rather than a distinct status code, so this is decided from
 * the message text. That made it easy to get wrong in one specific way: an
 * UNLINKED bill — one that has never been pushed — was reported to the user as
 * "already settled in Xero" whenever its CREATE happened to be rejected with a
 * message matching the patterns. Nothing had been pushed, nothing was pulled
 * back, and there was no such bill in Xero. Reproduced live on BILL-1746.
 *
 * A bill with no xeroInvoiceId cannot be locked by Xero, whatever the text
 * says, so the link is part of the decision and not an afterthought.
 *
 * Pure, so the predicate can be tested without a database or a Xero call.
 */

/** What Xero says when the invoice itself will not accept the change. */
const LOCKED_PATTERNS = /LineItemID|payments or credit notes|has payments|not of valid status/i;

export function messageLooksLocked(message: string | null | undefined): boolean {
  return LOCKED_PATTERNS.test(message || "");
}

export function isLockedInXero(
  validationErrors: Array<{ message?: string | null }> | null | undefined,
  xeroInvoiceId: string | null | undefined,
): boolean {
  // No link, no lock — there is nothing in Xero to be settled.
  if (!xeroInvoiceId) return false;
  return (validationErrors || []).some((v) => messageLooksLocked(v?.message));
}

/**
 * Interim guard for vendor credits at the Xero push boundary.
 *
 * `createBill`/`updateBill` hardcode `Type: "ACCPAY"` and the push payload never
 * carries `billType`, so a vendor credit currently syncs to Xero as a normal
 * supplier bill with positive amounts — it *increases* payables in the
 * customer's file instead of reducing them. Until credit notes are built
 * properly (CREDIT_NOTES_PLAN.md Phase 1: `ACCPAYCREDIT` via `/CreditNotes`),
 * refuse the push.
 *
 * Trap: the test is `=== "credit"`, never `!== "bill"`. `billType: "receipt"`
 * is a worker reimbursement — a genuine payable that must keep pushing as
 * ACCPAY.
 */
export const CREDIT_NOT_SUPPORTED = "CREDIT_NOT_SUPPORTED";

export const CREDIT_NOT_SUPPORTED_MESSAGE =
  "Vendor credits can't sync to Xero yet — record the credit note in Xero directly.";

export function isVendorCredit(billType: string | null | undefined): boolean {
  return billType === "credit";
}

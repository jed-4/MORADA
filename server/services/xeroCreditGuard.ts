/**
 * Vendor credit identification at the Xero push boundary.
 *
 * `createBill`/`updateBill` hardcode `Type: "ACCPAY"`, so a vendor credit sent
 * down the bill path syncs to Xero as a normal supplier bill with positive
 * amounts — it *increases* payables instead of reducing them. That is what
 * this module originally existed to refuse.
 *
 * Credits now push properly, as `ACCPAYCREDIT` on `/CreditNotes`
 * (`xeroService.createCreditNote`), so the refusal is gone. The test itself
 * stays, because it is what routes the push down the credit-note path — and
 * the trap below is unchanged and still load-bearing.
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

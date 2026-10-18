/**
 * What a Xero invoice's state means for the Morada bill behind it.
 *
 * Pure, and in its own module, so the rules can be tested without booting
 * routes.ts (which opens a database pool on import).
 */

/** Voided or deleted in Xero — a document somebody deliberately threw away. */
export function isDeadInXero(xeroStatus: string | null | undefined): boolean {
  const s = String(xeroStatus || "").toUpperCase();
  return s === "VOIDED" || s === "DELETED";
}

export function deriveBillStatusFromXero(
  localStatus: string,
  xeroStatus: string,
  amountPaidCents: number,
  totalCents: number,
): { status: string; voidNote?: string } {
  if (xeroStatus === "PAID") return { status: "paid" };
  if (xeroStatus === "VOIDED" || xeroStatus === "DELETED") {
    // Keep the local status. This used to return "draft", and draft bills never
    // reach pushBillToXeroInternal at all — so a single sync against a voided
    // Xero invoice put the bill permanently beyond syncing, silently: no error,
    // no badge, it simply never went again. Voiding something in Xero says
    // nothing about whether the work happened or the supplier invoice is real,
    // which is the only thing the Morada status records.
    //
    // The bill is flagged `voided_in_xero` instead and surfaces in the Xero
    // review queue, where the existing Unlink action lets a human decide
    // whether it should be pushed again as a new Xero bill. That is the right
    // place for the decision: a Xero bill is often voided precisely BECAUSE it
    // was a duplicate, and re-creating it automatically would undo the fix.
    return {
      status: localStatus,
      voidNote: `Voided/Deleted in Xero on ${new Date().toISOString().slice(0, 10)}`,
    };
  }
  // Don't demote a locally-paid bill on a non-PAID Xero update.
  if (localStatus === "paid") return { status: "paid" };
  if (amountPaidCents > 0 && amountPaidCents < totalCents) return { status: "awaiting_payment" };
  if (amountPaidCents === 0 && xeroStatus === "AUTHORISED") return { status: "awaiting_payment" };
  if (amountPaidCents === 0 && xeroStatus === "SUBMITTED") return { status: "awaiting_approval" };
  return { status: localStatus };
}

/**
 * Which of Xero's search hits may be adopted as "this bill is already there".
 *
 * A voided or deleted invoice is not a bill to link to. Adopting one meant the
 * Morada bill pointed at a document that had been thrown away, every later
 * push was refused, and nothing reached Xero — the Sept 2026 Bunnings case.
 * When a supplier invoice is re-entered after the Xero copy was voided, the
 * right outcome is a fresh Xero bill, which is what an empty result produces.
 */
export function selectAdoptableBills<T extends { Status?: string; InvoiceID?: string; Contact?: { ContactID?: string } }>(
  invoices: T[],
  contactId?: string | null,
): T[] {
  return (invoices || []).filter((inv) => {
    if (isDeadInXero(inv.Status)) return false;
    // A same-numbered invoice against a different supplier is a different bill.
    if (contactId && inv.Contact?.ContactID && inv.Contact.ContactID !== contactId) return false;
    return true;
  });
}

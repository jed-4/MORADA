/**
 * Where a bill push goes in Xero: update the linked invoice, or make a new one.
 *
 * BILL-1805 (Bunnings, 20 Oct 2026) was still refused by Xero after #253/#260
 * with "Invoice not of valid status for modification", for two reasons:
 *
 *   1. "Create" was never a create. It was POST /Invoices, which Xero documents
 *      as "Updates or creates", and it matches an existing invoice on
 *      InvoiceNumber. A re-entered supplier invoice whose earlier Xero copy had
 *      been voided was therefore sent as an EDIT to the voided copy, even with
 *      no link stored in Morada. Creates now use PUT (create-only), in
 *      xeroService.
 *
 *   2. A bill whose STORED link pointed at a voided invoice could only be
 *      released by a human pressing Unlink in the review queue. It now unlinks
 *      itself and goes again: after the dead link is cleared it takes the
 *      unlinked path, which first ADOPTS any live Xero bill with the same
 *      invoice number. That keeps the reason Unlink was manual — a bill is
 *      often voided in Xero because it was a duplicate of a live one, and
 *      the live one is what gets linked rather than a third copy.
 *
 * Pure orchestration with its dependencies passed in, so it can be tested
 * without a database or a Xero connection (routes.ts opens a pool on import).
 */
import { isDeadInXero } from "./xeroBillStatus";

/** Map a Morada bill status to the Xero status for this push. */
export function xeroStatusForPush(
  localStatus: string | null | undefined,
  isCreate: boolean,
): "SUBMITTED" | "AUTHORISED" {
  // A bill Morada puts into Xero always arrives as Awaiting Approval: approving
  // it is the accounts team's call in Xero, not a side effect of saving here.
  if (isCreate) return "SUBMITTED";
  // An update keeps the two systems in step. awaiting_payment / paid are
  // AUTHORISED in Xero (payment is posted separately via createPayment).
  return localStatus === "awaiting_approval" ? "SUBMITTED" : "AUTHORISED";
}

export interface PushTargetDeps<T> {
  /** Edit the linked Xero document. */
  update(xeroId: string): Promise<T>;
  /** The unlinked path: adopt a live match, or create a new document. */
  createOrAdopt(): Promise<T>;
  /** Current Xero status of a document, or null when it cannot be read. */
  getStatus(xeroId: string): Promise<string | null>;
  /** Sever a dead link so the bill can go again. */
  unlink(deadXeroId: string): Promise<void>;
  /** Does this error mean Xero refused to modify the document? */
  isLockedError(err: unknown): boolean;
}

export interface PushTargetResult<T> {
  result: T;
  /** True when this push did not edit an existing link. */
  viaUnlinkedPath: boolean;
  /** The voided/deleted Xero id that was unlinked on the way, if any. */
  replacedDeadId?: string;
}

export async function pushToXeroTarget<T>(
  link: { xeroId: string | null; knownDead?: boolean },
  deps: PushTargetDeps<T>,
): Promise<PushTargetResult<T>> {
  if (!link.xeroId) {
    return { result: await deps.createOrAdopt(), viaUnlinkedPath: true };
  }

  const releaseAndGo = async (deadId: string): Promise<PushTargetResult<T>> => {
    await deps.unlink(deadId);
    return { result: await deps.createOrAdopt(), viaUnlinkedPath: true, replacedDeadId: deadId };
  };

  // Already known to be voided (flagged by a sync): don't send an edit Xero is
  // certain to refuse. Still confirm it — a void can be reversed in Xero, and
  // unlinking a live bill would make a duplicate.
  if (link.knownDead) {
    const status = await deps.getStatus(link.xeroId).catch(() => null);
    if (isDeadInXero(status)) return releaseAndGo(link.xeroId);
  }

  try {
    return { result: await deps.update(link.xeroId), viaUnlinkedPath: false };
  } catch (err) {
    if (!deps.isLockedError(err)) throw err;
    // Voided and paid get the same refusal text from Xero. Only a dead
    // document is released; a paid/credited one is the caller's to handle.
    const status = await deps.getStatus(link.xeroId).catch(() => null);
    if (isDeadInXero(status)) return releaseAndGo(link.xeroId);
    throw err;
  }
}

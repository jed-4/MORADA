/**
 * Where a bill push goes in Xero, and what Morada sends with it.
 *
 * BILL-1805 (Bunnings, 20 Oct 2026) was still refused by Xero after #253/#260
 * with "Invoice not of valid status for modification". "Create" was never a
 * create: it was POST /Invoices, which Xero documents as "Updates or creates"
 * and matches on InvoiceNumber, so a re-entered supplier invoice whose earlier
 * Xero copy had been voided was sent as an EDIT to the voided copy. Creates now
 * use PUT (create-only), in xeroService.
 *
 * A bill whose STORED link points at a voided/deleted Xero bill is never
 * re-created by a push (Jed, 20 Oct): a bill voided on purpose must not come
 * back by itself. The push reports it as dead, the bill is flagged in the Xero
 * review queue, and only the queue's "Re-create in Xero" action sends it again.
 *
 * Pure, with dependencies passed in, so it can be tested without a database or
 * a Xero connection (routes.ts opens a pool on import).
 */
import { isDeadInXero } from "./xeroBillStatus";

/**
 * The Xero status to send. Morada never approves a bill in Xero — Jed approves
 * there himself — and an edit never changes a bill's status in Xero:
 *   create → SUBMITTED ("Awaiting Approval")
 *   update → nothing, so Xero keeps whatever status it has.
 */
export function xeroStatusForPush(isCreate: boolean): "SUBMITTED" | undefined {
  return isCreate ? "SUBMITTED" : undefined;
}

export interface PushTargetDeps<T> {
  /** Edit the linked Xero document. */
  update(xeroId: string): Promise<T>;
  /** The unlinked path: adopt a live match, or create a new document. */
  createOrAdopt(): Promise<T>;
  /** Current Xero status of a document, or null when it cannot be read. */
  getStatus(xeroId: string): Promise<string | null>;
  /** Does this error mean Xero refused to modify the document? */
  isLockedError(err: unknown): boolean;
}

export type PushTargetResult<T> =
  /** Sent. `viaUnlinkedPath` is true when no existing link was edited. */
  | { kind: "pushed"; result: T; viaUnlinkedPath: boolean }
  /** The linked Xero document is voided/deleted. Nothing was sent. */
  | { kind: "dead"; deadXeroId: string; xeroStatus: string };

export async function pushToXeroTarget<T>(
  link: { xeroId: string | null; knownDead?: boolean },
  deps: PushTargetDeps<T>,
): Promise<PushTargetResult<T>> {
  if (!link.xeroId) {
    return { kind: "pushed", result: await deps.createOrAdopt(), viaUnlinkedPath: true };
  }

  // Already flagged voided by a sync: don't send an edit Xero is certain to
  // refuse. Still confirm it — a void can be reversed in Xero.
  if (link.knownDead) {
    const status = await deps.getStatus(link.xeroId).catch(() => null);
    if (isDeadInXero(status)) return { kind: "dead", deadXeroId: link.xeroId, xeroStatus: status! };
  }

  try {
    return { kind: "pushed", result: await deps.update(link.xeroId), viaUnlinkedPath: false };
  } catch (err) {
    if (!deps.isLockedError(err)) throw err;
    // Voided and paid get the same refusal text from Xero; only the status
    // tells them apart. A paid/credited refusal is the caller's to handle.
    const status = await deps.getStatus(link.xeroId).catch(() => null);
    if (isDeadInXero(status)) return { kind: "dead", deadXeroId: link.xeroId, xeroStatus: status! };
    throw err;
  }
}

/**
 * Another Morada bill for the same supplier invoice — the one this bill must
 * not be pushed alongside.
 *
 * 7377/90275519 from Bunnings ended up on BILL-1746 and again on BILL-1782..
 * BILL-1803; each push of a copy is a second payable for one invoice. The
 * EARLIEST bill is treated as the original and stays pushable; every later
 * copy is blocked. A copy that is already linked to a live Xero bill blocks the
 * others too, whatever its age, since that one is the bill Xero knows.
 *
 * Supplier AND number must both match: the same number from two suppliers is
 * two invoices. A bill with no supplier or no number is never matched.
 */
export interface DuplicateCandidate {
  id: string;
  billNumber?: string | null;
  supplierId?: string | null;
  billReference?: string | null;
  createdAt?: Date | string | null;
  xeroInvoiceId?: string | null;
  xeroVoidedAt?: Date | string | null;
}

const normRef = (r: string | null | undefined) => String(r ?? "").trim().toLowerCase();
const ts = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);

export function findDuplicateBlocker<B extends DuplicateCandidate>(self: DuplicateCandidate, others: B[]): B | null {
  const ref = normRef(self.billReference);
  if (!ref || !self.supplierId) return null;
  const same = (others || []).filter(
    (o) => o.id !== self.id && o.supplierId === self.supplierId && normRef(o.billReference) === ref,
  );
  if (same.length === 0) return null;
  // This one is already the bill Xero holds: keeping it in step adds nothing.
  const liveLink = (b: DuplicateCandidate) => !!b.xeroInvoiceId && !b.xeroVoidedAt;
  if (liveLink(self)) return null;
  // A copy Xero already holds wins outright.
  const linked = same.find(liveLink);
  if (linked) return linked;
  // Otherwise the earliest is the original; ties broken by id so exactly one
  // of a pair is ever pushable.
  const mine = ts(self.createdAt);
  const older = same
    .filter((o) => ts(o.createdAt) < mine || (ts(o.createdAt) === mine && o.id < self.id))
    .sort((x, y) => ts(x.createdAt) - ts(y.createdAt));
  return older[0] ?? null;
}

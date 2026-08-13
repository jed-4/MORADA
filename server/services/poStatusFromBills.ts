import { db } from "../db";
import * as schema from "@shared/schema";
import { and, eq, ne } from "drizzle-orm";

/**
 * Source of truth for PO status when bills are linked.
 *
 * Rules:
 * - cancelled POs are never auto-modified.
 * - draft POs are never auto-modified (they have not been issued yet).
 * - With ≥1 linked bill, PO status is derived from the linked bills:
 *     - any linked bill                       → invoiced
 *     - some linked bills have paidAmount > 0 → partially_paid
 *     - every linked bill status === "paid"   → paid
 *       (and sum of paidAmount ≥ PO total when total > 0)
 * - Linked vendor credits (billType "credit") are ignored entirely — they are a
 *   negative document and must not drive a PO toward invoiced/paid. A PO whose
 *   only link is a credit therefore counts as having 0 linked bills.
 * - With 0 linked bills, an "invoiced/partially_paid/paid" PO drops back to "sent"
 *   (i.e. previously linked bill was removed/unlinked).
 *
 * Returns the new status the PO was set to (or its current status if unchanged).
 */
export async function recomputePOStatusFromBills(poId: string): Promise<string | null> {
  if (!poId) return null;

  const [po] = await db
    .select()
    .from(schema.purchaseOrders)
    .where(eq(schema.purchaseOrders.id, poId))
    .limit(1);
  if (!po) return null;

  if (po.status === "cancelled" || po.status === "draft") {
    return po.status;
  }

  const linkedBills = await db
    .select({
      id: schema.bills.id,
      status: schema.bills.status,
      paidAmount: schema.bills.paidAmount,
      total: schema.bills.total,
    })
    .from(schema.bills)
    // Vendor credits are excluded. Amounts are stored positive and negated at
    // read time, so a credit linked to a PO used to add its paidAmount to sumPaid
    // and its "paid" status to allPaid — driving the PO toward paid on a
    // document that *reduces* what's owed. `ne(billType, 'credit')` and not
    // `eq(billType, 'bill')`: a receipt is a genuine payable and still counts.
    .where(and(eq(schema.bills.matchedSitePOId, poId), ne(schema.bills.billType, "credit")));

  let nextStatus: string;
  if (linkedBills.length === 0) {
    // Used to be linked but the bill was removed/unlinked → back to sent.
    if (po.status === "invoiced" || po.status === "partially_paid" || po.status === "paid") {
      nextStatus = "sent";
    } else {
      return po.status;
    }
  } else {
    const sumPaid = linkedBills.reduce((s, b) => s + (Number(b.paidAmount) || 0), 0);
    const anyPaidPartial = linkedBills.some((b) => (Number(b.paidAmount) || 0) > 0);
    const allPaid = linkedBills.every((b) => b.status === "paid");
    const poTotal = Number(po.total) || 0;

    if (allPaid && (poTotal === 0 || sumPaid >= poTotal)) {
      nextStatus = "paid";
    } else if (anyPaidPartial) {
      nextStatus = "partially_paid";
    } else {
      nextStatus = "invoiced";
    }
  }

  // Always keep matchedBillId/matchedAt loosely in sync for backwards compat
  // with code that reads a single "the matched bill" pointer — even when the
  // status itself is unchanged (e.g. a different bill becomes the canonical one).
  const patch: any = {};
  if (nextStatus !== po.status) patch.status = nextStatus;
  if (linkedBills.length === 0) {
    if (po.matchedBillId !== null) patch.matchedBillId = null;
  } else if (!po.matchedBillId || !linkedBills.some((b) => b.id === po.matchedBillId)) {
    patch.matchedBillId = linkedBills[0].id;
    patch.matchedAt = new Date();
  }

  if (Object.keys(patch).length === 0) return po.status;

  await db
    .update(schema.purchaseOrders)
    .set(patch)
    .where(eq(schema.purchaseOrders.id, poId));

  return nextStatus;
}

/**
 * Recompute status for both the old and the new PO link (or just one if the other is null).
 * Handy when a bill's matchedSitePOId changes or the bill is deleted.
 */
export async function recomputePOStatusForLinks(
  previousPoId: string | null | undefined,
  nextPoId: string | null | undefined,
): Promise<void> {
  const ids = Array.from(new Set([previousPoId, nextPoId].filter(Boolean) as string[]));
  for (const id of ids) {
    try {
      await recomputePOStatusFromBills(id);
    } catch (err) {
      console.error(`[recomputePOStatusFromBills] ${id} failed:`, err);
    }
  }
}

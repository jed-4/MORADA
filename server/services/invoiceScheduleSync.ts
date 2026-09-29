// Draft invoices follow their schedule item's dates (shared/invoiceScheduleDates).
// Called after anything moves schedule items, and when an invoice is linked or
// told to follow the schedule again. Touches DRAFT, NOT-PINNED invoices only —
// an approved invoice is in Xero and its dates never move.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { clientInvoices, scheduleItems } from "@shared/schema";
import { followedDates, itemClaimDate } from "@shared/invoiceScheduleDates";

/** Bring every following draft linked to these items onto the items' dates. Returns how many moved. */
export async function syncInvoicesForItems(itemIds: string[]): Promise<number> {
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (ids.length === 0) return 0;
  const rows = await db
    .select({
      id: clientInvoices.id,
      invoiceDate: clientInvoices.invoiceDate,
      dueDate: clientInvoices.dueDate,
      endDate: scheduleItems.endDate,
      actualEndDate: scheduleItems.actualEndDate,
    })
    .from(clientInvoices)
    .innerJoin(scheduleItems, eq(clientInvoices.scheduleItemId, scheduleItems.id))
    // A draft that was ever in Xero (voided back to draft) keeps its dates.
    .where(and(inArray(clientInvoices.scheduleItemId, ids), eq(clientInvoices.status, "draft"), eq(clientInvoices.datePinned, false), isNull(clientInvoices.xeroInvoiceId)));

  let moved = 0;
  for (const r of rows) {
    const claim = itemClaimDate(r);
    if (!claim) continue;
    const next = followedDates(r, claim);
    if (!next) continue;
    await db
      .update(clientInvoices)
      .set({ invoiceDate: next.invoiceDate, dueDate: next.dueDate, updatedAt: new Date() })
      .where(and(eq(clientInvoices.id, r.id), eq(clientInvoices.status, "draft"), eq(clientInvoices.datePinned, false), isNull(clientInvoices.xeroInvoiceId)));
    moved++;
  }
  return moved;
}

/** The same for one invoice (after linking it, or "Follow the schedule again"). */
export async function syncInvoice(invoiceId: string): Promise<void> {
  const [row] = await db
    .select({ scheduleItemId: clientInvoices.scheduleItemId })
    .from(clientInvoices)
    .where(eq(clientInvoices.id, invoiceId))
    .limit(1);
  if (row?.scheduleItemId) await syncInvoicesForItems([row.scheduleItemId]);
}

/**
 * Best-effort wrapper for schedule writes: a failed invoice sync must never
 * fail the schedule change that triggered it — it's logged, and the next
 * schedule change (or opening the invoice) catches it up.
 */
export function syncInvoicesForItemsQuietly(itemIds: string[]): void {
  syncInvoicesForItems(itemIds).catch((err) => console.error("[invoice-schedule-sync] failed:", err?.message ?? err));
}

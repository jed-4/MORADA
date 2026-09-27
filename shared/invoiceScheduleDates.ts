// A client invoice's dates and the schedule item it's linked to
// (client_invoices.schedule_item_id). Pure — the server and the editor share it.
//
//   follows  draft, linked, not set by hand: invoice date = the item's finish
//            (actual finish once recorded); the due date keeps the invoice's
//            terms (same number of days after). Moves when the item moves.
//   pinned   draft, linked, invoice date set by hand: keeps its own date.
//            "Follow the schedule again" goes back to `follows`.
//   locked   approved / sent / part paid / paid / overdue: it's in Xero, so the
//            dates never move again. The link stays for the record.
//   unlinked no schedule item.

import { addDays, daysBetween, toDateKey, type DateKey } from "./cashflow/dates";

export type InvoiceDateMode = "follows" | "pinned" | "locked" | "unlinked";

export function invoiceDateMode(inv: { status: string; scheduleItemId?: string | null; datePinned?: boolean | null; xeroInvoiceId?: string | null }): InvoiceDateMode {
  if (!inv.scheduleItemId) return "unlinked";
  // Approved and on — or a draft that was in Xero once (voided back): locked.
  if (inv.status !== "draft" || inv.xeroInvoiceId) return "locked";
  return inv.datePinned ? "pinned" : "follows";
}

/** The day a schedule item triggers its claim: its actual finish once recorded, else its planned finish. */
export function itemClaimDate(item: { endDate?: Date | string | null; actualEndDate?: Date | string | null }): DateKey | null {
  return toDateKey(item.actualEndDate ?? null) ?? toDateKey(item.endDate ?? null);
}

/**
 * Stored as midnight UTC of the day — how invoice dates already sit in the
 * database, and read back as the same day in UTC and in Sydney.
 */
export function dateOnly(key: DateKey): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * The dates a following invoice should have. Terms are kept: a due date 14
 * days after the old invoice date is 14 days after the new one. No due date
 * stays no due date. Null when nothing needs to change.
 */
export function followedDates(
  inv: { invoiceDate: Date | string; dueDate?: Date | string | null },
  claimDate: DateKey,
): { invoiceDate: Date; dueDate: Date | null } | null {
  const current = toDateKey(inv.invoiceDate);
  if (current === claimDate) return null;
  const due = toDateKey(inv.dueDate ?? null);
  // Terms can't be negative: a due date before the invoice date means "due now".
  const termsDays = current && due ? Math.max(0, daysBetween(current, due)) : null;
  return {
    invoiceDate: dateOnly(claimDate),
    dueDate: termsDays == null ? (inv.dueDate ? dateOnly(due!) : null) : dateOnly(addDays(claimDate, termsDays)),
  };
}

/**
 * The due date after the invoice date moves by hand without a new due date:
 * it moves the same number of days, so the terms stay the same.
 */
export function shiftedDueDate(before: { invoiceDate: Date | string; dueDate?: Date | string | null }, newInvoiceDate: Date | string): Date | null {
  const from = toDateKey(before.invoiceDate);
  const to = toDateKey(newInvoiceDate);
  const due = toDateKey(before.dueDate ?? null);
  if (!due) return null;
  if (!from || !to) return dateOnly(due);
  return dateOnly(addDays(to, Math.max(0, daysBetween(from, due))));
}

/** Did an edit change the invoice date (by day, not by time)? That's a hand-set date. */
export function invoiceDateChanged(before: Date | string | null | undefined, after: Date | string | null | undefined): boolean {
  if (after == null) return false;
  return toDateKey(before ?? null) !== toDateKey(after);
}

/** A locked invoice whose schedule item has since moved more than a few days — worth a note, not an edit. */
export function scheduleMovedSinceLock(inv: { invoiceDate: Date | string }, claimDate: DateKey | null, thresholdDays = 3): DateKey | null {
  const current = toDateKey(inv.invoiceDate);
  if (!current || !claimDate) return null;
  return Math.abs(daysBetween(current, claimDate)) > thresholdDays ? claimDate : null;
}

// Derived client-invoice status.
//
// "overdue" is NEVER stored in the database — nothing writes it, so a stored
// filter/badge would always be stale. It is always derived at display time:
// an invoice is overdue when it has been issued (sent/partial), isn't fully
// paid, and its due date is in the past.
export function effectiveInvoiceStatus(inv: {
  status: string;
  dueDate?: Date | string | null;
}): string {
  if ((inv.status === "sent" || inv.status === "partial") && inv.dueDate) {
    const due = new Date(inv.dueDate);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (due < startOfToday) return "overdue";
  }
  return inv.status;
}

// A PO's status only ever moves forward through its lifecycle. Cancelled is
// the one exit from anywhere, and nothing leaves it.
//
// The exception is status DERIVED from linked bills (server/services/
// poStatusFromBills.ts): that follows the bills, so unlinking a bill or
// removing a payment can step it back. Manual moves never can.

export const PO_STATUS_ORDER = [
  "draft",
  "sent",
  "accepted",
  "invoiced",
  "partially_paid",
  "paid",
] as const;

export function poStatusRank(status: string | null | undefined): number {
  return PO_STATUS_ORDER.indexOf((status ?? "draft") as any);
}

/** Can a person move a PO from `from` to `to`? Same status is a no-op, so allowed. */
export function canMovePOStatus(from: string | null | undefined, to: string): boolean {
  const current = from ?? "draft";
  if (current === to) return true;
  // Paid is finished: it can't be cancelled either.
  if (current === "cancelled" || current === "paid") return false;
  if (to === "cancelled") return true;
  const toRank = poStatusRank(to);
  return toRank >= 0 && toRank > poStatusRank(current);
}

export const PO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  invoiced: "Invoiced",
  partially_paid: "Partially Paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export function poStatusMoveError(from: string | null | undefined, to: string): string {
  const fromLabel = PO_STATUS_LABELS[from ?? "draft"] ?? from;
  const toLabel = PO_STATUS_LABELS[to] ?? to;
  if (from === "cancelled") return "This purchase order is cancelled and can't be changed.";
  if (from === "paid") return "This purchase order is paid and can't be changed.";
  return `A purchase order can't go back from ${fromLabel} to ${toLabel}.`;
}

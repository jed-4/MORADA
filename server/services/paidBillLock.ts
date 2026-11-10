/**
 * A bill with a payment recorded is locked, the way Xero locks a paid bill:
 * the amounts, supplier, number and dates can't change until the payment is
 * removed. Where the cost LANDS stays editable — cost code, allowance and
 * project — because tidying job costing after a bill is paid is normal and
 * none of it changes what was paid (Jed, 10 Nov 2026).
 *
 * Pure functions; the routes load the rows and decide the response.
 */

export const PAID_BILL_LOCK_MESSAGE =
  "This bill has a payment recorded, so its amounts, lines, supplier, number and dates are locked. " +
  "Remove the payment to change them. Cost codes, allowances and the project can still be changed.";

/** Header fields a payment locks. Totals are derived from the lines, so they're
 *  dropped from the save rather than compared (see stripDerivedTotals). */
const LOCKED_HEADER_FIELDS = [
  "supplierId",
  "billNumber",
  "billReference",
  "billDate",
  "dueDate",
  "taxMode",
  "billType",
] as const;

const DERIVED_TOTAL_FIELDS = ["subtotal", "tax", "total", "roundingCents", "documentTotalCents"] as const;

/** Line fields a payment locks. costCodeId (and the allowance link) stay free. */
const LOCKED_LINE_FIELDS = ["description", "quantity", "unit", "unitPrice", "tax", "account", "total"] as const;

const NUMERIC = new Set(["quantity", "unitPrice", "total"]);

// Dates compare as calendar days. Bills store a date as whatever instant made
// it — BILL created at 09:35 UTC keeps that time — while the bill form sends
// UTC midnight, so comparing instants called every resave a date change.
// Sydney's calendar works for every Australian zone: UTC midnight and local
// midnight on day D both land on D there.
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" });

function norm(field: string, v: unknown): string | number | null {
  if (v === undefined || v === null || v === "") return null;
  if (field === "billDate" || field === "dueDate") {
    const d = v instanceof Date ? v : new Date(v as string);
    return Number.isNaN(d.getTime()) ? String(v) : DAY.format(d);
  }
  if (NUMERIC.has(field)) return Number(v);
  return String(v);
}

export function activePaidCents(payments: Array<{ amount: number | null; isVoided?: boolean | null }>): number {
  return payments.filter((p) => !p.isVoided).reduce((s, p) => s + (p.amount ?? 0), 0);
}

/** Locked header fields this save would change. Only fields present in the save count. */
export function lockedHeaderChanges(previous: Record<string, unknown>, incoming: Record<string, unknown>): string[] {
  return LOCKED_HEADER_FIELDS.filter(
    (f) => f in incoming && norm(f, incoming[f]) !== norm(f, previous[f]),
  );
}

/** Drop client-computed totals from a save on a paid bill: they're derived from
 *  the (locked) lines, and a one-cent rounding disagreement must not block a
 *  cost-code change. */
export function stripDerivedTotals(incoming: Record<string, unknown>): void {
  for (const f of DERIVED_TOTAL_FIELDS) delete incoming[f];
}

/**
 * Why a full line replace on a paid bill is refused, or null when it only
 * re-allocates (same lines, same money). `incoming` items carry `id` for
 * existing lines.
 */
export function lockedLineChanges(
  existing: Array<Record<string, unknown> & { id: string }>,
  incoming: Array<Record<string, unknown> & { id?: string }>,
): string | null {
  if (incoming.length !== existing.length || incoming.some((l) => !l.id)) {
    return "lines can't be added or removed";
  }
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const line of incoming) {
    const prev = byId.get(line.id!);
    if (!prev) return "lines can't be added or removed";
    const changed = lockedLineFieldChanges(prev, line);
    if (changed.length) return `a line's ${changed.join(", ")} can't change`;
  }
  return null;
}

/** Locked fields a single-line edit would change. */
export function lockedLineFieldChanges(previous: Record<string, unknown>, incoming: Record<string, unknown>): string[] {
  return LOCKED_LINE_FIELDS.filter((f) => f in incoming && norm(f, incoming[f]) !== norm(f, previous[f]));
}

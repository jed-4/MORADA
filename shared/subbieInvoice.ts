// Subbie invoice line generation — pure, DB-free, deterministic.
//
// The correctness heart of the subbie tier's "create invoice from unbilled hours".
// Timesheets ALWAYS track real hours (the honest record). Day rate is a billing
// choice applied HERE, at invoice time — never at the tracking layer.
//
// Money: everything in this module is EX-GST integer cents (see shared/money.ts).
// Labour is a taxable supply only when the subbie is GST-registered, so GST is
// added at the invoice level iff `gstRegistered` — a NON-registered subbie must
// emit an invoice with no GST line and no "Tax Invoice" label (legal requirement).

import { GST_RATE_PERCENT, type Cents } from "./money";

export type BillingUnit = "hour" | "day";

/** One tracked timesheet row, reduced to what invoice generation needs. */
export interface SubbieTimesheetInput {
  /** Calendar date of the work — ISO string or Date. Only the date part is used. */
  date: string | Date;
  /** Real hours tracked (fractional allowed, e.g. 7.5). */
  hours: number;
  /** What the subbie charges the client, EX-GST cents per hour. */
  chargeRateCents: Cents;
}

export interface SubbieInvoiceOptions {
  /** Bill by the hour (default) or convert tracked hours to days. */
  billingUnit: BillingUnit;
  /** Day rate, EX-GST cents. Required when billingUnit === "day". */
  dayRateCents?: Cents;
  /** Is the subbie registered for GST? Drives the whole GST/label behaviour. */
  gstRegistered: boolean;
  /** Line description stem, e.g. "Carpentry". */
  description?: string;
  /**
   * Manual override of the total day count (half-day steps). When provided in
   * day mode, it replaces the computed count — the subbie had the final say.
   */
  dayCountOverride?: number;
}

export interface SubbieInvoiceLine {
  description: string;
  unit: BillingUnit;
  /** Fractional quantity (7.5 hrs, 3.5 days) — the invoice-item integer
   *  `quantity` can't hold this, so callers persist it in `quantityDecimal`. */
  quantity: number;
  /** EX-GST cents per unit (hourly charge rate, or day rate). */
  unitPriceCents: Cents;
  /** EX-GST cents = round(quantity × unitPrice). */
  totalPriceCents: Cents;
  /** True only when the subbie is GST-registered. */
  taxable: boolean;
}

/** Per-day classification, surfaced so the UI can show "Mon ½, Tue 1, …". */
export interface SubbieDayBreakdown {
  date: string; // YYYY-MM-DD
  hours: number;
  dayUnits: 0.5 | 1;
}

export interface SubbieInvoiceResult {
  lines: SubbieInvoiceLine[];
  /** Sum of line totals, EX-GST cents. */
  subtotalExGstCents: Cents;
  /** 10% of the ex-GST subtotal, or 0 when not registered. */
  gstCents: Cents;
  /** subtotal + gst. */
  totalIncGstCents: Cents;
  /** Present in day mode: how each calendar day was classified. */
  dayBreakdown?: SubbieDayBreakdown[];
  /** The label the document must use — enforced, not chosen by the caller. */
  documentLabel: "Tax Invoice" | "Invoice";
}

/** Round half-away-from-zero to whole cents. */
function roundCents(n: number): Cents {
  return Math.round(n);
}

/** Normalise a date input to a YYYY-MM-DD key (local calendar day). */
function dayKey(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Trim a fractional hours/day count for display (7.50 → "7.5", 8.00 → "8"). */
function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * The half/full-day rule, applied per calendar day:
 *   > 0h and ≤ 4h  → half day (0.5)
 *   > 4h           → full day (1.0)
 * (>8h is still one day — a day rate is flat.)
 */
export function classifyDay(hours: number): 0.5 | 1 {
  return hours > 4 ? 1 : 0.5;
}

/**
 * Build invoice lines + totals from tracked timesheet rows.
 * Pure: same inputs → same output. No DB, no clock, no I/O.
 */
export function computeSubbieInvoice(
  entries: SubbieTimesheetInput[],
  opts: SubbieInvoiceOptions,
): SubbieInvoiceResult {
  const description = opts.description?.trim() || "Carpentry";
  const documentLabel = opts.gstRegistered ? "Tax Invoice" : "Invoice";

  const lines: SubbieInvoiceLine[] = [];
  let dayBreakdown: SubbieDayBreakdown[] | undefined;

  if (opts.billingUnit === "day") {
    const dayRateCents = opts.dayRateCents ?? 0;
    if (dayRateCents <= 0) {
      throw new Error("dayRateCents is required and must be positive in day mode");
    }

    // Sum tracked hours per calendar day, then classify each day.
    const hoursByDay = new Map<string, number>();
    for (const e of entries) {
      if (e.hours <= 0) continue;
      const key = dayKey(e.date);
      hoursByDay.set(key, (hoursByDay.get(key) ?? 0) + e.hours);
    }

    dayBreakdown = Array.from(hoursByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, hours]) => ({ date, hours, dayUnits: classifyDay(hours) }));

    const computedDays = dayBreakdown.reduce((sum, d) => sum + d.dayUnits, 0);
    const totalDays = opts.dayCountOverride ?? computedDays;

    if (totalDays > 0) {
      const totalPriceCents = roundCents(totalDays * dayRateCents);
      lines.push({
        description: `${description} — ${fmtQty(totalDays)} ${totalDays === 1 ? "day" : "days"}`,
        unit: "day",
        quantity: totalDays,
        unitPriceCents: dayRateCents,
        totalPriceCents,
        taxable: opts.gstRegistered,
      });
    }
  } else {
    // Hour mode: group by charge rate so mixed rates stay correct.
    const hoursByRate = new Map<number, number>();
    for (const e of entries) {
      if (e.hours <= 0) continue;
      hoursByRate.set(e.chargeRateCents, (hoursByRate.get(e.chargeRateCents) ?? 0) + e.hours);
    }

    for (const [rateCents, hours] of Array.from(hoursByRate.entries()).sort(([a], [b]) => a - b)) {
      const totalPriceCents = roundCents(hours * rateCents);
      lines.push({
        description: `${description} — ${fmtQty(hours)} ${hours === 1 ? "hr" : "hrs"}`,
        unit: "hour",
        quantity: hours,
        unitPriceCents: rateCents,
        totalPriceCents,
        taxable: opts.gstRegistered,
      });
    }
  }

  const subtotalExGstCents = lines.reduce((sum, l) => sum + l.totalPriceCents, 0);
  const gstCents = opts.gstRegistered
    ? roundCents((subtotalExGstCents * GST_RATE_PERCENT) / 100)
    : 0;
  const totalIncGstCents = subtotalExGstCents + gstCents;

  return {
    lines,
    subtotalExGstCents,
    gstCents,
    totalIncGstCents,
    dayBreakdown,
    documentLabel,
  };
}

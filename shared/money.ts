// Single source of truth for money units and conversions.
//
// Morada's storage conventions (do not add a fourth):
//   1. CENTS as integers        — bills, invoices, POs, variations (headers),
//                                 budgets, allowance items/allocations, selections,
//                                 price list, projects. The dominant convention.
//   2. DOLLARS as float doubles — estimate_items price fields and
//                                 variation_items.unitCostExTax. 2dp policy via
//                                 shared/pricing.ts round2. (Legacy; migration to
//                                 cents is parked.)
//   3. DOLLARS as numeric(10,2) — timesheets, timesheet_cost_codes, user/contact
//                                 hourly rates. Drizzle returns these as STRINGS —
//                                 never do arithmetic on them without going through
//                                 the accessors below.
//
// GST rules (Australia, 10%):
//   - Client-facing prices are inc GST unless labelled otherwise.
//   - TIMESHET LABOUR COST IS EX GST: timesheets.total = hours × hourlyRate with
//     no GST component (wages aren't a taxable supply). When comparing labour
//     against inc-GST client prices, gross it up with incGstFromEx().
//   - Timesheet-allowance allocation amounts are stored as EX-GST cents.

/** A monetary amount in integer cents. Purely documentary, but prefer it in signatures. */
export type Cents = number;

export const GST_RATE_PERCENT = 10;

/** Parse anything numeric-ish (including Drizzle numeric strings) to a number. NaN-safe. */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}

/** Dollars (number or numeric string) → integer cents. */
export function dollarsToCents(dollars: number | string | null | undefined): Cents {
  return Math.round(toNumber(dollars) * 100);
}

export function centsToDollars(cents: Cents): number {
  return (cents || 0) / 100;
}

/** Inc-GST cents → ex-GST cents. Prefer exact stored tax components when available. */
export function exGstFromInc(incCents: Cents, taxRatePercent: number = GST_RATE_PERCENT): Cents {
  return Math.round((incCents || 0) / (1 + taxRatePercent / 100));
}

/** Ex-GST cents → inc-GST cents. */
export function incGstFromEx(exCents: Cents, taxRatePercent: number = GST_RATE_PERCENT): Cents {
  return Math.round((exCents || 0) * (1 + taxRatePercent / 100));
}

/** Split an inc-GST amount into { exGst, gst } cents (gst = inc − ex, so the parts always sum). */
export function gstSplit(incCents: Cents, taxRatePercent: number = GST_RATE_PERCENT): { exGst: Cents; gst: Cents } {
  const exGst = exGstFromInc(incCents, taxRatePercent);
  return { exGst, gst: (incCents || 0) - exGst };
}

/**
 * The canonical AUD formatter. Takes CENTS.
 * Whole-dollar amounts render without decimals ($1,500); otherwise 2dp ($1,500.25).
 */
export function formatCents(cents: Cents, opts?: { alwaysShowDecimals?: boolean }): string {
  const dollars = centsToDollars(cents);
  const isWhole = dollars % 1 === 0;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: !opts?.alwaysShowDecimals && isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

// ─── Timesheet accessors ──────────────────────────────────────────────────────
// timesheets.total / .hourlyRate / .duration are numeric(10,2) → strings in JS.
// Labour is EX GST (see header). These are the only sanctioned ways to read them.

/** Timesheet total (hours × rate) as EX-GST cents. */
export function timesheetTotalExGstCents(ts: { total: string | number | null | undefined }): Cents {
  return dollarsToCents(ts.total);
}

/** Timesheet hourly rate as EX-GST cents per hour. */
export function timesheetRateCents(ts: { hourlyRate: string | number | null | undefined }): Cents {
  return dollarsToCents(ts.hourlyRate);
}

/** Timesheet duration in hours as a number (handles the numeric-string type). */
export function timesheetHours(ts: { duration: string | number | null | undefined }): number {
  return toNumber(ts.duration);
}

/**
 * Signed abbreviated money for dense financial grids.
 *
 * Values at or above $1,000 collapse to "k"; smaller ones stay whole dollars so
 * a $385 credit does not become an unreadable "$0.4k". The sign is carried
 * OUTSIDE the dollar sign (-$0.4k, -$385) so credits are unmistakable.
 *
 * Lives here rather than in the page because a Math.abs() in one of two
 * near-identical local copies is exactly what made a -$385.36 Warehouse-Rent
 * credit render as "$0.4k" on Monthly Actuals while the totals stayed correct.
 */
export function formatSignedAbbreviatedMoney(cents: number): string {
  const v = cents / 100;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

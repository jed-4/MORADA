// Canonical bill header math. The bill header (subtotal / tax / total) is a
// denormalized cache of the bill's line items. Line-item totals are the source
// of truth and are stored EX-GST in cents. This helper mirrors exactly what
// BillDetail.tsx computes on the client so headers can never drift (e.g. an
// ex-GST sum getting stored as the inc-GST total in exclusive mode).

export type BillTotalsLine = {
  total: number; // cents (ex-GST for exclusive, inc-GST for inclusive)
  tax: string | null; // "GST on expenses" => taxable
};

export type BillTaxMode = "inclusive" | "exclusive";

/**
 * Split ONE line into its ex-GST and GST parts, in whole cents.
 *
 * The single place GST is rounded. Xero rounds tax per line and sums the
 * results; Morada used to sum the untaxed floats and round once at the end,
 * and the two disagree on a third of ordinary bills — $123.45 + $67.89 is
 * 1914c of GST to Xero and 1913c to Morada. That cent is what people were
 * reconciling by hand with the rounding adjuster. Round here, per line, and
 * every consumer agrees with Xero by construction.
 */
export function splitLineGstCents(
  lineTotalCents: number,
  taxable: boolean,
  taxMode: BillTaxMode,
  taxRatePercent: number = 10,
): { ex: number; gst: number } {
  const rate = (Number(taxRatePercent) || 0) / 100;
  const total = Math.round(lineTotalCents || 0);
  if (!taxable) return { ex: total, gst: 0 };
  if (taxMode === "inclusive") {
    // The line already contains the GST; back it out, then the GST is the
    // remainder so ex + gst can never drift from the line's own amount.
    const ex = Math.round(total / (1 + rate));
    return { ex, gst: total - ex };
  }
  return { ex: total, gst: Math.round(total * rate) };
}

export function computeBillTotalsCents(
  lineItems: BillTotalsLine[],
  taxMode: BillTaxMode,
  taxRatePercent: number,
  // Manual rounding adjustment in cents (e.g. +/-1c to make the computed total
  // match the figure printed on the supplier invoice, the way Xero adds a
  // "Rounding" line). Applied to the total only, never to subtotal or tax.
  roundingCents: number = 0,
): { subtotal: number; tax: number; total: number } {
  let subtotalCents = 0;
  let taxCents = 0;

  for (const li of lineItems) {
    const { ex, gst } = splitLineGstCents(
      li.total || 0,
      li.tax === "GST on expenses",
      taxMode,
      taxRatePercent,
    );
    subtotalCents += ex;
    taxCents += gst;
  }

  const rounding = Math.round(Number(roundingCents) || 0);
  return { subtotal: subtotalCents, tax: taxCents, total: subtotalCents + taxCents + rounding };
}

// The description Morada gives the rounding line it pushes to Xero. It is the
// marker that lets the import side tell our own rounding line apart from a real
// expense line, so a round trip does not fold the adjustment into the subtotal
// or re-import it as a line item. Changing this string orphans the rounding
// lines on already-pushed bills, so don't.
export const XERO_ROUNDING_LINE_DESCRIPTION = "Rounding";

/**
 * Is this Xero line the rounding line Morada pushed?
 *
 * Matched on description and on being small enough to be a rounding
 * adjustment — the description alone would also swallow a genuine supplier
 * line that happened to be called "Rounding", and misreading a real line as
 * ours would silently drop money off the bill.
 */
export function isXeroRoundingLine(
  description: string | null | undefined,
  lineAmountCents: number,
): boolean {
  if ((description || "").trim().toLowerCase() !== XERO_ROUNDING_LINE_DESCRIPTION.toLowerCase()) return false;
  return Math.abs(lineAmountCents) <= MAX_ROUNDING_CENTS;
}

// Maximum absolute rounding adjustment we allow (in cents). Rounding is meant
// to reconcile sub-cent drift against a supplier invoice, not to fudge amounts.
export const MAX_ROUNDING_CENTS = 5;

export function clampRoundingCents(cents: number): number {
  const n = Math.round(Number(cents) || 0);
  if (n > MAX_ROUNDING_CENTS) return MAX_ROUNDING_CENTS;
  if (n < -MAX_ROUNDING_CENTS) return -MAX_ROUNDING_CENTS;
  return n;
}

// Ex-GST value (in cents) of a single bill line, honouring the parent bill's
// taxMode. Mirrors computeBillTotalsCents' per-line subtotal contribution:
//   - exclusive bills: the stored line total is already ex-GST.
//   - inclusive bills: a taxable ("GST on expenses") line total INCLUDES GST,
//     so strip it (ex = total / (1 + rate)).
//   - non-taxable ("No GST") lines never carry GST.
// Use this anywhere bill spend is rolled up as an "actual" so it compares
// like-for-like against the ex-GST budget (budget line items, budget header
// rollup, actual-costs summary, budget-actuals drill-down). Australian GST is
// fixed at 10%, which is the default.
export function billLineExGstCents(
  lineTotal: number,
  lineTax: string | null | undefined,
  taxMode: BillTaxMode | string | null | undefined,
  taxRatePercent: number = 10,
): number {
  const total = lineTotal || 0;
  if (taxMode === "inclusive" && lineTax === "GST on expenses") {
    const rate = (Number(taxRatePercent) || 0) / 100;
    return Math.round(total / (1 + rate));
  }
  return Math.round(total);
}

// Which way round the AI's line totals should be read. An extractor returns the
// numbers printed on the document: per-line totals, plus the document's own
// subtotal (ex-GST) and total (inc-GST). If the lines add up to the subtotal
// they are ex-GST lines (exclusive); if they add up to the total they include
// GST (inclusive). Guessing wrong puts every stored figure ~10% out AND sends
// Xero the wrong LineAmountTypes, so both the bill and the pushed invoice are
// wrong in the same direction.
//
// Australian supplier invoices most often print inc-GST line totals, so that is
// the fallback when the document gives us nothing to compare against.
export function detectBillTaxMode(input: {
  lineTotalsCents: number[];
  documentSubtotalCents?: number | null;
  documentTotalCents?: number | null;
}): BillTaxMode {
  const { lineTotalsCents, documentSubtotalCents, documentTotalCents } = input;
  if (!lineTotalsCents || lineTotalsCents.length === 0) return "inclusive";
  if (documentSubtotalCents == null || documentTotalCents == null) return "inclusive";
  if (documentSubtotalCents === documentTotalCents) return "inclusive";
  const sum = lineTotalsCents.reduce((s, n) => s + (n || 0), 0);
  return Math.abs(sum - documentSubtotalCents) < Math.abs(sum - documentTotalCents)
    ? "exclusive"
    : "inclusive";
}

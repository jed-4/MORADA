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

export function computeBillTotalsCents(
  lineItems: BillTotalsLine[],
  taxMode: BillTaxMode,
  taxRatePercent: number,
): { subtotal: number; tax: number; total: number } {
  const rate = (Number(taxRatePercent) || 0) / 100;
  let subtotal = 0;
  let tax = 0;

  for (const li of lineItems) {
    const lineTotal = li.total || 0;
    const taxable = li.tax === "GST on expenses";
    if (taxMode === "inclusive") {
      if (taxable) {
        const ex = lineTotal / (1 + rate);
        subtotal += ex;
        tax += lineTotal - ex;
      } else {
        subtotal += lineTotal;
      }
    } else {
      subtotal += lineTotal;
      if (taxable) tax += lineTotal * rate;
    }
  }

  const subtotalCents = Math.round(subtotal);
  const taxCents = Math.round(tax);
  return { subtotal: subtotalCents, tax: taxCents, total: subtotalCents + taxCents };
}

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

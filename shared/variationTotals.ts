// Single source of truth for variation money totals.
//
// Used by BOTH the client editor (live preview) and the server (persisted
// subtotal/gstAmount/totalAmount on every write) so the two can never drift.
//
// Component conventions (see shared/money.ts header):
//   - variation_items.totalPrice  — EX-GST integer cents; `taxable` lines
//     attract 10% GST. Applies to cost_line AND allowance adjustment lines
//     (allowance lines may be negative = deduction/credit).
//   - bills.subtotal/tax/total    — integer cents; prefer the stored ex/tax
//     components, fall back to a 10% split of the inc-GST total.
//   - timesheets.total            — EX-GST dollars as a numeric string. Labour
//     on-charged to a client is a taxable supply, so it attracts GST here
//     even though the underlying wage cost has no GST component.

import {
  type Cents,
  dollarsToCents,
  gstSplit,
  timesheetTotalExGstCents,
} from "./money";

export interface VariationTotalsInput {
  items: Array<{
    totalPrice: number | null | undefined; // ex-GST cents
    taxable: boolean | null | undefined;
  }>;
  bills?: Array<{
    subtotal?: number | null; // ex-GST cents (stored component)
    tax?: number | null; // GST cents (stored component)
    total: number | null | undefined; // inc-GST cents
  }>;
  timesheets?: Array<{
    total: string | number | null | undefined; // ex-GST dollars (numeric string)
  }>;
}

export interface VariationTotals {
  subtotalCents: Cents; // ex GST
  gstCents: Cents;
  totalCents: Cents; // inc GST
}

const GST_MULTIPLIER = 0.1;

export function computeVariationTotals(input: VariationTotalsInput): VariationTotals {
  let subtotalCents = 0;
  let gstCents = 0;

  for (const item of input.items) {
    const lineCents = Math.round(item.totalPrice || 0);
    subtotalCents += lineCents;
    if (item.taxable) gstCents += Math.round(lineCents * GST_MULTIPLIER);
  }

  for (const bill of input.bills ?? []) {
    const totalCents = Math.round(bill.total || 0);
    if (totalCents === 0) continue;
    const hasComponents =
      typeof bill.subtotal === "number" &&
      typeof bill.tax === "number" &&
      bill.subtotal + bill.tax === totalCents;
    if (hasComponents) {
      subtotalCents += bill.subtotal!;
      gstCents += bill.tax!;
    } else {
      const split = gstSplit(totalCents);
      subtotalCents += split.exGst;
      gstCents += split.gst;
    }
  }

  for (const ts of input.timesheets ?? []) {
    const exCents = timesheetTotalExGstCents(ts);
    subtotalCents += exCents;
    gstCents += Math.round(exCents * GST_MULTIPLIER);
  }

  return { subtotalCents, gstCents, totalCents: subtotalCents + gstCents };
}

/** Per-line client price in ex-GST cents from the builder-cost fields.
 *  unitCostExTax is DOLLARS (doublePrecision); markupPercent is a whole %.
 *  Returns both the unit price and the line total, each independently rounded
 *  to cents from the exact float so unitPrice*qty and totalPrice agree with
 *  what the editor displays. */
export function computeVariationLinePriceCents(line: {
  quantity: number | null | undefined;
  unitCostExTax: number | string | null | undefined;
  markupPercent?: number | null;
}): { unitPriceCents: Cents; totalPriceCents: Cents } {
  const qty = typeof line.quantity === "number" ? line.quantity : Number(line.quantity) || 0;
  const markupFactor = 1 + (line.markupPercent ?? 0) / 100;
  const unitExDollars = (typeof line.unitCostExTax === "string"
    ? parseFloat(line.unitCostExTax) || 0
    : line.unitCostExTax || 0) * markupFactor;
  return {
    unitPriceCents: dollarsToCents(unitExDollars),
    totalPriceCents: dollarsToCents(unitExDollars * qty),
  };
}

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
//
// Markup has TWO independent layers, and they are not interchangeable:
//   1. Per-line markup (variation_items.markupPercent) is baked into the line's
//      unitPrice/totalPrice by computeVariationLinePriceCents, so it is already
//      inside the figures above and the client sees it only as the line amount.
//   2. Global markup (variations.globalMarkupPercent) is applied HERE, once, to
//      the ex-GST value of everything being on-charged, and is returned as its
//      own component so the document can print it as a visible row.

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
    /** "cost_line" | "allowance". Allowance rows are adjustments and are often
     *  negative, so they are excluded from the global-markup base — marking up
     *  a credit would make the client's deduction bigger. Absent = cost line. */
    itemType?: string | null;
  }>;
  bills?: Array<{
    subtotal?: number | null; // ex-GST cents (stored component)
    tax?: number | null; // GST cents (stored component)
    total: number | null | undefined; // inc-GST cents
  }>;
  timesheets?: Array<{
    total: string | number | null | undefined; // ex-GST dollars (numeric string)
  }>;
  /** Document-level markup, a whole percentage (12.5 = 12.5%). null/0 = none. */
  globalMarkupPercent?: number | null;
}

export interface VariationTotals {
  subtotalCents: Cents; // ex GST, INCLUDING global markup
  gstCents: Cents;
  totalCents: Cents; // inc GST
  /** Ex-GST value the global markup was applied to (cost lines + bills + labour). */
  markupBaseCents: Cents;
  /** Ex-GST global markup amount. Already inside subtotalCents. */
  globalMarkupCents: Cents;
}

const GST_MULTIPLIER = 0.1;

export function computeVariationTotals(input: VariationTotalsInput): VariationTotals {
  let subtotalCents = 0;
  let gstCents = 0;
  // The global-markup base, split by tax character. Markup inherits the GST
  // treatment of what it marks up — apportioning it pro-rata is the only way
  // the GST line stays correct on a variation that mixes taxable and
  // non-taxable value. Applying 10% to the whole markup (or none of it) would
  // silently misstate the tax.
  let baseTaxableCents = 0;
  let baseNonTaxableCents = 0;

  for (const item of input.items) {
    const lineCents = Math.round(item.totalPrice || 0);
    subtotalCents += lineCents;
    if (item.taxable) gstCents += Math.round(lineCents * GST_MULTIPLIER);
    // Allowance adjustments are excluded from the markup base.
    if (item.itemType !== "allowance") {
      if (item.taxable) baseTaxableCents += lineCents;
      else baseNonTaxableCents += lineCents;
    }
  }

  for (const bill of input.bills ?? []) {
    const totalCents = Math.round(bill.total || 0);
    if (totalCents === 0) continue;
    const hasComponents =
      typeof bill.subtotal === "number" &&
      typeof bill.tax === "number" &&
      bill.subtotal + bill.tax === totalCents;
    let exCents: number;
    let taxCents: number;
    if (hasComponents) {
      exCents = bill.subtotal!;
      taxCents = bill.tax!;
    } else {
      const split = gstSplit(totalCents);
      exCents = split.exGst;
      taxCents = split.gst;
    }
    subtotalCents += exCents;
    gstCents += taxCents;
    // A bill can be part-taxable (GST-free groceries alongside taxable goods),
    // so derive the taxable slice from the GST actually charged rather than
    // treating the whole bill as one or the other.
    const taxableEx = Math.min(Math.round(taxCents / GST_MULTIPLIER), exCents);
    baseTaxableCents += taxableEx;
    baseNonTaxableCents += exCents - taxableEx;
  }

  for (const ts of input.timesheets ?? []) {
    const exCents = timesheetTotalExGstCents(ts);
    subtotalCents += exCents;
    gstCents += Math.round(exCents * GST_MULTIPLIER);
    baseTaxableCents += exCents;
  }

  const markupBaseCents = baseTaxableCents + baseNonTaxableCents;
  const pct = input.globalMarkupPercent ?? 0;
  let globalMarkupCents = 0;
  if (pct !== 0 && markupBaseCents !== 0) {
    // Round each tax slice independently so the GST added below is derived from
    // the same figure that lands in the subtotal.
    const markupTaxable = Math.round(baseTaxableCents * (pct / 100));
    const markupNonTaxable = Math.round(baseNonTaxableCents * (pct / 100));
    globalMarkupCents = markupTaxable + markupNonTaxable;
    subtotalCents += globalMarkupCents;
    gstCents += Math.round(markupTaxable * GST_MULTIPLIER);
  }

  return {
    subtotalCents,
    gstCents,
    totalCents: subtotalCents + gstCents,
    markupBaseCents,
    globalMarkupCents,
  };
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

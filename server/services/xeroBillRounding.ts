/**
 * The rounding adjustment at the Xero push/import boundary.
 *
 * A Xero bill payload carries no total — Xero computes it from the lines. So a
 * bill whose total was adjusted in Morada (to match the figure printed on the
 * supplier's invoice) can only agree with Xero if the adjustment is pushed as
 * a line of its own, the way Xero's own "Rounding" line works.
 *
 * Pure, and in its own module, so the payload math can be tested without
 * booting routes.ts (which opens a database pool on import).
 */

import {
  XERO_ROUNDING_LINE_DESCRIPTION,
  isXeroRoundingLine,
  type BillTaxMode,
} from "@shared/billTotals";

export type XeroPayloadLine = {
  description?: string;
  quantity?: number;
  unitAmount?: number;
  taxType?: string;
  accountCode?: string;
};

/** Tax types that mean "no GST on this line". */
const GST_FREE_TAX_TYPES = new Set(["NONE", "EXEMPTEXPENSES", "EXEMPTINPUT", "BASEXCLUDED"]);

export function isGstFreeTaxType(taxType: string | undefined): boolean {
  return GST_FREE_TAX_TYPES.has((taxType || "").toUpperCase());
}

/**
 * The rounding line to append, or a reason it cannot be built.
 *
 * `accountCode` is required: Xero rejects a line without one, and dropping the
 * line instead is what left Morada and Xero disagreeing by a cent with nothing
 * on screen to say so. `gstFreeExpenseTaxType` must be a type the organisation
 * actually has active — many AU orgs do not have "NONE", and hardcoding it
 * failed the whole push on those orgs.
 */
export function buildRoundingLine(input: {
  roundingCents: number;
  accountCode: string | undefined;
  gstFreeExpenseTaxType: string;
}): { ok: true; line: XeroPayloadLine } | { ok: false; reason: "NO_ADJUSTMENT" | "NO_ACCOUNT" } {
  const cents = Math.round(input.roundingCents || 0);
  if (cents === 0) return { ok: false, reason: "NO_ADJUSTMENT" };
  if (!input.accountCode) return { ok: false, reason: "NO_ACCOUNT" };
  return {
    ok: true,
    line: {
      description: XERO_ROUNDING_LINE_DESCRIPTION,
      quantity: 1,
      unitAmount: cents / 100,
      taxType: input.gstFreeExpenseTaxType,
      accountCode: input.accountCode,
    },
  };
}

/**
 * What Xero will compute for this payload, in cents.
 *
 * Mirrors Xero's own arithmetic: LineAmount = quantity x unitAmount, and tax is
 * rounded per line. Under `Exclusive` the line amounts are ex-GST and tax is
 * added on top; under `Inclusive` they already contain the GST.
 */
export function xeroComputedTotals(
  lines: XeroPayloadLine[],
  taxMode: BillTaxMode,
  taxRatePercent: number = 10,
): { subtotal: number; tax: number; total: number } {
  const rate = (Number(taxRatePercent) || 0) / 100;
  let subtotal = 0;
  let tax = 0;

  for (const l of lines) {
    const lineAmount = Math.round((l.quantity ?? 1) * (l.unitAmount ?? 0) * 100);
    const taxable = !isGstFreeTaxType(l.taxType);
    if (taxMode === "inclusive") {
      if (taxable) {
        const ex = Math.round(lineAmount / (1 + rate));
        subtotal += ex;
        tax += lineAmount - ex;
      } else {
        subtotal += lineAmount;
      }
    } else {
      subtotal += lineAmount;
      if (taxable) tax += Math.round(lineAmount * rate);
    }
  }

  return { subtotal, tax, total: subtotal + tax };
}

/**
 * Read a Xero invoice back into Morada's shape, taking our own rounding line
 * out of the subtotal and recovering it as `roundingCents`.
 *
 * Without this a re-sync folds the adjustment into the subtotal while
 * roundingCents still carries it, so the bill stops agreeing with its own math
 * and the adjustment is applied twice the next time a line is edited.
 */
export function importXeroTotals(invoice: {
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  LineItems?: Array<{ Description?: string; LineAmount?: number }>;
}): { subtotal: number; tax: number; total: number; roundingCents: number } {
  const subtotalRaw = Math.round((invoice.SubTotal || 0) * 100);
  const tax = Math.round((invoice.TotalTax || 0) * 100);
  const total = Math.round((invoice.Total || 0) * 100);

  const roundingLineCents = (invoice.LineItems || []).reduce((sum, xl) => {
    const amount = Math.round((xl.LineAmount ?? 0) * 100);
    return isXeroRoundingLine(xl.Description, amount) ? sum + amount : sum;
  }, 0);

  const subtotal = subtotalRaw - roundingLineCents;
  // Whatever the lines cannot explain is the rounding, so the bill can never
  // store a total that disagrees with its own subtotal + tax + rounding.
  return { subtotal, tax, total, roundingCents: total - subtotal - tax };
}

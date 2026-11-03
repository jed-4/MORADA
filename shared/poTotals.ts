// Canonical PO header math. The header (subtotal / gstAmount / total) is a
// denormalized cache of the lines, like a bill's. gstMode says what a line's
// price means: "inclusive" already contains the GST, "exclusive" has it added,
// "gst_free" carries none. Subtotal is always ex GST, as the PDF labels it.

import { splitLineGstCents } from "./billTotals";

export type POTotalsLine = {
  quantity?: string | number | null;
  unitPrice?: number | null;
  total?: number | null; // cents
  isGstFree?: boolean | null;
};

// Same order as the PDF: the stored line total, else quantity × price.
export function poLineCents(line: POTotalsLine): number {
  return line.total || Math.round(Number(line.quantity || 0) * (line.unitPrice || 0));
}

export function hasPricedLine(lines: POTotalsLine[]): boolean {
  return lines.some((line) => poLineCents(line) !== 0);
}

export function computePOTotalsCents(
  lines: POTotalsLine[],
  gstMode: string | null | undefined,
): { subtotal: number; gstAmount: number; total: number } {
  let subtotal = 0;
  let gstAmount = 0;
  for (const line of lines) {
    const taxable = gstMode !== "gst_free" && !line.isGstFree;
    const { ex, gst } = splitLineGstCents(
      poLineCents(line),
      taxable,
      gstMode === "inclusive" ? "inclusive" : "exclusive",
    );
    subtotal += ex;
    gstAmount += gst;
  }
  return { subtotal, gstAmount, total: subtotal + gstAmount };
}

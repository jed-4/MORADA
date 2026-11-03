// An estimate line as a PO line. A PO goes to the supplier, so this is always
// the builder's COST: never markup, and wastage counts because it is what has
// to be bought. Estimate money is dollars, PO money is cents, and a price
// follows the PO's gstMode so it means what shared/poTotals.ts says it means.

import { computeEstimateItemPrice, isLumpSumLine } from "./pricing";

export type EstimateLineForPO = {
  name?: string | null;
  quantity?: number | null;
  wastagePercent?: number | null;
  unitType?: string | null;
  unitCostExTax?: number | null;
  unitCostIncTax?: number | null;
  markupPercent?: number | null;
  priceIncTax?: number | null;
};

const toCents = (dollars: number) => Math.round(dollars * 100);

export function estimateLineToPOLine(item: EstimateLineForPO, gstMode: string) {
  const inclusive = gstMode === "inclusive";
  const lineCents = (exDollars: number, incDollars: number) => toCents(inclusive ? incDollars : exDollars);

  // A lump sum has no unit cost and ignores quantity; its amount is the cached
  // sell price, so take any line markup back off.
  if (isLumpSumLine(item.unitCostExTax, item.priceIncTax)) {
    const inc = (item.priceIncTax || 0) / (1 + (item.markupPercent || 0) / 100);
    const total = lineCents(inc / 1.1, inc);
    return { description: item.name || "Untitled item", quantity: "1", unit: item.unitType || "each", unitPrice: total, total };
  }

  const price = computeEstimateItemPrice({
    unitCostExTax: item.unitCostExTax ?? 0,
    unitCostIncTax: item.unitCostIncTax,
    quantity: item.quantity ?? 0,
    wastagePercent: item.wastagePercent,
    markupPercent: 0,
    projectMarkupPercent: 0,
    taxRate: 10,
  });
  const quantity = (item.quantity ?? 0) * (1 + (item.wastagePercent || 0) / 100);
  return {
    description: item.name || "Untitled item",
    quantity: String(Math.round(quantity * 100) / 100),
    unit: item.unitType || "each",
    unitPrice: lineCents(item.unitCostExTax ?? 0, price.unitCostIncTax),
    total: lineCents(price.builderCost, price.builderCostIncTax),
  };
}

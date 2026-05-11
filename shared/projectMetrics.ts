export interface EstimateItemForMetrics {
  priceIncTax: number | null;
  taxAmount: number | null;
}

export interface VariationForMetrics {
  status: string | null;
  subtotal: number | null;
  totalAmount: number | null;
}

export interface ContractMetricsCents {
  originalContractPriceExGstCents: number;
  originalContractPriceIncGstCents: number;
  approvedVariationsExGstCents: number;
  approvedVariationsIncGstCents: number;
  revisedContractPriceExGstCents: number;
  revisedContractPriceIncGstCents: number;
}

export interface ContractMetrics extends ContractMetricsCents {
  originalContractPriceExGst: number;
  originalContractPriceIncGst: number;
  approvedVariationsExGst: number;
  approvedVariationsIncGst: number;
  revisedContractPriceExGst: number;
  revisedContractPriceIncGst: number;
}

const APPROVED_VARIATION_STATUSES = new Set(["approved", "released"]);

export function isApprovedVariationStatus(status: string | null | undefined): boolean {
  return !!status && APPROVED_VARIATION_STATUSES.has(status);
}

export function computeContractMetricsCents(
  estimateItems: EstimateItemForMetrics[],
  variations: VariationForMetrics[],
  projectMarkupPercent: number | null | undefined = 0,
): ContractMetricsCents {
  // estimate_items.priceIncTax / taxAmount are stored as dollars (double precision,
  // 2dp) — convert to cents here. variations.subtotal / totalAmount are integer
  // cents already.
  let itemsIncGstCents = 0;
  let itemsTaxCents = 0;
  for (const item of estimateItems) {
    itemsIncGstCents += Math.round((Number(item.priceIncTax) || 0) * 100);
    itemsTaxCents += Math.round((Number(item.taxAmount) || 0) * 100);
  }
  const itemsExGstCents = itemsIncGstCents - itemsTaxCents;

  // Apply project-level builder margin on top of the line items to get the true
  // contracted (sell) price. The percent is applied to ex-GST, then GST is added
  // back at the same effective rate the items used.
  const margin = (Number(projectMarkupPercent) || 0) / 100;
  const originalExGst = Math.round(itemsExGstCents * (1 + margin));
  // Preserve the items' effective tax rate (handles non-10% or zero-rated items).
  const effectiveTaxRate =
    itemsExGstCents > 0 ? itemsTaxCents / itemsExGstCents : 0;
  const originalIncGst = Math.round(originalExGst * (1 + effectiveTaxRate));

  let varExGst = 0;
  let varIncGst = 0;
  for (const v of variations) {
    if (!isApprovedVariationStatus(v.status)) continue;
    varExGst += Number(v.subtotal) || 0;
    varIncGst += Number(v.totalAmount) || 0;
  }

  return {
    originalContractPriceExGstCents: originalExGst,
    originalContractPriceIncGstCents: originalIncGst,
    approvedVariationsExGstCents: varExGst,
    approvedVariationsIncGstCents: varIncGst,
    revisedContractPriceExGstCents: originalExGst + varExGst,
    revisedContractPriceIncGstCents: originalIncGst + varIncGst,
  };
}

export function toContractMetrics(c: ContractMetricsCents): ContractMetrics {
  return {
    ...c,
    originalContractPriceExGst: c.originalContractPriceExGstCents / 100,
    originalContractPriceIncGst: c.originalContractPriceIncGstCents / 100,
    approvedVariationsExGst: c.approvedVariationsExGstCents / 100,
    approvedVariationsIncGst: c.approvedVariationsIncGstCents / 100,
    revisedContractPriceExGst: c.revisedContractPriceExGstCents / 100,
    revisedContractPriceIncGst: c.revisedContractPriceIncGstCents / 100,
  };
}

export function computeContractMetrics(
  estimateItems: EstimateItemForMetrics[],
  variations: VariationForMetrics[],
  projectMarkupPercent: number | null | undefined = 0,
): ContractMetrics {
  return toContractMetrics(
    computeContractMetricsCents(estimateItems, variations, projectMarkupPercent),
  );
}

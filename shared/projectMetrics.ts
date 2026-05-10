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
): ContractMetricsCents {
  let originalIncGst = 0;
  let originalTax = 0;
  for (const item of estimateItems) {
    originalIncGst += Number(item.priceIncTax) || 0;
    originalTax += Number(item.taxAmount) || 0;
  }
  const originalExGst = originalIncGst - originalTax;

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
): ContractMetrics {
  return toContractMetrics(computeContractMetricsCents(estimateItems, variations));
}

import { computeEstimateSummary } from "./pricing";

export interface EstimateItemForMetrics {
  priceIncTax: number | null;
  taxAmount: number | null;
  // Raw inputs needed to recompute the original contract via the single
  // pricing source of truth (computeEstimateSummary). unitCostExTax/quantity/
  // markupPercent let us apply projectMarkupPercent exactly ONCE, instead of
  // re-applying it on top of the cached priceIncTax (which already bakes the
  // project markup in for lines that have no explicit per-line markup — that
  // path double-counts). priceIncTax/taxAmount remain for fixed-price (PC sum)
  // lines where unitCost === 0.
  unitCostExTax?: number | null;
  quantity?: number | null;
  markupPercent?: number | null;
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
  taxRate: number | null | undefined = 10,
): ContractMetricsCents {
  // The ORIGINAL contract price is the canonical estimate total. Derive it from
  // the single pricing source of truth (computeEstimateSummary) so it ALWAYS
  // matches the value stamped onto projects.contractPrice at approve/contract
  // time. This recomputes per-line markup from unitCost/qty/markupPercent and
  // applies projectMarkupPercent exactly once at the subtotal — avoiding the
  // double-count that occurs when project markup is re-applied on top of the
  // cached priceIncTax (which already bakes it in for null-markup lines).
  // computeEstimateSummary returns dollars (2dp); convert to cents here.
  const summary = computeEstimateSummary(estimateItems, {
    projectMarkupPercent,
    taxRate,
  });
  const originalExGst = Math.round((summary.totalExTax || 0) * 100);
  const originalIncGst = Math.round((summary.total || 0) * 100);

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
  taxRate: number | null | undefined = 10,
): ContractMetrics {
  return toContractMetrics(
    computeContractMetricsCents(
      estimateItems,
      variations,
      projectMarkupPercent,
      taxRate,
    ),
  );
}

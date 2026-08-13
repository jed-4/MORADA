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

// "Pending" = raised with the client and awaiting their decision. Draft is
// deliberately excluded (not yet issued) and so is rejected/approved (decided).
// Single definition for every surface that counts or values pending
// variations — the KPI card, business widget, project summary and open-items
// widget each used to filter differently, so the same number disagreed
// depending on where you read it.
export const PENDING_VARIATION_STATUSES = ["pending", "action"] as const;
const PENDING_VARIATION_STATUS_SET = new Set<string>(PENDING_VARIATION_STATUSES);

export function isPendingVariationStatus(status: string | null | undefined): boolean {
  return !!status && PENDING_VARIATION_STATUS_SET.has(status);
}

/**
 * The frozen contract sum captured when an estimate was marked as the contract
 * (projects.contracted_total_ex_gst_cents / _inc_gst_cents). Once a job is
 * contracted the sum the client owes MUST NOT move — only an approved
 * variation may change it — so when this is supplied it REPLACES the live
 * estimate recomputation as the original contract price.
 */
export interface FrozenContractTotalCents {
  exGstCents: number;
  incGstCents: number;
}

/**
 * True when a project carries a usable frozen contract sum. `contractedAt`
 * is the authority on "this job is contracted"; the two totals must both be
 * present for the freeze to be meaningful (a half-written row falls back to
 * the live estimate rather than reporting a zero contract).
 */
export function frozenContractTotalFrom(project: {
  contractedAt?: Date | string | null;
  contractedTotalExGstCents?: number | null;
  contractedTotalIncGstCents?: number | null;
} | null | undefined): FrozenContractTotalCents | null {
  if (!project?.contractedAt) return null;
  const ex = project.contractedTotalExGstCents;
  const inc = project.contractedTotalIncGstCents;
  if (ex == null || inc == null) return null;
  return { exGstCents: Number(ex), incGstCents: Number(inc) };
}

export function computeContractMetricsCents(
  estimateItems: EstimateItemForMetrics[],
  variations: VariationForMetrics[],
  projectMarkupPercent: number | null | undefined = 0,
  taxRate: number | null | undefined = 10,
  frozen?: FrozenContractTotalCents | null,
): ContractMetricsCents {
  // The ORIGINAL contract price is the canonical estimate total. Derive it from
  // the single pricing source of truth (computeEstimateSummary) so it ALWAYS
  // matches the value stamped onto projects.contractPrice at approve/contract
  // time. This recomputes per-line markup from unitCost/qty/markupPercent and
  // applies projectMarkupPercent exactly once at the subtotal — avoiding the
  // double-count that occurs when project markup is re-applied on top of the
  // cached priceIncTax (which already bakes it in for null-markup lines).
  // computeEstimateSummary returns dollars (2dp); convert to cents here.
  //
  // EXCEPT once the job is contracted: `frozen` short-circuits the whole
  // recomputation. This is the freeze. Without it, editing a contracted
  // estimate silently moves what the client owes — and excluding an allowance
  // would credit the client twice (once by shrinking the estimate, again via
  // the deduction variation raised for it).
  const summary = frozen
    ? null
    : computeEstimateSummary(estimateItems, {
        projectMarkupPercent,
        taxRate,
      });
  const originalExGst = frozen
    ? Math.round(frozen.exGstCents)
    : Math.round((summary!.totalExTax || 0) * 100);
  const originalIncGst = frozen
    ? Math.round(frozen.incGstCents)
    : Math.round((summary!.total || 0) * 100);

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
  frozen?: FrozenContractTotalCents | null,
): ContractMetrics {
  return toContractMetrics(
    computeContractMetricsCents(
      estimateItems,
      variations,
      projectMarkupPercent,
      taxRate,
      frozen,
    ),
  );
}

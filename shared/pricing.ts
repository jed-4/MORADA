// Single source of truth for estimate pricing.
//
// Mental model (matches what the user described):
//   line ex tax    = qty * unitCostExTax * (1 + lineMarkup%/100)
//   line inc tax   = line ex tax * (1 + tax%/100)
//   estimate ex tax = sum(line ex tax) * (1 + projectMarkup%/100)
//   estimate inc tax = estimate ex tax * (1 + tax%/100)
//
// Cost code, status, allowance and proposalVisible NEVER affect price.
//
// Fixed-price lines (PC sums / provisional allowances):
//   When qty * unitCostExTax === 0, we treat the line as a fixed-price entry:
//     - the stored priceIncTax is taken as authoritative line inc tax
//     - the line contributes its full cached amount to the builder cost total
//     - the line contributes ZERO line-item markup (markup is for materials/labour)
//   This is intentional and matches how Australian builders enter PC sums:
//   you punch in a $5,000 fixed allowance, not a unit rate × quantity.
//
// All money values are dollars rounded to 2 decimals. Percentages are
// percentages (10 = 10%, 7.5 = 7.5%).

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface EstimateItemPriceInput {
  unitCostExTax: number;
  quantity: number;
  /** Per-item markup percent. If null/undefined, falls back to projectMarkupPercent. */
  markupPercent: number | null | undefined;
  /** Estimate-level project markup, used as fallback when item has no own markup. */
  projectMarkupPercent: number | null | undefined;
  /** Tax rate (GST) as a percentage. Default 10. */
  taxRate: number | null | undefined;
}

export interface EstimateItemPrice {
  /** qty * unitCostExTax, rounded to 2dp. The builder's raw cost. */
  builderCost: number;
  /** The effective markup % actually applied (resolves item → project fallback). */
  effectiveMarkupPercent: number;
  /** builderCost * effectiveMarkupPercent / 100, rounded to 2dp. */
  lineMarkupAmount: number;
  /** builderCost + lineMarkupAmount, rounded to 2dp. */
  lineExTax: number;
  /** lineExTax * taxRate / 100, rounded to 2dp. */
  taxAmount: number;
  /** lineExTax + taxAmount, rounded to 2dp. */
  lineIncTax: number;
  /** unitCostExTax * (1 + taxRate/100), rounded to 2dp. UI-only convenience. */
  unitCostIncTax: number;
  /** builderCost * (1 + taxRate/100), rounded to 2dp. UI-only convenience. */
  builderCostIncTax: number;
}

export function computeEstimateItemPrice(input: EstimateItemPriceInput): EstimateItemPrice {
  const unitCost = Number(input.unitCostExTax) || 0;
  const qty = Number(input.quantity) || 0;
  const itemMarkup = input.markupPercent;
  const projectMarkup = input.projectMarkupPercent;
  const taxRate = Number(input.taxRate ?? 10);

  // Fall back to project-level markup when item has none. `?? 0` handles
  // the case where neither is set.
  const effectiveMarkupPercent = Number(
    itemMarkup ?? projectMarkup ?? 0,
  );

  const builderCost = round2(unitCost * qty);
  const lineMarkupAmount = round2(builderCost * (effectiveMarkupPercent / 100));
  const lineExTax = round2(builderCost + lineMarkupAmount);
  const taxAmount = round2(lineExTax * (taxRate / 100));
  const lineIncTax = round2(lineExTax + taxAmount);
  const unitCostIncTax = round2(unitCost * (1 + taxRate / 100));
  const builderCostIncTax = round2(builderCost * (1 + taxRate / 100));

  return {
    builderCost,
    effectiveMarkupPercent,
    lineMarkupAmount,
    lineExTax,
    taxAmount,
    lineIncTax,
    unitCostIncTax,
    builderCostIncTax,
  };
}

/**
 * Minimal shape required to compute summary totals. Accepts any object
 * with these fields so it works against drizzle rows, in-memory items, etc.
 *
 * `priceIncTax` and `taxAmount` are only consulted for the fixed-price
 * special case (qty * unitCost === 0). They are otherwise re-derived.
 */
export interface EstimateItemSummaryInput {
  unitCostExTax?: number | null;
  quantity?: number | null;
  markupPercent?: number | null;
  /** Used only as a fallback for fixed-price (qty=0) lines. */
  priceIncTax?: number | null;
  /** Used only as a fallback for fixed-price (qty=0) lines. */
  taxAmount?: number | null;
}

export interface EstimateSummary {
  /** Sum of (qty * unitCost) for all lines, fixed-price lines counted at their cached ex-tax. */
  builderCostTotal: number;
  /** Sum of per-line markup amounts. Zero for fixed-price lines. */
  lineItemMarkupAmount: number;
  /** builderCostTotal + lineItemMarkupAmount. */
  subtotalExTax: number;
  globalMarkupPercent: number;
  /** subtotalExTax * projectMarkupPercent / 100. */
  globalMarkupAmount: number;
  /** subtotalExTax + globalMarkupAmount. */
  totalExTax: number;
  /** GST on totalExTax. */
  taxAmount: number;
  /** totalExTax + taxAmount. */
  total: number;
  itemCount: number;
  // Backwards-compatibility aliases
  subtotal: number;
  markupAmount: number;
  subtotalWithMarkup: number;
}

export function computeEstimateSummary(
  items: EstimateItemSummaryInput[],
  options: {
    projectMarkupPercent: number | null | undefined;
    taxRate: number | null | undefined;
  },
): EstimateSummary {
  const projectMarkupPercent = Number(options.projectMarkupPercent ?? 0);
  const taxRate = Number(options.taxRate ?? 10);

  let builderCostTotal = 0;
  let lineItemMarkupTotal = 0;

  for (const item of items) {
    const unitCost = Number(item.unitCostExTax ?? 0);
    const qty = Number(item.quantity ?? 0);
    const computed = computeEstimateItemPrice({
      unitCostExTax: unitCost,
      quantity: qty,
      markupPercent: item.markupPercent ?? null,
      // Per-line markup must NOT inherit project markup at the line level
      // here — project markup is applied once at the estimate subtotal below.
      projectMarkupPercent: 0,
      taxRate,
    });

    if (unitCost * qty > 0) {
      builderCostTotal += computed.builderCost;
      lineItemMarkupTotal += computed.lineMarkupAmount;
    } else {
      // Fixed-price line (PC sum / provisional allowance).
      // Use the cached priceIncTax - taxAmount as the line's ex-tax amount.
      // No line-item markup is added; markup on a flat allowance makes no sense.
      const cachedExTax = Number(item.priceIncTax ?? 0) - Number(item.taxAmount ?? 0);
      builderCostTotal += cachedExTax;
    }
  }

  builderCostTotal = round2(builderCostTotal);
  const lineItemMarkupAmount = round2(lineItemMarkupTotal);
  const subtotalExTax = round2(builderCostTotal + lineItemMarkupAmount);
  const globalMarkupAmount = round2(subtotalExTax * (projectMarkupPercent / 100));
  const totalExTax = round2(subtotalExTax + globalMarkupAmount);
  const taxAmount = round2(totalExTax * (taxRate / 100));
  const total = round2(totalExTax + taxAmount);

  return {
    builderCostTotal,
    lineItemMarkupAmount,
    subtotalExTax,
    globalMarkupPercent: projectMarkupPercent,
    globalMarkupAmount,
    totalExTax,
    taxAmount,
    total,
    itemCount: items.length,
    subtotal: builderCostTotal,
    markupAmount: lineItemMarkupAmount,
    subtotalWithMarkup: subtotalExTax,
  };
}

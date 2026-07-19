// Single source of truth for estimate pricing.
//
// Mental model (matches what the user described):
//   line ex tax    = qty * unitCostExTax * (1 + lineMarkup%/100)
//   line inc tax   = line ex tax * (1 + tax%/100)
//   estimate ex tax = sum(line ex tax) * (1 + projectMarkup%/100)
//   estimate inc tax = estimate ex tax * (1 + tax%/100)
//
// The two markups are SEPARATE and both apply to allowance (PC/PS) lines:
//   - Line-item markup belongs to one line only (qty × unitCost × (1+lineMarkup%)).
//   - Builder's margin (project/global markup) applies ONCE to the ex-GST
//     subtotal of ALL lines, then GST on top.
//
// Cost code, status, allowance and proposalVisible NEVER affect price.
// Allowance type (None / Prime Cost / Provisional Sum) is METADATA ONLY — it
// must never change any computed amount.
//
// Fixed-price lines (PC sums / provisional allowances):
//   When a line has NO per-unit cost (unitCostExTax === 0), we treat it as a
//   fixed-price entry:
//     - the stored/typed priceIncTax is AUTHORITATIVE line inc tax and must be
//       PRESERVED across every write path — never recomputed to $0
//     - the line contributes its full cached amount to the builder cost total
//     - the line contributes ZERO line-item markup (markup is for materials/labour)
//   This is intentional and matches how Australian builders enter PC sums:
//   you punch in a $5,000 fixed allowance, not a unit rate × quantity.
//   NOTE: a normal priced line (unitCost > 0) whose quantity is set to 0 is NOT
//   fixed-price — it recomputes to $0. Classifying on unitCost alone (not on
//   qty × unitCost === 0) is what stops a zeroed priced line from keeping its
//   stale cached price and never dropping the estimate total.
//
//   IMPORTANT for every write path (create / update / import / duplicate / copy /
//   reorder / bulk edit, on web, mobile, routes AND storage): route the stored
//   { priceIncTax, taxAmount } through `resolveEstimateStoredPrice` below.
//   Recomputing blindly via `computeEstimateItemPrice` produces 0 for a flat
//   line and silently wipes the typed allowance amount, dropping the estimate
//   total. That is a bug — the resolver preserves the flat amount.
//
// All money values are dollars rounded to 2 decimals. Percentages are
// percentages (10 = 10%, 7.5 = 7.5%).

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface EstimateItemPriceInput {
  unitCostExTax: number;
  quantity: number;
  /** Per-item markup percent. If null/undefined, the line carries ZERO markup. */
  markupPercent: number | null | undefined;
  /**
   * IGNORED for the line amount. The builder's margin (project markup) is
   * applied once at the estimate subtotal (computeEstimateSummary), never as a
   * per-line fallback. Retained only for call-site compatibility.
   */
  projectMarkupPercent: number | null | undefined;
  /** Tax rate (GST) as a percentage. Default 10. */
  taxRate: number | null | undefined;
  /**
   * Wastage percent (10 = 10%). Inflates the quantity you must buy, so it
   * raises the builder cost: builderCost = unitCost × qty × (1 + wastage/100).
   * Defaults to 0. Fixed-price (unitCost 0) lines ignore it.
   */
  wastagePercent?: number | null | undefined;
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
  const wastagePercent = Number(input.wastagePercent ?? 0) || 0;
  const itemMarkup = input.markupPercent;
  const taxRate = Number(input.taxRate ?? 10);

  // Wastage inflates the quantity actually purchased, so it raises the builder
  // cost. Applied to the quantity BEFORE markup and GST. A zero-quantity line
  // stays $0 regardless of wastage.
  const effectiveQty = qty * (1 + wastagePercent / 100);

  // Per-line markup is the line's OWN markup ONLY. A blank (null/undefined)
  // line markup means ZERO line markup — the builder's margin (project
  // markup) is applied exactly ONCE at the estimate subtotal in
  // computeEstimateSummary, never as a per-line fallback. Inheriting it here
  // would double-count it against the global margin and make the on-screen
  // rows disagree with the estimate total. `input.projectMarkupPercent` is
  // therefore IGNORED for the line amount; it is kept on the input only for
  // call-site compatibility.
  const effectiveMarkupPercent = Number(itemMarkup ?? 0);

  const builderCost = round2(unitCost * effectiveQty);
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
 * A line is "fixed-price" (a flat PC sum / provisional allowance) when it has
 * NO per-unit cost — i.e. `unitCostExTax === 0`. In that case the typed
 * priceIncTax is the authoritative amount and must be preserved, not derived
 * from qty × unitCost × markup.
 *
 * IMPORTANT: this is deliberately based on the unit cost ALONE, not on
 * `qty × unitCost === 0`. A normal priced line (unitCost > 0) whose quantity is
 * set to 0 is NOT fixed-price — it must recompute to $0. The old
 * `qty × unitCost === 0` test wrongly matched those zeroed priced lines and
 * preserved their stale cached price, so the estimate total never dropped.
 * Genuine flat allowances are entered as a typed amount with unitCost = 0, so
 * `unitCostExTax === 0` captures them exactly. (An allowance that DOES carry a
 * real unit cost behaves as a normal priced line in both the old and new
 * classification, so nothing regresses.)
 */
export function isFixedPriceLine(
  unitCostExTax: number | null | undefined,
): boolean {
  return (Number(unitCostExTax) || 0) === 0;
}

export interface StoredPriceResolveInput {
  unitCostExTax: number | null | undefined;
  quantity: number | null | undefined;
  markupPercent: number | null | undefined;
  projectMarkupPercent: number | null | undefined;
  taxRate: number | null | undefined;
  /** Wastage percent (raises builder cost on priced lines). Defaults to 0. */
  wastagePercent?: number | null | undefined;
  /**
   * The line's existing/typed priceIncTax. Authoritative for fixed-price
   * (unitCost === 0) lines — this is what must NOT be wiped to 0.
   */
  existingPriceIncTax?: number | null;
}

/**
 * The ONE place every write path (create / update / import / duplicate / copy /
 * reorder / bulk edit, in routes.ts AND storage.ts) should use to decide the
 * stored { priceIncTax, taxAmount } for an estimate line.
 *
 *  - Priced line (unitCost > 0): fully re-derived from qty × unitCost × its OWN
 *    line markup via computeEstimateItemPrice. The builder's margin (project
 *    markup) is NOT baked into the stored cache — it is applied once globally at
 *    the estimate subtotal, so the cache holds the pre-margin line amount and an
 *    edit to the project margin never staleifies any cached row. This keeps
 *    normal lines recalculating correctly, INCLUDING dropping to $0 when the
 *    quantity is set to 0.
 *  - Fixed-price line (unitCost === 0, a flat PC/PS allowance): the typed
 *    priceIncTax is PRESERVED and a correct GST split is re-derived from it, so
 *    a stale taxAmount self-heals on the next write WITHOUT ever wiping the
 *    typed amount to $0. Toggling allowance / status / cost code / any non-price
 *    field therefore never changes the line price or the estimate total.
 */
export function resolveEstimateStoredPrice(
  input: StoredPriceResolveInput,
): { priceIncTax: number; taxAmount: number } {
  const taxRate = Number(input.taxRate ?? 10);

  if (!isFixedPriceLine(input.unitCostExTax)) {
    const { taxAmount, lineIncTax } = computeEstimateItemPrice({
      unitCostExTax: input.unitCostExTax ?? 0,
      quantity: input.quantity ?? 0,
      markupPercent: input.markupPercent,
      projectMarkupPercent: input.projectMarkupPercent,
      taxRate,
      wastagePercent: input.wastagePercent,
    });
    return { priceIncTax: lineIncTax, taxAmount };
  }

  // Fixed-price line: preserve the typed inc-tax amount, re-derive the GST split.
  const priceIncTax = round2(Number(input.existingPriceIncTax ?? 0));
  const exTax = round2(priceIncTax / (1 + taxRate / 100));
  const taxAmount = round2(priceIncTax - exTax);
  return { priceIncTax, taxAmount };
}

/**
 * Minimal shape required to compute summary totals. Accepts any object
 * with these fields so it works against drizzle rows, in-memory items, etc.
 *
 * `priceIncTax` and `taxAmount` are only consulted for the fixed-price
 * special case (unitCost === 0). They are otherwise re-derived.
 */
export interface EstimateItemSummaryInput {
  unitCostExTax?: number | null;
  quantity?: number | null;
  markupPercent?: number | null;
  /** Wastage percent — raises builder cost on priced lines. Defaults to 0. */
  wastagePercent?: number | null;
  /** Used only as a fallback for fixed-price (unitCost=0) lines. */
  priceIncTax?: number | null;
  /** Used only as a fallback for fixed-price (unitCost=0) lines. */
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

/**
 * The pure builder COST (ex-tax, NO markup) of a single estimate line — the
 * cost-only basis used by the Budget page. This is exactly the per-line
 * contribution to `computeEstimateSummary().builderCostTotal`:
 *   - priced line (unitCost > 0): qty * unitCost (ex-tax)
 *   - fixed-price line (PC sum / provisional allowance, unitCost === 0):
 *     its cached ex-tax value (priceIncTax - taxAmount)
 * Excludes BOTH per-line markup and the global project markup, and excludes GST.
 */
export function estimateItemBuilderCostExTax(item: EstimateItemSummaryInput): number {
  const unitCost = Number(item.unitCostExTax ?? 0);
  const qty = Number(item.quantity ?? 0);
  if (!isFixedPriceLine(unitCost)) {
    // Priced line: cost is qty × unitCost, inflated by wastage (0 when qty is 0).
    const wastagePercent = Number(item.wastagePercent ?? 0) || 0;
    return round2(unitCost * qty * (1 + wastagePercent / 100));
  }
  return round2(Number(item.priceIncTax ?? 0) - Number(item.taxAmount ?? 0));
}

/**
 * Payload handed to the total-integrity reporter when an estimate's grand total
 * diverges from the sum of its per-line inc-tax totals (+ builder's margin).
 */
export interface EstimateTotalIntegrityViolation {
  estimateId?: string;
  /** Total reconstructed from the sum of the individual line totals. */
  expectedTotal: number;
  /** The aggregated grand total actually returned by computeEstimateSummary. */
  actualTotal: number;
  /** |expectedTotal - actualTotal|, rounded to cents. */
  diff: number;
}

export type EstimateTotalIntegrityReporter = (
  violation: EstimateTotalIntegrityViolation,
) => void;

// Injectable so shared/pricing.ts stays free of any server-only dependency
// (e.g. @sentry/node). The server wires a Sentry-backed reporter at startup;
// on the client / in tests this stays null and the invariant is a silent check.
let integrityReporter: EstimateTotalIntegrityReporter | null = null;

export function setEstimateTotalIntegrityReporter(
  reporter: EstimateTotalIntegrityReporter | null,
): void {
  integrityReporter = reporter;
}

export function computeEstimateSummary(
  items: EstimateItemSummaryInput[],
  options: {
    projectMarkupPercent: number | null | undefined;
    taxRate: number | null | undefined;
    /** Optional — included in the integrity-violation report for traceability. */
    estimateId?: string;
    /** Optional override for the rounding tolerance budget (defaults to line count). */
    estimateItemCountForTolerance?: number;
  },
): EstimateSummary {
  const projectMarkupPercent = Number(options.projectMarkupPercent ?? 0);
  const taxRate = Number(options.taxRate ?? 10);

  let builderCostTotal = 0;
  let lineItemMarkupTotal = 0;
  // Independent running sum of every line's OWN inc-tax total (the number shown
  // per row on screen). Used purely for the total-integrity invariant below.
  let sumLineIncTax = 0;

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
      wastagePercent: item.wastagePercent ?? 0,
    });

    if (!isFixedPriceLine(unitCost)) {
      // Priced line: include positive AND negative-quantity rows
      // (e.g. deduction lines) so their markup nets correctly against the
      // matching positive lines. A zero-quantity priced line contributes $0
      // (builderCost = qty × unitCost = 0), which is the whole point of the
      // fix — its stale cached price is NOT preserved.
      builderCostTotal += computed.builderCost;
      lineItemMarkupTotal += computed.lineMarkupAmount;
      sumLineIncTax += computed.lineIncTax;
    } else {
      // Fixed-price line (PC sum / provisional allowance): no per-unit cost.
      // Use the cached priceIncTax - taxAmount as the line's ex-tax amount.
      // No line-item markup is added; markup on a flat allowance makes no sense.
      const cachedIncTax = Number(item.priceIncTax ?? 0);
      const cachedExTax = cachedIncTax - Number(item.taxAmount ?? 0);
      builderCostTotal += cachedExTax;
      sumLineIncTax += cachedIncTax;
    }
  }

  builderCostTotal = round2(builderCostTotal);
  const lineItemMarkupAmount = round2(lineItemMarkupTotal);
  const subtotalExTax = round2(builderCostTotal + lineItemMarkupAmount);
  const globalMarkupAmount = round2(subtotalExTax * (projectMarkupPercent / 100));
  const totalExTax = round2(subtotalExTax + globalMarkupAmount);
  const taxAmount = round2(totalExTax * (taxRate / 100));
  const total = round2(totalExTax + taxAmount);

  // Total-integrity invariant. Reconstruct the grand total from the sum of the
  // per-line inc-tax totals shown on screen, plus the builder's-margin
  // (project markup) inc-tax which the UI shows as its own summary line. If this
  // reconstruction diverges from the aggregated `total`, a line price has
  // silently drifted from its contribution to the total — exactly the failure
  // mode that let a stale cached price survive. Surface it loudly instead of
  // quietly displaying a wrong number during a quote.
  const globalMarkupIncTax = round2(globalMarkupAmount * (1 + taxRate / 100));
  const reconstructedTotal = round2(sumLineIncTax + globalMarkupIncTax);
  // Per-line rounding accumulates ~half a cent per line, so budget one cent per
  // line (min one cent). A genuine stale-price divergence is dollars, far above
  // this, so real bugs still surface while rounding noise never false-fires.
  const integrityTolerance = Math.max(0.01, options.estimateItemCountForTolerance ?? items.length) * 0.01;
  const integrityDiff = Math.abs(reconstructedTotal - total);
  if (integrityDiff > integrityTolerance && integrityReporter) {
    try {
      integrityReporter({
        estimateId: options.estimateId,
        expectedTotal: reconstructedTotal,
        actualTotal: total,
        diff: round2(integrityDiff),
      });
    } catch {
      // A misbehaving reporter must never break pricing.
    }
  }

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

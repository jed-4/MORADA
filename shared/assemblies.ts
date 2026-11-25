/**
 * Estimate assemblies — the pure rules (migration 0142).
 *
 * An assembly is a company recipe: "Slab Pour", per m². Dropped into an
 * estimate it becomes ONE assembly line (qty 120 m²) with its components as
 * sub-items underneath. Each component's quantity follows the assembly line:
 *
 *   per_unit   quantity = assembly quantity × factor   (concrete 0.105 m³ / m²)
 *   fixed      quantity = factor                        (1 pump hire)
 *
 * Typing a component's quantity by hand marks it OVERRIDDEN: it stops following
 * until reset. Same idea as editing a unit cost taking a line off the price list.
 *
 * Money rule (the one that matters): the assembly line carries NO cost of its
 * own — unitCostExTax 0, priceIncTax 0 — and every dollar lives on the
 * components. Pricing therefore sums each line exactly once and needs no new
 * rule. Anything that DISPLAYS a line amount must show the assembly line's
 * rolled-up figure (`rollUpAssemblyLine`), and anything that SUMS must not add
 * that figure on top of the components it came from.
 *
 * Library money is CENTS ex GST (like the price list); estimate money is
 * DOLLARS. The conversion happens here, once.
 */
import { centsToDollars } from "./money";
import { computeEstimateItemPrice, resolveEstimateStoredPrice, round2 } from "./pricing";

export type AssemblyQtyMode = "per_unit" | "fixed";

/** Four decimals: enough for 0.105 × 120, without float dust like 12.600000000000001. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** A component's quantity for a given assembly quantity. */
export function componentQuantity(
  mode: string | null | undefined,
  factor: number | null | undefined,
  assemblyQuantity: number | null | undefined,
): number {
  const f = Number(factor) || 0;
  if (mode === "fixed") return round4(f);
  return round4((Number(assemblyQuantity) || 0) * f);
}

/** The minimum an estimate line needs for the assembly rules below. */
export interface AssemblyLineLike {
  id: string;
  parentItemId?: string | null;
  assemblyId?: string | null;
  assemblyQtyMode?: string | null;
  assemblyQtyFactor?: number | null;
  assemblyQtyOverridden?: boolean | null;
  quantity?: number | null;
}

/** True for the assembly line itself (the one that rolls up). */
export function isAssemblyLine(item: { assemblyId?: string | null } | null | undefined): boolean {
  return !!item?.assemblyId;
}

/** True for a component line that follows an assembly line's quantity. */
export function isAssemblyComponentLine(
  item: { assemblyQtyMode?: string | null; parentItemId?: string | null } | null | undefined,
): boolean {
  return !!item?.assemblyQtyMode && !!item?.parentItemId;
}

/**
 * The quantity updates a change to the assembly line's quantity implies.
 * Overridden components are left alone; unchanged ones are not returned.
 */
export function planAssemblyRescale(
  assemblyQuantity: number,
  components: AssemblyLineLike[],
): Array<{ id: string; quantity: number }> {
  const out: Array<{ id: string; quantity: number }> = [];
  for (const c of components) {
    if (!c.assemblyQtyMode || c.assemblyQtyOverridden) continue;
    const next = componentQuantity(c.assemblyQtyMode, c.assemblyQtyFactor, assemblyQuantity);
    if (Math.abs(next - (Number(c.quantity) || 0)) > 1e-9) out.push({ id: c.id, quantity: next });
  }
  return out;
}

/** Assembly line id → its component lines, in the order given. */
export function groupAssemblyComponents<T extends AssemblyLineLike>(items: T[]): Map<string, T[]> {
  const assemblyIds = new Set(items.filter(isAssemblyLine).map((i) => i.id));
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (item.parentItemId && assemblyIds.has(item.parentItemId)) {
      const list = map.get(item.parentItemId) ?? [];
      list.push(item);
      map.set(item.parentItemId, list);
    }
  }
  return map;
}

/**
 * What an assembly line shows: the sum of its components' amounts, and the
 * rate that sum works out to per assembly unit. `amountOf` is the caller's own
 * line-amount function, so a grid, a PDF and a portal each roll up in exactly
 * the figure they already print for an ordinary line.
 */
export function rollUpAssemblyLine<T>(
  assemblyQuantity: number | null | undefined,
  components: T[],
  amountOf: (line: T) => number,
): { amount: number; rate: number | null } {
  const amount = round2(components.reduce((s, c) => s + (Number(amountOf(c)) || 0), 0));
  const qty = Number(assemblyQuantity) || 0;
  return { amount, rate: qty > 0 ? round2(amount / qty) : null };
}

// ── Building estimate lines from a Library assembly ──────────────────────────

export interface AssemblyComponentSource {
  id: string;
  name: string;
  type: string;
  priceListItemId: string | null;
  unitType: string;
  unitCostCents: number;
  qtyMode: string;
  qtyFactor: number;
  wastagePercent: number;
  markupPercent: number | null;
  costCodeId: string | null;
}

export interface AssemblySource {
  id: string;
  name: string;
  description: string | null;
  unitType: string;
  costCodeId: string | null;
  version: number;
  components: AssemblyComponentSource[];
}

export interface EstimatePricingContext {
  projectMarkupPercent: number | null | undefined;
  taxRate: number | null | undefined;
}

/** Fields for the assembly line itself. Groups, order and ids are the caller's. */
export function assemblyLineFields(assembly: AssemblySource, quantity: number) {
  return {
    name: assembly.name,
    description: assembly.description,
    type: "Material",
    quantity: round4(Number(quantity) || 0),
    unitType: assembly.unitType,
    // No money of its own — see the header.
    unitCostExTax: 0,
    unitCostIncTax: null,
    markupPercent: null,
    wastagePercent: 0,
    priceIncTax: 0,
    taxAmount: 0,
    costCode: assembly.costCodeId,
    assemblyId: assembly.id,
    assemblyVersion: assembly.version,
    proposalVisible: true,
  };
}

/**
 * Fields for one component line under an assembly line of `quantity`.
 *
 * `catalogueCostCents` is the price list's CURRENT ex-GST cost for the linked
 * item, when there is one. The line keeps its price-list link only while its
 * cost still equals that price — the invariant estimate_items.priceListItemId
 * documents — so an assembly whose stored cost has drifted from the catalogue
 * drops in at the assembly's cost, unlinked, rather than silently repricing.
 */
export function componentLineFields(
  component: AssemblyComponentSource,
  assembly: Pick<AssemblySource, "costCodeId">,
  quantity: number,
  pricing: EstimatePricingContext,
  catalogueCostCents?: number | null,
) {
  const unitCostExTax = centsToDollars(component.unitCostCents);
  const qty = componentQuantity(component.qtyMode, component.qtyFactor, quantity);
  const { priceIncTax, taxAmount } = resolveEstimateStoredPrice({
    unitCostExTax,
    quantity: qty,
    markupPercent: component.markupPercent,
    projectMarkupPercent: pricing.projectMarkupPercent,
    taxRate: pricing.taxRate,
    wastagePercent: component.wastagePercent,
    existingPriceIncTax: 0,
  });
  const keepsLink =
    !!component.priceListItemId &&
    catalogueCostCents !== undefined &&
    catalogueCostCents !== null &&
    catalogueCostCents === component.unitCostCents;
  return {
    name: component.name,
    type: component.type || "Material",
    quantity: qty,
    unitType: component.unitType,
    unitCostExTax,
    unitCostIncTax: null,
    markupPercent: component.markupPercent,
    wastagePercent: component.wastagePercent,
    priceIncTax,
    taxAmount,
    costCode: component.costCodeId ?? assembly.costCodeId,
    priceListItemId: keepsLink ? component.priceListItemId : null,
    assemblyComponentId: component.id,
    assemblyQtyMode: component.qtyMode === "fixed" ? "fixed" : "per_unit",
    assemblyQtyFactor: component.qtyFactor,
    assemblyQtyOverridden: false,
    // The client sees the assembly line, not its recipe. The eye can bring any back.
    proposalVisible: false,
  };
}

/**
 * An assembly's price in the two parts that mean something to an estimator:
 * the rate per assembly unit (from per-unit components) and the fixed costs
 * that land once whatever the quantity. DOLLARS ex GST, before the builder's
 * margin, line markup and wastage included.
 */
export function assemblyRateBreakdown(
  components: Array<Pick<AssemblyComponentSource, "unitCostCents" | "qtyMode" | "qtyFactor" | "wastagePercent" | "markupPercent">>,
): { perUnitExTax: number; fixedExTax: number } {
  const perUnit = components.filter((c) => c.qtyMode !== "fixed");
  const fixed = components.filter((c) => c.qtyMode === "fixed");
  // Priced at 1 000 units and divided back down, so a 0.105 factor isn't
  // rounded to the cent per line before it is multiplied out.
  return {
    perUnitExTax: round2(previewAssemblyCostExTax(perUnit, 1000) / 1000),
    fixedExTax: previewAssemblyCostExTax(fixed, 0),
  };
}

/**
 * What an assembly costs at a given quantity, before the builder's margin, in
 * DOLLARS ex GST — the Library editor's preview. Line markup and wastage
 * included, exactly as the components will price once dropped in.
 */
export function previewAssemblyCostExTax(
  components: Array<Pick<AssemblyComponentSource, "unitCostCents" | "qtyMode" | "qtyFactor" | "wastagePercent" | "markupPercent">>,
  quantity: number,
): number {
  let total = 0;
  for (const c of components) {
    const { lineExTax } = computeEstimateItemPrice({
      unitCostExTax: centsToDollars(c.unitCostCents),
      quantity: componentQuantity(c.qtyMode, c.qtyFactor, quantity),
      markupPercent: c.markupPercent,
      projectMarkupPercent: 0,
      taxRate: 10,
      wastagePercent: c.wastagePercent,
    });
    total += lineExTax;
  }
  return round2(total);
}

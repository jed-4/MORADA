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
import { evaluateQuantityFormula } from "./quantityFormula";

/**
 *   formula    quantity = a recipe over the assembly's NAMED INPUTS (phase 3):
 *              `Area × Thickness × 1.05`, `Edge`, `ROUND(Area / 1.2)`.
 *
 * Named inputs: the assembly line's own quantity is always the first input
 * (key "qty", labelled e.g. "Area"); an assembly can declare more — Thickness
 * 0.1 m, Edge length — each with a default. On an estimate line every input
 * has a value and may instead follow a take-off measurement. Recipes are
 * stored by KEY (`{input:qty} * {input:t} * 1.05`), shown by LABEL, so
 * renaming an input never breaks a recipe — the same rule take-off refs keep.
 */
export type AssemblyQtyMode = "per_unit" | "fixed" | "formula";

/** The key of the first input: the assembly line's own quantity. */
export const MAIN_INPUT_KEY = "qty";

/** An extra input the Library assembly declares. */
export interface AssemblyInputDef {
  key: string;
  label: string;
  unit?: string | null;
  defaultValue: number;
}

/**
 * An input's value on one estimate (or template) line. The definition is
 * SNAPSHOTTED onto the line: editing the Library never changes a priced job
 * (linked + manual Update). `formula` is a take-off link — `{takeoff:id}` on an
 * estimate, `{Name}` on a template — and decides `value` when set.
 */
export interface AssemblyInputValue extends AssemblyInputDef {
  value: number;
  formula?: string | null;
}

const WORD = /^[A-Za-z][A-Za-z0-9_]*$/;

/** An input key: short, stable, never shown. */
export function newInputKey(): string {
  return `i${Math.random().toString(36).slice(2, 8)}`;
}

/** What the main input is called when the assembly doesn't say. */
export function mainInputLabel(label: string | null | undefined): string {
  return (label ?? "").trim() || "Qty";
}

/** The values a recipe reads, keyed the way the formula parser looks them up. */
export function inputValueMap(
  quantity: number | null | undefined,
  inputs: Array<{ key: string; value?: number | null; defaultValue?: number | null }> | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>([[`input:${MAIN_INPUT_KEY}`, Number(quantity) || 0]]);
  for (const i of inputs ?? []) {
    const v = i.value ?? i.defaultValue;
    map.set(`input:${i.key}`, Number(v) || 0);
  }
  return map;
}

/** Validate an assembly's extra inputs. Returns an error message, or null. */
export function checkInputDefs(mainLabel: string | null | undefined, defs: AssemblyInputDef[]): string | null {
  const seenKeys = new Set<string>([MAIN_INPUT_KEY]);
  const seenLabels = new Set<string>([mainInputLabel(mainLabel).toLowerCase()]);
  if (mainInputLabel(mainLabel).toUpperCase() === "ROUND") return "An input can't be called ROUND";
  for (const d of defs) {
    const label = (d.label ?? "").trim();
    if (!label) return "Every input needs a name";
    if (label.toUpperCase() === "ROUND") return "An input can't be called ROUND";
    if (/[{}]/.test(label)) return "An input name can't contain { or }";
    if (!/^[0-9a-zA-Z_-]+$/.test(d.key)) return "Bad input key";
    if (seenKeys.has(d.key)) return "Two inputs share a key";
    if (seenLabels.has(label.toLowerCase())) return `Two inputs are called "${label}"`;
    if (!Number.isFinite(Number(d.defaultValue))) return `"${label}" needs a default number`;
    seenKeys.add(d.key);
    seenLabels.add(label.toLowerCase());
  }
  return null;
}

type LabelSource = { mainLabel: string | null | undefined; inputs: Array<{ key: string; label: string }> };

const labelIndex = (src: LabelSource) => {
  const byKey = new Map<string, string>([[MAIN_INPUT_KEY, mainInputLabel(src.mainLabel)]]);
  for (const i of src.inputs) byKey.set(i.key, i.label.trim());
  const byLabel = new Map<string, string>();
  byKey.forEach((label, key) => byLabel.set(label.toLowerCase(), key));
  return { byKey, byLabel };
};

/** `{input:qty} * {input:t}` → `Area × Thickness`, for showing a recipe. */
export function recipeToDisplay(formula: string | null | undefined, src: LabelSource): string {
  if (!formula) return "";
  const { byKey } = labelIndex(src);
  return formula
    .replace(/\{input:([0-9a-zA-Z_-]+)\}/g, (_all, key: string) => {
      const label = byKey.get(key);
      if (!label) return "{deleted input}";
      return WORD.test(label) && label.toUpperCase() !== "ROUND" ? label : `{${label}}`;
    })
    .replace(/\s*\*\s*/g, " × ")
    .replace(/\s*\/\s*/g, " ÷ ");
}

/**
 * `Area × Thickness × 1.05` (or `{Edge length}`) → the stored key form, and
 * what it comes to at the inputs' defaults — so a recipe that doesn't read is
 * caught in the Library, not on every estimate it lands in.
 */
export function recipeFromDisplay(
  text: string,
  src: LabelSource & { quantity?: number; defaults?: Array<{ key: string; defaultValue: number }> },
): { ok: true; formula: string; sample: number } | { ok: false; error: string } {
  const display = text.trim();
  if (!display) return { ok: false, error: "Type a recipe, e.g. Area × 1.1" };
  const { byLabel } = labelIndex(src);
  let error: string | null = null;
  const formula = display.replace(/\{([^{}]*)\}|[A-Za-z][A-Za-z0-9_]*/g, (all, braced: string | undefined) => {
    if (error) return all;
    const name = (braced ?? all).trim();
    if (braced === undefined && name.toUpperCase() === "ROUND") return "ROUND";
    if (/^input:[0-9a-zA-Z_-]+$/.test(name)) return `{${name}}`;
    const key = byLabel.get(name.toLowerCase());
    if (!key) {
      error = `No input called "${name}"`;
      return all;
    }
    return `{input:${key}}`;
  });
  if (error) return { ok: false, error };
  const values = inputValueMap(src.quantity ?? 1, src.defaults ?? []);
  const r = evaluateQuantityFormula(formula, values, { decimals: 4 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, formula, sample: r.value };
}

/**
 * Settle the inputs that follow a take-off measurement: each `formula` is
 * evaluated against the project's measurements and decides `value`. A formula
 * that doesn't read (a waiting template name, a deleted measurement) keeps the
 * last value — never zeroes it. `changed` says whether any value moved.
 */
export function resolveInputFormulas(
  inputs: AssemblyInputValue[] | null | undefined,
  takeoffQuantities: Map<string, number>,
): { inputs: AssemblyInputValue[]; changed: boolean; errors: string[] } {
  let changed = false;
  const errors: string[] = [];
  const out = (inputs ?? []).map((i) => {
    if (!i.formula) return i;
    const r = evaluateQuantityFormula(i.formula, takeoffQuantities);
    if (!r.ok) {
      errors.push(`${i.label}: ${r.error}`);
      return i;
    }
    if (Math.abs(r.value - (Number(i.value) || 0)) < 1e-9) return i;
    changed = true;
    return { ...i, value: r.value };
  });
  return { inputs: out, changed, errors };
}

/** The take-off formulas a line's inputs follow — for the take-off ref index. */
export function inputFormulas(inputs: AssemblyInputValue[] | null | undefined): string[] {
  return (inputs ?? []).map((i) => i.formula).filter((f): f is string => !!f && f.trim() !== "");
}

/** Every input key a recipe reads. */
export function recipeInputKeys(formula: string | null | undefined): string[] {
  if (!formula) return [];
  const keys: string[] = [];
  for (const m of Array.from(formula.matchAll(/\{input:([0-9a-zA-Z_-]+)\}/g))) {
    if (!keys.includes(m[1])) keys.push(m[1]);
  }
  return keys;
}

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

/**
 * A component's quantity in any mode. `null` when a recipe doesn't read (an
 * input deleted, divide by zero): the caller keeps the line's last number —
 * a broken recipe must never quietly zero a priced line.
 */
export function componentQuantityOf(
  c: { mode: string | null | undefined; factor: number | null | undefined; formula?: string | null },
  ctx: { quantity: number | null | undefined; inputs?: Array<{ key: string; value?: number | null; defaultValue?: number | null }> | null },
): number | null {
  if (c.mode !== "formula") return componentQuantity(c.mode, c.factor, ctx.quantity);
  const r = evaluateQuantityFormula(c.formula, inputValueMap(ctx.quantity, ctx.inputs), { decimals: 4 });
  return r.ok ? r.value : null;
}

/** The minimum an estimate line needs for the assembly rules below. */
export interface AssemblyLineLike {
  id: string;
  parentItemId?: string | null;
  assemblyId?: string | null;
  assemblyQtyMode?: string | null;
  assemblyQtyFactor?: number | null;
  assemblyQtyFormula?: string | null;
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
  inputs?: AssemblyInputValue[] | null,
): Array<{ id: string; quantity: number }> {
  const out: Array<{ id: string; quantity: number }> = [];
  for (const c of components) {
    if (!c.assemblyQtyMode || c.assemblyQtyOverridden) continue;
    const next = componentQuantityOf(
      { mode: c.assemblyQtyMode, factor: c.assemblyQtyFactor, formula: c.assemblyQtyFormula },
      { quantity: assemblyQuantity, inputs },
    );
    if (next === null) continue;
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
  qtyFormula?: string | null;
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
  quantityLabel?: string | null;
  inputs?: AssemblyInputDef[] | null;
  components: AssemblyComponentSource[];
}

/** An assembly's inputs as they land on a new line: every one at its default. */
export function initialInputValues(assembly: Pick<AssemblySource, "inputs">): AssemblyInputValue[] {
  return (assembly.inputs ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    unit: d.unit ?? null,
    defaultValue: Number(d.defaultValue) || 0,
    value: Number(d.defaultValue) || 0,
    formula: null,
  }));
}

/**
 * The input values a recipe reads on a line, with an edit applied: only
 * known keys, numbers only, a take-off formula kept as text for the caller to
 * evaluate. Labels and defaults always come from the line's own snapshot.
 */
export function mergeInputEdits(
  current: AssemblyInputValue[] | null | undefined,
  edits: Array<{ key?: unknown; value?: unknown; formula?: unknown }>,
): AssemblyInputValue[] {
  const byKey = new Map((edits ?? []).filter((e) => typeof e?.key === "string").map((e) => [e.key as string, e] as const));
  return (current ?? []).map((i) => {
    const e = byKey.get(i.key);
    if (!e) return i;
    const formula = typeof e.formula === "string" && e.formula.trim() ? e.formula.trim() : null;
    const value = e.value === undefined ? i.value : Number(e.value);
    return { ...i, value: Number.isFinite(value) ? value : i.value, formula };
  });
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
    assemblyQtyLabel: assembly.quantityLabel ?? null,
    assemblyInputs: initialInputValues(assembly),
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
  inputs?: AssemblyInputValue[] | null,
) {
  const unitCostExTax = centsToDollars(component.unitCostCents);
  const qty = componentQuantityOf(
    { mode: component.qtyMode, factor: component.qtyFactor, formula: component.qtyFormula },
    { quantity, inputs },
  ) ?? 0;
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
    assemblyQtyMode: normaliseQtyMode(component.qtyMode),
    assemblyQtyFactor: component.qtyFactor,
    assemblyQtyFormula: component.qtyMode === "formula" ? component.qtyFormula ?? null : null,
    assemblyQtyOverridden: false,
    // The client sees the assembly line, not its recipe. The eye can bring any back.
    proposalVisible: false,
  };
}

/** What pricing a component needs — loose enough for a half-edited draft. */
export interface PricedComponent {
  unitCostCents: number;
  qtyMode: string;
  qtyFactor: number;
  qtyFormula?: string | null;
  wastagePercent?: number | null;
  markupPercent?: number | null;
}

/** The three modes; anything else reads as per-unit. */
export function normaliseQtyMode(mode: string | null | undefined): AssemblyQtyMode {
  return mode === "fixed" || mode === "formula" ? mode : "per_unit";
}

/**
 * An assembly's price in the two parts that mean something to an estimator:
 * the rate per assembly unit (from per-unit components) and the fixed costs
 * that land once whatever the quantity. DOLLARS ex GST, before the builder's
 * margin, line markup and wastage included.
 */
export function assemblyRateBreakdown(
  components: PricedComponent[],
  inputs?: Array<{ key: string; defaultValue: number }> | null,
): { perUnitExTax: number; fixedExTax: number } {
  // What lands at quantity 0 is fixed; what 1 000 units add on top, divided
  // back down, is the rate — so a 0.105 factor isn't rounded to the cent per
  // line before it is multiplied out. A recipe over other inputs is read at
  // their defaults.
  const fixed = previewAssemblyCostExTax(components, 0, inputs);
  return {
    perUnitExTax: round2((previewAssemblyCostExTax(components, 1000, inputs) - fixed) / 1000),
    fixedExTax: fixed,
  };
}

/**
 * What an assembly costs at a given quantity, before the builder's margin, in
 * DOLLARS ex GST — the Library editor's preview. Line markup and wastage
 * included, exactly as the components will price once dropped in.
 */
export function previewAssemblyCostExTax(
  components: PricedComponent[],
  quantity: number,
  inputs?: Array<{ key: string; defaultValue: number; value?: number | null }> | null,
): number {
  let total = 0;
  for (const c of components) {
    const { lineExTax } = computeEstimateItemPrice({
      unitCostExTax: centsToDollars(c.unitCostCents),
      quantity: componentQuantityOf({ mode: c.qtyMode, factor: c.qtyFactor, formula: c.qtyFormula }, { quantity, inputs }) ?? 0,
      markupPercent: c.markupPercent,
      projectMarkupPercent: 0,
      taxRate: 10,
      wastagePercent: c.wastagePercent,
    });
    total += lineExTax;
  }
  return round2(total);
}

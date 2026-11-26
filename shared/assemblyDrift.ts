/**
 * Drift: when what a line was built from has moved on (phase 4).
 *
 * Two kinds, one rule — nothing reprices on its own. A line shows a flag, and
 * the estimator chooses to pull the change in (Jed, 11-25: "linked, manual
 * Update").
 *
 *  - PRICE drift. A line linked to the price list (`priceListItemId`) whose
 *    unit cost no longer equals the catalogue's. The link means "this IS the
 *    book price"; when the book moves the line is out of date. Update = take
 *    the catalogue's cost, keep the link. Applies to any linked line, an
 *    assembly's components included.
 *
 *  - ASSEMBLY drift. An assembly line built from Library version N when the
 *    Library is now at M > N. Update = bring its recipe up to date: components
 *    matched by `assemblyComponentId` get the Library's name, unit, cost,
 *    quantity rule, wastage, markup and cost code; new Library components are
 *    added; ones the Library dropped are removed. Respected on the way:
 *      · a quantity typed by hand (overridden) is kept — its cost still moves;
 *      · lines added by hand under the assembly (no component id) stay;
 *      · the line's own name and this job's input VALUES stay — new inputs
 *        arrive at their defaults.
 *
 * Everything here is CENTS so a template (cents) and an estimate (dollars,
 * converted by the caller) share one comparison. Pure: callers load and save.
 */
import type { AssemblyInputDef, AssemblyInputValue, AssemblySource } from "./assemblies";

// ── Price drift ──────────────────────────────────────────────────────────────

export interface PriceDrift {
  itemId: string;
  name: string;
  priceListItemId: string;
  beforeCents: number;
  afterCents: number;
}

/**
 * Linked lines whose cost no longer matches the catalogue. `catalogueCents`
 * holds each linked item's CURRENT ex-GST cost; a link to an item that is gone
 * is not drift (there is nothing to update to).
 */
export function planPriceDrift(
  lines: Array<{ id: string; name: string; priceListItemId?: string | null; unitCostCents: number }>,
  catalogueCents: Map<string, number>,
): PriceDrift[] {
  const out: PriceDrift[] = [];
  for (const l of lines) {
    if (!l.priceListItemId) continue;
    const now = catalogueCents.get(l.priceListItemId);
    if (now === undefined || now === l.unitCostCents) continue;
    out.push({ itemId: l.id, name: l.name, priceListItemId: l.priceListItemId, beforeCents: l.unitCostCents, afterCents: now });
  }
  return out;
}

// ── Assembly drift ───────────────────────────────────────────────────────────

/** A component line as it stands on the estimate or template, in cents. */
export interface DriftComponentLine {
  id: string;
  name: string;
  assemblyComponentId?: string | null;
  unitType: string;
  unitCostCents: number;
  qtyMode?: string | null;
  qtyFactor?: number | null;
  qtyFormula?: string | null;
  markupPercent?: number | null;
  wastagePercent?: number | null;
  costCodeId?: string | null;
  priceListItemId?: string | null;
  overridden?: boolean | null;
}

/** The fields an update can change on a component line. */
export interface ComponentFields {
  name: string;
  type: string;
  unitType: string;
  unitCostCents: number;
  qtyMode: "per_unit" | "fixed" | "formula";
  qtyFactor: number;
  qtyFormula: string | null;
  markupPercent: number | null;
  wastagePercent: number;
  costCodeId: string | null;
  priceListItemId: string | null;
}

export type FieldChange = { field: keyof ComponentFields; before: unknown; after: unknown };

export type ComponentChange =
  | { kind: "update"; lineId: string; componentId: string; name: string; changes: FieldChange[]; next: ComponentFields }
  | { kind: "add"; componentId: string; name: string; next: ComponentFields; order: number }
  | { kind: "remove"; lineId: string; name: string };

export interface AssemblyDrift {
  itemId: string;
  name: string;
  assemblyId: string;
  fromVersion: number | null;
  toVersion: number;
  components: ComponentChange[];
  /** The line's inputs once updated: Library definitions, this job's values. */
  inputs: AssemblyInputValue[];
  qtyLabel: string | null;
  inputsAdded: string[];
  inputsRemoved: string[];
  /** The assembly's unit, when the Library changed it. */
  unitType: string | null;
  /** Cost code for the line, when the Library changed it. */
  costCodeId?: string | null;
}

const MODE = (m: string | null | undefined): ComponentFields["qtyMode"] =>
  m === "fixed" || m === "formula" ? m : "per_unit";

/** What one Library component says its line should be. */
export function libraryComponentFields(
  c: AssemblySource["components"][number],
  assembly: Pick<AssemblySource, "costCodeId">,
  catalogueCents: Map<string, number>,
): ComponentFields {
  const now = c.priceListItemId ? catalogueCents.get(c.priceListItemId) : undefined;
  return {
    name: c.name,
    type: c.type || "Material",
    unitType: c.unitType,
    unitCostCents: c.unitCostCents,
    qtyMode: MODE(c.qtyMode),
    qtyFactor: Number(c.qtyFactor) || 0,
    qtyFormula: c.qtyMode === "formula" ? c.qtyFormula ?? null : null,
    markupPercent: c.markupPercent ?? null,
    wastagePercent: Number(c.wastagePercent) || 0,
    costCodeId: c.costCodeId ?? assembly.costCodeId ?? null,
    // Same invariant as on insert: linked only while the cost IS the book's.
    priceListItemId: c.priceListItemId && now !== undefined && now === c.unitCostCents ? c.priceListItemId : null,
  };
}

const same = (a: unknown, b: unknown) =>
  (a ?? null) === (b ?? null) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);

/** The inputs a line ends up with: the Library's definitions, the job's values. */
export function mergeInputDefs(
  current: AssemblyInputValue[] | null | undefined,
  defs: AssemblyInputDef[] | null | undefined,
): { inputs: AssemblyInputValue[]; added: string[]; removed: string[] } {
  const byKey = new Map((current ?? []).map((i) => [i.key, i] as const));
  const nextKeys = new Set((defs ?? []).map((d) => d.key));
  const inputs = (defs ?? []).map((d) => {
    const had = byKey.get(d.key);
    return {
      key: d.key,
      label: d.label,
      unit: d.unit ?? null,
      defaultValue: Number(d.defaultValue) || 0,
      value: had ? had.value : Number(d.defaultValue) || 0,
      formula: had?.formula ?? null,
    };
  });
  return {
    inputs,
    added: (defs ?? []).filter((d) => !byKey.has(d.key)).map((d) => d.label),
    removed: (current ?? []).filter((i) => !nextKeys.has(i.key)).map((i) => i.label),
  };
}

/**
 * What updating one assembly line to the Library's current version changes.
 * Returns null when the line is already current.
 */
export function planAssemblyUpdate(
  line: {
    id: string;
    name: string;
    assemblyVersion?: number | null;
    unitType?: string | null;
    assemblyInputs?: AssemblyInputValue[] | null;
  },
  components: DriftComponentLine[],
  assembly: AssemblySource,
  catalogueCents: Map<string, number>,
  /** Templates store "no line markup" as 0 where the Library says null. */
  opts: { zeroMarkupIsUnset?: boolean } = {},
): AssemblyDrift | null {
  if ((line.assemblyVersion ?? 0) >= assembly.version) return null;

  const byComponent = new Map<string, DriftComponentLine>();
  for (const c of components) if (c.assemblyComponentId) byComponent.set(c.assemblyComponentId, c);
  const libraryIds = new Set(assembly.components.map((c) => c.id));

  const changes: ComponentChange[] = [];
  assembly.components.forEach((lib, order) => {
    const next = libraryComponentFields(lib, assembly, catalogueCents);
    const have = byComponent.get(lib.id);
    if (!have) {
      changes.push({ kind: "add", componentId: lib.id, name: lib.name, next, order });
      return;
    }
    const before: Partial<ComponentFields> = {
      name: have.name,
      unitType: have.unitType,
      unitCostCents: have.unitCostCents,
      qtyMode: MODE(have.qtyMode),
      qtyFactor: Number(have.qtyFactor) || 0,
      qtyFormula: have.qtyMode === "formula" ? have.qtyFormula ?? null : null,
      markupPercent: have.markupPercent ?? null,
      wastagePercent: Number(have.wastagePercent) || 0,
      costCodeId: have.costCodeId ?? null,
    };
    const fieldChanges: FieldChange[] = [];
    for (const k of Object.keys(before) as Array<keyof ComponentFields>) {
      // A per-unit factor that doesn't apply to the new mode isn't a change worth showing.
      if (k === "qtyFactor" && next.qtyMode === "formula") continue;
      const unset = (v: unknown) => (opts.zeroMarkupIsUnset && k === "markupPercent" && !v ? null : v);
      if (!same(unset(before[k]), unset(next[k]))) fieldChanges.push({ field: k, before: before[k], after: next[k] });
    }
    if (fieldChanges.length > 0) {
      changes.push({ kind: "update", lineId: have.id, componentId: lib.id, name: have.name, changes: fieldChanges, next });
    }
  });
  for (const c of components) {
    // Gone from the Library. On an estimate, deleting a Library component sets
    // the line's assembly_component_id to NULL (FK on delete set null), so a
    // line that still FOLLOWS the assembly (has a quantity rule) but names no
    // component came from one that was dropped. A line added by hand has no
    // rule; one kept because a PO points at it had its rule cleared.
    const dropped = c.assemblyComponentId ? !libraryIds.has(c.assemblyComponentId) : !!c.qtyMode;
    if (dropped) {
      changes.push({ kind: "remove", lineId: c.id, name: c.name });
    }
  }

  const merged = mergeInputDefs(line.assemblyInputs, assembly.inputs);
  return {
    itemId: line.id,
    name: line.name,
    assemblyId: assembly.id,
    fromVersion: line.assemblyVersion ?? null,
    toVersion: assembly.version,
    components: changes,
    inputs: merged.inputs,
    qtyLabel: assembly.quantityLabel ?? null,
    inputsAdded: merged.added,
    inputsRemoved: merged.removed,
    unitType: line.unitType && line.unitType !== assembly.unitType ? assembly.unitType : null,
    costCodeId: assembly.costCodeId,
  };
}

/** One sentence for a component change, for the review dialog. */
export function describeFieldChange(
  c: FieldChange,
  money: (cents: number) => string,
): string {
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : String(x));
  switch (c.field) {
    case "unitCostCents": return `cost ${money(Number(c.before) || 0)} → ${money(Number(c.after) || 0)}`;
    case "qtyFactor": return `×${v(c.before)} → ×${v(c.after)}`;
    case "qtyMode": return `${v(c.before).replace("per_unit", "per unit")} → ${v(c.after).replace("per_unit", "per unit")}`;
    case "qtyFormula": return "recipe changed";
    case "markupPercent": return `markup ${v(c.before)}% → ${v(c.after)}%`;
    case "wastagePercent": return `wastage ${v(c.before)}% → ${v(c.after)}%`;
    case "unitType": return `unit ${v(c.before)} → ${v(c.after)}`;
    case "costCodeId": return "cost code changed";
    case "name": return `renamed to "${v(c.after)}"`;
    default: return `${c.field} changed`;
  }
}

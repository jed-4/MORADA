/**
 * Assemblies in a spreadsheet (phase 5).
 *
 * The estimate/template sheet carries an assembly as rows a builder can read
 * and edit by hand:
 *
 *   Item         Assembly     Inputs                           Sub-item  Qty Rule
 *   Garage slab  Slab Pour    Thickness = 0.15; Edge = 52      —         —
 *   Concrete     —            —                                Yes       = Area × Thickness × 1.05
 *   SL82 mesh    —            —                                Yes       per unit 1.1
 *   Pump hire    —            —                                Yes       fixed
 *   Extra bags   —            —                                Yes       60 (typed)   ← hand-typed
 *
 * `Assembly` names the LIBRARY assembly (the line itself may be renamed); the
 * import links it by name. Recipes are written with input names, as the
 * Library editor shows them. A blank Qty Rule on a component means "take the
 * Library's".
 */
import {
  componentQuantityOf,
  mainInputLabel,
  recipeFromDisplay,
  recipeToDisplay,
  type AssemblyInputDef,
  type AssemblyInputValue,
} from "./assemblies";

const num = (n: number) => String(Math.round((Number(n) || 0) * 1e6) / 1e6);

/** A component line's Qty Rule cell. */
export function formatQtyRule(
  c: { assemblyQtyMode?: string | null; assemblyQtyFactor?: number | null; assemblyQtyFormula?: string | null; assemblyQtyOverridden?: boolean | null },
  parent: { assemblyQtyLabel?: string | null; assemblyInputs?: Array<{ key: string; label: string }> | null } | undefined,
): string {
  if (!c.assemblyQtyMode) return "";
  const rule =
    c.assemblyQtyMode === "fixed"
      ? "fixed"
      : c.assemblyQtyMode === "formula"
        ? `= ${recipeToDisplay(c.assemblyQtyFormula, { mainLabel: parent?.assemblyQtyLabel, inputs: parent?.assemblyInputs ?? [] })}`
        : `per unit ${num(c.assemblyQtyFactor ?? 0)}`;
  return c.assemblyQtyOverridden ? `${rule} (typed)` : rule;
}

export type ParsedQtyRule = {
  mode: "per_unit" | "fixed" | "formula";
  factor: number;
  formula: string | null;
  overridden: boolean;
};

/**
 * Read a Qty Rule cell back. `fixed` takes its factor from the row's quantity
 * (a fixed component's quantity IS its factor). Returns null for a blank cell,
 * or an error for one that doesn't read.
 */
export function parseQtyRule(
  text: unknown,
  ctx: { mainLabel?: string | null; inputs?: AssemblyInputDef[] | null; rowQuantity: number },
): ParsedQtyRule | { error: string } | null {
  let t = String(text ?? "").trim();
  if (!t) return null;
  let overridden = false;
  if (/\(typed\)\s*$/i.test(t)) {
    overridden = true;
    t = t.replace(/\(typed\)\s*$/i, "").trim();
  }
  if (/^fixed$/i.test(t)) return { mode: "fixed", factor: ctx.rowQuantity, formula: null, overridden };
  const per = /^per\s*unit\s+(-?[\d.]+)$/i.exec(t) ?? /^[×x*]\s*(-?[\d.]+)$/i.exec(t);
  if (per) {
    const factor = Number(per[1]);
    if (!Number.isFinite(factor)) return { error: `"${t}" isn't a number` };
    return { mode: "per_unit", factor, formula: null, overridden };
  }
  if (t.startsWith("=")) {
    const r = recipeFromDisplay(t.slice(1), {
      mainLabel: ctx.mainLabel,
      inputs: ctx.inputs ?? [],
      defaults: ctx.inputs ?? [],
    });
    if (!r.ok) return { error: r.error };
    return { mode: "formula", factor: 0, formula: r.formula, overridden };
  }
  return { error: `Qty Rule "${t}" — use "per unit 0.105", "fixed" or "= Area × 1.1"` };
}

/** An assembly line's Inputs cell: `Thickness = 0.15; Edge length = 52`. */
export function formatInputs(inputs: AssemblyInputValue[] | null | undefined): string {
  return (inputs ?? []).map((i) => `${i.label} = ${num(i.value)}`).join("; ");
}

/**
 * Read an Inputs cell against the Library's input definitions. Names match
 * case-insensitively; an unknown name is reported, not guessed. Inputs the
 * cell leaves out take their default.
 */
export function parseInputs(
  text: unknown,
  defs: AssemblyInputDef[] | null | undefined,
): { inputs: AssemblyInputValue[]; unknown: string[] } {
  const given = new Map<string, number>();
  const unknown: string[] = [];
  const byLabel = new Map((defs ?? []).map((d) => [d.label.trim().toLowerCase(), d] as const));
  for (const part of String(text ?? "").split(/[;\n]/)) {
    const m = /^\s*(.+?)\s*[=:]\s*(-?[\d.,]+)\s*[a-zA-Z²³]*\s*$/.exec(part);
    if (!m) continue;
    const def = byLabel.get(m[1].trim().toLowerCase());
    const value = Number(m[2].replace(/,/g, ""));
    if (!def || !Number.isFinite(value)) {
      if (m[1].trim()) unknown.push(m[1].trim());
      continue;
    }
    given.set(def.key, value);
  }
  return {
    inputs: (defs ?? []).map((d) => ({
      key: d.key,
      label: d.label,
      unit: d.unit ?? null,
      defaultValue: Number(d.defaultValue) || 0,
      value: given.has(d.key) ? given.get(d.key)! : Number(d.defaultValue) || 0,
      formula: null,
    })),
    unknown,
  };
}

/** The main input's name for showing in a sheet, e.g. "Area". */
export const sheetMainLabel = mainInputLabel;

/** A Library assembly as the sheet matcher needs it. */
export interface SheetLibraryAssembly {
  id: string;
  name: string;
  version: number;
  isArchived?: boolean | null;
  quantityLabel?: string | null;
  inputs?: AssemblyInputDef[] | null;
  components: Array<{ id: string; name: string; qtyMode: string; qtyFactor: number; qtyFormula?: string | null }>;
}

/**
 * Match a sheet's Assembly column to the Library (phase 5) — shared by the
 * estimate import route and the template import, which keeps no server.
 *
 *  - A line links by NAME, case-insensitively, to exactly one assembly
 *    (active ones first). Its inputs come from the Inputs cell, defaults for
 *    the rest.
 *  - A component row matches a Library component by name (first unused);
 *    its rule is the Qty Rule cell, or the Library's when blank. The sheet's
 *    quantity is kept; if it isn't what the rule gives, the row is marked
 *    overridden, so an edit made in Excel survives.
 *  - A sub-item that matches no component is a hand-added line: no rule.
 *
 * Returns, per row index, the assembly fields to set, plus the names no
 * Library assembly answers to and any cells that didn't read.
 */
export function planSheetAssemblies(
  rows: Array<{ name?: string; quantity?: number; assembly?: string; inputs?: string; qtyRule?: string; assemblyId?: unknown }>,
  parentRowOf: Map<number, number>,
  library: SheetLibraryAssembly[],
): { fields: Map<number, Record<string, any>>; unlinked: string[]; warnings: string[] } {
  const fields = new Map<number, Record<string, any>>();
  const unlinked: string[] = [];
  const warnings: string[] = [];
  const byName = new Map<string, SheetLibraryAssembly[]>();
  for (const a of library) {
    const k = a.name.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), a]);
  }
  const pick = (name: string) => {
    const all = byName.get(name.toLowerCase()) ?? [];
    const active = all.filter((a) => !a.isArchived);
    const pool = active.length ? active : all;
    return pool.length === 1 ? pool[0] : null;
  };

  rows.forEach((row, index) => {
    const name = typeof row?.assembly === "string" ? row.assembly.trim() : "";
    if (!name || parentRowOf.has(index) || row.assemblyId) return;
    const lib = pick(name);
    if (!lib) {
      if (!unlinked.includes(name)) unlinked.push(name);
      return;
    }
    const parsed = parseInputs(row.inputs, lib.inputs);
    if (parsed.unknown.length) warnings.push(`${name}: no input called ${parsed.unknown.map((u) => `"${u}"`).join(", ")}`);
    const lineQty = Number(row.quantity) || 0;
    fields.set(index, {
      assemblyId: lib.id,
      assemblyVersion: lib.version,
      assemblyQtyLabel: lib.quantityLabel ?? null,
      assemblyInputs: parsed.inputs,
    });

    const used = new Set<string>();
    for (const [r, parent] of Array.from(parentRowOf.entries())) {
      if (parent !== index) continue;
      const it = rows[r];
      const rowName = String(it?.name ?? "").trim().toLowerCase();
      const comp = lib.components.find((c) => !used.has(c.id) && c.name.trim().toLowerCase() === rowName);
      if (!comp) continue;
      used.add(comp.id);
      const rowQty = Number(it.quantity) || 0;
      const rule = parseQtyRule(it.qtyRule, { mainLabel: lib.quantityLabel, inputs: lib.inputs, rowQuantity: rowQty });
      if (rule && "error" in rule) warnings.push(`${it.name}: ${rule.error} — used the Library's rule`);
      const r2: ParsedQtyRule = rule && !("error" in rule)
        ? rule
        : {
            mode: comp.qtyMode === "fixed" || comp.qtyMode === "formula" ? comp.qtyMode : "per_unit",
            factor: comp.qtyFactor,
            formula: comp.qtyFormula ?? null,
            overridden: false,
          };
      const ruleQty = componentQuantityOf({ mode: r2.mode, factor: r2.factor, formula: r2.formula }, { quantity: lineQty, inputs: parsed.inputs });
      fields.set(r, {
        assemblyComponentId: comp.id,
        assemblyQtyMode: r2.mode,
        assemblyQtyFactor: r2.factor,
        assemblyQtyFormula: r2.mode === "formula" ? r2.formula : null,
        assemblyQtyOverridden: r2.overridden || ruleQty === null || Math.abs(ruleQty - rowQty) > 1e-6,
      });
    }
  });
  return { fields, unlinked, warnings };
}

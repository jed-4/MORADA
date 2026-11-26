/**
 * Named inputs on assemblies (phase 3). Run with:
 *   npx tsx server/__tests__/assembly-inputs.test.ts
 */
import assert from "node:assert/strict";
import {
  assemblyRateBreakdown,
  checkInputDefs,
  componentLineFields,
  componentQuantityOf,
  mergeInputEdits,
  planAssemblyRescale,
  previewAssemblyCostExTax,
  recipeFromDisplay,
  recipeInputKeys,
  recipeToDisplay,
  type AssemblyInputValue,
} from "@shared/assemblies";
import { evaluateQuantityFormula, extractNameRefs, isWaitingFormula } from "@shared/quantityFormula";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
};

const SRC = {
  mainLabel: "Area",
  inputs: [
    { key: "t", label: "Thickness", unit: "m", defaultValue: 0.1 },
    { key: "e", label: "Edge length", unit: "lm", defaultValue: 0 },
  ],
};
const DEFAULTS = SRC.inputs;
const values = (over: Partial<Record<string, number>> = {}): AssemblyInputValue[] =>
  SRC.inputs.map((i) => ({ ...i, value: over[i.key] ?? i.defaultValue, formula: null }));

console.log("assembly inputs");

test("a recipe typed with labels is stored by key, and reads back", () => {
  const r = recipeFromDisplay("Area × Thickness × 1.05", { ...SRC, quantity: 120, defaults: DEFAULTS });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.formula, "{input:qty} * {input:t} * 1.05");
  assert.equal(r.sample, 12.6);
  assert.equal(recipeToDisplay(r.formula, SRC), "Area × Thickness × 1.05");
});

test("multi-word labels go in braces; case doesn't matter; ROUND still works", () => {
  const r = recipeFromDisplay("ROUND({edge length} / 2.4) + area*0", { ...SRC, defaults: [{ key: "t", defaultValue: 0.1 }, { key: "e", defaultValue: 44 }] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.formula, "ROUND({input:e} / 2.4) + {input:qty} * 0");
  assert.equal(r.sample, 19);
  assert.equal(recipeToDisplay(r.formula, SRC), "ROUND({Edge length} ÷ 2.4) + Area × 0");
  assert.deepEqual(recipeInputKeys(r.formula), ["e", "qty"]);
});

test("unknown names and broken recipes are refused in the Library", () => {
  const a = recipeFromDisplay("Area × Depth", SRC);
  assert.equal(a.ok, false);
  assert.match((a as any).error, /No input called "Depth"/);
  assert.equal(recipeFromDisplay("Area ×", SRC).ok, false);
  assert.equal(recipeFromDisplay("", SRC).ok, false);
});

test("renaming an input keeps the recipe; deleting it shows as deleted", () => {
  const f = "{input:qty} * {input:t}";
  assert.equal(recipeToDisplay(f, { mainLabel: "Slab area", inputs: [{ key: "t", label: "Depth" }] }), "{Slab area} × Depth");
  assert.equal(recipeToDisplay(f, { mainLabel: "Area", inputs: [] }), "Area × {deleted input}");
});

test("input refs are never mistaken for take-off names", () => {
  assert.deepEqual(extractNameRefs("{input:qty} * {Wall tiles}"), ["Wall tiles"]);
  assert.equal(isWaitingFormula("{input:qty} * 2"), false);
  const r = evaluateQuantityFormula("{input:qty} * {input:gone}", new Map([["input:qty", 2]]));
  assert.equal(r.ok, false);
  assert.match((r as any).error, /input/);
});

test("component quantity in each mode; a broken recipe gives null, not 0", () => {
  const ctx = { quantity: 120, inputs: values({ e: 44 }) };
  assert.equal(componentQuantityOf({ mode: "per_unit", factor: 1.1 }, ctx), 132);
  assert.equal(componentQuantityOf({ mode: "fixed", factor: 1 }, ctx), 1);
  assert.equal(componentQuantityOf({ mode: "formula", factor: 0, formula: "{input:qty} * {input:t} * 1.05" }, ctx), 12.6);
  assert.equal(componentQuantityOf({ mode: "formula", factor: 0, formula: "{input:e}" }, ctx), 44);
  assert.equal(componentQuantityOf({ mode: "formula", factor: 0, formula: "{input:gone}" }, ctx), null);
});

test("rescale reads the inputs; a broken recipe is left alone", () => {
  const comps = [
    { id: "c1", parentItemId: "L", assemblyQtyMode: "formula", assemblyQtyFormula: "{input:qty} * {input:t} * 1.05", quantity: 12.6 },
    { id: "c2", parentItemId: "L", assemblyQtyMode: "formula", assemblyQtyFormula: "{input:e}", quantity: 0 },
    { id: "c3", parentItemId: "L", assemblyQtyMode: "formula", assemblyQtyFormula: "{input:nope}", quantity: 7 },
  ];
  const plan = planAssemblyRescale(120, comps, values({ t: 0.15, e: 44 }));
  assert.deepEqual(plan, [{ id: "c1", quantity: 18.9 }, { id: "c2", quantity: 44 }]);
});

test("an input edit keeps the snapshot's labels and ignores unknown keys", () => {
  const next = mergeInputEdits(values(), [{ key: "t", value: 0.2 }, { key: "zzz", value: 9 }, { key: "e", value: 3, formula: " {takeoff:m1} " }]);
  assert.deepEqual(next.map((i) => [i.key, i.label, i.value, i.formula]), [["t", "Thickness", 0.2, null], ["e", "Edge length", 3, "{takeoff:m1}"]]);
  assert.equal(mergeInputEdits(values(), [{ key: "t", value: "abc" }])[0].value, 0.1, "not a number: unchanged");
});

test("input definitions are checked", () => {
  assert.equal(checkInputDefs("Area", SRC.inputs), null);
  assert.match(checkInputDefs("Area", [{ key: "a", label: "area", defaultValue: 1 }])!, /Two inputs/);
  assert.match(checkInputDefs("Area", [{ key: "a", label: "Round", defaultValue: 1 }])!, /ROUND/);
  assert.match(checkInputDefs("Area", [{ key: "qty", label: "X", defaultValue: 1 }])!, /key/);
  assert.match(checkInputDefs("Area", [{ key: "a", label: "", defaultValue: 1 }])!, /name/);
});

test("a component line carries its recipe and lands at the recipe's quantity", () => {
  const f = componentLineFields(
    { id: "k", name: "Concrete", type: "Material", priceListItemId: null, unitType: "m3", unitCostCents: 28500,
      qtyMode: "formula", qtyFactor: 0, qtyFormula: "{input:qty} * {input:t} * 1.05", wastagePercent: 0, markupPercent: null, costCodeId: null },
    { costCodeId: null }, 120, { projectMarkupPercent: 0, taxRate: 10 }, undefined, values());
  assert.equal(f.quantity, 12.6);
  assert.equal(f.assemblyQtyMode, "formula");
  assert.equal(f.assemblyQtyFormula, "{input:qty} * {input:t} * 1.05");
});

test("rate breakdown: per-unit share and fixed share, recipes read at defaults", () => {
  const comps = [
    { unitCostCents: 28500, qtyMode: "formula", qtyFactor: 0, qtyFormula: "{input:qty} * {input:t}" }, // $28.50 / m²
    { unitCostCents: 110000, qtyMode: "fixed", qtyFactor: 1 },                                         // $1,100 once
    { unitCostCents: 1000, qtyMode: "formula", qtyFactor: 0, qtyFormula: "{input:e}" },                // 0 at default
  ];
  assert.deepEqual(assemblyRateBreakdown(comps, DEFAULTS), { perUnitExTax: 28.5, fixedExTax: 1100 });
  assert.equal(previewAssemblyCostExTax(comps, 100, [{ key: "t", defaultValue: 0.1 }, { key: "e", defaultValue: 10 }]), 2850 + 1100 + 100);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

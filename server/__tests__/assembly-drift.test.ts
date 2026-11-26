/**
 * Drift + Update (phase 4). Run with:
 *   npx tsx server/__tests__/assembly-drift.test.ts
 */
import assert from "node:assert/strict";
import { mergeInputDefs, planAssemblyUpdate, planPriceDrift } from "@shared/assemblyDrift";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
};

const LIB: any = {
  id: "A", name: "Slab", description: null, unitType: "m2", costCodeId: "cc", version: 4, quantityLabel: "Area",
  inputs: [{ key: "t", label: "Thickness", unit: "m", defaultValue: 0.1 }, { key: "e", label: "Edge", unit: "lm", defaultValue: 30 }],
  components: [
    { id: "k1", name: "Concrete", type: "Material", priceListItemId: "pl1", unitType: "m3", unitCostCents: 29000, qtyMode: "formula", qtyFactor: 0, qtyFormula: "{input:qty} * {input:t}", wastagePercent: 5, markupPercent: null, costCodeId: null },
    { id: "k2", name: "Mesh", type: "Material", priceListItemId: null, unitType: "m2", unitCostCents: 940, qtyMode: "per_unit", qtyFactor: 1.15, wastagePercent: 0, markupPercent: 10, costCodeId: "cc2" },
    { id: "k4", name: "Bar chairs", type: "Material", priceListItemId: null, unitType: "each", unitCostCents: 50, qtyMode: "per_unit", qtyFactor: 2, wastagePercent: 0, markupPercent: null, costCodeId: null },
  ],
};
const line = { id: "L", name: "Garage slab", assemblyVersion: 2, unitType: "m2", assemblyInputs: [{ key: "t", label: "Thick", unit: "m", defaultValue: 0.1, value: 0.15, formula: null }, { key: "old", label: "Gone", unit: null, defaultValue: 1, value: 1, formula: null }] };
const comps = [
  { id: "c1", name: "Concrete", assemblyComponentId: "k1", unitType: "m3", unitCostCents: 28500, qtyMode: "formula", qtyFormula: "{input:qty} * {input:t}", wastagePercent: 5, markupPercent: null, costCodeId: "cc", overridden: true },
  { id: "c2", name: "Mesh", assemblyComponentId: "k2", unitType: "m2", unitCostCents: 940, qtyMode: "per_unit", qtyFactor: 1.15, wastagePercent: 0, markupPercent: 10, costCodeId: "cc2" },
  { id: "c3", name: "Pump hire", assemblyComponentId: "k3", unitType: "each", unitCostCents: 110000, qtyMode: "fixed", qtyFactor: 1 },
  { id: "c9", name: "Added by hand", assemblyComponentId: null, unitType: "each", unitCostCents: 100 },
];

console.log("assembly drift");

test("a current line has nothing to update", () => {
  assert.equal(planAssemblyUpdate({ ...line, assemblyVersion: 4 }, comps, LIB, new Map()), null);
});

test("changed, added and removed components — hand-added ones stay", () => {
  const plan = planAssemblyUpdate(line, comps, LIB, new Map([["pl1", 29000]]))!;
  assert.equal(plan.fromVersion, 2);
  assert.equal(plan.toVersion, 4);
  const kinds = plan.components.map((c) => `${c.kind}:${c.name}`);
  assert.deepEqual(kinds, ["update:Concrete", "add:Bar chairs", "remove:Pump hire"]);
  const upd = plan.components[0] as any;
  assert.deepEqual(upd.changes.map((c: any) => c.field), ["unitCostCents"]);
  assert.equal(upd.next.priceListItemId, "pl1", "catalogue matches the Library cost: stays linked");
});

test("a component whose Library row was deleted (FK set null) still counts as dropped", () => {
  const orphan = { id: "c5", name: "Pump hire", assemblyComponentId: null, unitType: "each", unitCostCents: 110000, qtyMode: "fixed", qtyFactor: 1 };
  const plan = planAssemblyUpdate(line, [...comps.filter((c) => c.id !== "c3"), orphan], LIB, new Map())!;
  assert.ok(plan.components.some((c) => c.kind === "remove" && c.name === "Pump hire"));
  assert.ok(!plan.components.some((c) => c.kind === "remove" && c.name === "Added by hand"));
});

test("a component whose Library cost differs from the catalogue arrives unlinked", () => {
  const plan = planAssemblyUpdate(line, comps, LIB, new Map([["pl1", 31000]]))!;
  assert.equal((plan.components[0] as any).next.priceListItemId, null);
});

test("inputs: Library definitions, this job's values; new ones at their default", () => {
  const plan = planAssemblyUpdate(line, comps, LIB, new Map())!;
  assert.deepEqual(plan.inputs.map((i) => [i.key, i.label, i.value]), [["t", "Thickness", 0.15], ["e", "Edge", 30]]);
  assert.deepEqual(plan.inputsAdded, ["Edge"]);
  assert.deepEqual(plan.inputsRemoved, ["Gone"]);
  assert.equal(plan.qtyLabel, "Area");
});

test("mergeInputDefs keeps a take-off link on a surviving input", () => {
  const r = mergeInputDefs([{ key: "e", label: "Edge", defaultValue: 0, value: 44, formula: "{takeoff:m1}" }], LIB.inputs);
  assert.deepEqual(r.inputs[1], { key: "e", label: "Edge", unit: "lm", defaultValue: 30, value: 44, formula: "{takeoff:m1}" });
});

test("price drift: only linked lines whose cost moved; a vanished item isn't drift", () => {
  const out = planPriceDrift([
    { id: "a", name: "Tiles", priceListItemId: "p1", unitCostCents: 4500 },
    { id: "b", name: "Grout", priceListItemId: "p2", unitCostCents: 1200 },
    { id: "c", name: "Typed", priceListItemId: null, unitCostCents: 99 },
    { id: "d", name: "Deleted", priceListItemId: "p9", unitCostCents: 10 },
  ], new Map([["p1", 4800], ["p2", 1200]]));
  assert.deepEqual(out, [{ itemId: "a", name: "Tiles", priceListItemId: "p1", beforeCents: 4500, afterCents: 4800 }]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

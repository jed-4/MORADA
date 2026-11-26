/**
 * Estimate assemblies — the pure rules in shared/assemblies.ts.
 *
 * Pinned here: per-unit components rescale, fixed ones don't, overridden ones
 * are left alone; the assembly line carries no money of its own; the roll-up
 * is the sum of the components; and the estimate total counts each dollar once.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/assemblies.test.ts
 */
import assert from "node:assert/strict";
import {
  assemblyLineFields,
  assemblyRateBreakdown,
  componentLineFields,
  componentQuantity,
  groupAssemblyComponents,
  planAssemblyRescale,
  previewAssemblyCostExTax,
  rollUpAssemblyLine,
  type AssemblySource,
} from "../../shared/assemblies";
import { computeEstimateItemPrice, computeEstimateSummary } from "../../shared/pricing";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const slab: AssemblySource = {
  id: "asm-1",
  name: "Slab Pour",
  description: null,
  unitType: "m2",
  costCodeId: "cc-concrete",
  version: 3,
  components: [
    { id: "c1", name: "Concrete 25MPa", type: "Material", priceListItemId: "pl-1", unitType: "m3",
      unitCostCents: 28500, qtyMode: "per_unit", qtyFactor: 0.105, wastagePercent: 0, markupPercent: null, costCodeId: null },
    { id: "c2", name: "SL82 mesh", type: "Material", priceListItemId: null, unitType: "m2",
      unitCostCents: 940, qtyMode: "per_unit", qtyFactor: 1.1, wastagePercent: 0, markupPercent: 10, costCodeId: "cc-steel" },
    { id: "c3", name: "Pump hire", type: "Equipment", priceListItemId: null, unitType: "each",
      unitCostCents: 110000, qtyMode: "fixed", qtyFactor: 1, wastagePercent: 0, markupPercent: null, costCodeId: null },
  ],
};
const pricing = { projectMarkupPercent: 20, taxRate: 10 };

console.log("assemblies");

test("per-unit quantities scale without float dust", () => {
  assert.equal(componentQuantity("per_unit", 0.105, 120), 12.6);
  assert.equal(componentQuantity("per_unit", 1.1, 120), 132);
});

test("fixed quantities ignore the assembly quantity", () => {
  assert.equal(componentQuantity("fixed", 1, 120), 1);
  assert.equal(componentQuantity("fixed", 2, 0), 2);
});

test("the assembly line carries no money of its own", () => {
  const line = assemblyLineFields(slab, 120);
  assert.equal(line.unitCostExTax, 0);
  assert.equal(line.priceIncTax, 0);
  assert.equal(line.assemblyId, "asm-1");
  assert.equal(line.assemblyVersion, 3);
  assert.equal(line.proposalVisible, true);
});

test("component lines convert cents to dollars and price via the shared resolver", () => {
  const line = componentLineFields(slab.components[0], slab, 120, pricing, 28500);
  assert.equal(line.unitCostExTax, 285);
  assert.equal(line.quantity, 12.6);
  const expected = computeEstimateItemPrice({ unitCostExTax: 285, quantity: 12.6, markupPercent: null, projectMarkupPercent: 20, taxRate: 10 });
  assert.equal(line.priceIncTax, expected.lineIncTax);
  assert.equal(line.proposalVisible, false);
  assert.equal(line.costCode, "cc-concrete", "falls back to the assembly's cost code");
});

test("price-list link kept only while the cost still matches the catalogue", () => {
  assert.equal(componentLineFields(slab.components[0], slab, 1, pricing, 28500).priceListItemId, "pl-1");
  assert.equal(componentLineFields(slab.components[0], slab, 1, pricing, 29900).priceListItemId, null);
  assert.equal(componentLineFields(slab.components[0], slab, 1, pricing, undefined).priceListItemId, null);
});

test("rescale moves per-unit lines, keeps fixed and overridden ones", () => {
  const plan = planAssemblyRescale(140, [
    { id: "a", assemblyQtyMode: "per_unit", assemblyQtyFactor: 0.105, quantity: 12.6 },
    { id: "b", assemblyQtyMode: "fixed", assemblyQtyFactor: 1, quantity: 1 },
    { id: "c", assemblyQtyMode: "per_unit", assemblyQtyFactor: 1.1, quantity: 99, assemblyQtyOverridden: true },
    { id: "d", quantity: 5 }, // an ordinary sub-item
  ]);
  assert.deepEqual(plan, [{ id: "a", quantity: 14.7 }]);
});

test("roll-up is the components' sum and the total counts each dollar once", () => {
  const parent = { id: "p", ...assemblyLineFields(slab, 120) };
  const kids = slab.components.map((c, i) => ({
    id: `k${i}`, parentItemId: "p", ...componentLineFields(c, slab, 120, pricing),
  }));
  const all = [parent, ...kids];
  const grouped = groupAssemblyComponents(all);
  assert.equal(grouped.get("p")?.length, 3);

  const roll = rollUpAssemblyLine(parent.quantity, grouped.get("p")!, (l) => l.priceIncTax);
  const kidsTotal = kids.reduce((s, k) => s + k.priceIncTax, 0);
  assert.equal(roll.amount, Math.round(kidsTotal * 100) / 100);
  assert.equal(roll.rate, Math.round((roll.amount / 120) * 100) / 100);

  const withParent = computeEstimateSummary(all, pricing);
  const kidsOnly = computeEstimateSummary(kids, pricing);
  assert.equal(withParent.total, kidsOnly.total, "the assembly line adds nothing to the estimate");
});

test("Library preview matches the dropped-in components ex GST", () => {
  const preview = previewAssemblyCostExTax(slab.components, 120);
  const kids = slab.components.map((c) => componentLineFields(c, slab, 120, pricing));
  const ex = kids.reduce((s, k) => s + computeEstimateItemPrice({
    unitCostExTax: k.unitCostExTax, quantity: k.quantity, markupPercent: k.markupPercent,
    projectMarkupPercent: 0, taxRate: 10, wastagePercent: k.wastagePercent,
  }).lineExTax, 0);
  assert.equal(preview, Math.round(ex * 100) / 100);
});

test("rate breakdown splits per-unit and fixed", () => {
  const { perUnitExTax, fixedExTax } = assemblyRateBreakdown(slab.components);
  // 0.105 × $285 + 1.1 × $9.40 × 1.10 markup = 29.925 + 11.374
  assert.equal(perUnitExTax, 41.3);
  assert.equal(fixedExTax, 1100);
});

console.log(`\n${passed} passed`);

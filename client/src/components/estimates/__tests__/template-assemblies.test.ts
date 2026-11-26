/**
 * Assemblies inside estimate templates. Run with:
 *   npx tsx client/src/components/estimates/__tests__/template-assemblies.test.ts
 */
import assert from "node:assert/strict";
import {
  buildTemplateAssembly,
  nestSubLines,
  normaliseTemplateSubLines,
  rescaleTemplateAssembly,
} from "../templateAssemblies";
import { linesForApply } from "../templateGroupTree";
import { assemblyPatchRules, type TemplateItem } from "../TemplateEstimateGrid";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
};

const ASSEMBLY: any = {
  id: "A1", name: "Slab Pour", description: null, unitType: "m2", costCodeId: "cc-slab", version: 3,
  components: [
    { id: "k1", name: "Concrete 25MPa", type: "Material", priceListItemId: "pl-conc", unitType: "m3",
      unitCostCents: 28500, qtyMode: "per_unit", qtyFactor: 0.105, wastagePercent: 5, markupPercent: null, costCodeId: null },
    { id: "k2", name: "SL82 mesh", type: "Material", priceListItemId: "pl-mesh", unitType: "m2",
      unitCostCents: 940, qtyMode: "per_unit", qtyFactor: 1.1, wastagePercent: 0, markupPercent: 10, costCodeId: "cc-mesh" },
    { id: "k3", name: "Pump hire", type: "Equipment", priceListItemId: null, unitType: "each",
      unitCostCents: 110000, qtyMode: "fixed", qtyFactor: 1, wastagePercent: 0, markupPercent: null, costCodeId: null },
  ],
};
const COST_CODES: any[] = [
  { id: "cc-slab", code: "04", title: "Slab" },
  { id: "cc-mesh", code: "04.2", title: "Reo" },
];

const line = (over: Partial<TemplateItem> = {}): TemplateItem =>
  ({ id: "L1", name: "slab", isGroup: false, groupName: "Structure", quantity: 120, unitPrice: 1500,
     priceListItemId: "pl-old", sortOrder: 0, ...over }) as TemplateItem;

console.log("template assemblies");

test("picking turns the line into the assembly line, with no money of its own", () => {
  const { linePatch } = buildTemplateAssembly(line(), ASSEMBLY, { costCodes: COST_CODES, catalogueCents: new Map(), nextSortOrder: 5 });
  assert.equal(linePatch.name, "Slab Pour");
  assert.equal(linePatch.quantity, 120, "keeps the quantity already on the line");
  assert.equal(linePatch.unitPrice, 0);
  assert.equal(linePatch.priceListItemId, null);
  assert.equal(linePatch.assemblyId, "A1");
  assert.equal(linePatch.assemblyVersion, 3);
  assert.equal(linePatch.costCodeTitle, "04 - Slab");
});

test("a blank line starts at 1", () => {
  const { linePatch, components } = buildTemplateAssembly(line({ quantity: 0 }), ASSEMBLY, { costCodes: COST_CODES, catalogueCents: new Map(), nextSortOrder: 0 });
  assert.equal(linePatch.quantity, 1);
  assert.equal(components[0].quantity, 0.105);
});

test("components: scaled, CENTS kept as cents, hidden, in the line's group, under the line", () => {
  const { components } = buildTemplateAssembly(line(), ASSEMBLY, { costCodes: COST_CODES, catalogueCents: new Map(), nextSortOrder: 5 });
  assert.deepEqual(components.map((c) => c.quantity), [12.6, 132, 1]);
  assert.deepEqual(components.map((c) => c.unitPrice), [28500, 940, 110000]);
  assert.ok(components.every((c) => c.parentItemId === "L1" && c.groupName === "Structure" && c.proposalVisible === false));
  assert.deepEqual(components.map((c) => c.sortOrder), [5, 6, 7]);
  assert.equal(components[0].costCodeTitle, "04 - Slab", "falls back to the assembly's code");
  assert.equal(components[1].costCodeTitle, "04.2 - Reo");
  assert.equal(components[1].markup, 10);
});

test("a component keeps its price-list link only while the catalogue still matches", () => {
  const catalogueCents = new Map([["pl-conc", 28500], ["pl-mesh", 990]]);
  const { components } = buildTemplateAssembly(line(), ASSEMBLY, { costCodes: COST_CODES, catalogueCents, nextSortOrder: 0 });
  assert.equal(components[0].priceListItemId, "pl-conc");
  assert.equal(components[1].priceListItemId, null, "catalogue moved: unlinked, at the assembly's cost");
  assert.equal(components[1].unitPrice, 940);
});

const built = () => {
  const l = line();
  const { linePatch, components } = buildTemplateAssembly(l, ASSEMBLY, { costCodes: COST_CODES, catalogueCents: new Map(), nextSortOrder: 1 });
  return [{ ...l, ...linePatch }, ...components] as TemplateItem[];
};

test("changing the assembly quantity rescales; fixed and overridden stay", () => {
  let items = built();
  items[2] = { ...items[2], quantity: 150, assemblyQtyOverridden: true };
  items = items.map((i) => (i.id === "L1" ? { ...i, quantity: 200 } : i));
  const out = rescaleTemplateAssembly(items, "L1");
  assert.deepEqual(out.slice(1).map((c) => c.quantity), [21, 150, 1]);
});

test("rescale returns the same array when nothing moved", () => {
  const items = built();
  assert.equal(rescaleTemplateAssembly(items, "L1"), items);
});

test("deleting the assembly line drops its components; moving it moves them", () => {
  const items = built();
  assert.equal(normaliseTemplateSubLines(items.filter((i) => i.id !== "L1")).length, 0);
  const moved = normaliseTemplateSubLines(items.map((i) => (i.id === "L1" ? { ...i, groupName: "Kitchen" } : i)));
  assert.ok(moved.every((i) => i.groupName === "Kitchen"));
  assert.equal(normaliseTemplateSubLines(items), items, "untouched when already consistent");
});

test("assembly line refuses money edits; a typed component quantity becomes overridden", () => {
  const [asm, conc] = built();
  assert.deepEqual(assemblyPatchRules(asm, { unitPrice: 5000 }), { unitPrice: 0 });
  assert.deepEqual(assemblyPatchRules(asm, { quantity: 10 }), {});
  assert.deepEqual(assemblyPatchRules(conc, { quantity: 20 }), { assemblyQtyOverridden: true });
  assert.deepEqual(assemblyPatchRules(conc, { quantity: conc.quantity }), {});
  assert.deepEqual(assemblyPatchRules(conc, { assemblyQtyOverridden: false } as any), {});
});

test("apply order: components straight after their assembly line, even if sorted elsewhere", () => {
  const items = built();
  const other = { id: "X", name: "Termite barrier", isGroup: false, groupName: "Structure", sortOrder: 1 } as TemplateItem;
  const shuffled = [items[3], other, items[0], items[1], items[2]].map((i, n) => ({ ...i, sortOrder: n }));
  const names = linesForApply(shuffled).map((x) => x.line.name);
  // Pump hire sorted first of all: it still goes under its line, and first
  // among its siblings — the order the grid draws them in.
  assert.deepEqual(names, ["Termite barrier", "Slab Pour", "Pump hire", "Concrete 25MPa", "SL82 mesh"]);
  assert.deepEqual(nestSubLines([{ id: "c", parentItemId: "p" }, { id: "p" }], (x) => x).map((x) => x.id), ["p", "c"]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

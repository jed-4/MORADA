/**
 * Assemblies in spreadsheets + Buildern "Estimate Items" (phase 5). Run with:
 *   npx tsx server/__tests__/assembly-sheet.test.ts
 */
import assert from "node:assert/strict";
import { formatInputs, formatQtyRule, parseInputs, parseQtyRule } from "@shared/assemblySheet";
import { convertBuildernEstimateItems, isBuildernEstimateItems } from "@shared/buildernEstimateItems";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
};
const DEFS = [{ key: "t", label: "Thickness", unit: "m", defaultValue: 0.1 }, { key: "e", label: "Edge length", unit: "lm", defaultValue: 30 }];
const parent = { assemblyQtyLabel: "Area", assemblyInputs: DEFS };

console.log("assembly sheet");

test("qty rules round-trip", () => {
  const cases = [
    { assemblyQtyMode: "per_unit", assemblyQtyFactor: 0.105 },
    { assemblyQtyMode: "fixed", assemblyQtyFactor: 1 },
    { assemblyQtyMode: "formula", assemblyQtyFormula: "{input:qty} * {input:t} * 1.05" },
    { assemblyQtyMode: "per_unit", assemblyQtyFactor: 1.1, assemblyQtyOverridden: true },
  ];
  const texts = cases.map((c) => formatQtyRule(c, parent));
  assert.deepEqual(texts, ["per unit 0.105", "fixed", "= Area × Thickness × 1.05", "per unit 1.1 (typed)"]);
  const back = texts.map((t) => parseQtyRule(t, { mainLabel: "Area", inputs: DEFS, rowQuantity: 7 }));
  assert.deepEqual(back[0], { mode: "per_unit", factor: 0.105, formula: null, overridden: false });
  assert.deepEqual(back[1], { mode: "fixed", factor: 7, formula: null, overridden: false });
  assert.equal((back[2] as any).formula, "{input:qty} * {input:t} * 1.05");
  assert.equal((back[3] as any).overridden, true);
  assert.equal(formatQtyRule({}, parent), "", "not a component");
});

test("bad and blank rules", () => {
  assert.equal(parseQtyRule("", { rowQuantity: 1 }), null);
  assert.ok("error" in (parseQtyRule("about 3", { rowQuantity: 1 }) as any));
  assert.ok("error" in (parseQtyRule("= Area × Depth", { mainLabel: "Area", inputs: DEFS, rowQuantity: 1 }) as any));
});

test("inputs cell: names match loosely, missing ones take the default, unknown ones reported", () => {
  const r = parseInputs("thickness = 0.15 m;  Colour: 3", DEFS);
  assert.deepEqual(r.inputs.map((i) => [i.key, i.value]), [["t", 0.15], ["e", 30]]);
  assert.deepEqual(r.unknown, ["Colour"]);
  assert.equal(formatInputs(r.inputs), "Thickness = 0.15; Edge length = 30");
});

const row = (Name: string, type: string, cost: number, qty = 1, extra: Record<string, unknown> = {}) =>
  ({ Name, "Cost Type": type, "Builder Cost Ex. Tax": cost, Quantity: qty, "Unit Cost Ex. Tax": qty ? cost / qty : 0, Unit: "unit", ...extra });

test("detects the Buildern Estimate Items export", () => {
  assert.ok(isBuildernEstimateItems(["Name", "Cost Type", "Builder Cost Ex. Tax", "Quantity"]));
  assert.ok(!isBuildernEstimateItems(["Name", "Parent Name", "Cost Type", "Builder Cost Ex. Tax"]));
});

test("sections and assemblies rebuilt from the money", () => {
  const c = convertBuildernEstimateItems([
    row("Framing", "GROUP", 2700),
    row("Labour", "LABOUR", 1000),
    row("Wall frame", "ASSEMBLY", 1500, 50, { Unit: "Lm" }),
    row("Plate", "MATERIAL", 500, 100),
    row("Studs", "MATERIAL", 1000, 200),
    row("Nails", "MATERIAL", 200),
    row("Roofing", "GROUP", 300),
    row("Sheet", "ALLOWANCE", 300, 1, { "Visible in proposal": "Invisible", "Show As": "Empty" }),
  ]);
  const view = c.rows.map((r) => [r.Group, r.Item, r["Sub-item"] ?? "", r.Assembly ?? "", r["Unit Cost"]]);
  assert.deepEqual(view, [
    ["Framing", "Labour", "", "", 1000],
    ["Framing", "Wall frame", "", "Wall frame", 0],
    ["Framing", "Plate", "Yes", "", 5],
    ["Framing", "Studs", "Yes", "", 5],
    ["Framing", "Nails", "", "", 200],
    ["Roofing", "Sheet", "", "", 300],
  ]);
  assert.equal(c.rows[5].Allowance, "Provisional Sum");
  assert.equal(c.rows[5]["Proposal Visible"], "No");
  assert.equal(c.rows[5]["Shown As"], "empty");
  assert.equal(c.rows[2]["Proposal Visible"], "No", "components hidden from the client");
  assert.deepEqual([c.sections, c.assemblies, c.unbalancedAssemblies], [2, 1, []]);
});

test("subsections nest by money; a $0 section's first row is its own", () => {
  const c = convertBuildernEstimateItems([
    row("Wet areas", "GROUP", 900),
    row("Bathroom", "GROUP", 600),
    row("Tiles", "MATERIAL", 600),
    row("Laundry", "GROUP", 300),
    row("Tub", "MATERIAL", 300),
    row("Rendering", "GROUP", 0),
    row("Render", "ALLOWANCE", 2470),
    row("Render deduction", "SUBCONTRACTOR", -2470),
  ]);
  assert.deepEqual(c.rows.map((r) => [r.Group, r.Item]), [
    ["Wet areas > Bathroom", "Tiles"],
    ["Wet areas > Laundry", "Tub"],
    ["Rendering", "Render"],
    ["Rendering", "Render deduction"],
  ]);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

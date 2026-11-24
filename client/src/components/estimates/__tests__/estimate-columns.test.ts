/**
 * The shared estimate / template column list. Run with:
 *   npx tsx client/src/components/estimates/__tests__/estimate-columns.test.ts
 */
import assert from "node:assert/strict";
import {
  ESTIMATE_DEFAULT_COLUMNS,
  TEMPLATE_DEFAULT_COLUMNS,
  gridLayout,
  mergeSavedColumns,
} from "../estimateColumnModel";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { failed++; console.error(`✗ ${name}\n`, e); }
};

test("a template's columns are the estimate's, in the same order, minus Status and Notes", () => {
  const expected = ESTIMATE_DEFAULT_COLUMNS.filter((c) => c.id !== "status" && c.id !== "notes");
  assert.deepEqual(TEMPLATE_DEFAULT_COLUMNS, expected);
});

test("nothing saved → defaults (copies, not the shared objects)", () => {
  const out = mergeSavedColumns(null, TEMPLATE_DEFAULT_COLUMNS);
  assert.deepEqual(out, TEMPLATE_DEFAULT_COLUMNS);
  assert.notEqual(out[0], TEMPLATE_DEFAULT_COLUMNS[0]);
});

test("saved order, widths and visibility win", () => {
  const saved = [
    { id: "quantity", visible: false, widthPx: 120 },
    { id: "item", visible: true, widthPx: 300 },
  ];
  const out = mergeSavedColumns(saved, TEMPLATE_DEFAULT_COLUMNS);
  assert.equal(out[0].id, "quantity");
  assert.equal(out[0].visible, false);
  assert.equal(out[0].widthPx, 120);
  assert.equal(out[1].id, "item");
  assert.equal(out[1].widthPx, 300);
});

test("a column added after the save still appears, with its default", () => {
  const saved = [{ id: "item", visible: true, widthPx: 300 }];
  const out = mergeSavedColumns(saved, TEMPLATE_DEFAULT_COLUMNS);
  assert.equal(out.length, TEMPLATE_DEFAULT_COLUMNS.length);
  const markup = out.find((c) => c.id === "markup")!;
  assert.deepEqual(markup, TEMPLATE_DEFAULT_COLUMNS.find((c) => c.id === "markup"));
});

test("unknown, duplicate and malformed saved entries are dropped; labels come from the code", () => {
  const saved = [
    { id: "gone", visible: true, widthPx: 50 },
    { id: "item", label: "Renamed", visible: true, widthPx: 300 },
    { id: "item", visible: false, widthPx: 10 },
    null,
    { id: "type", widthPx: -5 },
  ];
  const out = mergeSavedColumns(saved, TEMPLATE_DEFAULT_COLUMNS);
  assert.equal(out.filter((c) => c.id === "item").length, 1);
  assert.equal(out.find((c) => c.id === "item")!.label, "Item");
  assert.ok(!out.some((c) => c.id === "gone"));
  // A non-positive width falls back to the default.
  assert.equal(out.find((c) => c.id === "type")!.widthPx, 80);
});

test("not an array → defaults", () => {
  assert.deepEqual(mergeSavedColumns({ item: true }, TEMPLATE_DEFAULT_COLUMNS), TEMPLATE_DEFAULT_COLUMNS);
});

test("layout: fixed pixel tracks only (no 1fr), and the width adds up", () => {
  const cols = [
    { id: "item", label: "Item", visible: true, widthPx: 200 },
    { id: "type", label: "Type", visible: false, widthPx: 80 },
    { id: "quantity", label: "Qty", visible: true, widthPx: 60 },
  ];
  const { visibleCols, gridTemplate, tableWidth } = gridLayout(cols);
  assert.deepEqual(visibleCols.map((c) => c.id), ["item", "quantity"]);
  assert.equal(gridTemplate, "40px 200px 60px 80px");
  assert.ok(!gridTemplate.includes("fr"));
  assert.equal(tableWidth, 40 + 200 + 60 + 80);
});

console.log(`estimate columns: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

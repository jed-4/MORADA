/**
 * A take-off item's unit must describe what its TYPE measures.
 *
 * The case that prompted this: "Joists" was an Area item labelled "lm". It
 * drew a closed outline, clicking along the joist band made that outline cross
 * itself, the two halves cancelled, and the row read "0.04 lm".
 *
 * Run: npx tsx client/src/components/takeoff/__tests__/takeoff-type-unit.test.ts
 */
import assert from "node:assert/strict";
import { polygonSelfIntersects, unitFitsType, unitForType } from "../useTakeoffGeometry";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { failed++; console.error(`✗ ${name}\n`, e); }
};

test("an area labelled lm does not fit, and shows as m²", () => {
  assert.equal(unitFitsType("area", "lm"), false);
  assert.equal(unitForType("area", "lm"), "m²");
});

test("a unit that fits is kept, hand-set ones included", () => {
  assert.equal(unitForType("area", "ft²"), "ft²");
  assert.equal(unitForType("linear", "m"), "m");
  assert.equal(unitForType("linear", "ft"), "ft");
  assert.equal(unitForType("count", "pcs"), "pcs");
});

test("a linear item without a height is lm, not m²", () => {
  assert.equal(unitForType("linear", "m²"), "lm");
  assert.equal(unitForType("linear", ""), "lm");
});

test("a linear item WITH a height is m², whatever it was labelled", () => {
  assert.equal(unitForType("linear", "lm", 2400), "m²");
  assert.equal(unitFitsType("linear", "m²", 2400), true);
});

test("manual items keep any unit, including none", () => {
  assert.equal(unitForType("manual", "hrs"), "hrs");
  assert.equal(unitForType("manual", ""), "");
});

test("a count labelled lm becomes each", () => {
  assert.equal(unitForType("count", "lm"), "each");
});

test("an outline clicked ALONG a band crosses itself", () => {
  // Top-left, top-right, bottom-left, bottom-right: how a line along a joist
  // band gets drawn as an area. The closing edge crosses the middle one.
  const along = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }];
  assert.equal(polygonSelfIntersects(along), true);
});

test("an outline clicked AROUND an area does not", () => {
  const around = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 1 }, { x: 0, y: 1 }];
  assert.equal(polygonSelfIntersects(around), false);
  const lShape = [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 },
  ];
  assert.equal(polygonSelfIntersects(lShape), false);
  assert.equal(polygonSelfIntersects([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]), false);
});

console.log(`take-off type/unit: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

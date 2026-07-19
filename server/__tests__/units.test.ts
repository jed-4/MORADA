/**
 * Unit-normalization tests for shared/units.ts.
 * Run with:  NODE_ENV=test npx tsx server/__tests__/units.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { normalizeUnit, unitsMatch } from "@shared/units";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("units:");

check("collapses the count spellings", () => {
  assert.strictEqual(normalizeUnit("each"), "ea");
  assert.strictEqual(normalizeUnit("EA"), "ea");
  assert.strictEqual(normalizeUnit("pcs"), "ea");
});

check("collapses area/linear/volume spellings", () => {
  assert.strictEqual(normalizeUnit("m²"), "m2");
  assert.strictEqual(normalizeUnit("m2"), "m2");
  assert.strictEqual(normalizeUnit("SQM"), "m2");
  assert.strictEqual(normalizeUnit("lm"), "m");
  assert.strictEqual(normalizeUnit("lin_m"), "m");
  assert.strictEqual(normalizeUnit("m³"), "m3");
});

check("collapses time / mass / volume", () => {
  assert.strictEqual(normalizeUnit("hour"), "hr");
  assert.strictEqual(normalizeUnit("t"), "tonne");
  assert.strictEqual(normalizeUnit("l"), "litre");
});

check("unknown units pass through trimmed + lowercased", () => {
  assert.strictEqual(normalizeUnit("  Widget "), "widget");
  assert.strictEqual(normalizeUnit(""), "");
  assert.strictEqual(normalizeUnit(null), "");
  assert.strictEqual(normalizeUnit(undefined), "");
});

check("unitsMatch is spelling-insensitive across surfaces", () => {
  assert.ok(unitsMatch("ea", "each"));       // estimate vs price-list
  assert.ok(unitsMatch("m²", "m2"));         // estimate vs template
  assert.ok(unitsMatch("lm", "m"));          // takeoff vs estimate
  assert.ok(!unitsMatch("m2", "m3"));        // area ≠ volume
  assert.ok(!unitsMatch("ea", "item"));      // distinct field-settings options
});

console.log(`\nunits: ${passed} checks passed\n`);

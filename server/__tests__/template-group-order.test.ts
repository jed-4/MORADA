/**
 * The company-wide order of groups in the Details and Labour template libraries
 * — shared/templateGroupOrder.ts, used by both groups panels and by both
 * template-apply paths.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/template-group-order.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { moveGroup, orderGroups } from "../../shared/templateGroupOrder";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log("\ntemplate-group-order");

// ── orderGroups ──────────────────────────────────────────────────────────────

check("with nothing saved, groups read alphabetically — exactly as before", () => {
  assert.deepStrictEqual(orderGroups(["Wet areas", "Site", "Structure"], []), ["Site", "Structure", "Wet areas"]);
  assert.deepStrictEqual(orderGroups(["Wet areas", "Site"], null), ["Site", "Wet areas"]);
  assert.deepStrictEqual(orderGroups(["Wet areas", "Site"], undefined), ["Site", "Wet areas"]);
});

check("saved groups come first, in the saved order", () => {
  assert.deepStrictEqual(
    orderGroups(["Site", "Structure", "Wet areas"], ["Wet areas", "Site", "Structure"]),
    ["Wet areas", "Site", "Structure"],
  );
});

check("a group created since the last drag goes to the bottom", () => {
  assert.deepStrictEqual(
    orderGroups(["Site", "Wet areas", "Brand new", "Another new"], ["Wet areas", "Site"]),
    ["Wet areas", "Site", "Another new", "Brand new"],
  );
});

check("a saved name that no longer exists is ignored (rename or delete)", () => {
  assert.deepStrictEqual(orderGroups(["Site", "Services"], ["Gone", "Services", "Old name", "Site"]), ["Services", "Site"]);
});

check("a panel showing only some groups keeps them in company order", () => {
  const company = ["Wet areas", "Site", "Services", "Structure"];
  assert.deepStrictEqual(orderGroups(["Structure", "Site"], company), ["Site", "Structure"]);
});

check("duplicate names in the saved order don't duplicate a group", () => {
  assert.deepStrictEqual(orderGroups(["Site", "Services"], ["Site", "Site", "Services"]), ["Site", "Services"]);
});

// ── moveGroup ────────────────────────────────────────────────────────────────

check("dragging down lands after the target", () => {
  assert.deepStrictEqual(moveGroup(["A", "B", "C", "D"], "A", "C"), ["B", "C", "A", "D"]);
});

check("dragging up lands before the target", () => {
  assert.deepStrictEqual(moveGroup(["A", "B", "C", "D"], "D", "B"), ["A", "D", "B", "C"]);
});

check("to the very top and the very bottom", () => {
  assert.deepStrictEqual(moveGroup(["A", "B", "C"], "C", "A"), ["C", "A", "B"]);
  assert.deepStrictEqual(moveGroup(["A", "B", "C"], "A", "C"), ["B", "C", "A"]);
});

check("groups the open template doesn't have keep their places", () => {
  // The panel shows only B and D; B is dragged onto D. A, C and E are in other
  // templates and must not be reshuffled by a drag that never showed them.
  assert.deepStrictEqual(moveGroup(["A", "B", "C", "D", "E"], "B", "D"), ["A", "C", "D", "B", "E"]);
});

check("an unknown name or a drop on itself changes nothing", () => {
  assert.deepStrictEqual(moveGroup(["A", "B"], "Z", "A"), ["A", "B"]);
  assert.deepStrictEqual(moveGroup(["A", "B"], "A", "Z"), ["A", "B"]);
  assert.deepStrictEqual(moveGroup(["A", "B"], "A", "A"), ["A", "B"]);
});

check("a move then a read round-trips to the order shown", () => {
  const all = orderGroups(["Site", "Services", "Structure", "Wet areas"], []);
  assert.deepStrictEqual(all, ["Services", "Site", "Structure", "Wet areas"]);
  const saved = moveGroup(all, "Wet areas", "Services"); // onto the top row
  assert.deepStrictEqual(saved, ["Wet areas", "Services", "Site", "Structure"]);
  assert.deepStrictEqual(orderGroups(["Site", "Services", "Structure", "Wet areas"], saved), saved);
});

console.log(`\ntemplate-group-order: ${passed} checks passed\n`);

/**
 * Nesting/ordering tests for the schedule Gantt.
 *
 * The Gantt used to understand only two levels. An item with a grandparent was
 * bucketed under its parent, but the render only ever read the buckets of
 * TOP-LEVEL items — so a third-level row silently never drew, while the list
 * view (<MoradaScheduleList>) happily rendered the same three levels. These
 * tests pin the corrected behaviour so the two views cannot drift apart again.
 *
 * What is verified:
 *   1. Three real levels survive, in tree order, at the depths they claim.
 *   2. A FOURTH level is clamped up to the cap, not dropped — a too-deep row
 *      draws as a sibling of its own parent rather than vanishing.
 *   3. Collapsing hides exactly one subtree, at any level.
 *   4. A parent removed by a search/filter promotes its children instead of
 *      orphaning them.
 *   5. The original contract holds: every visible row is emitted exactly once,
 *      and groups stay contiguous however the input is interleaved.
 *   6. A malformed (cyclic) parent link strands rows at top level instead of
 *      blanking the Gantt or hanging the render.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/schedule-nesting.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  MAX_NEST_DEPTH,
  resolveDisplayParents,
  buildNormalizedOrder,
} from "../../client/src/lib/scheduleNesting";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** Build the parent lookup the helpers take. */
const parents = (o: Record<string, string | null>) =>
  new Map<string, string | null | undefined>(Object.entries(o));

const noneCollapsed = new Set<string>();

console.log("schedule nesting:");

check("the cap is three levels, matching the list view", () => {
  assert.strictEqual(MAX_NEST_DEPTH, 2);
});

check("three levels all survive, in tree order", () => {
  const p = parents({ g: null, i1: "g", s1: "i1", s2: "i1", i2: "g" });
  const ids = ["g", "i1", "s1", "s2", "i2"];
  const { depthOf } = resolveDisplayParents(ids, p);
  assert.deepStrictEqual(ids.map(i => depthOf.get(i)), [0, 1, 2, 2, 1]);
  assert.deepStrictEqual(
    buildNormalizedOrder(ids, p, noneCollapsed),
    ["g", "i1", "s1", "s2", "i2"],
  );
});

check("a fourth level is clamped to the cap, never dropped", () => {
  const p = parents({ g: null, i: "g", s: "i", deep: "s" });
  const ids = ["g", "i", "s", "deep"];
  const { depthOf, displayParentOf } = resolveDisplayParents(ids, p);
  assert.strictEqual(depthOf.get("deep"), MAX_NEST_DEPTH);
  // Re-attached to its grandparent, so it draws beside its own parent.
  assert.strictEqual(displayParentOf.get("deep"), "i");
  assert.ok(buildNormalizedOrder(ids, p, noneCollapsed).includes("deep"));
});

check("collapsing a mid-level item hides only its own subtree", () => {
  const p = parents({ g: null, i1: "g", s1: "i1", i2: "g" });
  const ids = ["g", "i1", "s1", "i2"];
  assert.deepStrictEqual(
    buildNormalizedOrder(ids, p, new Set(["i1"])),
    ["g", "i1", "i2"],
  );
});

check("collapsing a root hides every level beneath it", () => {
  const p = parents({ g: null, i1: "g", s1: "i1", i2: "g" });
  const ids = ["g", "i1", "s1", "i2"];
  // s1 is a grandchild: it must stay hidden, not be "rescued" to top level.
  assert.deepStrictEqual(buildNormalizedOrder(ids, p, new Set(["g"])), ["g"]);
});

check("a filtered-out parent promotes its children", () => {
  const p = parents({ i1: "g", s1: "i1" }); // "g" removed by a filter
  const ids = ["i1", "s1"];
  const { depthOf } = resolveDisplayParents(ids, p);
  assert.deepStrictEqual([depthOf.get("i1"), depthOf.get("s1")], [0, 1]);
  assert.deepStrictEqual(buildNormalizedOrder(ids, p, noneCollapsed), ["i1", "s1"]);
});

check("every visible row is emitted exactly once", () => {
  const p = parents({ a: null, b: "a", c: "b", d: "c", e: null, f: "e" });
  const ids = ["a", "b", "c", "d", "e", "f"];
  const out = buildNormalizedOrder(ids, p, noneCollapsed);
  assert.strictEqual(out.length, ids.length, "no row dropped");
  assert.strictEqual(new Set(out).size, ids.length, "no row duplicated");
});

check("groups stay contiguous however the input is interleaved", () => {
  const p = parents({ g1: null, a: "g1", a2: "a", g2: null, b: "g2" });
  assert.deepStrictEqual(
    buildNormalizedOrder(["g1", "g2", "a", "b", "a2"], p, noneCollapsed),
    ["g1", "a", "a2", "g2", "b"],
  );
});

check("a cyclic parent link strands rows instead of blanking the Gantt", () => {
  const p = parents({ x: "y", y: "x" });
  const out = buildNormalizedOrder(["x", "y"], p, noneCollapsed);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(new Set(out).size, 2);
});

console.log(`\n${passed} checks passed`);

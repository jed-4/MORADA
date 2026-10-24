/**
 * Where a dragged estimate group lands.
 *
 * The bug this pins: on a flat estimate — every group top level, which is
 * every estimate until a subgroup exists — nesting one group into another was
 * impossible. The old rule was "if the target is at the same level, reorder;
 * otherwise nest", and on a flat estimate every target IS at the same level,
 * so the reorder branch always won and the nest branch was unreachable. There
 * was no way back out either: nothing ever set parentGroupId to null.
 *
 * The replacement is two rules — `inside` nests, `above`/`below` make the
 * group a sibling of the target — which between them give reorder, nest,
 * promote and demote.
 */
import assert from "node:assert/strict";
import { planGroupDrop, descendantsOf, hiddenGroupIds, type GroupNode } from "../estimateDragTypes";

let passed = 0;
const check = (label: string, fn: () => void) => { fn(); passed++; };

/** Four top-level groups, the shape of a normal estimate. */
const flat: GroupNode[] = [
  { id: "demo", parentGroupId: null, order: 0 },
  { id: "fit", parentGroupId: null, order: 1 },
  { id: "ext", parentGroupId: null, order: 2 },
  { id: "frame", parentGroupId: null, order: 3 },
];

/** What a plan says about one group, for terse assertions. */
const landing = (moves: ReturnType<typeof planGroupDrop>, id: string) => {
  const m = moves.find((x) => x.id === id);
  return m ? { order: m.order, parent: "parentGroupId" in m ? m.parentGroupId : "untouched" } : null;
};

// --- the reported bug -------------------------------------------------------

check("a group nests into another on a FLAT estimate", () => {
  const moves = planGroupDrop(flat, "fit", "demo", "inside");
  assert.deepEqual(landing(moves, "fit"), { order: 0, parent: "demo" },
    "Fit-Out should become Demolition's first child");
});

check("the gap left behind is closed", () => {
  const moves = planGroupDrop(flat, "fit", "demo", "inside");
  // demo/ext/frame resequence 0,1,2 — no hole where Fit-Out was.
  assert.deepEqual(landing(moves, "ext")?.order, 1);
  assert.deepEqual(landing(moves, "frame")?.order, 2);
});

check("a nest APPENDS, so existing children keep their order", () => {
  const withChildren: GroupNode[] = [
    ...flat,
    { id: "joinery", parentGroupId: "demo", order: 0 },
    { id: "tiling", parentGroupId: "demo", order: 1 },
  ];
  const moves = planGroupDrop(withChildren, "fit", "demo", "inside");
  assert.equal(landing(moves, "joinery")?.order, 0);
  assert.equal(landing(moves, "tiling")?.order, 1);
  assert.equal(landing(moves, "fit")?.order, 2, "the newcomer goes last");
});

// --- un-nesting, which was impossible --------------------------------------

const nested: GroupNode[] = [
  { id: "demo", parentGroupId: null, order: 0 },
  { id: "ext", parentGroupId: null, order: 1 },
  { id: "fit", parentGroupId: "demo", order: 0 },
];

check("dropping a subgroup beside a top-level group promotes it", () => {
  const moves = planGroupDrop(nested, "fit", "ext", "below");
  assert.deepEqual(landing(moves, "fit"), { order: 2, parent: null },
    "Fit-Out returns to the top level, after External Works");
});

check("promoting ABOVE a root group puts it first", () => {
  const moves = planGroupDrop(nested, "fit", "demo", "above");
  assert.deepEqual(landing(moves, "fit"), { order: 0, parent: null });
  assert.equal(landing(moves, "demo")?.order, 1);
});

// --- plain reordering still works ------------------------------------------

check("above/below reorders within a level without re-parenting", () => {
  const moves = planGroupDrop(flat, "frame", "demo", "above");
  assert.deepEqual(landing(moves, "frame"), { order: 0, parent: null });
  assert.deepEqual([landing(moves, "demo")?.order, landing(moves, "fit")?.order, landing(moves, "ext")?.order], [1, 2, 3]);
});

check("dropping below the group just above it is a no-op in position", () => {
  const moves = planGroupDrop(flat, "fit", "demo", "below");
  assert.equal(landing(moves, "fit")?.order, 1, "Fit-Out was already second");
});

check("dropping beside a SUBGROUP demotes into that subgroup's parent", () => {
  const moves = planGroupDrop(nested, "ext", "fit", "below");
  assert.deepEqual(landing(moves, "ext"), { order: 1, parent: "demo" },
    "External Works joins Demolition, after Fit-Out");
});

// --- refusals ---------------------------------------------------------------

check("a group cannot be dropped into itself", () => {
  assert.deepEqual(planGroupDrop(flat, "fit", "fit", "inside"), []);
});

check("a group cannot be dropped into its own child", () => {
  assert.deepEqual(planGroupDrop(nested, "demo", "fit", "inside"), [],
    "that would make Demolition a descendant of itself");
});

check("nor into a grandchild", () => {
  const deep: GroupNode[] = [
    { id: "a", parentGroupId: null, order: 0 },
    { id: "b", parentGroupId: "a", order: 0 },
    { id: "c", parentGroupId: "b", order: 0 },
  ];
  assert.deepEqual(planGroupDrop(deep, "a", "c", "inside"), []);
  assert.deepEqual([...descendantsOf(deep, "a")].sort(), ["b", "c"]);
});

check("a missing target is refused rather than guessed at", () => {
  assert.deepEqual(planGroupDrop(flat, "fit", "ghost", "inside"), []);
});

check("a corrupt parent cycle in existing data does not hang the walk", () => {
  const corrupt: GroupNode[] = [
    { id: "x", parentGroupId: "y", order: 0 },
    { id: "y", parentGroupId: "x", order: 0 },
  ];
  assert.deepEqual([...descendantsOf(corrupt, "x")].sort(), ["x", "y"]);
});

// --- every plan is internally consistent ------------------------------------

check("no plan ever leaves two siblings sharing an order", () => {
  const cases: Array<[GroupNode[], string, string, "above" | "below" | "inside"]> = [
    [flat, "fit", "demo", "inside"], [flat, "frame", "demo", "above"],
    [nested, "fit", "ext", "below"], [nested, "ext", "fit", "below"],
    [nested, "fit", "demo", "above"],
  ];
  for (const [groups, dragged, target, position] of cases) {
    const moves = planGroupDrop(groups, dragged, target, position);
    const parentOf = new Map(groups.map((g) => [g.id, g.parentGroupId ?? null]));
    for (const m of moves) if ("parentGroupId" in m) parentOf.set(m.id, m.parentGroupId ?? null);
    const seen = new Map<string, Set<number>>();
    for (const m of moves) {
      const key = String(parentOf.get(m.id));
      if (!seen.has(key)) seen.set(key, new Set());
      assert.ok(!seen.get(key)!.has(m.order),
        `${dragged}→${target} ${position}: two siblings under ${key} both at order ${m.order}`);
      seen.get(key)!.add(m.order);
    }
  }
});

// --- what may be dropped ON -------------------------------------------------

check("a collapsed section hides its children from the drop test", () => {
  const tree: GroupNode[] = [
    { id: "demo", parentGroupId: null, order: 0, isCollapsed: true },
    { id: "fit", parentGroupId: "demo", order: 0 },
    { id: "joinery", parentGroupId: "fit", order: 0 },
    { id: "ext", parentGroupId: null, order: 1 },
  ];
  // Collapsed sections clip their children rather than removing them, so the
  // headers still measure full height and a rect-based hit test would offer
  // them. Both levels under the collapsed group have to go.
  assert.deepEqual([...hiddenGroupIds(tree)].sort(), ["fit", "joinery"]);
});

check("an expanded section hides nothing", () => {
  assert.equal(hiddenGroupIds(nested).size, 0);
});

console.log(`estimate group drop: ${passed} passed, 0 failed`);

/**
 * Dragging a LINE on an estimate or template grid. Run with:
 *   npx tsx client/src/components/estimates/__tests__/line-drag.test.ts
 */
import assert from "node:assert/strict";
import { pickItemDropTarget, type MeasuredGroup, type MeasuredRow } from "../estimateDragTypes";
import { currentTree, layoutTemplateGroups, moveTemplateLine, templateGroupOrder, UNGROUPED, type TemplateRowLike } from "../templateGroupTree";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { failed++; console.error(`✗ ${name}\n`, e); }
};

// Two groups on screen. A: header 0–30, rows a1 30–60, a2 60–90 (card 0–100).
// B: header 110–140, rows b1 140–170 (card 110–180). C: empty, card 200–240.
const groups: MeasuredGroup[] = [
  { id: "A", top: 0, bottom: 100 },
  { id: "B", top: 110, bottom: 180 },
  { id: "C", top: 200, bottom: 240 },
];
const rows: MeasuredRow[] = [
  { id: "a1", groupId: "A", top: 30, bottom: 60 },
  { id: "a2", groupId: "A", top: 60, bottom: 90 },
  { id: "b1", groupId: "B", top: 140, bottom: 170 },
];

test("above the first row's middle → above it", () => {
  assert.deepEqual(pickItemDropTarget(35, "x", groups, rows), { id: "a1", position: "above" });
});
test("between two rows → below the upper one", () => {
  assert.deepEqual(pickItemDropTarget(65, "x", groups, rows), { id: "a1", position: "below" });
});
test("past the last row's middle → below the last", () => {
  assert.deepEqual(pickItemDropTarget(85, "x", groups, rows), { id: "a2", position: "below" });
});
test("cursor in another group targets that group's rows only", () => {
  assert.deepEqual(pickItemDropTarget(160, "a1", groups, rows), { id: "b1", position: "below" });
});
test("empty group → its header, so a line can go into it", () => {
  assert.deepEqual(pickItemDropTarget(220, "a1", groups, rows), { id: "group-C", position: "below" });
});
test("the dragged row is never its own target", () => {
  // Only a1 left in A besides the dragged a2.
  assert.deepEqual(pickItemDropTarget(80, "a2", groups, rows), { id: "a1", position: "below" });
});
test("a nested card listed after its parent wins", () => {
  const nested: MeasuredGroup[] = [{ id: "P", top: 0, bottom: 200 }, { id: "S", top: 50, bottom: 150 }];
  const r: MeasuredRow[] = [{ id: "s1", groupId: "S", top: 80, bottom: 110 }, { id: "p1", groupId: "P", top: 20, bottom: 40 }];
  assert.deepEqual(pickItemDropTarget(100, "x", nested, r), { id: "s1", position: "below" });
});
test("outside every card → ungrouped rows; none → null", () => {
  assert.equal(pickItemDropTarget(500, "x", groups, rows), null);
  const loose: MeasuredRow[] = [{ id: "u1", groupId: null, top: 490, bottom: 520 }];
  assert.deepEqual(pickItemDropTarget(500, "x", groups, loose), { id: "u1", position: "above" });
});

// ── moveTemplateLine ──
const line = (id: string, groupName: string | undefined, sortOrder: number): TemplateRowLike =>
  ({ id, name: id, isGroup: false, groupName, sortOrder });
const grp = (name: string): TemplateRowLike => ({ id: `g-${name}`, name, isGroup: true, sortOrder: 0 });
const base = (): TemplateRowLike[] => [
  grp("A"), grp("B"), grp("C"),
  line("a1", "A", 0), line("a2", "A", 1), line("b1", "B", 2), line("u1", undefined, 3),
];
const order = (items: TemplateRowLike[]) =>
  items.filter((i) => !i.isGroup).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => `${i.groupName ?? "-"}:${i.id}`);

test("reorder within a group", () => {
  assert.deepEqual(order(moveTemplateLine(base(), "a1", { id: "a2", position: "below" })), ["A:a2", "A:a1", "B:b1", "-:u1"]);
});
test("into another group, above a line", () => {
  assert.deepEqual(order(moveTemplateLine(base(), "a1", { id: "b1", position: "above" })), ["A:a2", "B:a1", "B:b1", "-:u1"]);
});
test("into an empty group via its header", () => {
  const out = moveTemplateLine(base(), "a1", { id: "group-C", position: "below" });
  assert.equal(out.find((i) => i.id === "a1")!.groupName, "C");
});
test("onto General's header → ungrouped", () => {
  const out = moveTemplateLine(base(), "a1", { id: `group-${UNGROUPED}`, position: "below" });
  assert.equal(out.find((i) => i.id === "a1")!.groupName, undefined);
  assert.deepEqual(order(out).slice(-2), ["-:u1", "-:a1"]);
});
test("next to an ungrouped line → ungrouped", () => {
  const out = moveTemplateLine(base(), "b1", { id: "u1", position: "above" });
  assert.equal(out.find((i) => i.id === "b1")!.groupName, undefined);
});
test("group rows untouched; unknown target is a no-op", () => {
  const b = base();
  const out = moveTemplateLine(b, "a1", { id: "b1", position: "below" });
  assert.deepEqual(out.filter((i) => i.isGroup), b.filter((i) => i.isGroup));
  assert.equal(moveTemplateLine(b, "a1", { id: "nope", position: "below" }), b);
  assert.equal(moveTemplateLine(b, "a1", { id: "a1", position: "below" }), b);
});

test("with group rows laid down first, moving the first line doesn't reorder the groups", () => {
  // No group rows: order comes from the lines, so K is first because k1 is.
  const noRows: TemplateRowLike[] = [line("k1", "K", 0), line("k2", "K", 1), line("b1", "B", 2)];
  assert.deepEqual(templateGroupOrder(noRows), ["K", "B"]);
  // The bug: move k1 into B and K loses first place.
  assert.deepEqual(templateGroupOrder(moveTemplateLine(noRows, "k1", { id: "b1", position: "below" })).slice(0, 2), ["B", "K"]);
  // The fix (what the grid does): pin the groups, then move.
  const { parentOf, orderOf } = currentTree(noRows);
  const pinned = layoutTemplateGroups(noRows, parentOf, orderOf);
  const out = moveTemplateLine(pinned, "k1", { id: "b1", position: "below" });
  assert.deepEqual(templateGroupOrder(out).slice(0, 2), ["K", "B"]);
  assert.equal(out.find((i) => i.id === "k1")!.groupName, "B");
});

console.log(`line drag: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

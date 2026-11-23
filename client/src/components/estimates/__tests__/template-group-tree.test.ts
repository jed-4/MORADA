/**
 * Nested groups on estimate templates. Run with:
 *   npx tsx client/src/components/estimates/__tests__/template-group-tree.test.ts
 */
import assert from "node:assert/strict";
import {
  currentTree,
  layoutTemplateGroups,
  linesForApply,
  placeImportedGroups,
  templateDescendants,
  templateGroupOrder,
  templateGroupParents,
  type TemplateRowLike,
} from "../templateGroupTree";
import { planGroupDrop } from "../estimateDragTypes";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { failed++; console.error(`✗ ${name}\n`, e); }
};

let n = 0;
const id = () => `id-${++n}`;
const group = (name: string, parentGroupName?: string): TemplateRowLike =>
  ({ id: id(), name, isGroup: true, sortOrder: 0, ...(parentGroupName ? { parentGroupName } : {}) });
const line = (name: string, groupName: string | undefined, sortOrder: number): TemplateRowLike =>
  ({ id: id(), name, isGroup: false, groupName, sortOrder });

test("a template with no group rows still reads its groups from the lines", () => {
  const items = [line("a", "Kitchen", 0), line("b", "Bathroom", 1), line("c", undefined, 2)];
  assert.deepEqual(templateGroupOrder(items), ["Kitchen", "Bathroom", "ungrouped"]);
  assert.equal(templateGroupParents(items).get("Kitchen"), null);
});

test("parentGroupName nests a group", () => {
  const items = [group("Kitchen"), group("Joinery", "Kitchen"), line("a", "Joinery", 0)];
  assert.equal(templateGroupParents(items).get("Joinery"), "Kitchen");
});

test("a parent that names nothing, itself, or General reads as top level", () => {
  const items = [group("A", "Missing"), group("B", "B"), group("C", "ungrouped"), line("x", undefined, 0)];
  const p = templateGroupParents(items);
  assert.equal(p.get("A"), null);
  assert.equal(p.get("B"), null);
  assert.equal(p.get("C"), null);
});

test("a loop is cut instead of making the groups vanish", () => {
  const items = [group("A", "B"), group("B", "A")];
  const p = templateGroupParents(items);
  // Both links are cut (each walk comes back round); nothing is left with no
  // top-level ancestor.
  assert.equal(p.get("A"), null);
  assert.equal(p.get("B"), null);
});

test("layout puts each parent directly before its subtree and gives name-only groups a row", () => {
  const items = [group("Kitchen"), group("Bathroom"), line("t", "Tiling", 0)];
  const { parentOf, orderOf } = currentTree(items);
  parentOf.set("Tiling", "Bathroom");
  const out = layoutTemplateGroups(items, parentOf, orderOf, id);
  assert.deepEqual(out.filter((i) => i.isGroup).map((g) => g.name), ["Kitchen", "Bathroom", "Tiling"]);
  assert.equal(out.find((g) => g.isGroup && g.name === "Tiling")!.parentGroupName, "Bathroom");
  assert.equal(out.filter((i) => !i.isGroup).length, 1, "lines are untouched");
});

test("drag Bathroom INTO Kitchen, then back out above it", () => {
  let items = [group("Kitchen"), group("Bathroom"), group("Laundry"), line("a", "Bathroom", 0)];
  const asNodes = (rows: TemplateRowLike[]) => {
    const parents = templateGroupParents(rows);
    return templateGroupOrder(rows).map((name, order) => ({ id: name, parentGroupId: parents.get(name) ?? null, order }));
  };
  const apply = (moves: ReturnType<typeof planGroupDrop>) => {
    const { parentOf, orderOf } = currentTree(items);
    const base = items.length + 1;
    for (const m of moves) {
      orderOf.set(m.id, base + m.order);
      if ("parentGroupId" in m) parentOf.set(m.id, m.parentGroupId ?? null);
    }
    items = layoutTemplateGroups(items, parentOf, orderOf, id);
  };

  apply(planGroupDrop(asNodes(items), "Bathroom", "Kitchen", "inside"));
  assert.equal(templateGroupParents(items).get("Bathroom"), "Kitchen");
  assert.deepEqual(templateGroupOrder(items), ["Kitchen", "Bathroom", "Laundry"]);

  apply(planGroupDrop(asNodes(items), "Bathroom", "Kitchen", "above"));
  assert.equal(templateGroupParents(items).get("Bathroom"), null);
  assert.deepEqual(templateGroupOrder(items), ["Bathroom", "Kitchen", "Laundry"]);
});

test("reordering two subgroups keeps them inside their parent", () => {
  let items = [group("Kitchen"), group("Joinery", "Kitchen"), group("Stone", "Kitchen"), group("Laundry")];
  const parents = templateGroupParents(items);
  const nodes = templateGroupOrder(items).map((name, order) => ({ id: name, parentGroupId: parents.get(name) ?? null, order }));
  const moves = planGroupDrop(nodes, "Stone", "Joinery", "above");
  const { parentOf, orderOf } = currentTree(items);
  for (const m of moves) {
    orderOf.set(m.id, items.length + 1 + m.order);
    if ("parentGroupId" in m) parentOf.set(m.id, m.parentGroupId ?? null);
  }
  items = layoutTemplateGroups(items, parentOf, orderOf, id);
  assert.deepEqual(templateGroupOrder(items), ["Kitchen", "Stone", "Joinery", "Laundry"]);
  assert.equal(templateGroupParents(items).get("Stone"), "Kitchen");
});

test("descendants reach every depth", () => {
  const items = [group("A"), group("B", "A"), group("C", "B"), group("D")];
  assert.deepEqual(Array.from(templateDescendants(templateGroupParents(items), "A")).sort(), ["B", "C"]);
});

test("apply sends full paths, in the template's display order", () => {
  const items = [
    group("Kitchen"),
    group("Joinery", "Kitchen"),
    group("Bathroom"),
    line("vanity", "Bathroom", 0),
    line("benchtop", "Kitchen", 5),
    line("doors", "Joinery", 1),
    line("loose", undefined, 2),
  ];
  const out = linesForApply(items).map((x) => [x.line.name, x.groupPath]);
  assert.deepEqual(out, [
    ["benchtop", "Kitchen"],
    ["doors", "Kitchen > Joinery"],
    ["vanity", "Bathroom"],
    ["loose", ""],
  ]);
});

test("import: a path creates the subgroup inside its parent", () => {
  const { items, leafOf } = placeImportedGroups([], ["Kitchen > Joinery", "Kitchen", "Bathroom", undefined], id);
  assert.deepEqual(templateGroupOrder(items), ["Kitchen", "Joinery", "Bathroom"]);
  assert.equal(templateGroupParents(items).get("Joinery"), "Kitchen");
  assert.equal(leafOf.get("Kitchen > Joinery"), "Joinery");
  assert.equal(leafOf.get(""), undefined);
});

test("import: existing groups keep their place; new ones follow", () => {
  const base = [group("Prelims"), group("Kitchen"), line("a", "Kitchen", 0)];
  const { items } = placeImportedGroups(base, ["Kitchen > Stone", "Bathroom > Tiling"], id);
  assert.deepEqual(templateGroupOrder(items), ["Prelims", "Kitchen", "Stone", "Bathroom", "Tiling"]);
  assert.equal(templateGroupParents(items).get("Stone"), "Kitchen");
  assert.equal(templateGroupParents(items).get("Tiling"), "Bathroom");
  assert.equal(items.filter((i) => !i.isGroup).length, 1);
});

test("export then import gives the same tree", () => {
  const original = [
    group("Kitchen"), group("Joinery", "Kitchen"), group("Bathroom"),
    line("doors", "Joinery", 0), line("bench", "Kitchen", 1), line("vanity", "Bathroom", 2),
  ];
  const sheet = linesForApply(original).map((x) => x.groupPath);
  const { items, leafOf } = placeImportedGroups([], sheet, id);
  assert.deepEqual(templateGroupOrder(items), ["Kitchen", "Joinery", "Bathroom"]);
  assert.equal(templateGroupParents(items).get("Joinery"), "Kitchen");
  assert.deepEqual(sheet.map((g) => leafOf.get(g)), ["Kitchen", "Joinery", "Bathroom"]);
});

console.log(`template group tree: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

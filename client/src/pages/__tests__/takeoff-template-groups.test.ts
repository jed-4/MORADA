/**
 * Grouping take-off template items by category.
 *
 * The template is stored as one FLAT array; the categories are a view over it.
 * So the thing that can go wrong is not the grouping — it is the indices. Edit
 * and delete act on an item's position in the whole array, and a real template
 * has a category's items scattered through it (Jed's has 87 items with Tiling
 * spread from index 0 to index 20). Render a group's rows by their position
 * within the GROUP and an edit lands on whichever item happens to hold that
 * index in the array: the wrong one, almost always, and silently.
 *
 * These pin that every row carries its true index.
 */
import assert from "node:assert/strict";
import { groupItems, UNCATEGORISED } from "../TakeoffTemplateDetail";
import type { TakeoffTemplateItem } from "@shared/takeoffTemplates";

let passed = 0;
const check = (_label: string, fn: () => void) => { fn(); passed++; };

const item = (name: string, categoryName: string | null): TakeoffTemplateItem => ({
  name, categoryName, measurementType: "area", color: "#A890D4",
  multiplier: 1, wastePercent: 0, heightMm: null,
});

/** Shaped like a real template: a category's items are not adjacent. */
const scattered: TakeoffTemplateItem[] = [
  item("Bath 1 Floor Tiles", "Tiling"),      // 0
  item("Bathroom Furniture B1", "Bath 1"),   // 1
  item("Bath 2 Wall Tiles", "Tiling"),       // 2
  item("Doors", "Fix Out"),                  // 3
  item("Carpet", "Flooring"),                // 4
  item("Skirting", "Fix Out"),               // 5
  item("Loose item", null),                  // 6
];

check("a category's scattered items are gathered", () => {
  const groups = groupItems(scattered);
  const tiling = groups.find((g) => g.name === "Tiling")!;
  assert.deepEqual(tiling.rows.map((r) => r.item.name), ["Bath 1 Floor Tiles", "Bath 2 Wall Tiles"]);
});

check("every row keeps its index in the WHOLE array", () => {
  const groups = groupItems(scattered);
  const fixOut = groups.find((g) => g.name === "Fix Out")!;
  // Doors is index 3 and Skirting is 5 — NOT 0 and 1, which is what a
  // within-group index would give and what an edit would then overwrite.
  assert.deepEqual(fixOut.rows.map((r) => r.index), [3, 5]);
  for (const group of groups) {
    for (const row of group.rows) {
      assert.equal(scattered[row.index], row.item, `row ${row.item.name} points at the wrong index`);
    }
  }
});

check("no item is lost or duplicated by grouping", () => {
  const groups = groupItems(scattered);
  const indices = groups.flatMap((g) => g.rows.map((r) => r.index)).sort((a, b) => a - b);
  assert.deepEqual(indices, scattered.map((_, i) => i));
});

check("items with no category land under Uncategorised", () => {
  const groups = groupItems(scattered);
  const none = groups.find((g) => g.name === UNCATEGORISED)!;
  assert.deepEqual(none.rows.map((r) => r.index), [6]);
});

check("blank and whitespace-only categories count as uncategorised", () => {
  // A trimmed-empty category is not a category called "   ".
  const groups = groupItems([item("a", ""), item("b", "   "), item("c", null)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, UNCATEGORISED);
  assert.equal(groups[0].rows.length, 3);
});

check("a category is matched on its trimmed name", () => {
  const groups = groupItems([item("a", "Tiling"), item("b", " Tiling ")]);
  assert.equal(groups.length, 1, "trailing spaces must not split a category in two");
  assert.equal(groups[0].rows.length, 2);
});

check("group order follows first appearance, not the alphabet", () => {
  // The order a builder arranged their template in has to survive.
  const groups = groupItems(scattered);
  assert.deepEqual(groups.map((g) => g.name),
    ["Tiling", "Bath 1", "Fix Out", "Flooring", UNCATEGORISED]);
});

check("an empty template groups to nothing", () => {
  assert.deepEqual(groupItems([]), []);
});

console.log(`takeoff template groups: ${passed} passed, 0 failed`);

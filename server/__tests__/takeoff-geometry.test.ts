/**
 * Take-off geometry — an item is one row across the whole plan, and its
 * quantity is everything marked on every page (client/src/components/takeoff/
 * useTakeoffGeometry.ts).
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/takeoff-geometry.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import {
  normalizeEntries,
  entriesForPage,
  totalQuantity,
  unitForLinear,
  computeQuantity,
} from "../../client/src/components/takeoff/useTakeoffGeometry";

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

console.log("\ntakeoff-geometry");

const sq = (o: number) => [
  { x: o, y: o },
  { x: o + 0.1, y: o },
  { x: o + 0.1, y: o + 0.1 },
  { x: o, y: o + 0.1 },
];

// ── Reading the three geometry formats ───────────────────────────────────────

check("shapes drawn since the change keep the page they were drawn on", () => {
  const entries = normalizeEntries(
    [
      { pageId: "p1", points: sq(0.1), qty: 12 },
      { pageId: "p3", points: sq(0.4), qty: 8.5 },
    ],
    "p1",
  );
  assert.deepStrictEqual(entries.map((e) => [e.pageId, e.qty]), [["p1", 12], ["p3", 8.5]]);
});

check("older sub-shapes belong to the page the item was created on", () => {
  const entries = normalizeEntries([sq(0.1), sq(0.4)], "p7");
  assert.strictEqual(entries.length, 2);
  assert.ok(entries.every((e) => e.pageId === "p7" && e.qty === 0));
});

check("the oldest format — one flat list of points — reads as one shape", () => {
  const entries = normalizeEntries(sq(0.2), "p2");
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].pageId, "p2");
  assert.strictEqual(entries[0].points.length, 4);
});

check("nothing drawn yet reads as nothing", () => {
  assert.deepStrictEqual(normalizeEntries([], "p1"), []);
  assert.deepStrictEqual(normalizeEntries(null, "p1"), []);
  assert.deepStrictEqual(normalizeEntries(undefined, "p1"), []);
});

// ── One page's markings ──────────────────────────────────────────────────────

check("a page's canvas draws only what was marked on that page", () => {
  const entries = normalizeEntries(
    [
      { pageId: "p1", points: sq(0.1), qty: 12 },
      { pageId: "p2", points: sq(0.4), qty: 8 },
      { pageId: "p1", points: sq(0.6), qty: 3 },
    ],
    "p1",
  );
  assert.strictEqual(entriesForPage(entries, "p1").length, 2);
  assert.strictEqual(entriesForPage(entries, "p2").length, 1);
  assert.strictEqual(entriesForPage(entries, "p9").length, 0);
  // No page on screen yet — draw nothing rather than everything.
  assert.strictEqual(entriesForPage(entries, null).length, 0);
});

// ── The row's quantity ───────────────────────────────────────────────────────

check("every page adds up to the one figure on the row", () => {
  const entries = normalizeEntries(
    [
      { pageId: "p1", points: sq(0.1), qty: 24.13 },
      { pageId: "p2", points: sq(0.4), qty: 24.13 },
    ],
    "p1",
  );
  assert.strictEqual(totalQuantity(entries, "area"), 48.26);
});

check("count is the number of markers, wherever they were dropped", () => {
  const entries = normalizeEntries(
    [
      { pageId: "p1", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], qty: 2 },
      { pageId: "p4", points: [{ x: 0.3, y: 0.3 }], qty: 1 },
    ],
    "p1",
  );
  assert.strictEqual(totalQuantity(entries, "count"), 3);
});

check("a wall run with a height is metres x height, in m²", () => {
  const entries = normalizeEntries([{ pageId: "p1", points: sq(0.1), qty: 12.5 }], "p1");
  assert.strictEqual(totalQuantity(entries, "linear", 2400), 30);
  assert.strictEqual(unitForLinear(2400), "m²");
});

check("a linear item with no height is still a plain length", () => {
  const entries = normalizeEntries([{ pageId: "p1", points: sq(0.1), qty: 12.5 }], "p1");
  assert.strictEqual(totalQuantity(entries, "linear", null), 12.5);
  assert.strictEqual(totalQuantity(entries, "linear", 0), 12.5);
  assert.strictEqual(unitForLinear(null), "lm");
  assert.strictEqual(unitForLinear(null, "ft"), "ft");
});

check("a height only applies to a run — an area is already an area", () => {
  const entries = normalizeEntries([{ pageId: "p1", points: sq(0.1), qty: 40 }], "p1");
  assert.strictEqual(totalQuantity(entries, "area", 2400), 40);
});

// ── Per-page scale ───────────────────────────────────────────────────────────

check("the same shape measures differently on a 1:50 page than a 1:100 page", () => {
  // A quarter of the sheet's width, on an A3 sheet rendered 1000px wide.
  const line = [{ x: 0.25, y: 0.5 }, { x: 0.5, y: 0.5 }];
  const page = (ratio: number) =>
    ({ isScaled: true, scaleRatio: ratio, calibrationPixelLength: null,
       calibrationRealDistance: null, calibrationUnit: "mm" }) as any;
  const at100 = computeQuantity([line], "linear", page(100), 1000, 700, 420);
  const at50 = computeQuantity([line], "linear", page(50), 1000, 700, 420);
  assert.strictEqual(at100.quantity, 10.5); // 105 mm of paper at 1:100
  assert.strictEqual(at50.quantity, 5.25);
  // Which is why each shape banks its own quantity: summing them is the only
  // way a plan with mixed scales can total correctly.
  const mixed = normalizeEntries(
    [
      { pageId: "p1", points: line, qty: at100.quantity },
      { pageId: "p2", points: line, qty: at50.quantity },
    ],
    "p1",
  );
  assert.strictEqual(totalQuantity(mixed, "linear"), 15.75);
});

console.log(`\ntakeoff-geometry: ${passed} checks passed\n`);

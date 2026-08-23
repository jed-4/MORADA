/**
 * Ordering tests for the numbered-name tie-break that keeps checklists in the
 * sequence their author numbered them.
 * Run with:  NODE_ENV=test npx tsx server/__tests__/checklist-order.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { leadingSequenceNumber, compareNumberedNames } from "@shared/utils";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** The comparator every checklist surface sorts with. */
function byAuthoredOrder<T extends { order?: number | null }>(
  rows: T[],
  nameOf: (row: T) => string,
): string[] {
  return [...rows]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || compareNumberedNames(nameOf(a), nameOf(b)))
    .map(nameOf);
}

console.log("checklist ordering:");

check("reads the number an author put at the front", () => {
  assert.strictEqual(leadingSequenceNumber("1. Slab"), 1);
  assert.strictEqual(leadingSequenceNumber("2) Frame"), 2);
  assert.strictEqual(leadingSequenceNumber("10 - Lockup"), 10);
  assert.strictEqual(leadingSequenceNumber("07: Painting"), 7);
  assert.strictEqual(leadingSequenceNumber("1.Slab"), 1);
  assert.strictEqual(leadingSequenceNumber("12"), 12);
});

check("reads a code glued to its number", () => {
  assert.strictEqual(leadingSequenceNumber("ITP013 - DILAPIDATION REPORT"), 13);
  assert.strictEqual(leadingSequenceNumber("QA-07 Handover"), 7);
});

check("ignores a number that isn't a sequence number", () => {
  assert.strictEqual(leadingSequenceNumber("Fix 3 taps"), null);
  assert.strictEqual(leadingSequenceNumber("3 Bedroom Fitout"), null);
  assert.strictEqual(leadingSequenceNumber("Level 2 framing"), null);
  assert.strictEqual(leadingSequenceNumber("Slab prep"), null);
  assert.strictEqual(leadingSequenceNumber(""), null);
  assert.strictEqual(leadingSequenceNumber(null), null);
});

check("compares numerically, not lexicographically", () => {
  // The whole point: a plain localeCompare puts "10." ahead of "2.".
  assert.ok(compareNumberedNames("2. Slab", "10. Frame") < 0);
  assert.ok(compareNumberedNames("ITP3", "ITP20") < 0);
});

check("declines to compare unless both names are numbered", () => {
  assert.strictEqual(compareNumberedNames("Zebra check", "Alpha check"), 0);
  assert.strictEqual(compareNumberedNames("1. Slab", "Alpha check"), 0);
});

check("puts a legacy all-zero checklist into number order", () => {
  // Every row carries order 0, so the column can't separate them — this is the
  // shape that arrived scrambled on an estimate.
  const items = [
    { order: 0, description: "10. Tenth item" },
    { order: 0, description: "3. Third item" },
    { order: 0, description: "1. First item" },
    { order: 0, description: "2. Second item" },
  ];
  assert.deepStrictEqual(byAuthoredOrder(items, i => i.description), [
    "1. First item",
    "2. Second item",
    "3. Third item",
    "10. Tenth item",
  ]);
});

check("leaves a dragged order alone even when the numbers disagree", () => {
  const items = [
    { order: 0, description: "3. Was dragged first" },
    { order: 1, description: "1. Was dragged second" },
    { order: 2, description: "2. Was dragged third" },
  ];
  assert.deepStrictEqual(byAuthoredOrder(items, i => i.description), [
    "3. Was dragged first",
    "1. Was dragged second",
    "2. Was dragged third",
  ]);
});

check("leaves an unnumbered tied list in the sequence it was stored in", () => {
  const items = [
    { order: 0, description: "Zebra check" },
    { order: 0, description: "Alpha check" },
    { order: 0, description: "Middle check" },
  ];
  assert.deepStrictEqual(byAuthoredOrder(items, i => i.description), [
    "Zebra check",
    "Alpha check",
    "Middle check",
  ]);
});

check("sorts numbered groups the same way", () => {
  const groups = [
    { order: 0, name: "10. Handover" },
    { order: 0, name: "2. Frame" },
    { order: 0, name: "1. Slab" },
    { order: 0, name: "ITP013 - Dilapidation" },
  ];
  assert.deepStrictEqual(byAuthoredOrder(groups, g => g.name), [
    "1. Slab",
    "2. Frame",
    "10. Handover",
    "ITP013 - Dilapidation",
  ]);
});

check("orders a real Lighthouse estimating checklist", () => {
  // Verbatim from the 02 - ESTIMATION checklist, in the sequence it rendered
  // in before the fix. Note the numbers are zero-padded, so a plain
  // alphabetical sort would have looked right by accident — what shipped was
  // no order at all, which is the signature of the missing tie-break.
  const items = [
    "02. All documents have been received from designer etc",
    "23. An Estimate Start Meeting has been conducted to review the basics of the plans",
    "14. Sweeping Review - Specifications, has been completed to get a general idea",
    "01. Set 60min Timer",
    "29. Mark Estimate Start Meeting as complete on E-notes sheets & Schedule",
  ].map(description => ({ order: 0, description }));

  assert.deepStrictEqual(
    byAuthoredOrder(items, i => i.description).map(d => d.slice(0, 3)),
    ["01.", "02.", "14.", "23.", "29."],
  );
});

check("reads the group and checklist names that carry them", () => {
  assert.strictEqual(leadingSequenceNumber("EST01 - ESTIMATE START MEETING"), 1);
  assert.strictEqual(leadingSequenceNumber("02 - ESTIMATION"), 2);
});

console.log(`\n${passed} checks passed`);

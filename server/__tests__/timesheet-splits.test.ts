/**
 * One rate per timesheet — shared/timesheetSplits.ts.
 *
 * Run: npx tsx server/__tests__/timesheet-splits.test.ts
 */
import assert from "node:assert";
import { isRealSplit, normalisedSplit, splitNeedsNormalising } from "../../shared/timesheetSplits";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

test("the 14 May case: a 7550 split rate on a $50 timesheet is re-stamped to $25", () => {
  const header = { duration: "0.50", hourlyRate: "50.00" };
  const split = { duration: "0.50", hourlyRate: "7550.00", total: "3775.00" };
  assert.strictEqual(splitNeedsNormalising(header, split, 1), true);
  assert.deepStrictEqual(normalisedSplit(header, split, 1), { duration: "0.50", hourlyRate: "50.00", total: "25.00" });
});

test("a single mirror row takes the timesheet's hours too", () => {
  const out = normalisedSplit({ duration: "1.00", hourlyRate: "73" }, { duration: "0.75", hourlyRate: "75", total: "56.25" }, 1);
  assert.deepStrictEqual(out, { duration: "1.00", hourlyRate: "73.00", total: "73.00" });
});

test("a real split keeps its own hours; dollars = hours × the timesheet rate", () => {
  const header = { duration: "8.50", hourlyRate: "0.00" }; // subbie: $0
  assert.deepStrictEqual(
    normalisedSplit(header, { duration: "4.00", hourlyRate: "50.00", total: "200.00" }, 2),
    { duration: "4.00", hourlyRate: "0.00", total: "0.00" },
  );
  assert.deepStrictEqual(
    normalisedSplit({ duration: "3", hourlyRate: "60" }, { duration: "1.25", hourlyRate: "99", total: "1" }, 2),
    { duration: "1.25", hourlyRate: "60.00", total: "75.00" },
  );
});

test("an already-correct row needs nothing (string/number formatting ignored)", () => {
  assert.strictEqual(splitNeedsNormalising({ duration: 2, hourlyRate: "75" }, { duration: "2", hourlyRate: 75, total: "150.00" }, 1), false);
});

test("only two or more rows is a real split", () => {
  assert.strictEqual(isRealSplit(undefined), false);
  assert.strictEqual(isRealSplit([]), false);
  assert.strictEqual(isRealSplit([{}]), false);
  assert.strictEqual(isRealSplit([{}, {}]), true);
});

console.log(`\n${passed} passed`);

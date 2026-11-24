/**
 * Subcontractor PO lines: a split timesheet gets one line per cost-code split.
 *
 * Run: npx tsx server/__tests__/sub-po-lines.test.ts
 */
import assert from "node:assert/strict";
import { subPoLineParts } from "../../shared/subPoLines";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

check("no splits: one line, the timesheet's hours and code", () => {
  const out = subPoLineParts({ id: "t", duration: "8.00", costCodeId: "frame" }, []);
  assert.deepStrictEqual(out, [{ hours: 8, costCodeId: "frame", splitOf: null }]);
});

check("no code anywhere: one line with a null code", () => {
  const out = subPoLineParts({ id: "t", duration: "4", costCodeId: null }, []);
  assert.deepStrictEqual(out, [{ hours: 4, costCodeId: null, splitOf: null }]);
});

check("a single split row is the legacy mirror, not a split: timesheet wins", () => {
  const out = subPoLineParts({ id: "t", duration: "8.00", costCodeId: "frame" }, [{ costCodeId: "roof", duration: "7.50" }]);
  assert.deepStrictEqual(out, [{ hours: 8, costCodeId: "frame", splitOf: null }]);
});

check("a real split: one line per split, its own hours and code, header code ignored", () => {
  const out = subPoLineParts(
    { id: "t", duration: "8.00", costCodeId: "frame" },
    [{ costCodeId: "frame", duration: "5.00" }, { costCodeId: "roof", duration: "3.00" }],
  );
  assert.deepStrictEqual(out, [
    { hours: 5, costCodeId: "frame", splitOf: { index: 1, count: 2 } },
    { hours: 3, costCodeId: "roof", splitOf: { index: 2, count: 2 } },
  ]);
  assert.strictEqual(out.reduce((s, p) => s + p.hours, 0), 8);
});

check("$0 subbie splits still split by HOURS (price comes from the profile rate)", () => {
  const out = subPoLineParts(
    { id: "t", duration: "6", costCodeId: null },
    [{ costCodeId: "a", duration: "2.5" }, { costCodeId: "b", duration: "3.5" }],
  );
  assert.deepStrictEqual(out.map((p) => [p.costCodeId, p.hours]), [["a", 2.5], ["b", 3.5]]);
});

console.log(`\n${passed} passed`);

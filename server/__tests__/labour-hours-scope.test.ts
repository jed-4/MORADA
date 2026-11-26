/**
 * Labour hours by cost category. Run with:
 *   npx tsx server/__tests__/labour-hours-scope.test.ts
 */
import assert from "node:assert/strict";
import { filterLabourHoursRows, labourHoursCategoryScope } from "@shared/labourHoursScope";

let passed = 0;
let failed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
};

const row = (o: Record<string, unknown>) => ({ key: "financial.budget_labour", allowedActions: ["view"], ...o });

console.log("labour hours scope");

test("older rows saved 'own' (or no scope) see every cost code", () => {
  assert.equal(labourHoursCategoryScope([row({ viewScope: "own" })]), null);
  assert.equal(labourHoursCategoryScope([row({ viewScope: null })]), null);
  assert.equal(labourHoursCategoryScope([row({ viewScope: "all" })]), null);
});

test("cost_categories scope returns the category ids", () => {
  assert.deepEqual(labourHoursCategoryScope([row({ viewScope: "cost_categories", viewableRoleIds: ["onsite", 7] })]), ["onsite"]);
});

test("ticked none = limited to nothing, not everything", () => {
  assert.deepEqual(labourHoursCategoryScope([row({ viewScope: "cost_categories", viewableRoleIds: [] })]), []);
});

test("other keys' scopes and a grant without view don't count", () => {
  assert.equal(labourHoursCategoryScope([{ key: "timesheets.manage", allowedActions: ["view"], viewScope: "cost_categories", viewableRoleIds: ["x"] }]), null);
  assert.equal(labourHoursCategoryScope([row({ allowedActions: [], viewScope: "cost_categories", viewableRoleIds: ["x"] })]), null);
});

test("rows filter by their cost code's category; uncategorised and unknown codes hidden", () => {
  const rows = [{ costCodeId: "a" }, { costCodeId: "b" }, { costCodeId: "c" }, { costCodeId: "gone" }, { costCodeId: null }];
  const cats = new Map<string, string | null>([["a", "onsite"], ["b", "mgmt"], ["c", null]]);
  assert.deepEqual(filterLabourHoursRows(rows, ["onsite"], cats), [{ costCodeId: "a" }]);
  assert.equal(filterLabourHoursRows(rows, null, cats).length, 5);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

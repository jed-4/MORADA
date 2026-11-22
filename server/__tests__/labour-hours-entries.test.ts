/**
 * Labour Hours drill-down attribution must match recalculateLabourHoursBudget:
 * splits → their own code; otherwise the timesheet's code, then its work
 * item's code; pending = submitted; subbie hours count.
 */
import assert from "node:assert/strict";
import { pickLabourHoursEntries } from "@shared/labourHoursEntries";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const A = "cc-a";
const B = "cc-b";
const ts = (o: Partial<Parameters<typeof pickLabourHoursEntries>[0]["timesheets"][number]>) => ({
  id: "t", userId: "u", date: "2026-11-02", duration: "8", status: "approved",
  poStatus: null, description: null, costCodeId: null, workItemId: null, ...o,
});

check("direct cost code, work-item fallback, and status filter", () => {
  const out = pickLabourHoursEntries({
    timesheets: [
      ts({ id: "direct", costCodeId: A }),
      ts({ id: "viaItem", workItemId: "w1" }),
      ts({ id: "otherCode", costCodeId: B }),
      ts({ id: "pending", costCodeId: A, status: "submitted" }),
      ts({ id: "subbie", costCodeId: A, poStatus: "on_po", duration: "8" }),
    ],
    splits: [],
    workItemCostCode: new Map([["w1", A]]),
    costCodeId: A,
    status: "approved",
  });
  assert.deepStrictEqual(out.map((e) => e.timesheetId).sort(), ["direct", "subbie", "viaItem"]);
});

check("split timesheets contribute only their split's hours; header code ignored", () => {
  const out = pickLabourHoursEntries({
    timesheets: [ts({ id: "s", costCodeId: B, duration: "8" })],
    splits: [
      { timesheetId: "s", costCodeId: A, duration: "3" },
      { timesheetId: "s", costCodeId: B, duration: "5" },
    ],
    workItemCostCode: new Map(),
    costCodeId: A,
    status: "approved",
  });
  assert.deepStrictEqual(out.map((e) => [e.timesheetId, e.hours, e.isSplit]), [["s", 3, true]]);
});

check("pending = submitted only", () => {
  const out = pickLabourHoursEntries({
    timesheets: [
      ts({ id: "sub", costCodeId: A, status: "submitted" }),
      ts({ id: "draft", costCodeId: A, status: "draft" }),
    ],
    splits: [],
    workItemCostCode: new Map(),
    costCodeId: A,
    status: "submitted",
  });
  assert.deepStrictEqual(out.map((e) => e.timesheetId), ["sub"]);
});

console.log(`\n${passed} passed`);

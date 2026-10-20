/**
 * The timesheets toggle was one switch over four different events, so turning
 * off "somebody submitted a timesheet" — which every approver gets, for every
 * submission — also turned off "your timesheet was approved".
 *
 * These pin the split, and that a preference saved under the old combined key
 * still silences both halves rather than quietly switching them back on.
 */
import assert from "node:assert/strict";
import {
  PUSH_NOTIFICATION_GROUPS,
  getPushGroupForType,
  expandGroupKeys,
  shouldEmailForType,
} from "../../../../shared/notificationGroups";

const keys = PUSH_NOTIFICATION_GROUPS.map((g) => g.key as string);
assert.ok(keys.includes("timesheetsToApprove"));
assert.ok(keys.includes("timesheetsMine"));
assert.ok(!keys.includes("timesheets"), "the combined group is gone");

// The flood is on its own.
assert.equal(getPushGroupForType("timesheet_submitted"), "timesheetsToApprove");

// What happens to your own timesheet is not.
assert.equal(getPushGroupForType("timesheet_approved"), "timesheetsMine");
assert.equal(getPushGroupForType("timesheet_rejected"), "timesheetsMine");
assert.equal(getPushGroupForType("timesheet_overtime"), "timesheetsMine");

// So muting submissions leaves your own alone — the whole point.
const muted = expandGroupKeys(["timesheetsToApprove"]);
assert.ok(muted.includes("timesheetsToApprove"));
assert.ok(!muted.includes("timesheetsMine"));

// Anyone who muted the OLD combined key wanted both silent, and still gets that.
const legacy = expandGroupKeys(["timesheets"]);
assert.ok(legacy.includes("timesheetsToApprove"));
assert.ok(legacy.includes("timesheetsMine"));

// A legacy email opt-in keeps covering both halves too.
assert.equal(shouldEmailForType("timesheet_approved", ["timesheets"]), true);
assert.equal(shouldEmailForType("timesheet_submitted", ["timesheets"]), true);
// And an opt-in to one half does not leak to the other.
assert.equal(shouldEmailForType("timesheet_approved", ["timesheetsToApprove"]), false);

// Nothing else moved.
assert.equal(getPushGroupForType("mention"), "messages");
assert.equal(getPushGroupForType("not_a_real_type"), null);

console.log("notification groups: 15 passed, 0 failed");

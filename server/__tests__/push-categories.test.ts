/**
 * Push notification categories (#43): which action buttons the phone shows.
 *
 * Run with:  npx tsx server/__tests__/push-categories.test.ts
 */
import assert from "node:assert";
import { pushCategoryFor, channelIdFromLink } from "../../shared/pushCategories";

assert.equal(pushCategoryFor("timesheet_submitted", "timesheet"), "timesheet_approval");
assert.equal(pushCategoryFor("task_assigned", "task"), "task");
assert.equal(pushCategoryFor("task_mentioned", "task"), "task");
assert.equal(pushCategoryFor("message_new", "message"), "message");
assert.equal(pushCategoryFor("mention", "message"), "message");

// No buttons where the action wouldn't make sense or the id isn't there.
assert.equal(pushCategoryFor("timesheet_approved", "timesheet"), undefined);
assert.equal(pushCategoryFor("timesheet_submitted", null), undefined);
assert.equal(pushCategoryFor("task_completed", "task"), undefined);
assert.equal(pushCategoryFor("mention", "note"), undefined);
assert.equal(pushCategoryFor(undefined, undefined), undefined);

assert.equal(channelIdFromLink("/messages?channel=abc-123"), "abc-123");
assert.equal(channelIdFromLink("/messages?x=1&channel=abc#m"), "abc");
assert.equal(channelIdFromLink("/messages"), null);

console.log("push-categories: all assertions passed");

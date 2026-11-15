/**
 * When a variation chase email falls due, and what it says. These are the
 * rules that decide whether a client gets emailed, so they're pinned.
 * Run: npx tsx server/__tests__/variation-reminders.test.ts
 */
import assert from "node:assert";
import {
  variationReminderDueAt,
  renderVariationReminderText,
  describeVariationTrigger,
  DEFAULT_VARIATION_REMINDER_TEMPLATES,
  pickVariationReminder,
} from "../../shared/variationReminders";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok   ${name}`); } catch (e: any) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
const DAY = 86400000;
const sent = new Date("2026-11-01T00:00:00Z");
const deadline = new Date("2026-11-20T00:00:00Z");

check("after_send counts days from when it was sent", () => {
  const due = variationReminderDueAt({ trigger: "after_send", offsetDays: 3 }, { sentAt: sent });
  assert.strictEqual(due?.getTime(), sent.getTime() + 3 * DAY);
});
check("never due before the variation has been sent", () => {
  assert.strictEqual(variationReminderDueAt({ trigger: "after_send", offsetDays: 3 }, { sentAt: null }), null);
  assert.strictEqual(variationReminderDueAt({ trigger: "before_deadline", offsetDays: 2 }, { sentAt: null, approvalDeadline: deadline }), null);
});
check("before_deadline counts back from the approval deadline", () => {
  const due = variationReminderDueAt({ trigger: "before_deadline", offsetDays: 2 }, { sentAt: sent, approvalDeadline: deadline });
  assert.strictEqual(due?.getTime(), deadline.getTime() - 2 * DAY);
});
check("before_deadline with no deadline never fires (rather than firing at once)", () => {
  assert.strictEqual(variationReminderDueAt({ trigger: "before_deadline", offsetDays: 2 }, { sentAt: sent, approvalDeadline: null }), null);
});
check("placeholders fill in; unknown ones are left visible", () => {
  const out = renderVariationReminderText("Hi {{client_name}}, {{variation_number}} {{oops}}", {
    variation: { variationNumber: "VO-7", name: "Stone tops" }, clientName: "Sam",
  });
  assert.strictEqual(out, "Hi Sam, VO-7 {{oops}}");
});
check("no client name reads 'there', not a blank", () => {
  assert.strictEqual(renderVariationReminderText("Hi {{client_name}}", { variation: {} }), "Hi there");
});
check("defaults: 3 and 7 days after sending, 2 before the deadline", () => {
  assert.deepStrictEqual(
    DEFAULT_VARIATION_REMINDER_TEMPLATES.map((t) => [t.trigger, t.offsetDays]),
    [["after_send", 3], ["after_send", 7], ["before_deadline", 2]],
  );
});
check("descriptions read naturally", () => {
  assert.strictEqual(describeVariationTrigger({ trigger: "after_send", offsetDays: 1 }), "1 day after sending");
  assert.strictEqual(describeVariationTrigger({ trigger: "before_deadline", offsetDays: 0 }), "On the approval deadline");
});

const steps = [
  { id: "a", trigger: "after_send", offsetDays: 3 },
  { id: "b", trigger: "after_send", offsetDays: 7 },
  { id: "c", trigger: "before_deadline", offsetDays: 2 },
];
check("switched on weeks late: ONE email (the latest due), the earlier ones skipped", () => {
  const r = pickVariationReminder(steps, new Set(), { sentAt: sent, approvalDeadline: null }, new Date(sent.getTime() + 30 * DAY));
  assert.strictEqual(r.send?.id, "b");
  assert.deepStrictEqual(r.skip.map((t) => t.id), ["a"]);
});
check("nothing due yet: nothing sent", () => {
  const r = pickVariationReminder(steps, new Set(), { sentAt: sent, approvalDeadline: deadline }, new Date(sent.getTime() + 1 * DAY));
  assert.strictEqual(r.send, null);
});
check("already-sent steps are never picked again", () => {
  const r = pickVariationReminder(steps, new Set(["a", "b"]), { sentAt: sent, approvalDeadline: null }, new Date(sent.getTime() + 30 * DAY));
  assert.strictEqual(r.send, null);
});
check("normal cadence: day 4 sends the 3-day step only", () => {
  const r = pickVariationReminder(steps, new Set(), { sentAt: sent, approvalDeadline: deadline }, new Date(sent.getTime() + 4 * DAY));
  assert.strictEqual(r.send?.id, "a");
  assert.deepStrictEqual(r.skip, []);
});
check("deadline already passed: the before-deadline step is stale and not sent", () => {
  const r = pickVariationReminder([steps[2]], new Set(), { sentAt: sent, approvalDeadline: deadline }, new Date(deadline.getTime() + DAY));
  assert.strictEqual(r.send, null);
});
check("two days before the deadline: the deadline step goes", () => {
  const r = pickVariationReminder(steps, new Set(["a", "b"]), { sentAt: sent, approvalDeadline: deadline }, new Date(deadline.getTime() - 1 * DAY));
  assert.strictEqual(r.send?.id, "c");
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall passing");

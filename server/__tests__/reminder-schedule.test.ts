/**
 * When a reminder is due, and who it goes to.
 *
 * The processor read four fields off its rows that are not columns —
 * `lastTriggeredAt`, `deliverySettings`, `message` and `recurrencePattern`.
 * Drizzle drops unknown keys silently instead of erroring, so nothing ever
 * failed loudly; the feature just did the wrong thing quietly:
 *
 *   - business reminders went to EVERY user in the company, ignoring the
 *     targeting the admin chose
 *   - email went out regardless of the email toggle (which defaults to OFF),
 *     because `deliverySettings.email !== false` is true when the field is
 *     undefined
 *   - the body was always empty (the column is `description`, not `message`)
 *   - duplicate suppression never suppressed anything
 *   - personal reminders never recurred: every one was completed after one fire
 *   - "monthly" matched nothing and never fired at all
 *
 * And the schedule was compared against the SERVER's clock, so on a UTC host a
 * 16:30 Australian reminder fired at 03:30 the next morning.
 *
 * No DB, no clock of its own — the decisions live in shared/reminderSchedule.ts
 * so they can be tested directly.
 *
 * Run with:  npx tsx server/__tests__/reminder-schedule.test.ts
 */

import assert from "node:assert";
import {
  zonedNow,
  parseScheduleTime,
  matchesScheduleDay,
  businessReminderDue,
  resolveBusinessRecipients,
  nextPersonalDueAt,
} from "@shared/reminderSchedule";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const SYD = "Australia/Sydney";

console.log("\nReminder scheduling\n");

// ─── Timezone: the 11-hour bug ───────────────────────────────────────────────

test("the schedule is read in the company's timezone, not the server's", () => {
  // 2026-10-06T06:30:00Z is 17:30 in Sydney (UTC+11 in October).
  const at = new Date("2026-10-06T06:30:00Z");
  const sydney = zonedNow(at, SYD);
  const utc = zonedNow(at, "UTC");

  assert.strictEqual(sydney.minutes, 17 * 60 + 30, "Sydney sees 17:30");
  assert.strictEqual(utc.minutes, 6 * 60 + 30, "UTC sees 06:30");
  assert.strictEqual(sydney.dateKey, "2026-10-06");

  // A 16:30 daily reminder is due in Sydney and not yet due in UTC.
  const daily = { scheduleType: "daily", scheduleTime: "16:30" };
  assert.strictEqual(businessReminderDue(daily, sydney, false), true);
  assert.strictEqual(businessReminderDue(daily, utc, false), false);
});

test("a late-evening local time can fall on the next UTC day", () => {
  // 2026-10-06T13:00:00Z is midnight on the 7th in Sydney.
  const z = zonedNow(new Date("2026-10-06T13:00:00Z"), SYD);
  assert.strictEqual(z.dateKey, "2026-10-07");
  assert.strictEqual(z.minutes, 0, "midnight is 0 minutes, not 1440");
});

// ─── Due-ness ────────────────────────────────────────────────────────────────

// NB: 05:00Z is 16:00 the same day in Sydney. Fixtures deliberately avoid
// late-evening UTC times, which land on the NEXT Sydney day — the trap this
// module exists to handle, and one these tests tripped over first time.
const at = (iso: string) => zonedNow(new Date(iso), SYD);

test("fires at its time, and keeps being due later the same day", () => {
  const daily = { scheduleType: "daily", scheduleTime: "16:30" };
  assert.strictEqual(businessReminderDue(daily, at("2026-10-06T05:00:00Z"), false), false, "16:00 — not yet");
  assert.strictEqual(businessReminderDue(daily, at("2026-10-06T05:30:00Z"), false), true, "16:30 — due");
  // The old code demanded an exact HH:MM match, so a restart or a slow tick
  // lost that day's reminder entirely. Catching up is the point.
  assert.strictEqual(businessReminderDue(daily, at("2026-10-06T08:00:00Z"), false), true, "19:00 — caught up");
});

test("once a day, no matter how many ticks", () => {
  const daily = { scheduleType: "daily", scheduleTime: "16:30" };
  assert.strictEqual(businessReminderDue(daily, at("2026-10-06T06:00:00Z"), true), false);
});

test("weekly fires only on its days", () => {
  const weekly = { scheduleType: "weekly", scheduleTime: "09:00", scheduleDays: [1, 3, 5] };
  // 2026-10-06 is a Tuesday in Sydney; the 7th is a Wednesday.
  assert.strictEqual(at("2026-10-06T00:00:00Z").dayOfWeek, 2, "Tuesday");
  assert.strictEqual(businessReminderDue(weekly, at("2026-10-06T05:00:00Z"), false), false, "Tuesday — not listed");
  assert.strictEqual(businessReminderDue(weekly, at("2026-10-07T05:00:00Z"), false), true, "Wednesday — listed");
});

test("monthly fires — it used to match nothing at all", () => {
  const monthly = { scheduleType: "monthly", scheduleTime: "09:00", scheduleDays: [15] };
  assert.strictEqual(businessReminderDue(monthly, at("2026-10-15T05:00:00Z"), false), true);
  assert.strictEqual(businessReminderDue(monthly, at("2026-10-16T05:00:00Z"), false), false);
});

test("a 31st reminder still fires in a short month", () => {
  // Otherwise it would silently skip February, April, June, September, November.
  const monthly = { scheduleType: "monthly", scheduleTime: "09:00", scheduleDays: [31] };
  assert.strictEqual(matchesScheduleDay(monthly, at("2026-02-28T05:00:00Z")), true, "28 Feb is the last day");
  assert.strictEqual(matchesScheduleDay(monthly, at("2026-02-27T05:00:00Z")), false);
  assert.strictEqual(matchesScheduleDay(monthly, at("2026-03-31T05:00:00Z")), true);
});

test("an unusable schedule time never fires rather than firing at midnight", () => {
  assert.strictEqual(parseScheduleTime("16:30"), 990);
  for (const bad of ["", null, undefined, "nonsense", "25:00", "16:99"]) {
    assert.strictEqual(parseScheduleTime(bad as any), null, `${bad} must not parse`);
    assert.strictEqual(
      businessReminderDue({ scheduleType: "daily", scheduleTime: bad as any }, at("2026-10-06T05:00:00Z"), false),
      false,
    );
  }
});

// ─── Recipients ──────────────────────────────────────────────────────────────

const users = [
  { id: "u1", roleId: "r-field" },
  { id: "u2", roleId: "r-office" },
  { id: "u3", roleId: "r-field" },
  { id: "u4", roleId: null },
];

test("specific users means those users, not everyone", () => {
  const { recipients } = resolveBusinessRecipients(
    { targetUsers: "specific", specificUserIds: ["u2", "u4"] },
    users,
  );
  assert.deepStrictEqual(recipients.map(u => u.id), ["u2", "u4"]);
});

test("roles means that role, not everyone", () => {
  const { recipients } = resolveBusinessRecipients(
    { targetUsers: "roles", targetRoleIds: ["r-field"] },
    users,
  );
  assert.deepStrictEqual(recipients.map(u => u.id), ["u1", "u3"]);
});

test("all means everyone", () => {
  const { recipients, unresolvedTarget } = resolveBusinessRecipients({ targetUsers: "all" }, users);
  assert.strictEqual(recipients.length, 4);
  assert.strictEqual(unresolvedTarget, null);
});

test("an empty selection reaches nobody, instead of falling back to everyone", () => {
  // The failure that mattered: targeting two people and notifying the business.
  const { recipients } = resolveBusinessRecipients(
    { targetUsers: "specific", specificUserIds: [] },
    users,
  );
  assert.strictEqual(recipients.length, 0);
});

test("field/office cannot be resolved and say so", () => {
  // Nothing on a user or a role records field vs office, so these keep their
  // old everyone behaviour but are reported rather than passing silently.
  for (const t of ["field", "office"]) {
    const { recipients, unresolvedTarget } = resolveBusinessRecipients({ targetUsers: t }, users);
    assert.strictEqual(recipients.length, 4);
    assert.strictEqual(unresolvedTarget, t);
  }
});

// ─── Personal recurrence ─────────────────────────────────────────────────────

test("a one-time reminder does not recur", () => {
  assert.strictEqual(
    nextPersonalDueAt({ reminderType: "one_time" }, new Date("2026-10-06T05:30:00Z"), SYD),
    null,
  );
});

test("a daily reminder comes back tomorrow — it used to be completed after one fire", () => {
  const next = nextPersonalDueAt({ reminderType: "recurring", schedulePattern: "daily" }, new Date("2026-10-06T05:30:00Z"), SYD);
  assert.ok(next);
  assert.strictEqual(next!.toISOString(), "2026-10-07T05:30:00.000Z");
});

test("weekdays skips the weekend", () => {
  // Friday 2026-10-09 in Sydney -> next weekday is Monday the 12th.
  const friday = new Date("2026-10-09T05:30:00Z");
  assert.strictEqual(zonedNow(friday, SYD).dayOfWeek, 5, "Friday");
  const next = nextPersonalDueAt({ reminderType: "recurring", schedulePattern: "weekdays" }, friday, SYD);
  assert.strictEqual(zonedNow(next!, SYD).dayOfWeek, 1, "Monday");
  assert.strictEqual(next!.toISOString(), "2026-10-12T05:30:00.000Z");
});

test("custom days pick the next listed day", () => {
  // Tuesday -> next listed day is Friday.
  const tuesday = new Date("2026-10-06T05:30:00Z");
  const next = nextPersonalDueAt(
    { reminderType: "recurring", schedulePattern: "custom", scheduleDays: [1, 5] },
    tuesday,
    SYD,
  );
  assert.strictEqual(zonedNow(next!, SYD).dayOfWeek, 5, "Friday");
});

test("an unsatisfiable pattern terminates instead of spinning", () => {
  const next = nextPersonalDueAt(
    { reminderType: "recurring", schedulePattern: "custom", scheduleDays: [99] },
    new Date("2026-10-06T05:30:00Z"),
    SYD,
  );
  assert.strictEqual(next, null);
});

console.log(`\n${passed} passed\n`);

/**
 * Schedule dates are days stored as UTC midnight — shared/scheduleDates.ts.
 *
 * Run with:  TZ=Australia/Sydney NODE_ENV=test npx tsx server/__tests__/schedule-dates.test.ts
 * (The timezone is the point: this bug only appears east of UTC.)
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { scheduleDayUTC, scheduleDayString, isScheduleDayUTC } from "../../shared/scheduleDates";

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

console.log(`\nschedule-dates (TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}, offset ${-new Date().getTimezoneOffset() / 60}h)`);

check("a Date from day arithmetic keeps its day, whatever the server's timezone", () => {
  // Exactly what snapWD/addWD produce in the cascade.
  const local = new Date(2026, 10, 9); // 9 Nov 2026, local midnight
  assert.strictEqual(scheduleDayUTC(local).toISOString(), "2026-11-09T00:00:00.000Z");
});

check("a date-only string is taken at face value", () => {
  assert.strictEqual(scheduleDayUTC("2026-11-09").toISOString(), "2026-11-09T00:00:00.000Z");
  assert.strictEqual(scheduleDayString("2026-11-09"), "2026-11-09");
});

check("an already-correct stored value is unchanged", () => {
  assert.strictEqual(scheduleDayUTC("2026-11-09T00:00:00.000Z").toISOString(), "2026-11-09T00:00:00.000Z");
  assert.ok(isScheduleDayUTC("2026-11-09T00:00:00.000Z"));
});

check("the 13:00Z rows this bug wrote are recognisable", () => {
  // Local midnight on 9 Nov in AEDT, which the Gantt drew as the 8th.
  assert.ok(!isScheduleDayUTC("2026-11-08T13:00:00.000Z"));
});

check("late-evening times keep the day they are already read as", () => {
  // Legacy rows carry odd times; the UTC day is what every reader already uses,
  // so normalising must not move them to a different bar position.
  assert.strictEqual(scheduleDayUTC("2026-11-09T09:30:00.000Z").toISOString(), "2026-11-09T00:00:00.000Z");
  assert.strictEqual(scheduleDayUTC("2026-11-09T23:59:00.000Z").toISOString(), "2026-11-09T00:00:00.000Z");
});

check("a day either side of a DST change still comes out as itself", () => {
  // AEDT starts 4 Oct 2026 in Sydney — the classic off-by-one window.
  for (const [y, m, d, iso] of [
    [2026, 9, 3, "2026-10-03T00:00:00.000Z"],
    [2026, 9, 4, "2026-10-04T00:00:00.000Z"],
    [2026, 9, 5, "2026-10-05T00:00:00.000Z"],
    [2027, 3, 4, "2027-04-04T00:00:00.000Z"],
  ] as Array<[number, number, number, string]>) {
    assert.strictEqual(scheduleDayUTC(new Date(y, m, d)).toISOString(), iso);
  }
});

check("rubbish in is rubbish out, not a wrong date", () => {
  assert.ok(Number.isNaN(scheduleDayUTC(new Date("nope")).getTime()));
  assert.ok(!isScheduleDayUTC(null));
  assert.ok(!isScheduleDayUTC(undefined));
});

console.log(`\nschedule-dates: ${passed} checks passed\n`);

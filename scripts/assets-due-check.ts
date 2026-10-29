/**
 * Pins the asset register's "what's due" maths (shared/assets.ts).
 *
 *   npx tsx scripts/assets-due-check.ts
 *
 * Pure, no database. Exits non-zero on the first wrong answer.
 */
import assert from "node:assert/strict";
import {
  addDaysKey,
  addMonthsKey,
  assetDueSummary,
  complianceDue,
  daysBetween,
  isHeavyVehicle,
  normaliseRego,
  serviceDue,
  todayKey,
} from "../shared/assets.ts";

const today = "2026-10-26";
let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

check("addMonthsKey clamps to the month's last day", () => {
  assert.equal(addMonthsKey("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsKey("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonthsKey("2026-08-15", 6), "2027-02-15");
  assert.equal(addMonthsKey("2026-12-01", 12), "2027-12-01");
});

check("addDaysKey crosses month and year ends", () => {
  assert.equal(addDaysKey("2026-10-26", 30), "2026-11-25");
  assert.equal(addDaysKey("2026-12-20", 15), "2027-01-04");
  assert.equal(addDaysKey("2026-03-01", -1), "2026-02-28");
});

check("daysBetween is whole days across DST", () => {
  // NSW daylight saving starts 4 Oct 2026; UTC keys must not lose an hour.
  assert.equal(daysBetween("2026-10-03", "2026-10-05"), 2);
  assert.equal(daysBetween("2026-10-26", "2026-10-20"), -6);
});

check("todayKey uses Sydney, not the server clock", () => {
  // 14:00 UTC on the 26th is 01:00 on the 27th in Sydney (AEDT, +11).
  assert.equal(todayKey("Australia/Sydney", new Date("2026-10-26T14:00:00Z")), "2026-10-27");
});

check("compliance: overdue / due soon / ok boundaries", () => {
  assert.deepEqual(complianceDue({ expiryDate: "2026-10-25" }, today), { state: "overdue", daysLeft: -1 });
  assert.deepEqual(complianceDue({ expiryDate: "2026-10-26" }, today), { state: "due_soon", daysLeft: 0 });
  assert.deepEqual(complianceDue({ expiryDate: "2026-11-25" }, today), { state: "due_soon", daysLeft: 30 });
  assert.deepEqual(complianceDue({ expiryDate: "2026-11-26" }, today), { state: "ok", daysLeft: 31 });
});

const ute = { meterType: "km", currentMeter: 58_200, purchaseDate: "2024-03-01" };

check("service: km falls due before the date", () => {
  const due = serviceDue({ everyMeter: 10_000, everyMonths: 12, lastDoneMeter: 50_000, lastDoneDate: "2026-06-01" }, ute, today);
  assert.equal(due.dueMeter, 60_000);
  assert.equal(due.meterLeft, 1_800);
  assert.equal(due.dueDate, "2027-06-01");
  assert.equal(due.state, "ok"); // 1,800 km left > 1,000 km due-soon window
});

check("service: whichever comes first — date overdue wins over km ok", () => {
  const due = serviceDue({ everyMeter: 10_000, everyMonths: 6, lastDoneMeter: 55_000, lastDoneDate: "2026-03-01" }, ute, today);
  assert.equal(due.dueDate, "2026-09-01");
  assert.equal(due.state, "overdue");
});

check("service: label follows the side that set the state (the 1,800 km bug)", () => {
  // Date overdue, km fine: the chip must say overdue by date, not "1,800 km to go".
  const byDate = serviceDue({ everyMeter: 10_000, everyMonths: 6, lastDoneMeter: 50_000, lastDoneDate: "2026-03-01" }, ute, today);
  assert.equal(byDate.state, "overdue");
  assert.equal(byDate.drivenBy, "date");
  // Km overdue, date fine.
  const byMeter = serviceDue({ everyMeter: 5_000, everyMonths: 12, lastDoneMeter: 50_000, lastDoneDate: "2026-06-01" }, ute, today);
  assert.equal(byMeter.state, "overdue");
  assert.equal(byMeter.drivenBy, "meter");
  // Both ok: the date speaks.
  const both = serviceDue({ everyMeter: 10_000, everyMonths: 12, lastDoneMeter: 50_000, lastDoneDate: "2026-06-01" }, ute, today);
  assert.equal(both.drivenBy, "date");
});

check("service: km overdue", () => {
  const due = serviceDue({ everyMeter: 5_000, everyMonths: null, lastDoneMeter: 50_000, lastDoneDate: null }, ute, today);
  assert.equal(due.meterLeft, -3_200);
  assert.equal(due.state, "overdue");
  assert.equal(due.dueDate, null);
});

check("service: never done counts from purchase date", () => {
  const due = serviceDue({ everyMeter: null, everyMonths: 6, lastDoneMeter: null, lastDoneDate: null }, ute, today);
  assert.equal(due.dueDate, "2024-09-01");
  assert.equal(due.state, "overdue");
});

check("service: nothing to count from is unknown, not ok", () => {
  const due = serviceDue(
    { everyMeter: null, everyMonths: 6, lastDoneMeter: null, lastDoneDate: null },
    { meterType: "km", currentMeter: null, purchaseDate: null },
    today,
  );
  assert.equal(due.unknown, true);
});

check("service: a tool with no meter ignores the meter interval", () => {
  const due = serviceDue(
    { everyMeter: 100, everyMonths: 12, lastDoneMeter: 0, lastDoneDate: "2026-01-10" },
    { meterType: "none", currentMeter: null },
    today,
  );
  assert.equal(due.dueMeter, null);
  assert.equal(due.dueDate, "2027-01-10");
  assert.equal(due.state, "ok");
});

check("summary: picks the most pressing item and counts", () => {
  const s = assetDueSummary(
    ute,
    [
      { kind: "rego", label: null, expiryDate: "2026-11-10" }, // due soon, 15 days
      { kind: "insurance", label: null, expiryDate: "2027-05-01" }, // ok
    ],
    [{ label: "Minor service", everyMeter: 10_000, everyMonths: 6, lastDoneMeter: 55_000, lastDoneDate: "2026-03-01" }], // overdue
    today,
  );
  assert.equal(s.state, "overdue");
  assert.equal(s.overdue, 1);
  assert.equal(s.dueSoon, 1);
  assert.equal(s.next?.label, "Minor service");
  assert.equal(s.next?.drivenBy, "date");
});

check("summary: soonest date wins within the same state", () => {
  const s = assetDueSummary(
    ute,
    [
      { kind: "insurance", label: null, expiryDate: "2026-11-20" },
      { kind: "rego", label: null, expiryDate: "2026-11-05" },
    ],
    [],
    today,
  );
  assert.equal(s.next?.label, "Registration");
});

check("heavy vehicle threshold is over 4.5t, not at", () => {
  assert.equal(isHeavyVehicle(4500), false);
  assert.equal(isHeavyVehicle(4501), true);
  assert.equal(isHeavyVehicle(null), false);
});

check("rego is upper-cased without spaces", () => {
  assert.equal(normaliseRego(" ab 12 cd "), "AB12CD");
  assert.equal(normaliseRego("  "), null);
});

console.log(`assets-due-check: ok (${n} checks)`);

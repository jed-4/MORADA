/**
 * Pins the vehicle recharge rules (shared/assetRecharge.ts).
 *
 *   npx tsx scripts/asset-recharge-check.ts
 */
import assert from "node:assert/strict";
import { computeRecharges, eachDay, splitCents, driverOn, type RechargeAssignment } from "../shared/assetRecharge.ts";

let n = 0;
const check = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};

const ute = { id: "ute", dayRateCents: 9500 };
const tipper = { id: "tipper", dayRateCents: 25000 };
const jed = "jed", kye = "kye";
const assigned: RechargeAssignment[] = [{ assetId: "ute", date: "2026-10-01", userId: jed }];

check("splitCents adds up exactly", () => {
  assert.deepEqual(splitCents(9500, [1, 1, 1]), [3167, 3167, 3166]);
  assert.deepEqual(splitCents(9500, [6, 2]), [7125, 2375]);
  assert.deepEqual(splitCents(100, [0, 0]), [0, 0]);
});

check("eachDay skips weekends unless asked", () => {
  assert.deepEqual(eachDay("2026-10-30", "2026-11-02", false), ["2026-10-30", "2026-11-02"]);
  assert.equal(eachDay("2026-10-30", "2026-11-02", true).length, 4);
});

check("a driver day on one job charges the full day rate", () => {
  const c = computeRecharges({ assets: [ute], assignments: assigned, bookings: [], timesheets: [{ userId: jed, projectId: "smith", date: "2026-10-20", hours: 7.5 }] });
  assert.deepEqual(c.map((x) => [x.projectId, x.cents, x.source]), [["smith", 9500, "timesheet"]]);
});

check("a day across two jobs is split by hours", () => {
  const c = computeRecharges({
    assets: [ute], assignments: assigned, bookings: [],
    timesheets: [
      { userId: jed, projectId: "smith", date: "2026-10-20", hours: 6 },
      { userId: jed, projectId: "jones", date: "2026-10-20", hours: 2 },
    ],
  });
  assert.deepEqual(c.map((x) => [x.projectId, x.cents]), [["jones", 2375], ["smith", 7125]]);
});

check("business hours (no job) never charge, and don't dilute the job share", () => {
  const c = computeRecharges({
    assets: [ute], assignments: assigned, bookings: [],
    timesheets: [
      { userId: jed, projectId: null, date: "2026-10-20", hours: 4 },
      { userId: jed, projectId: "smith", date: "2026-10-20", hours: 4 },
      { userId: jed, projectId: null, date: "2026-10-21", hours: 8 },
    ],
  });
  assert.deepEqual(c.map((x) => [x.date, x.projectId, x.cents]), [["2026-10-20", "smith", 9500]]);
});

check("only the driver ON THAT DAY counts — reassigning doesn't rewrite history", () => {
  const history: RechargeAssignment[] = [
    { assetId: "ute", date: "2026-10-01", userId: jed },
    { assetId: "ute", date: "2026-10-15", userId: kye },
  ];
  assert.equal(driverOn(history, "2026-10-14"), jed);
  assert.equal(driverOn(history, "2026-10-15"), kye);
  const c = computeRecharges({
    assets: [ute], assignments: history, bookings: [],
    timesheets: [
      { userId: jed, projectId: "smith", date: "2026-10-10", hours: 8 },
      { userId: jed, projectId: "smith", date: "2026-10-20", hours: 8 }, // Jed no longer has it
      { userId: kye, projectId: "jones", date: "2026-10-20", hours: 8 },
    ],
  });
  assert.deepEqual(c.map((x) => [x.date, x.projectId]), [["2026-10-10", "smith"], ["2026-10-20", "jones"]]);
});

check("a booking wins over the driver's timesheets that day", () => {
  const c = computeRecharges({
    assets: [ute], assignments: assigned,
    bookings: [{ assetId: "ute", projectId: "jones", fromDate: "2026-10-20", toDate: "2026-10-20", includeWeekends: false }],
    timesheets: [{ userId: jed, projectId: "smith", date: "2026-10-20", hours: 8 }],
  });
  assert.deepEqual(c.map((x) => [x.projectId, x.cents, x.source]), [["jones", 9500, "booking"]]);
});

check("a pool tipper charges from bookings only, weekdays by default", () => {
  const c = computeRecharges({
    assets: [tipper], assignments: [], timesheets: [],
    bookings: [{ assetId: "tipper", projectId: "smith", fromDate: "2026-10-30", toDate: "2026-11-02", includeWeekends: false }],
  });
  assert.deepEqual(c.map((x) => [x.date, x.cents]), [["2026-10-30", 25000], ["2026-11-02", 25000]]);
});

check("two bookings on one day split it evenly", () => {
  const c = computeRecharges({
    assets: [tipper], assignments: [], timesheets: [],
    bookings: [
      { assetId: "tipper", projectId: "smith", fromDate: "2026-10-20", toDate: "2026-10-20", includeWeekends: false },
      { assetId: "tipper", projectId: "jones", fromDate: "2026-10-20", toDate: "2026-10-21", includeWeekends: false },
    ],
  });
  assert.deepEqual(c.map((x) => [x.date, x.projectId, x.cents]), [
    ["2026-10-20", "jones", 12500], ["2026-10-20", "smith", 12500], ["2026-10-21", "jones", 25000],
  ]);
});

check("no day rate, no charge", () => {
  const c = computeRecharges({
    assets: [{ id: "ute", dayRateCents: 0 }], assignments: assigned, bookings: [],
    timesheets: [{ userId: jed, projectId: "smith", date: "2026-10-20", hours: 8 }],
  });
  assert.equal(c.length, 0);
});

console.log(`asset-recharge-check: ok (${n} checks)`);

/**
 * Clock-in/out time comes from the button tap (server/clockTime.ts).
 *
 * Run with:  npx tsx server/__tests__/clock-time.test.ts
 */
import assert from "node:assert";
import { resolveClockTime, StaleClientTimeError, MAX_CLIENT_TIME_AGE_MS } from "../clockTime";

const now = new Date("2026-11-18T08:00:00.000Z");
const iso = (d: Date) => d.toISOString();

// Old app versions send nothing → server time.
assert.equal(resolveClockTime(undefined, now).getTime(), now.getTime());
assert.equal(resolveClockTime("", now).getTime(), now.getTime());
assert.equal(resolveClockTime("not a date", now).getTime(), now.getTime());

// Tapped offline 3 hours ago, sent now → the tap time.
const tapped = new Date(now.getTime() - 3 * 3600_000);
assert.equal(resolveClockTime(iso(tapped), now).getTime(), tapped.getTime());

// Phone clock ahead of the server → never in the future.
assert.equal(resolveClockTime(iso(new Date(now.getTime() + 60_000)), now).getTime(), now.getTime());

// Too old → rejected.
assert.throws(
  () => resolveClockTime(iso(new Date(now.getTime() - MAX_CLIENT_TIME_AGE_MS - 1000)), now),
  StaleClientTimeError,
);

// Clock-out can't be before the clock-in.
const clockIn = new Date(now.getTime() - 3600_000);
const earlier = new Date(now.getTime() - 2 * 3600_000);
assert.equal(resolveClockTime(iso(earlier), now, clockIn).getTime(), clockIn.getTime());
assert.equal(resolveClockTime(iso(now), now, clockIn).getTime(), now.getTime());

console.log("clock-time: all assertions passed");

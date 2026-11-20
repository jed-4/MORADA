/// <reference types="node" />
/**
 * Arriving on site: working hours, once-a-day, which prompt. Pure, so:
 *   npx tsx src/lib/siteGeofence.test.ts
 */
import assert from 'node:assert';
import {
  isWithinWorkingHours, formatTime12, alreadyPrompted, markPrompted,
  arrivalPrompt, leavePrompt, regionsFor, siteLabel, partsInTz, type SiteFence,
} from './siteGeofence';

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err: any) { console.error(`  ✗ ${name}\n    ${err?.message}`); process.exitCode = 1; }
}

const TZ = 'Australia/Sydney';
const hours = { hoursStart: '05:00', hoursEnd: '19:00', weekends: false };
// Thu 19 Nov 2026, Sydney is UTC+11 (daylight time).
const sydney = (hhmm: string, day = '2026-11-19') => new Date(`${day}T${hhmm}:00+11:00`);

check('weekday inside hours', () => assert.equal(isWithinWorkingHours(sydney('06:42'), hours, TZ), true));
check('before 5am is out', () => assert.equal(isWithinWorkingHours(sydney('04:59'), hours, TZ), false));
check('7pm is out', () => assert.equal(isWithinWorkingHours(sydney('19:00'), hours, TZ), false));
check('Saturday off by default', () => assert.equal(isWithinWorkingHours(sydney('09:00', '2026-11-21'), hours, TZ), false));
check('Saturday on when weekends allowed', () =>
  assert.equal(isWithinWorkingHours(sydney('09:00', '2026-11-21'), { ...hours, weekends: true }, TZ), true));
check('company timezone, not UTC', () => assert.equal(partsInTz(sydney('06:42'), TZ).date, '2026-11-19'));
check('12-hour time', () => {
  assert.equal(formatTime12(sydney('15:42'), TZ), '3:42pm');
  assert.equal(formatTime12(sydney('00:05'), TZ), '12:05am');
});

check('once per site per day, arrive and leave separate', () => {
  let map = {};
  assert.equal(alreadyPrompted(map, 'arrive', 'p1', '2026-11-19'), false);
  map = markPrompted(map, 'arrive', 'p1', '2026-11-19');
  assert.equal(alreadyPrompted(map, 'arrive', 'p1', '2026-11-19'), true);
  assert.equal(alreadyPrompted(map, 'leave', 'p1', '2026-11-19'), false);
  assert.equal(alreadyPrompted(map, 'arrive', 'p2', '2026-11-19'), false);
  assert.equal(alreadyPrompted(map, 'arrive', 'p1', '2026-11-20'), false);
  map = markPrompted(map, 'arrive', 'p2', '2026-11-20');
  assert.deepEqual(Object.keys(map), ['arrive:p2']); // yesterday's pruned
});

const a: SiteFence = { projectId: 'A', name: 'Jones Reno', address: '4 King St, Newtown NSW', latitude: -33.9, longitude: 151.18, radiusM: 150 };
const b: SiteFence = { projectId: 'B', name: 'Smith House', address: '12 Smith St, Marrickville NSW 2204', latitude: -33.91, longitude: 151.15, radiusM: 200 };

check('label is the street address', () => {
  assert.equal(siteLabel(b), '12 Smith St');
  assert.equal(siteLabel({ name: 'No address', address: null }), 'No address');
});
check('arrive, not clocked in → clock in?', () => {
  const p = arrivalPrompt(b, null, [a, b])!;
  assert.equal(p.category, 'site_arrival');
  assert.equal(p.title, "You're at 12 Smith St — clock in?");
});
check('arrive where already clocked in → nothing', () =>
  assert.equal(arrivalPrompt(b, { id: 't1', projectId: 'B' }, [a, b]), null));
check('arrive at B while clocked in at A → switch', () => {
  const p = arrivalPrompt(b, { id: 't1', projectId: 'A' }, [a, b])!;
  assert.equal(p.category, 'site_switch');
  assert.equal(p.body, 'Switch from 4 King St to 12 Smith St?');
  assert.equal(p.data.fromTimesheetId, 't1');
});
check('leave while clocked in there → clock out?', () => {
  const p = leavePrompt(b, { id: 't1', projectId: 'B' }, sydney('15:42'), TZ)!;
  assert.equal(p.category, 'site_leave');
  assert.equal(p.title, 'Left 12 Smith St at 3:42pm — clock out?');
  assert.equal(p.data.timesheetId, 't1');
});
check('leave when not clocked in there → nothing', () => {
  assert.equal(leavePrompt(b, null, new Date(), TZ), null);
  assert.equal(leavePrompt(b, { id: 't1', projectId: 'A' }, new Date(), TZ), null);
});
check('at most 20 regions, enter + exit', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ ...a, projectId: `p${i}` }));
  const r = regionsFor(many);
  assert.equal(r.length, 20);
  assert.deepEqual(r[0], { identifier: 'p0', latitude: a.latitude, longitude: a.longitude, radius: 150, notifyOnEnter: true, notifyOnExit: true });
});

console.log(`siteGeofence: ${passed} passed`);

/**
 * Working-day placement used when a schedule template is applied to a project,
 * or a project schedule is saved as a template.
 *
 * Run with:  npx tsx server/__tests__/schedule-template-dates.test.ts
 */
import assert from "node:assert";
import {
  TEMPLATE_ANCHOR_DAY, addWorkingDays, workingOffset, placeItems, templateDayNumber, isWorkingDay,
} from "../../shared/scheduleTemplateDates";

let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err: any) { failed++; console.error(`  ✗ ${name}\n      ${err?.message || err}`); }
}

const monFri = { includeSaturday: false, includeSunday: false };

test("the anchor is a Monday", () => {
  assert.strictEqual(new Date(`${TEMPLATE_ANCHOR_DAY}T00:00:00Z`).getUTCDay(), 1);
});

test("addWorkingDays skips the weekend", () => {
  // Fri 2026-10-02 + 1 working day = Mon 2026-10-05
  assert.strictEqual(addWorkingDays("2026-10-02", 1, monFri), "2026-10-05");
});

test("addWorkingDays snaps a weekend start forward first", () => {
  assert.strictEqual(addWorkingDays("2026-10-03", 0, monFri), "2026-10-05");
});

test("addWorkingDays skips a holiday", () => {
  const cal = { ...monFri, holidays: new Set(["2026-10-05"]) };
  assert.strictEqual(addWorkingDays("2026-10-02", 1, cal), "2026-10-06");
});

test("workingOffset is the inverse of addWorkingDays", () => {
  for (const n of [0, 1, 4, 5, 9, 23]) {
    const d = addWorkingDays("2026-10-05", n, monFri);
    assert.strictEqual(workingOffset("2026-10-05", d, monFri), n, `n=${n}`);
  }
});

test("a six-day week counts Saturdays", () => {
  const sixDay = { includeSaturday: true, includeSunday: false };
  assert.ok(isWorkingDay("2026-10-03", sixDay));
  assert.strictEqual(addWorkingDays("2026-10-02", 1, sixDay), "2026-10-03");
});

test("placeItems keeps offset and working-day duration across calendars", () => {
  // Template: item starts Day 3 (Wed of week 1) and lasts 5 working days,
  // i.e. Wed → Tue across a weekend.
  const items = [{ id: "a", startDate: "2024-01-03", endDate: "2024-01-09" }];
  const placed = placeItems(
    items,
    { day0: TEMPLATE_ANCHOR_DAY, calendar: monFri },
    // Target starts Thu 2026-10-01 and has Mon 2026-10-05 off.
    { day0: "2026-10-01", calendar: { ...monFri, holidays: new Set(["2026-10-05"]) } },
  ).get("a")!;
  // offset 2 from Thu: Fri(1), [Mon off], Tue(2) → starts Tue 10-06
  assert.strictEqual(placed.start, "2026-10-06");
  assert.strictEqual(placed.duration, 5);
  // 5 working days from Tue 10-06: Tue Wed Thu Fri Mon → ends Mon 10-12
  assert.strictEqual(placed.end, "2026-10-12");
});

test("placeItems accepts ISO instants and Dates at UTC midnight", () => {
  const items = [{ id: "a", startDate: new Date("2024-01-01T00:00:00.000Z"), endDate: "2024-01-01T00:00:00.000Z" }];
  const p = placeItems(items, { day0: TEMPLATE_ANCHOR_DAY, calendar: monFri }, { day0: "2026-10-05", calendar: monFri }).get("a")!;
  assert.deepStrictEqual(p, { start: "2026-10-05", end: "2026-10-05", duration: 1 });
});

test("an every-day item keeps its calendar length", () => {
  // Fri → Mon with the weekend worked = 4 days.
  const items = [{ id: "a", startDate: "2024-01-05", endDate: "2024-01-08", useWorkingDaysOverride: true }];
  const p = placeItems(items, { day0: TEMPLATE_ANCHOR_DAY, calendar: monFri }, { day0: "2026-10-05", calendar: monFri }).get("a")!;
  assert.strictEqual(p.start, "2026-10-09"); // offset 4 on Mon–Fri
  assert.strictEqual(p.duration, 4);
  assert.strictEqual(p.end, "2026-10-12");
});

test("a project schedule saved as a template lands on the anchor", () => {
  const items = [
    { id: "a", startDate: "2026-10-05", endDate: "2026-10-06" },
    { id: "b", startDate: "2026-10-07", endDate: "2026-10-13" },
  ];
  const placed = placeItems(items, { day0: "2026-10-05", calendar: monFri }, { day0: TEMPLATE_ANCHOR_DAY, calendar: monFri });
  assert.deepStrictEqual(placed.get("a"), { start: "2024-01-01", end: "2024-01-02", duration: 2 });
  assert.deepStrictEqual(placed.get("b"), { start: "2024-01-03", end: "2024-01-09", duration: 5 });
});

test("templateDayNumber: the anchor is Day 1, the next Monday Day 6", () => {
  assert.strictEqual(templateDayNumber("2024-01-01", monFri), 1);
  assert.strictEqual(templateDayNumber("2024-01-08", monFri), 6);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

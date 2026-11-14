/**
 * Monthly operational tasks. They used to generate nothing: the editor saved
 * recurringDays [] for "monthly" and the generator only understood days of
 * the week. Run: npx tsx server/__tests__/recurring-monthly.test.ts
 */
import assert from "node:assert";
import {
  generateRecurringTaskInstances,
  generateNextRecurringInstance,
  isScheduledOn,
} from "../utils/recurringTasks";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ok   ${name}`); } catch (e: any) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const monthly = (day: number) => ({ id: "t", title: "Pay super", frequency: "monthly", dueDayOfMonth: day, recurringDays: [] as number[] });

check("monthly template inside the 14-day window produces its task", () => {
  // Mon 9 Nov 2026 → window runs to Sun 22 Nov.
  const out = generateRecurringTaskInstances(monthly(15), new Date(2026, 10, 9));
  assert.deepStrictEqual(out.map((i) => ymd(i.dueDate)), ["2026-11-15"]);
});
check("monthly day outside the window produces nothing yet", () => {
  const out = generateRecurringTaskInstances(monthly(28), new Date(2026, 10, 9));
  assert.strictEqual(out.length, 0);
});
check("day 31 lands on the last day of a short month", () => {
  assert.ok(isScheduledOn(monthly(31), new Date(2027, 1, 28)));  // 28 Feb 2027
  assert.ok(!isScheduledOn(monthly(31), new Date(2027, 1, 27)));
  assert.ok(isScheduledOn(monthly(31), new Date(2026, 10, 30))); // 30 Nov
});
check("completing a monthly task makes next month's, not next week's", () => {
  const next = generateNextRecurringInstance(monthly(15), new Date(2026, 10, 15, 9, 0));
  assert.strictEqual(next && ymd(next.dueDate), "2026-12-15");
});
check("completing a day-31 task in January lands on 28 Feb", () => {
  const next = generateNextRecurringInstance(monthly(31), new Date(2027, 0, 31));
  assert.strictEqual(next && ymd(next.dueDate), "2027-2-28");
});
check("weekly templates are unchanged", () => {
  const weekly = { id: "w", title: "Toolbox talk", frequency: "weekly", recurringDays: [1] };
  const out = generateRecurringTaskInstances(weekly, new Date(2026, 10, 9));
  assert.deepStrictEqual(out.map((i) => ymd(i.dueDate)), ["2026-11-9", "2026-11-16"]);
  const next = generateNextRecurringInstance(weekly, new Date(2026, 10, 9));
  assert.strictEqual(next && ymd(next.dueDate), "2026-11-16");
});
check("monthly with no day set still makes nothing (rather than every day)", () => {
  const out = generateRecurringTaskInstances({ id: "x", title: "x", frequency: "monthly", recurringDays: [] }, new Date(2026, 10, 9));
  assert.strictEqual(out.length, 0);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall passing");

/**
 * Mobile Home Screen widget snapshot (#40).
 * Run with:  NODE_ENV=test npx tsx server/__tests__/widget-snapshot.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { resolveDayWindow, buildWidgetSnapshot, shortProjectName } from "../services/widgetSnapshot";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// AEST = UTC+10 → getTimezoneOffset() = -600
const win = resolveDayWindow("2026-11-19", "-600");

check("local day window maps AEST midnight to 14:00Z the day before", () => {
  assert.strictEqual(win.start.toISOString(), "2026-11-18T14:00:00.000Z");
  assert.strictEqual(win.end.toISOString(), "2026-11-19T14:00:00.000Z");
});

check("missing date derives the local day from the offset", () => {
  const w = resolveDayWindow(undefined, "-600", new Date("2026-11-18T15:30:00Z"));
  assert.strictEqual(w.date, "2026-11-19");
});

check("bad params fall back to UTC", () => {
  const w = resolveDayWindow("nope", "99999", new Date("2026-11-19T03:00:00Z"));
  assert.strictEqual(w.date, "2026-11-19");
  assert.strictEqual(w.start.toISOString(), "2026-11-19T00:00:00.000Z");
});

check("short name prefers job number, else trims at a word", () => {
  assert.strictEqual(shortProjectName({ name: "Smith Residence", jobNumber: "2604" }), "2604");
  assert.strictEqual(shortProjectName({ name: "Smith Residence" }), "Smith Residence");
  assert.strictEqual(shortProjectName({ name: "42 Wallaby Way Sydney Renovation" }), "42 Wallaby Way…");
});

const projects = [
  { id: "p1", name: "Smith Residence", jobNumber: null },
  { id: "p2", name: "Harbour View Extension", jobNumber: "2611" },
];

const snap = buildWidgetSnapshot({
  window: win,
  projects,
  now: new Date("2026-11-19T00:00:00Z"),
  tasks: [
    { id: "t1", title: "Order tiles", projectId: "p1", status: "todo", dueDate: "2026-11-19T01:00:00Z" },
    { id: "t2", title: "Done already", projectId: "p1", status: "done", dueDate: "2026-11-19T01:00:00Z" },
    { id: "t3", title: "Tomorrow", projectId: "p1", status: "todo", dueDate: "2026-11-19T15:00:00Z" },
    { id: "t4", title: "Biz", projectId: null, taskContextType: "business", status: "todo", dueDate: "2026-11-18T14:00:00Z" },
    { id: "t5", title: "A", projectId: "p2", status: "todo", dueDate: "2026-11-19T02:00:00Z" },
    { id: "t6", title: "B", projectId: "p2", status: "todo", dueDate: "2026-11-19T03:00:00Z" },
    { id: "t7", title: "C", projectId: "p2", status: "todo", dueDate: "2026-11-19T04:00:00Z" },
  ],
  scheduleItems: [
    { id: "s1", name: "Frame inspection", projectId: "p2", status: "not_started", startDate: "2026-11-21T00:00:00Z", endDate: "2026-11-21T00:00:00Z" },
    { id: "s2", name: "Plumbing rough-in", projectId: "p1", status: "in_progress", startDate: "2026-11-18T00:00:00Z", endDate: "2026-11-20T00:00:00Z", startTime: "07:00" },
    { id: "s3", name: "Finished", projectId: "p1", status: "completed", startDate: "2026-11-19T00:00:00Z", endDate: "2026-11-19T00:00:00Z" },
  ],
  activeTimesheet: { id: "ts1", isActive: true, clockInTime: "2026-11-18T21:00:00Z", projectId: "p2", hourlyRate: "80.00", total: "0" },
  timesheetsToday: [
    { id: "a", isActive: false, date: "2026-11-18T14:00:00Z", duration: "2.50", total: "200.00" },
    { id: "b", isActive: false, date: "2026-11-17T14:00:00Z", duration: "8.00" },
    { id: "ts1", isActive: true, date: "2026-11-18T14:00:00Z", duration: "0" },
  ],
});

check("tasks: open, due today, max 4, short names", () => {
  assert.deepStrictEqual(snap.tasks.map((t) => t.id), ["t4", "t1", "t5", "t6"]);
  assert.strictEqual(snap.tasks[0].projectShortName, "Business");
  assert.strictEqual(snap.tasks[1].projectShortName, "Smith Residence");
  assert.strictEqual(snap.tasks[2].projectShortName, "2611");
});

check("schedule: today's in-progress item first, completed dropped", () => {
  assert.strictEqual(snap.nextScheduleItem?.id, "s2");
  assert.strictEqual(snap.nextScheduleItem?.isToday, true);
  assert.deepStrictEqual(snap.upcomingSchedule.map((s) => s.id), ["s2", "s1"]);
});

check("timer + hours today exclude the running entry", () => {
  assert.strictEqual(snap.activeTimesheet?.clockInTime, "2026-11-18T21:00:00.000Z");
  assert.strictEqual(snap.activeTimesheet?.projectShortName, "2611");
  assert.strictEqual(snap.hoursToday, 2.5);
});

check("no money anywhere in the payload", () => {
  const keys: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.push(k.toLowerCase()); walk(x); }
  };
  walk(snap);
  for (const word of ["rate", "total", "price", "amount", "cost", "cents"]) {
    assert.ok(!keys.some((k) => k.includes(word) && k !== "generatedat"), `payload must not have a ${word} field`);
  }
  const json = JSON.stringify(snap);
  assert.ok(!json.includes("200.00") && !json.includes("80.00"), "no money values leak through");
});

console.log(`\n${passed} passed`);

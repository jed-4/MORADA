// Run: npx tsx server/__tests__/schedule-cascade-stage.test.ts
//
// Dragging a STAGE moves its tasks itself (Gantt phase move) and then asks
// computeMoveCascade for everything outside the stage that has to follow.
// Links can hang off the stage OR off a task inside it; both must follow, and a
// stage that follows carries its own tasks (Jed, 10 Nov 2026).
import assert from "node:assert";
import { computeMoveCascade } from "../../client/src/lib/scheduleCascade";

const weekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const d = (s: string) => new Date(s + "T00:00:00");
const item = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
  ({ id, startDate: start, endDate: end, dependencies: [], parentItemId: null, ...extra }) as any;

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); } catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

// Stage 1 [Task A] → (FS) Stage 2 [Task B];  Task C follows Task A.
const items = [
  item("s1", "2027-02-01", "2027-02-05"),
  item("a", "2027-02-01", "2027-02-05", { parentItemId: "s1" }),
  item("s2", "2027-02-08", "2027-02-12", { dependencies: [{ id: "s1", type: "FS", lag: 0 }] }),
  item("b", "2027-02-08", "2027-02-12", { parentItemId: "s2" }),
  item("c", "2027-02-08", "2027-02-12", { dependencies: [{ id: "a", type: "FS", lag: 0 }] }),
];

const byId = (out: Array<{ id: any; startDate: string; endDate: string }>) =>
  Object.fromEntries(out.map((u) => [String(u.id), `${u.startDate}→${u.endDate}`]));

check("stage drag a week later: following stage, its task, and a task-level follower all move", () => {
  const out = byId(computeMoveCascade({
    movedItemId: "s1",
    originalStart: d("2027-02-01"), originalEnd: d("2027-02-05"),
    newStart: d("2027-02-08"), newEnd: d("2027-02-12"),
    allItems: items, isNonWorking: weekend,
    childMoves: [{ id: "a", startDate: "2027-02-08", endDate: "2027-02-12" }],
  }));
  assert.equal(out.s2, "2027-02-15→2027-02-19");
  assert.equal(out.b, "2027-02-15→2027-02-19");
  assert.equal(out.c, "2027-02-15→2027-02-19");
});

check("without childMoves (parent-successor preview) a task-level follower is left alone", () => {
  const out = byId(computeMoveCascade({
    movedItemId: "s1",
    originalStart: d("2027-02-01"), originalEnd: d("2027-02-05"),
    newStart: d("2027-02-01"), newEnd: d("2027-02-12"),
    allItems: items, isNonWorking: weekend,
  }));
  assert.equal(out.c, undefined);
  assert.equal(out.s2, "2027-02-15→2027-02-19");
});

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("all passed");

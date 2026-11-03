// Run: npx tsx server/__tests__/schedule-assignee-filter.test.ts
//
// Rows below are exactly what GET /api/schedules/:id/items returned on dev
// (2026-11-03) after assigning two items to a contact and one to the business
// through PATCH /api/schedule-items/:id. Note there is no `assignedTo` field:
// the Gantt used to filter on it, so every assignee emptied the chart.
import assert from "node:assert";
import { matchesAssigneeFilter, BUSINESS_ASSIGNEE_PREFIX } from "../../client/src/contexts/ScheduleViewContext";

let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const CONTACT = "c3959087-579a-464b-9dda-830c432c1a6c";
const BUSINESS = `${BUSINESS_ASSIGNEE_PREFIX}edf7b72e-4478-4246-9a56-2f83c01faad6`;
const rows = [
  { name: "Demolition", assignedToId: CONTACT, assignedToName: "TEST WEX Motorpass" },
  { name: "Concrete Slab", assignedToId: CONTACT, assignedToName: "TEST WEX Motorpass" },
  { name: "Frame & Roof", assignedToId: null, assignedToName: "Morada Projects" },
  { name: "Lock-Up Stage", assignedToId: null, assignedToName: null },
  { name: "Fit-Off & Fix", assignedToId: null, assignedToName: null },
  { name: "Practical Completion", assignedToId: null, assignedToName: null },
];
const names = (assignee: string) => rows.filter((r) => matchesAssigneeFilter(r as any, assignee)).map((r) => r.name);

check("All shows everything", () => assert.strictEqual(names("all").length, 6));
check("a contact shows that contact's items", () =>
  assert.deepStrictEqual(names(CONTACT), ["Demolition", "Concrete Slab"]));
check("the business shows business-assigned items", () => assert.deepStrictEqual(names(BUSINESS), ["Frame & Roof"]));
check("an older row holding the raw company:<id> still counts as the business", () =>
  assert.ok(matchesAssigneeFilter({ assignedToId: BUSINESS, assignedToName: "Old Name" } as any, BUSINESS)));
check("someone with nothing assigned shows nothing", () => assert.deepStrictEqual(names("someone-else"), []));
check("the old Gantt check matched nothing for anyone", () =>
  assert.deepStrictEqual(rows.filter((r: any) => r.assignedTo === CONTACT), []));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nall passed");

/**
 * Timesheet view scope: the scope set on "Timesheets" (timesheets.manage) in
 * the Roles page must actually widen what a role sees. Before this, only
 * projects.timesheet was read, and the Roles page has no dropdown for it.
 */
import assert from "node:assert";
import { resolveTimesheetViewScope, type TimesheetScopeRow } from "../timesheet-view-scope";

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

const row = (key: string, viewScope: string | null, allowedActions: unknown = ["view"], viewableRoleIds: unknown = []): TimesheetScopeRow =>
  ({ key, viewScope, allowedActions, viewableRoleIds });

check("no rows → own", () => {
  assert.deepStrictEqual(resolveTimesheetViewScope([]), { viewScope: "own", viewableRoleIds: [] });
});

check("timesheets.manage set to all wins over projects.timesheet saved as own", () => {
  const r = resolveTimesheetViewScope([row("projects.timesheet", "own"), row("timesheets.manage", "all")]);
  assert.deepStrictEqual(r, { viewScope: "all", viewableRoleIds: [] });
});

check("legacy projects.timesheet = all still works", () => {
  assert.strictEqual(resolveTimesheetViewScope([row("projects.timesheet", "all")]).viewScope, "all");
});

check("a stale scope on a row without view is ignored", () => {
  const r = resolveTimesheetViewScope([row("timesheets.manage", "all", ["add"])]);
  assert.strictEqual(r.viewScope, "own");
});

check("selected_roles unions role ids across rows", () => {
  const r = resolveTimesheetViewScope([
    row("timesheets.manage", "selected_roles", ["view"], ["a", "b"]),
    row("business.timesheets", "selected_roles", ["view"], ["b", "c"]),
  ]);
  assert.strictEqual(r.viewScope, "selected_roles");
  assert.deepStrictEqual([...r.viewableRoleIds].sort(), ["a", "b", "c"]);
});

check("all beats selected_roles and drops role ids", () => {
  const r = resolveTimesheetViewScope([
    row("timesheets.manage", "selected_roles", ["view"], ["a"]),
    row("business.timesheets", "all"),
  ]);
  assert.deepStrictEqual(r, { viewScope: "all", viewableRoleIds: [] });
});

check("null scope / junk actions → own", () => {
  assert.strictEqual(resolveTimesheetViewScope([row("timesheets.manage", null), row("x", "all", null)]).viewScope, "own");
});

console.log(`\n${passed} passed`);

/**
 * Every Operations route (the /systems screen, the Docs library and project
 * workflows) checks its operations.* permission with the right action.
 *
 * Until these keys existed the routes checked only requireTeamMember — and the
 * docs and project-workflow routes not even that — so every team member, and
 * for some routes any supplier login, could read and change all of it. This
 * reads server/routes.ts and fails on any matching route registered without
 * the check, including ones added later.
 *
 * Run with:  npx tsx server/__tests__/operations-permission-routes.test.ts
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

const src = readFileSync(fileURLToPath(new URL("../routes.ts", import.meta.url)), "utf8");
const ROUTE = /app\.(get|post|put|patch|delete)\(\s*"([^"]+)"\s*,([^]*?)async\s*\(/g;

const KEY_FOR: Array<[RegExp, string]> = [
  [/^\/api\/(docs|doc-folders)(\/|$)/, "operations.library"],
  [/^\/api\/systems\/(folders|documents)(\/|$)/, "operations.library"],
  [/^\/api\/systems\/task-templates(\/|$)/, "operations.tasks"],
  [/^\/api\/task-template-statuses(\/|$)/, "operations.tasks"],
  [/^\/api\/systems\/workflow-templates(\/|$)/, "operations.workflows"],
  [/^\/api\/project-workflows(\/|$)/, "operations.workflows"],
  [/^\/api\/projects\/:projectId\/workflows$/, "operations.workflows"],
];

const routes = Array.from(src.matchAll(ROUTE))
  .map((m) => ({ method: m[1], path: m[2], middleware: m[3] }))
  .map((r) => ({ ...r, key: KEY_FOR.find(([re]) => re.test(r.path))?.[1] }))
  .filter((r): r is typeof r & { key: string } => !!r.key);

const actionOf = (r: { key: string; middleware: string }) =>
  new RegExp(`requirePermission\\("${r.key.replace(".", "\\.")}", "(\\w+)"\\)`).exec(r.middleware)?.[1];
const label = (r: { method: string; path: string }) => `${r.method.toUpperCase()} ${r.path}`;

check("the routes were found (the pattern still matches routes.ts)", () => {
  assert.ok(routes.length >= 44, `only ${routes.length} operations routes matched`);
});

check("every operations route requires its operations.* permission", () => {
  assert.deepStrictEqual(routes.filter((r) => !actionOf(r)).map(label), []);
});

check("every operations route is team-only", () => {
  assert.deepStrictEqual(routes.filter((r) => !/requireTeamMember\b/.test(r.middleware)).map(label), []);
});

check("reads need view; creates add; deletes delete; nothing writes with view", () => {
  for (const r of routes) {
    const action = actionOf(r)!;
    if (r.method === "get") assert.strictEqual(action, "view", label(r));
    else assert.notStrictEqual(action, "view", `${label(r)} writes with only view`);
    if (r.method === "delete") assert.strictEqual(action, "delete", label(r));
  }
});

check("the three keys are in both permission catalogues", () => {
  const storage = readFileSync(fileURLToPath(new URL("../storage.ts", import.meta.url)), "utf8");
  for (const key of ["operations.tasks", "operations.library", "operations.workflows"]) {
    const n = storage.split(`{ key: "${key}"`).length - 1;
    assert.strictEqual(n, 2, `${key} declared ${n} time(s); MemStorage and DbStorage each need it`);
  }
});

console.log(`\noperations-permission-routes: ${passed} passed`);

/**
 * Every team-facing client-invoice route checks "Progress Claims"
 * (projects.invoices), with the right action.
 *
 * The permission existed for years but only gated the client portal, so any
 * team member could read every invoice. This reads server/routes.ts and fails
 * on any /api/client-invoice* or Xero client-invoice route registered without
 * the check — including ones added later. The client's own view of an invoice
 * (/client-view) is portal-scoped and deliberately not gated here.
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
const routes = Array.from(src.matchAll(ROUTE))
  .map((m) => ({ method: m[1], path: m[2], middleware: m[3] }))
  .filter((r) => /^\/api\/(client-invoice|invoice-(variations|allowances|estimates|bills|timesheets|selections)|xero\/[a-z-]*client-invoice)/.test(r.path) || r.path === "/api/projects/:projectId/cash-flow" || r.path === "/api/projects/:projectId/schedule-invoice-links");

const EXEMPT = new Set(["get /api/client-invoices/:id/client-view"]);
const actionOf = (mw: string) => /requireTeamPermission\("projects\.invoices", "(\w+)"\)/.exec(mw)?.[1];

check("the routes were found (the pattern still matches routes.ts)", () => {
  assert.ok(routes.length >= 30, `only ${routes.length} client-invoice routes matched`);
});

check("every client-invoice route requires Progress Claims", () => {
  const missing = routes.filter((r) => !EXEMPT.has(`${r.method} ${r.path}`) && !actionOf(r.middleware));
  assert.deepStrictEqual(missing.map((r) => `${r.method.toUpperCase()} ${r.path}`), []);
});

check("reads need view; deleting an invoice needs delete; emailing needs send", () => {
  for (const r of routes) {
    const action = actionOf(r.middleware);
    if (!action) continue;
    if (r.method === "get" && !r.path.endsWith("/next-number")) assert.strictEqual(action, "view", `${r.method} ${r.path}`);
    if (r.method === "delete" && r.path === "/api/client-invoices/:id") assert.strictEqual(action, "delete");
    if (r.path.endsWith("/send-email")) assert.strictEqual(action, "send");
    if (r.method !== "get") assert.notStrictEqual(action, "view", `${r.method} ${r.path} writes with only view`);
  }
});

check("the client's own view stays open to the portal", () => {
  const cv = routes.find((r) => r.path === "/api/client-invoices/:id/client-view");
  assert.ok(cv && !actionOf(cv.middleware));
});

console.log(`\ninvoice-permission-routes: ${passed} passed`);

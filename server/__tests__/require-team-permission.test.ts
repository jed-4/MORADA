/**
 * requireTeamPermission — the team permission for routes the client portal
 * shares. A client login must pass straight through to clientAccessGate's
 * portal rules (a team key would 403 every client); a team or supplier login
 * without the permission must be refused.
 */
import assert from "node:assert";

process.env.NODE_ENV = "test"; // requirePermission skips itself in development
const { requireTeamPermission } = await import("../middleware/auth");

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function run(user: any) {
  let status = 0;
  let nexted = false;
  const res: any = { status: (s: number) => ((status = s), res), json: () => res };
  return Promise.resolve(requireTeamPermission("projects.invoices", "view")({ user } as any, res, () => (nexted = true))).then(() => ({ status, nexted }));
}

await check("a client login goes on to the portal gate", async () => {
  assert.deepStrictEqual(await run({ userCategory: "client", roleId: null }), { status: 0, nexted: true });
});

await check("a team login with no role is refused", async () => {
  assert.deepStrictEqual(await run({ userCategory: "team", roleId: null, companyId: "c" }), { status: 403, nexted: false });
});

await check("a supplier login is refused too (the portal gate doesn't cover suppliers)", async () => {
  assert.deepStrictEqual(await run({ userCategory: "supplier", roleId: null, companyId: "c" }), { status: 403, nexted: false });
});

console.log(`\nrequire-team-permission: ${passed} passed`);
process.exit(0);

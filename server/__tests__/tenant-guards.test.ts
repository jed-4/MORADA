/**
 * Tenant-ownership combinator tests — no database, no network.
 *
 * SCOPE — read this before trusting a green run.
 *
 * This does NOT boot the full app. server/auth.ts builds its session
 * middleware in a module-load IIFE bound to a connect-pg-simple store, so
 * registerRoutes cannot run without live Postgres; faking it hard enough to
 * boot would mean testing the fakes. Same constraint as
 * require-company.test.ts, uploads-access.test.ts and scope-tenancy.test.ts.
 *
 * What IS real: the actual combinators from server/middleware/tenantGuards.ts
 * — the same functions routes.ts builds its guards from. Only the record
 * lookups are substituted, since resolving one is a database read. Routes are
 * stubs mounted at the genuine paths, so 200 means "the guard let it through"
 * and 404 means "the guard blocked it".
 *
 * What is NOT covered: that routes.ts calls a guard on every fixed route. That
 * wiring was verified statically and is enumerated in the PR description; the
 * CI guard (scripts/check-route-tenancy.mjs) is what keeps it from regressing.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/tenant-guards.test.ts
 */

// Set before importing anything that reaches server/db.ts, which throws
// without a DATABASE_URL. Nothing here touches a database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:1/faketestdb";

import assert from "node:assert";
import express from "express";
import type { Server } from "node:http";

const {
  makeOwnedByCompany, makeOwnedViaParent, makeOwnsAllByIds, makeOwnsAllVia,
} = await import("../middleware/tenantGuards");

let passed = 0, failed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err: any) { failed++; failures.push(name); console.error(`  ✗ ${name}\n      ${err?.message || err}`); }
}

// ---------------------------------------------------------------------------
// Fixture: company A owns everything. Company B owns nothing.
// The chain mirrors the real one: step → schedule item → schedule → project.
// ---------------------------------------------------------------------------
const A = "company-a", B = "company-b";
const MISSING = "00000000-0000-0000-0000-000000000000";

const projects: Record<string, any>      = { "proj-a": { id: "proj-a", companyId: A } };
const schedules: Record<string, any>     = { "sch-a":  { id: "sch-a", projectId: "proj-a" } };
const scheduleItems: Record<string, any> = { "item-a": { id: "item-a", scheduleId: "sch-a" },
                                             "item-a2":{ id: "item-a2", scheduleId: "sch-a" } };
const steps: Record<string, any>         = { "step-a": { id: "step-a", scheduleItemId: "item-a" } };
const folders: Record<string, any>       = { "folder-a": { id: "folder-a", companyId: A } };
const tasks: Record<string, any>         = { "task-a": { id: "task-a", companyId: A },
                                             "task-a2":{ id: "task-a2", companyId: A } };

// Stand-in for enforceProjectCompany: the real one has the same contract.
const projectGuard: any = async (req: any, res: any, projectId: string, notFound: string) => {
  const p = projects[projectId];
  const companyId = req.user?.companyId;
  if (!p || !companyId || p.companyId !== companyId) {
    res.status(404).json({ error: notFound }); return null;
  }
  return p;
};

const getOwnedFolder      = makeOwnedByCompany(async (id) => folders[id], "Folder not found");
const getOwnedTask        = makeOwnedByCompany(async (id) => tasks[id], "Task not found");
const getOwnedSchedule    = makeOwnedViaParent(async (id) => schedules[id], (s) => s?.projectId, projectGuard, "Schedule not found");
const getOwnedScheduleItem= makeOwnedViaParent(async (id) => scheduleItems[id], (i) => i?.scheduleId, getOwnedSchedule, "Schedule item not found");
const getOwnedStep        = makeOwnedViaParent(async (id) => steps[id], (s) => s?.scheduleItemId, getOwnedScheduleItem, "Step not found");

// Batch: the joined-query variant. Returns only ids owned by companyId.
const ownsAllScheduleItems = makeOwnsAllByIds(async (ids, companyId) =>
  ids.filter((id) => {
    const it = scheduleItems[id]; if (!it) return false;
    const sc = schedules[it.scheduleId]; if (!sc) return false;
    const pr = projects[sc.projectId];
    return !!pr && pr.companyId === companyId;
  }), "Schedule item not found");

const ownsAllTasks = makeOwnsAllVia(getOwnedTask, "Task not found");

// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use("/api", (req: any, _res, next) => {
  const c = req.get("x-test-company");
  req.user = c === "none" ? {} : { id: "u1", companyId: c || A };
  next();
});

const OK = { ok: true };
app.delete("/api/doc-folders/:id", async (req, res) => {
  if (!(await getOwnedFolder(req, res, req.params.id))) return; res.json(OK);
});
app.patch("/api/schedule-item-steps/:id", async (req, res) => {
  if (!(await getOwnedStep(req, res, req.params.id))) return; res.json(OK);
});
app.post("/api/schedules/:scheduleId/baselines", async (req, res) => {
  if (!(await getOwnedSchedule(req, res, req.params.scheduleId))) return; res.json(OK);
});
app.post("/api/schedule-items/batch-sort", async (req, res) => {
  const ids = (req.body?.updates ?? []).flatMap((u: any) => [u?.id, u?.parentItemId]).filter(Boolean);
  if (!(await ownsAllScheduleItems(req, res, ids))) return; res.json(OK);
});
app.post("/api/tasks/bulk-action", async (req, res) => {
  if (!(await ownsAllTasks(req, res, req.body?.ids ?? []))) return; res.json(OK);
});

let baseUrl = ""; let server: Server;
async function api(method: string, path: string, o: { company?: string; body?: any } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(o.company ? { "x-test-company": o.company } : {}) },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const t = await res.text();
  let body: any = null; try { body = t ? JSON.parse(t) : null; } catch { body = t; }
  return { status: res.status, body };
}

/** Owner allowed · outsider 404 · missing 404 · company-less 404. */
async function expectGuarded(label: string, method: string, pathFor: (id: string) => string, ownedId: string, body?: any) {
  await test(`${label} — owner allowed`, async () =>
    assert.strictEqual((await api(method, pathFor(ownedId), { company: A, body })).status, 200));
  await test(`${label} — cross-company 404`, async () =>
    assert.strictEqual((await api(method, pathFor(ownedId), { company: B, body })).status, 404));
  await test(`${label} — nonexistent id 404`, async () =>
    assert.strictEqual((await api(method, pathFor(MISSING), { company: A, body })).status, 404));
  await test(`${label} — no company 404`, async () =>
    assert.strictEqual((await api(method, pathFor(ownedId), { company: "none", body })).status, 404));
}

async function main() {
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`; r();
    });
  });

  console.log("\nShape 1 — direct companyId\n");
  await expectGuarded("DELETE /api/doc-folders/:id", "DELETE", (id) => `/api/doc-folders/${id}`, "folder-a");

  console.log("\nShape 2 — resolved through the parent chain\n");
  await expectGuarded("POST /api/schedules/:scheduleId/baselines", "POST",
    (id) => `/api/schedules/${id}/baselines`, "sch-a", {});
  // three hops: step → item → schedule → project
  await expectGuarded("PATCH /api/schedule-item-steps/:id", "PATCH",
    (id) => `/api/schedule-item-steps/${id}`, "step-a", {});

  await test("chain breaks if any link is foreign, not just the leaf", async () => {
    // Re-point the schedule at a project company B owns; the step is unchanged.
    projects["proj-b"] = { id: "proj-b", companyId: B };
    const original = schedules["sch-a"].projectId;
    schedules["sch-a"].projectId = "proj-b";
    const res = await api("PATCH", "/api/schedule-item-steps/step-a", { company: A });
    schedules["sch-a"].projectId = original;
    assert.strictEqual(res.status, 404, "leaf is A's but the root project is B's — must 404");
  });

  console.log("\nShape 3 — batches\n");
  await test("batch — all-owned is allowed", async () =>
    assert.strictEqual((await api("POST", "/api/schedule-items/batch-sort", {
      company: A, body: { updates: [{ id: "item-a" }, { id: "item-a2" }] } })).status, 200));

  await test("batch — one foreign id rejects the WHOLE batch", async () => {
    scheduleItems["item-b"] = { id: "item-b", scheduleId: "sch-b" };
    schedules["sch-b"] = { id: "sch-b", projectId: "proj-b" };
    projects["proj-b"] = { id: "proj-b", companyId: B };
    const res = await api("POST", "/api/schedule-items/batch-sort", {
      company: A, body: { updates: [{ id: "item-a" }, { id: "item-b" }, { id: "item-a2" }] } });
    assert.strictEqual(res.status, 404);
  });

  await test("batch — a foreign parentItemId is caught too", async () =>
    assert.strictEqual((await api("POST", "/api/schedule-items/batch-sort", {
      company: A, body: { updates: [{ id: "item-a", parentItemId: "item-b" }] } })).status, 404));

  await test("batch — nonexistent id rejects the batch", async () =>
    assert.strictEqual((await api("POST", "/api/schedule-items/batch-sort", {
      company: A, body: { updates: [{ id: "item-a" }, { id: MISSING }] } })).status, 404));

  await test("batch — empty batch is allowed", async () =>
    assert.strictEqual((await api("POST", "/api/schedule-items/batch-sort", {
      company: A, body: { updates: [] } })).status, 200));

  await test("batch — no company 404", async () =>
    assert.strictEqual((await api("POST", "/api/schedule-items/batch-sort", {
      company: "none", body: { updates: [{ id: "item-a" }] } })).status, 404));

  await test("per-id batch — all-owned allowed", async () =>
    assert.strictEqual((await api("POST", "/api/tasks/bulk-action", {
      company: A, body: { ids: ["task-a", "task-a2"] } })).status, 200));

  await test("per-id batch — one foreign id rejects the whole batch", async () => {
    tasks["task-b"] = { id: "task-b", companyId: B };
    assert.strictEqual((await api("POST", "/api/tasks/bulk-action", {
      company: A, body: { ids: ["task-a", "task-b"] } })).status, 404);
  });

  await test("per-id batch — sends exactly one response (no double-send crash)", async () => {
    // Two foreign ids: if the per-id resolver wrote its own 404 the server
    // would throw ERR_HTTP_HEADERS_SENT and the request would hang or 500.
    tasks["task-b2"] = { id: "task-b2", companyId: B };
    const res = await api("POST", "/api/tasks/bulk-action", {
      company: A, body: { ids: ["task-b", "task-b2"] } });
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: "Task not found" });
  });

  console.log("\nRefusals are indistinguishable\n");
  await test("foreign and missing produce identical responses", async () => {
    const foreign = await api("DELETE", "/api/doc-folders/folder-a", { company: B });
    const missing = await api("DELETE", `/api/doc-folders/${MISSING}`, { company: A });
    assert.strictEqual(foreign.status, missing.status);
    assert.deepStrictEqual(foreign.body, missing.body);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) console.error(`\nFailures:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  server.close();
  process.exit(failed ? 1 : 0);
}

main();

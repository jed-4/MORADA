/**
 * Scope-section cross-tenant ownership tests — no database, no network.
 *
 * SCOPE — read this before trusting a green run.
 *
 * This does NOT boot the full app. server/auth.ts builds its session
 * middleware in a module-load IIFE bound to a connect-pg-simple store, so
 * registerRoutes cannot run without a live Postgres; faking it hard enough to
 * boot would mean testing the fakes rather than the app. Same constraint that
 * shaped require-company.test.ts and uploads-access.test.ts.
 *
 * What IS real here: the actual guards from server/middleware/scopeOwnership.ts
 * — the same factory routes.ts calls — driven over HTTP. Only the record
 * lookups are substituted, since resolving one is a database read. Routes are
 * stubs mounted at the genuine paths, so 200 means "the guard let it through"
 * and 404 means "the guard blocked it".
 *
 * What is NOT covered: that routes.ts actually calls these guards on every
 * route. That wiring was verified statically — as of this commit the call
 * sites are:
 *
 *   PATCH  /api/scope-stages/:id                    getOwnedScopeStage
 *   DELETE /api/scope-stages/:id                    getOwnedScopeStage
 *   POST   /api/scope-stages/reorder                ownsAllScopeStages
 *   POST   /api/projects/:projectId/scope-stages/initialize
 *                                                   enforceProjectCompany
 *   GET    /api/scope/:scopeItemId/gear-photos      getOwnedScopeItem
 *   POST   /api/scope/:scopeItemId/gear-photos      getOwnedScopeItem
 *   DELETE /api/gear-photos/:id                     getOwnedGearPhoto
 *
 * POST /api/scope-templates/:id/apply is guarded inside
 * storage.applyScopeTemplate (template read AND project write both scoped to
 * the caller's company), which is a database method and therefore covered by
 * the DB-backed tenant-isolation.test.ts rather than here.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/scope-tenancy.test.ts
 */

// Set before importing anything that reaches server/db.ts, which throws
// without a DATABASE_URL. Nothing here touches a database, but the import
// graph is checked at load time.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:1/faketestdb";

import assert from "node:assert";
import express from "express";
import type { Server } from "node:http";

const { createScopeOwnershipGuards } = await import("../middleware/scopeOwnership");

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture: company A owns everything. Company B owns nothing and must be
// refused at every door.
// ---------------------------------------------------------------------------
const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const MISSING = "00000000-0000-0000-0000-000000000000";

const A_PROJECT = "project-a";
const A_STAGE = "stage-a";
const A_STAGE_2 = "stage-a-2";
const A_SCOPE_ITEM = "scope-item-a";
const A_GEAR_PHOTO = "gear-photo-a";

const projects: Record<string, { companyId: string }> = { [A_PROJECT]: { companyId: COMPANY_A } };
const scopeItems: Record<string, { companyId: string }> = { [A_SCOPE_ITEM]: { companyId: COMPANY_A } };
const scopeStages: Record<string, { companyId: string }> = {
  [A_STAGE]: { companyId: COMPANY_A },
  [A_STAGE_2]: { companyId: COMPANY_A },
};
const gearPhotos: Record<string, { companyId: string }> = { [A_GEAR_PHOTO]: { companyId: COMPANY_A } };

const guards = createScopeOwnershipGuards({
  getProject: async (id) => projects[id],
  getScopeItem: async (id) => scopeItems[id],
  getScopeStage: async (id) => scopeStages[id],
  getScopeGearPhoto: async (id) => gearPhotos[id],
});

// ---------------------------------------------------------------------------
// Stub routes at the genuine paths. Identity comes from a header so each
// request can choose who it is; in production requireAuth populates req.user
// the same way (and rejects anonymous callers with a 401 before we're reached).
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

app.use("/api", (req: any, _res, next) => {
  const company = req.get("x-test-company");
  req.user = company === "none" ? {} : { id: "u1", companyId: company || COMPANY_A };
  next();
});

const OK = { ok: true };

app.patch("/api/scope-stages/:id", async (req, res) => {
  if (!(await guards.getOwnedScopeStage(req, res, req.params.id))) return;
  res.json(OK);
});

app.delete("/api/scope-stages/:id", async (req, res) => {
  if (!(await guards.getOwnedScopeStage(req, res, req.params.id))) return;
  res.json(OK);
});

app.post("/api/scope-stages/reorder", async (req, res) => {
  const updates = req.body?.updates ?? [];
  if (!(await guards.ownsAllScopeStages(req, res, updates.map((u: any) => u?.id)))) return;
  res.json(OK);
});

app.post("/api/projects/:projectId/scope-stages/initialize", async (req, res) => {
  if (!(await guards.enforceProjectCompany(req, res, req.params.projectId, "Project not found"))) return;
  res.json(OK);
});

app.get("/api/scope/:scopeItemId/gear-photos", async (req, res) => {
  if (!(await guards.getOwnedScopeItem(req, res, req.params.scopeItemId))) return;
  res.json(OK);
});

app.post("/api/scope/:scopeItemId/gear-photos", async (req, res) => {
  if (!(await guards.getOwnedScopeItem(req, res, req.params.scopeItemId))) return;
  res.json(OK);
});

app.delete("/api/gear-photos/:id", async (req, res) => {
  if (!(await guards.getOwnedGearPhoto(req, res, req.params.id))) return;
  res.json(OK);
});

// ---------------------------------------------------------------------------
let baseUrl = "";
let server: Server;

async function api(
  method: string,
  path: string,
  opts: { company?: string; body?: any } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.company ? { "x-test-company": opts.company } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

/**
 * Every guarded route gets the same three-way check: the owner is let in, an
 * outsider is refused, and a nonexistent id is refused identically (so a 404
 * never distinguishes "not yours" from "does not exist").
 */
async function expectGuarded(
  label: string,
  method: string,
  pathFor: (id: string) => string,
  ownedId: string,
  body?: any,
) {
  await test(`${label} — owner is allowed`, async () => {
    const res = await api(method, pathFor(ownedId), { company: COMPANY_A, body });
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
  });

  await test(`${label} — cross-company caller gets 404`, async () => {
    const res = await api(method, pathFor(ownedId), { company: COMPANY_B, body });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });

  await test(`${label} — nonexistent id gets 404`, async () => {
    const res = await api(method, pathFor(MISSING), { company: COMPANY_A, body });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });

  await test(`${label} — caller with no company gets 404`, async () => {
    const res = await api(method, pathFor(ownedId), { company: "none", body });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });
}

async function main() {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  console.log("\nScope tenancy guards\n");

  await expectGuarded(
    "PATCH /api/scope-stages/:id", "PATCH",
    (id) => `/api/scope-stages/${id}`, A_STAGE, { name: "Renamed" },
  );

  await expectGuarded(
    "DELETE /api/scope-stages/:id", "DELETE",
    (id) => `/api/scope-stages/${id}`, A_STAGE,
  );

  await expectGuarded(
    "POST /api/projects/:projectId/scope-stages/initialize", "POST",
    (id) => `/api/projects/${id}/scope-stages/initialize`, A_PROJECT, {},
  );

  await expectGuarded(
    "GET /api/scope/:scopeItemId/gear-photos", "GET",
    (id) => `/api/scope/${id}/gear-photos`, A_SCOPE_ITEM,
  );

  await expectGuarded(
    "POST /api/scope/:scopeItemId/gear-photos", "POST",
    (id) => `/api/scope/${id}/gear-photos`, A_SCOPE_ITEM, {},
  );

  await expectGuarded(
    "DELETE /api/gear-photos/:id", "DELETE",
    (id) => `/api/gear-photos/${id}`, A_GEAR_PHOTO,
  );

  // The reorder batch needs its own cases — the interesting failure is a
  // payload that mixes owned and foreign ids.
  console.log("\nPOST /api/scope-stages/reorder\n");

  await test("reorder — all-owned batch is allowed", async () => {
    const res = await api("POST", "/api/scope-stages/reorder", {
      company: COMPANY_A,
      body: { updates: [{ id: A_STAGE, displayOrder: 1 }, { id: A_STAGE_2, displayOrder: 0 }] },
    });
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
  });

  await test("reorder — cross-company batch gets 404", async () => {
    const res = await api("POST", "/api/scope-stages/reorder", {
      company: COMPANY_B,
      body: { updates: [{ id: A_STAGE, displayOrder: 1 }] },
    });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });

  await test("reorder — one foreign id rejects the whole batch", async () => {
    // The payload is mostly the caller's own stages; a single id they don't own
    // must refuse everything rather than silently reordering the rest.
    const res = await api("POST", "/api/scope-stages/reorder", {
      company: COMPANY_A,
      body: {
        updates: [
          { id: A_STAGE, displayOrder: 0 },
          { id: MISSING, displayOrder: 1 },
          { id: A_STAGE_2, displayOrder: 2 },
        ],
      },
    });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });

  await test("reorder — undefined id in the batch gets 404", async () => {
    const res = await api("POST", "/api/scope-stages/reorder", {
      company: COMPANY_A,
      body: { updates: [{ id: A_STAGE, displayOrder: 0 }, { displayOrder: 1 }] },
    });
    assert.strictEqual(res.status, 404, `expected 404, got ${res.status}`);
  });

  await test("reorder — empty batch is allowed", async () => {
    const res = await api("POST", "/api/scope-stages/reorder", {
      company: COMPANY_A,
      body: { updates: [] },
    });
    assert.strictEqual(res.status, 200, `expected 200, got ${res.status}`);
  });

  // A 404 must not leak which of "not yours" / "does not exist" applied.
  await test("refusals are indistinguishable between foreign and missing", async () => {
    const foreign = await api("DELETE", `/api/scope-stages/${A_STAGE}`, { company: COMPANY_B });
    const missing = await api("DELETE", `/api/scope-stages/${MISSING}`, { company: COMPANY_A });
    assert.strictEqual(foreign.status, missing.status);
    assert.deepStrictEqual(foreign.body, missing.body);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.error(`\nFailures:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  }
  server.close();
  process.exit(failed ? 1 : 0);
}

main();

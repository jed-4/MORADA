/**
 * requireCompany gate + fail-closed settings tests — no database, no .env.
 *
 * SCOPE — read this before trusting a green run.
 *
 * This does NOT boot the full app. server/auth.ts builds its session
 * middleware in a module-load IIFE bound to a connect-pg-simple store, so
 * registerRoutes cannot run without a live Postgres; faking it hard enough to
 * boot would mean testing the fakes rather than the app.
 *
 * What IS real here: the actual `requireCompany` middleware is imported from
 * server/middleware/requireCompany.ts — the allowlist is not reimplemented —
 * and the real MemStorage from server/storage.ts. Routes are stubs mounted at
 * the genuine paths, so 200 means "the gate let it through" and 403 means "the
 * gate blocked it".
 *
 * What is NOT covered: real route handlers, real auth, and the middleware
 * ORDER inside registerRoutes. Order was verified statically instead — only
 * POST /api/_client-error is registered before the gate at routes.ts:1558, and
 * it predates auth entirely and touches no tenant data. The DB-backed
 * tenant-isolation.test.ts remains the check for the real stack.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/require-company.test.ts
 */

// Before any import: server/storage.ts pulls in server/db.ts, which throws
// without a DATABASE_URL. Only MemStorage is exercised here. Static imports
// would hoist above these assignments.
//
// Overwritten unconditionally, never defaulted from the environment:
// server/storage.ts fires `dbStorage.initialize()` at module load, which runs
// ensure*Exist / migrate* / backfill* — all WRITES. Pointing this at a real
// database would run those against it. The loopback port refuses instantly;
// storage.ts catches and logs the failure ("Failed to initialize DbStorage"),
// which is expected noise in this test's output.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:1/faketestdb";

import assert from "node:assert";
import express from "express";
import type { Server } from "node:http";

const { requireCompany } = await import("../middleware/requireCompany");
const { MemStorage } = await import("../storage");

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
// A minimal app that reproduces the request shape requireCompany sees in
// production: req.user / req.session populated by the auth layer upstream.
// The session is driven by headers so each request can choose its identity.
// ---------------------------------------------------------------------------

const COMPANY_A = "company-a";
const USER_WITH_COMPANY = "user-with-company";
const USER_NO_COMPANY = "user-no-company";

const app = express();
app.use(express.json());

// Stands in for the global auth middleware: sets req.user and req.session the
// same way requireAuth and the legacy session bridge do.
app.use("/api", (req: any, _res, next) => {
  const mode = req.get("x-test-identity") || "with-company";
  if (mode === "anonymous") {
    req.session = {};
    return next();
  }
  if (mode === "no-company") {
    req.user = { id: USER_NO_COMPANY, companyId: null };
    req.session = { userId: USER_NO_COMPANY, companyId: null };
    return next();
  }
  req.user = { id: USER_WITH_COMPANY, companyId: COMPANY_A };
  req.session = { userId: USER_WITH_COMPANY, companyId: COMPANY_A };
  next();
});

// The gate under test — the real one.
app.use("/api", requireCompany);

// Stubs at real paths. Reaching one means the gate allowed the request.
const ok = (req: express.Request, res: express.Response) =>
  res.json({ reached: true, path: req.path });

// Gated surface — the fail-open list endpoints this middleware exists for.
app.get("/api/tasks", ok);
app.get("/api/bills", ok);
app.get("/api/checklist-templates", ok);
app.get("/api/checklist-templates/export", ok);
app.get("/api/projects/:id/bills", ok);
app.get("/api/projects/:id/actual-costs", ok);
app.get("/api/projects/:id/budget-actuals", ok);
app.get("/api/projects/:id/contract-metrics", ok);
app.get("/api/company-settings", ok);
app.patch("/api/company-settings", ok);
app.post("/api/bills/recompute-totals", ok);
// Must stay gated despite sharing a prefix with allowlisted entries.
app.get("/api/companies/:id", ok);
app.patch("/api/companies/:id", ok);
app.get("/api/companies/:companyId/non-working-days", ok);
app.get("/api/users/:id", ok);
app.patch("/api/users/:id/timezone", ok);
app.patch("/api/users/:id/xero-link", ok);
app.post("/api/users/:id/change-password", ok);

// Pre-company surface — everything a signup needs before a company exists.
app.get("/api/auth/user", ok);
app.post("/api/auth/login", ok);
app.post("/api/companies", ok);
app.patch("/api/users/:id", ok);
app.post("/api/billing/select-plan", ok);
app.get("/api/billing/plans", ok);
app.get("/api/portal/variation/:token", ok);

let baseUrl = "";
let server: Server;

async function req(
  method: string,
  path: string,
  identity: "with-company" | "no-company" | "anonymous" = "with-company",
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-identity": identity },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** Reached the handler — the gate allowed it. */
async function assertPasses(method: string, path: string, identity: any, why: string) {
  const r = await req(method, path, identity);
  assert.strictEqual(r.status, 200, `${method} ${path} → ${r.status} (${JSON.stringify(r.body)}) — ${why}`);
  assert.strictEqual(r.body?.reached, true, `${method} ${path} did not reach its handler — ${why}`);
}

/** Blocked by the gate — 403 specifically, with no data in the body. */
async function assertBlocked(method: string, path: string, identity: any, why: string) {
  const r = await req(method, path, identity);
  assert.strictEqual(
    r.status,
    403,
    `${method} ${path} → ${r.status} instead of 403 (${JSON.stringify(r.body)}) — ${why}`,
  );
  assert.strictEqual(r.body?.error, "company_required", `${method} ${path} blocked by something other than requireCompany`);
  assert.notStrictEqual(r.body?.reached, true, `${method} ${path} reached its handler despite the 403`);
}

// ---------------------------------------------------------------------------
async function main() {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  console.log(`\nrequireCompany gate (real middleware, stub routes, no DB) — ${baseUrl}\n`);

  // 1 — a session WITH a company reaches gated routes.
  await test("session with a companyId passes the gate on every gated route", async () => {
    for (const [method, path] of [
      ["GET", "/api/tasks"],
      ["GET", "/api/bills"],
      ["GET", "/api/checklist-templates"],
      ["GET", "/api/checklist-templates/export"],
      ["GET", "/api/projects/p1/bills"],
      ["GET", "/api/projects/p1/actual-costs"],
      ["GET", "/api/projects/p1/budget-actuals"],
      ["GET", "/api/projects/p1/contract-metrics"],
      ["GET", "/api/company-settings"],
      ["PATCH", "/api/company-settings"],
      ["POST", "/api/bills/recompute-totals"],
    ] as const) {
      await assertPasses(method, path, "with-company", "a normal session must not be blocked");
    }
  });

  // 2 — a session with NO company is blocked with 403, not 500, not data.
  await test("session with no companyId is blocked with 403 on every gated route", async () => {
    for (const [method, path] of [
      ["GET", "/api/tasks"],
      ["GET", "/api/bills"],
      ["GET", "/api/checklist-templates"],
      ["GET", "/api/checklist-templates/export"],
      ["GET", "/api/projects/p1/bills"],
      ["GET", "/api/projects/p1/actual-costs"],
      ["GET", "/api/projects/p1/budget-actuals"],
      ["GET", "/api/projects/p1/contract-metrics"],
      ["GET", "/api/company-settings"],
      ["PATCH", "/api/company-settings"],
      ["POST", "/api/bills/recompute-totals"],
    ] as const) {
      await assertBlocked(method, path, "no-company", "this is the fail-open surface the gate exists to close");
    }
  });

  // 3 — the signup-outage check: onboarding must still work with no company.
  await test("pre-company routes still pass with no companyId (onboarding is not blocked)", async () => {
    await assertPasses("GET", "/api/auth/user", "no-company", "the client cannot render onboarding without this");
    await assertPasses("POST", "/api/auth/login", "no-company", "login must work before a company exists");
    await assertPasses("POST", "/api/companies", "no-company", "this is the step that CREATES the company");
    await assertPasses("POST", "/api/billing/select-plan", "no-company", "final onboarding step");
    await assertPasses("GET", "/api/billing/plans", "no-company", "plan picker during onboarding");
  });

  await test("onboarding profile step (PATCH own user) passes with no companyId", async () => {
    await assertPasses(
      "PATCH",
      `/api/users/${USER_NO_COMPANY}`,
      "no-company",
      "the onboarding profile step edits the user's own record",
    );
  });

  // 4 — the allowlist must not over-reach.
  await test("PATCH of ANOTHER user is still blocked with no companyId", async () => {
    await assertBlocked(
      "PATCH",
      "/api/users/some-other-user",
      "no-company",
      "the self-only rule is what stops this being the admin user-edit endpoint",
    );
  });

  await test("the /companies allowlist entry does not leak to /companies/:id", async () => {
    await assertBlocked("GET", "/api/companies/other-co", "no-company", "POST /companies is matched exactly");
    await assertBlocked("PATCH", "/api/companies/other-co", "no-company", "POST /companies is matched exactly");
    await assertBlocked(
      "GET",
      "/api/companies/other-co/non-working-days",
      "no-company",
      "a prefix rule would have exposed this",
    );
  });

  await test("the /users allowlist entry does not leak to /users/:id subpaths", async () => {
    await assertBlocked("GET", `/api/users/${USER_NO_COMPANY}`, "no-company", "GET is not allowlisted, only PATCH");
    await assertBlocked("PATCH", `/api/users/${USER_NO_COMPANY}/timezone`, "no-company", "trailing segment must not match");
    await assertBlocked("PATCH", `/api/users/${USER_NO_COMPANY}/xero-link`, "no-company", "trailing segment must not match");
    await assertBlocked("POST", `/api/users/${USER_NO_COMPANY}/change-password`, "no-company", "trailing segment must not match");
  });

  await test("token-gated portal routes pass with no session at all", async () => {
    await assertPasses("GET", "/api/portal/variation/tok123", "anonymous", "portal callers have no session to scope");
  });

  // 5 — MemStorage fails closed.
  await test("MemStorage.getCompanySettings with no companyId throws", async () => {
    const mem = new MemStorage();
    await assert.rejects(
      async () => await (mem as any).getCompanySettings(),
      /requires a companyId/,
      "no-arg getCompanySettings returned instead of throwing — the unscoped fallback is back",
    );
    await assert.rejects(
      async () => await (mem as any).getCompanySettings(undefined),
      /requires a companyId/,
      "getCompanySettings(undefined) did not throw",
    );
    await assert.rejects(
      async () => await (mem as any).getCompanySettings(""),
      /requires a companyId/,
      "getCompanySettings('') did not throw",
    );
  });

  await test("MemStorage.updateCompanySettings with no companyId throws", async () => {
    const mem = new MemStorage();
    await assert.rejects(
      async () => await (mem as any).updateCompanySettings({ companyName: "nope" }),
      /requires a companyId/,
      "no-arg updateCompanySettings did not throw",
    );
  });

  await test("MemStorage keeps each company's settings separate", async () => {
    const mem = new MemStorage();
    await mem.updateCompanySettings({ companyName: "Company A" } as any, "co-a");
    await mem.updateCompanySettings({ companyName: "Company B" } as any, "co-b");

    const a = await mem.getCompanySettings("co-a");
    const b = await mem.getCompanySettings("co-b");
    assert.strictEqual(a?.companyName, "Company A");
    assert.strictEqual(b?.companyName, "Company B");
    assert.notStrictEqual(a?.id, b?.id, "both companies share one settings row");

    // A company that has never saved gets nothing — not another tenant's row.
    const missing = await mem.getCompanySettings("co-never-saved");
    assert.strictEqual(missing, undefined, "an unknown company was handed an existing tenant's settings");
  });

  await test("MemStorage will not let the body re-point a row at another company", async () => {
    const mem = new MemStorage();
    await mem.updateCompanySettings({ companyName: "Company A" } as any, "co-a");
    await mem.updateCompanySettings({ companyName: "Hijacked", companyId: "co-a" } as any, "co-b");

    const a = await mem.getCompanySettings("co-a");
    assert.strictEqual(a?.companyName, "Company A", "company B rewrote company A's row via a companyId in the body");
    const b = await mem.getCompanySettings("co-b");
    assert.strictEqual(b?.companyId, "co-b", "the row was stamped with the companyId from the body");
  });

  console.log(`\nrequireCompany: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) console.error("Failed tests:\n  - " + failures.join("\n  - "));
}

main()
  .then(() => {
    server?.close();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("\nFATAL: test harness crashed\n", err);
    server?.close();
    process.exit(1);
  });

/**
 * Contract-freeze tests.
 *
 * Business rule under test: once a job is contracted, the contract sum must not
 * change — only an approved variation may change what the client owes.
 *
 * Morada used to recompute the "original contract" live from the selected
 * estimate on every read, so editing a contracted estimate silently moved the
 * client's number. The sharpest symptom was a DOUBLE-CREDIT: excluding an
 * allowance shrank the live estimate (credit #1, silent, no paperwork) and the
 * deduction variation raised for it credited the same amount again (credit #2).
 *
 * This is the INTEGRATION half — the plumbing:
 *   1. Approve does NOT freeze (stage 1 deliberately tracks the estimate live).
 *   2. approved -> contract snapshots ex + inc GST, contractedAt, estimate id.
 *   3. GET /api/projects/:id/contract-metrics returns the frozen original and
 *      IGNORES a later estimate edit.
 *   4. recomputeContractPriceSnapshots skips contracted jobs.
 *   5. backfillContractedTotals fills an unfrozen contracted job, and a second
 *      run writes nothing (idempotent / self-disabling).
 *   6. Reverting the contract releases the freeze.
 *
 * The pure seam (computeContractMetricsCents with a frozen sum, including the
 * double-credit scenario) is covered without a DB by
 * contract-freeze-metrics.test.ts.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/contract-freeze.test.ts
 *
 * REQUIRES migration 0042_project_contracted_total to have been applied to the
 * database this points at.
 *
 * NOTE: this is an integration test — it talks to the same database the dev
 * server uses. Every row it creates is namespaced to one throwaway company and
 * deleted again in the cleanup phase.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import express from "express";
import assert from "node:assert";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { pool } from "../db";

let baseUrl = "";
let httpServer: any = null;

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
// HTTP helpers (mirrors tenant-isolation.test.ts)
// ---------------------------------------------------------------------------
function extractCookie(res: Response): string | null {
  const setCookies = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of setCookies) {
    if (c.startsWith("connect.sid=")) return c.split(";")[0];
  }
  return null;
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string | null; body?: any } = {},
): Promise<{ status: number; body: any; raw: Response }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // The session cookie is `secure` and the app trusts the proxy header, so
      // spoof HTTPS to establish a session over the plain-HTTP test connection.
      "X-Forwarded-Proto": "https",
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, raw: res };
}

// ---------------------------------------------------------------------------
// INTEGRATION tests — the plumbing.
// ---------------------------------------------------------------------------
interface Ctx {
  userId: string;
  companyId: string;
  cookie: string;
  projectId: string;
  estimateId: string;
}

async function createContext(): Promise<Ctx> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `contract-freeze-${unique}@freezetest.local`;
  const password = "FreezeTest123!";

  const reg = await api("POST", "/api/auth/register", {
    body: { email, password, firstName: "Freeze", lastName: "Test" },
  });
  assert.strictEqual(reg.status, 200, `register failed: ${JSON.stringify(reg.body)}`);
  const userId = reg.body.user.id;

  const company = await storage.createCompany(
    { name: `Contract Freeze Test Co ${unique}` } as any,
    userId,
  );

  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.strictEqual(login.status, 200, `login failed: ${JSON.stringify(login.body)}`);
  const cookie = extractCookie(login.raw);
  assert.ok(cookie, "no session cookie");

  const project = await storage.createProject({
    name: `Freeze Test Project ${unique}`,
    companyId: company.id,
    ownerId: userId,
    projectSubStatus: "lead_new",
  } as any);

  const estimate = await storage.createEstimate({
    name: "Freeze Test Estimate",
    projectId: project.id,
    projectMarkupPercent: 0,
    taxRate: 10,
  } as any);

  // One $100,000 ex-GST priced line -> $110,000 inc GST.
  await storage.createEstimateItem({
    estimateId: estimate.id,
    name: "Freeze Test Line",
    unitCostExTax: 100000,
    quantity: 1,
    markupPercent: 0,
  } as any);

  return { userId, companyId: company.id, cookie: cookie!, projectId: project.id, estimateId: estimate.id };
}

async function integrationTests(ctx: Ctx) {
  console.log("\nContract freeze — integration (dev DB)\n");

  const EXPECTED_EX = 10000000; // $100,000.00
  const EXPECTED_INC = 11000000; // $110,000.00

  await test("approve does NOT freeze (stage 1 tracks the estimate live)", async () => {
    const res = await api("POST", `/api/estimates/${ctx.estimateId}/approve`, { cookie: ctx.cookie });
    assert.strictEqual(res.status, 200, `approve failed: ${JSON.stringify(res.body)}`);
    const project = await storage.getProject(ctx.projectId);
    assert.strictEqual((project as any).contractedAt, null, "approve must not set contractedAt");
    assert.strictEqual((project as any).contractedTotalIncGstCents, null);
    // The live cache IS stamped at approve — that part is unchanged.
    assert.strictEqual(Number((project as any).contractPrice), EXPECTED_INC);
  });

  await test("approved -> contract snapshots ex + inc GST, contractedAt and the estimate id", async () => {
    const res = await api("POST", `/api/estimates/${ctx.estimateId}/contract`, { cookie: ctx.cookie });
    assert.strictEqual(res.status, 200, `contract failed: ${JSON.stringify(res.body)}`);
    const project = await storage.getProject(ctx.projectId);
    assert.strictEqual(Number((project as any).contractedTotalExGstCents), EXPECTED_EX);
    assert.strictEqual(Number((project as any).contractedTotalIncGstCents), EXPECTED_INC);
    assert.ok((project as any).contractedAt, "contractedAt must be stamped");
    assert.strictEqual((project as any).contractedEstimateId, ctx.estimateId);
  });

  await test("contract-metrics returns the frozen original and IGNORES a later estimate edit", async () => {
    const before = await api("GET", `/api/projects/${ctx.projectId}/contract-metrics`, { cookie: ctx.cookie });
    assert.strictEqual(before.status, 200);
    assert.strictEqual(before.body.originalContractPriceIncGstCents, EXPECTED_INC);

    // Edit the contracted estimate behind the lock — exactly what the allowance
    // "not included" flow does, and what used to move the client's number.
    const items = await storage.getEstimateItems(ctx.estimateId);
    assert.ok(items.length > 0, "precondition: estimate has a line");
    await storage.updateEstimateItem(items[0].id, { quantity: 0 } as any);

    // The live summary really has moved...
    const summary = await storage.getEstimateSummary(ctx.estimateId);
    assert.strictEqual(Math.round((summary.total || 0) * 100), 0, "precondition: live estimate dropped to $0");

    // ...but the contract has not.
    const after = await api("GET", `/api/projects/${ctx.projectId}/contract-metrics`, { cookie: ctx.cookie });
    assert.strictEqual(after.status, 200);
    assert.strictEqual(
      after.body.originalContractPriceIncGstCents,
      EXPECTED_INC,
      "THE BUG: an estimate edit moved the frozen contract",
    );
    assert.strictEqual(after.body.originalContractPriceExGstCents, EXPECTED_EX);
    assert.strictEqual(after.body.revisedContractPriceIncGstCents, EXPECTED_INC);

    // Restore so the later recompute/backfill checks read a sane estimate.
    await storage.updateEstimateItem(items[0].id, { quantity: 1 } as any);
  });

  await test("recomputeContractPriceSnapshots skips contracted jobs", async () => {
    // Drift the live cache, then prove the healer leaves the contracted job be.
    await storage.updateProject(ctx.projectId, { contractPrice: 12345 } as any);
    const result = await storage.recomputeContractPriceSnapshots();
    assert.ok(result.skippedContracted >= 1, "expected at least one contracted project to be skipped");
    const project = await storage.getProject(ctx.projectId);
    assert.strictEqual(
      Number((project as any).contractPrice),
      12345,
      "the recompute job rewrote a contracted project",
    );
    // And the freeze itself is untouched.
    assert.strictEqual(Number((project as any).contractedTotalIncGstCents), EXPECTED_INC);
  });

  await test("backfill fills an unfrozen contracted job, and a second run writes nothing", async () => {
    // Simulate a job contracted BEFORE the freeze existed: estimate is at
    // status "contract", project carries no frozen sum.
    await pool.query(
      `UPDATE projects
          SET contracted_total_ex_gst_cents = NULL,
              contracted_total_inc_gst_cents = NULL,
              contracted_at = NULL,
              contracted_estimate_id = NULL
        WHERE id = $1`,
      [ctx.projectId],
    );
    const unfrozen = await storage.getProject(ctx.projectId);
    assert.strictEqual((unfrozen as any).contractedAt, null, "precondition: project is unfrozen");

    const first = await storage.backfillContractedTotals();
    assert.ok(first.filled >= 1, "first backfill should fill at least this project");

    const project = await storage.getProject(ctx.projectId);
    assert.strictEqual(Number((project as any).contractedTotalExGstCents), EXPECTED_EX);
    assert.strictEqual(Number((project as any).contractedTotalIncGstCents), EXPECTED_INC);
    assert.strictEqual((project as any).contractedEstimateId, ctx.estimateId);
    const frozenAt = (project as any).contractedAt;
    assert.ok(frozenAt, "backfill must stamp contractedAt");

    // Second boot: nothing left to match, nothing written.
    const second = await storage.backfillContractedTotals();
    assert.strictEqual(second.scanned, 0, "backfill is not self-disabling — it rescanned");
    assert.strictEqual(second.filled, 0, "backfill wrote on a second run");

    const unchanged = await storage.getProject(ctx.projectId);
    assert.strictEqual(
      new Date((unchanged as any).contractedAt).getTime(),
      new Date(frozenAt).getTime(),
      "second backfill moved contractedAt",
    );
  });

  await test("reverting the contract releases the freeze", async () => {
    const res = await api("POST", `/api/estimates/${ctx.estimateId}/revert`, {
      cookie: ctx.cookie,
      body: { target: "approved" },
    });
    assert.strictEqual(res.status, 200, `revert failed: ${JSON.stringify(res.body)}`);
    const project = await storage.getProject(ctx.projectId);
    assert.strictEqual((project as any).contractedAt, null, "revert must clear contractedAt");
    assert.strictEqual((project as any).contractedTotalExGstCents, null);
    assert.strictEqual((project as any).contractedTotalIncGstCents, null);
    assert.strictEqual((project as any).contractedEstimateId, null);

    // And the metrics read live again.
    const metrics = await api("GET", `/api/projects/${ctx.projectId}/contract-metrics`, { cookie: ctx.cookie });
    assert.strictEqual(metrics.status, 200);
    assert.strictEqual(metrics.body.originalContractPriceIncGstCents, EXPECTED_INC);
  });
}

async function cleanup(companyIds: string[], userIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM estimate_items WHERE estimate_id IN (SELECT id FROM estimates WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1)))`, [companyIds]],
    [`UPDATE projects SET selected_estimate_id = NULL, contracted_estimate_id = NULL WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM estimates WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM budget_line_items WHERE budget_id IN (SELECT id FROM budgets WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1)))`, [companyIds]],
    [`DELETE FROM budgets WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM labour_hours_budget WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM projects WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM user_roles WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM sessions WHERE sess->>'userId' = ANY($1)`, [userIds]],
    [`DELETE FROM users WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM user_roles WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM companies WHERE id = ANY($1)`, [companyIds]],
  ];
  for (const [sql, params] of stmts) {
    try {
      await pool.query(sql, params);
    } catch (err: any) {
      console.warn(`[cleanup] skipped: ${err?.message || err}`);
    }
  }
}

async function main() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = await registerRoutes(app);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  const ctx = await createContext();
  try {
    await integrationTests(ctx);
  } finally {
    await cleanup([ctx.companyId], [ctx.userId]);
  }

  console.log(`\ncontract-freeze: ${passed} passed, ${failed} failed`);
  if (failures.length) console.log(`failed: ${failures.join(", ")}`);
  console.log("");
}

main()
  .then(async () => {
    try {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("\nFATAL: test harness crashed\n", err);
    try {
      await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });

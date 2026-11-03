/**
 * Operations workflows: each trigger fires its workflow once per event, the
 * steps make the right To-Dos and notifications, chains work (a To-Do a
 * workflow made can fire the next), and nothing crosses companies.
 *
 * Same harness as operations-tenancy.test.ts: the real Express app on an
 * ephemeral port, NODE_ENV=test (strict auth and permission checks), the dev
 * database, throwaway companies deleted at the end.
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/operations-workflows.test.ts
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

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

const HEADERS = { "Content-Type": "application/json", "X-Forwarded-Proto": "https" };

async function api(method: string, path: string, cookie: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...HEADERS, Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

async function register(label: string) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `ops-wf-${label}-${unique}@tenanttest.local`;
  const password = "TenantTest123!";
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email, password, firstName: label, lastName: "OpsWorkflows", agreeToTerms: true }),
  });
  const regText = await reg.text();
  assert.strictEqual(reg.status, 200, `register ${label}: ${regText}`);
  return { userId: JSON.parse(regText).user.id as string, email, password, unique };
}

async function login(email: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: HEADERS, body: JSON.stringify({ email, password }) });
  assert.strictEqual(res.status, 200, `login ${email}`);
  const cookie = ((res.headers as any).getSetCookie?.() ?? [])
    .find((c: string) => c.startsWith("connect.sid="))?.split(";")[0];
  assert.ok(cookie, `no session cookie for ${email}`);
  return cookie as string;
}

async function createTenant(label: string) {
  const u = await register(label);
  const company = await storage.createCompany({ name: `Ops Workflows Co ${label} ${u.unique}` } as any, u.userId);
  return { userId: u.userId, companyId: company.id as string, cookie: await login(u.email, u.password) };
}

const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;

// Workflows fire after the response, so wait for the run log to settle.
async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 20000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v as T;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const settle = (ms = 2500) => new Promise((r) => setTimeout(r, ms));
const runsOf = (workflowId: string) =>
  q(`SELECT * FROM workflow_runs WHERE workflow_id = $1 ORDER BY created_at`, [workflowId]);
const finishedRuns = async (workflowId: string, n: number) => {
  const rows = await runsOf(workflowId);
  return rows.length >= n && rows.every((r: any) => r.status !== "running") ? rows : null;
};

async function main() {
  const app = express();
  app.use(express.json());
  httpServer = await registerRoutes(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  console.log(`\nWorkflow engine tests (server on ${baseUrl})\n`);

  const A = await createTenant("A");
  const B = await createTenant("B");
  const companyIds = [A.companyId, B.companyId];
  try {
    const user = await storage.getUser(A.userId);
    const roleId = user!.roleId!;

    const tpl = async (cookie: string, title: string, extra: any = {}) => {
      const r = await api("POST", "/api/systems/task-templates", cookie, { title, category: "Site", checklist: [{ text: "One", completed: false }], ...extra });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      return r.body;
    };
    const fenceTpl = await tpl(A.cookie, "Order site fencing");
    const inspectTpl = await tpl(A.cookie, "Book first inspection", { isRecurringTemplate: true, isActive: false, frequency: "weekly", recurringDays: [1] });
    const bTpl = await tpl(B.cookie, "B's template");
    const projectA = await storage.createProject({ name: "Smith St", companyId: A.companyId, ownerId: A.userId, projectSubStatus: "lead_new", currentSystemPhase: "lead" } as any);
    const projectB = await storage.createProject({ name: "B Job", companyId: B.companyId, ownerId: B.userId, projectSubStatus: "lead_new", currentSystemPhase: "lead" } as any);

    const createWf = async (cookie: string, body: any) => api("POST", "/api/systems/workflow-templates", cookie, { isActive: true, ...body });

    await test("a workflow needs its trigger setting and a step", async () => {
      assert.strictEqual((await createWf(A.cookie, { name: "x", triggerType: "project_status", triggerConfig: {}, actions: [{ type: "create_task", taskTemplateId: fenceTpl.id }] })).status, 400);
      assert.strictEqual((await createWf(A.cookie, { name: "x", triggerType: "project_status", triggerConfig: { statusKey: "const_active" }, actions: [] })).status, 400);
      assert.strictEqual((await createWf(A.cookie, { name: "x", triggerType: "manual", actions: [{ type: "notify", recipient: { type: "template" }, message: "hi" }] })).status, 400);
    });

    await test("a workflow can't point at another company's template, role, person or document", async () => {
      const step = (a: any) => ({ name: "x", triggerType: "manual", actions: [a] });
      assert.strictEqual((await createWf(A.cookie, step({ type: "create_task", taskTemplateId: bTpl.id }))).status, 400);
      const bUser = await storage.getUser(B.userId);
      assert.strictEqual((await createWf(A.cookie, step({ type: "notify", recipient: { type: "role", roleId: bUser!.roleId }, message: "m" }))).status, 400);
      assert.strictEqual((await createWf(A.cookie, step({ type: "notify", recipient: { type: "user", userId: B.userId }, message: "m" }))).status, 400);
      assert.strictEqual((await createWf(A.cookie, { name: "x", triggerType: "task_completed", triggerConfig: { taskTemplateId: bTpl.id }, actions: [{ type: "create_task", taskTemplateId: fenceTpl.id }] })).status, 400);
    });

    await test("workflow steps can only target the team, not a client role", async () => {
      const clientRole = await storage.createUserRole({ name: `Client ${Date.now()}`, companyId: A.companyId, userCategory: "client", isBuiltIn: false } as any);
      const r = await createWf(A.cookie, { name: "x", triggerType: "manual", actions: [{ type: "notify", recipient: { type: "role", roleId: clientRole.id }, message: "m" }] });
      assert.strictEqual(r.status, 400, JSON.stringify(r.body));
      const t = await createWf(A.cookie, { name: "x", triggerType: "manual", actions: [{ type: "create_task", taskTemplateId: fenceTpl.id, assignee: { type: "role", roleId: clientRole.id } }] });
      assert.strictEqual(t.status, 400);
    });

    const statusWf = (await createWf(A.cookie, {
      name: "Construction start",
      triggerType: "project_status",
      triggerConfig: { statusKey: "const_active" },
      actions: [
        { type: "create_task", taskTemplateId: fenceTpl.id, offsetDays: 3, assignee: { type: "user", userId: A.userId } },
        { type: "create_task", taskTemplateId: inspectTpl.id, offsetDays: 0, assignee: { type: "role", roleId } },
        { type: "notify", recipient: { type: "role", roleId }, message: "Job is go" },
      ],
    })).body;
    const chainWf = (await createWf(A.cookie, {
      name: "After fencing",
      triggerType: "task_completed",
      triggerConfig: { taskTemplateId: fenceTpl.id },
      actions: [{ type: "notify", recipient: { type: "user", userId: A.userId }, message: "Fencing done, book the slab" }],
    })).body;
    const phaseWf = (await createWf(A.cookie, {
      name: "Into construction",
      triggerType: "project_phase",
      triggerConfig: { phase: "construction" },
      actions: [{ type: "notify", recipient: { type: "user", userId: A.userId }, message: "Construction phase" }],
    })).body;
    const docWf = (await createWf(A.cookie, {
      name: "SOP approved",
      triggerType: "doc_approved",
      triggerConfig: { docType: "sop" },
      actions: [{ type: "notify", recipient: { type: "role", roleId }, message: "New SOP" }],
    })).body;
    const offWf = (await createWf(A.cookie, {
      name: "Switched off",
      isActive: false,
      triggerType: "project_status",
      triggerConfig: { statusKey: "const_active" },
      actions: [{ type: "notify", recipient: { type: "user", userId: A.userId }, message: "never" }],
    })).body;
    assert.ok(statusWf?.id && chainWf?.id && phaseWf?.id && docWf?.id && offWf?.id, "workflows should save");

    let fenceTaskId = "";
    let inspectTaskId = "";

    await test("a project moving to the status runs the workflow: tasks, due dates, assignees, notification", async () => {
      const r = await api("PATCH", `/api/projects/${projectA.id}`, A.cookie, { projectSubStatus: "const_active" });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const [run] = await waitFor(() => finishedRuns(statusWf.id, 1), "status run");
      assert.strictEqual(run.status, "done", JSON.stringify(run.result));
      assert.strictEqual(run.project_id, projectA.id);
      assert.strictEqual(run.result.createdTaskIds.length, 2);
      const tasks = await q(`SELECT * FROM notes WHERE id = ANY($1)`, [run.result.createdTaskIds]);
      const fence = tasks.find((t: any) => t.template_id === fenceTpl.id);
      const inspect = tasks.find((t: any) => t.template_id === inspectTpl.id);
      fenceTaskId = fence.id; inspectTaskId = inspect.id;
      assert.strictEqual(fence.project_id, projectA.id);
      assert.strictEqual(fence.assignee_id, A.userId);
      assert.strictEqual(fence.reference_type, "workflow_run");
      assert.strictEqual(fence.type, "task");
      const days = Math.round((new Date(fence.due_date).getTime() - new Date(inspect.due_date).getTime()) / 86400000);
      assert.strictEqual(days, 3, "the fencing task should be due 3 days after the inspection one");
      assert.strictEqual(inspect.assignee_id, A.userId, "the role step should reach the role's member");
      assert.strictEqual(fence.checklist.length, 1);
      const notes = await q(`SELECT * FROM notifications WHERE company_id = $1 AND type = 'workflow_message'`, [A.companyId]);
      assert.strictEqual(notes.length, 1);
      assert.match(notes[0].message, /Job is go/);
      assert.strictEqual(notes[0].link, `/projects/${projectA.id}`);
    });

    await test("an inactive workflow doesn't fire", async () => {
      assert.strictEqual((await runsOf(offWf.id)).length, 0);
    });

    await test("moving away and back doesn't fire it again", async () => {
      await api("PATCH", `/api/projects/${projectA.id}`, A.cookie, { projectSubStatus: "lead_new" });
      await api("PATCH", `/api/projects/${projectA.id}`, A.cookie, { projectSubStatus: "const_active" });
      await settle();
      assert.strictEqual((await runsOf(statusWf.id)).length, 1);
    });

    await test("a phase change fires the phase workflow once", async () => {
      await api("PATCH", `/api/projects/${projectA.id}`, A.cookie, { projectStatus: "construction" });
      const runs = await waitFor(() => finishedRuns(phaseWf.id, 1), "phase run");
      assert.strictEqual(runs[0].status, "done", JSON.stringify(runs[0].result));
    });

    await test("completing the workflow's task fires the next workflow, once", async () => {
      const r = await api("PATCH", `/api/tasks/${fenceTaskId}`, A.cookie, { status: "done" });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const [run] = await waitFor(() => finishedRuns(chainWf.id, 1), "chain run");
      assert.strictEqual(run.status, "done", JSON.stringify(run.result));
      await api("PATCH", `/api/tasks/${fenceTaskId}`, A.cookie, { status: "todo" });
      await api("PATCH", `/api/tasks/${fenceTaskId}/status`, A.cookie, { status: "done" });
      await settle();
      assert.strictEqual((await runsOf(chainWf.id)).length, 1);
    });

    await test("a workflow's one-off from a weekly template doesn't roll on to next week", async () => {
      await api("PATCH", `/api/tasks/${inspectTaskId}`, A.cookie, { status: "done" });
      await settle(1500);
      const rows = await q(`SELECT count(*)::int AS n FROM notes WHERE company_id = $1 AND template_id = $2`, [A.companyId, inspectTpl.id]);
      assert.strictEqual(rows[0].n, 1);
    });

    await test("approving an SOP fires the doc workflow; a policy doesn't", async () => {
      const sop = (await api("POST", "/api/docs", A.cookie, { title: "Slab pour", docType: "sop", contentHtml: "<p>x</p>", contentText: "x" })).body;
      const policy = (await api("POST", "/api/docs", A.cookie, { title: "Leave", docType: "policy", contentHtml: "<p>y</p>", contentText: "y" })).body;
      assert.strictEqual((await api("POST", `/api/docs/${policy.id}/approve`, A.cookie)).status, 200);
      assert.strictEqual((await api("POST", `/api/docs/${sop.id}/approve`, A.cookie)).status, 200);
      const [run] = await waitFor(() => finishedRuns(docWf.id, 1), "doc run");
      assert.strictEqual(run.status, "done");
      assert.match(run.summary, /Slab pour/);
      await settle(1500);
      assert.strictEqual((await runsOf(docWf.id)).length, 1);
    });

    await test("another company's events never fire A's workflows", async () => {
      const before = (await q(`SELECT count(*)::int AS n FROM workflow_runs WHERE company_id = $1`, [A.companyId]))[0].n;
      await api("PATCH", `/api/projects/${projectB.id}`, B.cookie, { projectSubStatus: "const_active" });
      await settle();
      const after = (await q(`SELECT count(*)::int AS n FROM workflow_runs WHERE company_id = $1`, [A.companyId]))[0].n;
      assert.strictEqual(after, before);
      assert.strictEqual((await q(`SELECT count(*)::int AS n FROM notes WHERE company_id = $1`, [B.companyId]))[0].n, 0);
    });

    await test("Run by hand runs every time, on your own projects only", async () => {
      const one = await api("POST", `/api/systems/workflow-templates/${statusWf.id}/run`, A.cookie, { projectId: projectA.id });
      assert.strictEqual(one.status, 201, JSON.stringify(one.body));
      assert.strictEqual(one.body.status, "done");
      const two = await api("POST", `/api/systems/workflow-templates/${statusWf.id}/run`, A.cookie, {});
      assert.strictEqual(two.status, 201);
      assert.strictEqual((await runsOf(statusWf.id)).length, 3);
      assert.strictEqual((await api("POST", `/api/systems/workflow-templates/${statusWf.id}/run`, A.cookie, { projectId: projectB.id })).status, 404);
      assert.strictEqual((await api("POST", `/api/systems/workflow-templates/${statusWf.id}/run`, B.cookie, {})).status, 404);
    });

    await test("the run log lists runs for the owner only", async () => {
      const r = await api("GET", `/api/systems/workflow-templates/${statusWf.id}/runs`, A.cookie);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 3);
      assert.strictEqual(r.body.find((x: any) => x.projectId)?.projectName, "Smith St");
      assert.strictEqual((await api("GET", `/api/systems/workflow-templates/${statusWf.id}/runs`, B.cookie)).status, 404);
    });

    await test("a deleted task template fails that step but the rest still run", async () => {
      const wf = (await createWf(A.cookie, {
        name: "Partial", triggerType: "manual",
        actions: [
          { type: "create_task", taskTemplateId: fenceTpl.id },
          { type: "notify", recipient: { type: "user", userId: A.userId }, message: "still sent" },
        ],
      })).body;
      await pool.query(`DELETE FROM task_templates WHERE id = $1`, [fenceTpl.id]).catch(() => null);
      await pool.query(`UPDATE notes SET template_id = NULL WHERE template_id = $1`, [fenceTpl.id]);
      await pool.query(`DELETE FROM task_templates WHERE id = $1`, [fenceTpl.id]);
      const r = await api("POST", `/api/systems/workflow-templates/${wf.id}/run`, A.cookie, {});
      assert.strictEqual(r.body.status, "partial", JSON.stringify(r.body));
      assert.strictEqual(r.body.result.notifiedUserIds.length, 1);
      assert.match(r.body.result.errors[0], /Step 1/);
    });

    await test("two identical events at once run a workflow once", async () => {
      const { dispatchWorkflowEvent } = await import("../services/workflowEngine");
      const ev = { type: "doc_approved" as const, companyId: A.companyId, docId: "same-doc", docTitle: "Twice", docType: "sop", version: 9, actor: { id: A.userId, name: "A" } };
      await Promise.all([dispatchWorkflowEvent(ev), dispatchWorkflowEvent(ev)]);
      const rows = await q(`SELECT count(*)::int AS n FROM workflow_runs WHERE workflow_id = $1 AND event_key = 'doc:same-doc:v9'`, [docWf.id]);
      assert.strictEqual(rows[0].n, 1);
    });
  } finally {
    await cleanup(companyIds);
  }
}

async function cleanup(companyIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM workflow_runs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM workflow_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notifications WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notes WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM task_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM doc_versions WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM docs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM activities WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM projects WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM user_roles WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM sessions WHERE sess->>'userId' IN (SELECT id FROM users WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM company_settings WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM users WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM user_roles WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM companies WHERE id = ANY($1)`, [companyIds]],
  ];
  for (const [sql, params] of stmts) {
    try { await pool.query(sql, params); } catch (err: any) { console.warn(`[cleanup] skipped: ${err?.message || err}`); }
  }
}

async function shutdown(code: number) {
  try { await new Promise<void>((resolve) => httpServer?.close(() => resolve())); } catch {}
  try { await pool.end(); } catch {}
  console.log(`\noperations-workflows: ${passed} passed, ${failed} failed`);
  process.exit(code);
}

main()
  .then(() => shutdown(failed > 0 ? 1 : 0))
  .catch((err) => { console.error("\nFATAL: test harness crashed\n", err); shutdown(1); });

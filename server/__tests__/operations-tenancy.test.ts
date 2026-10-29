/**
 * Cross-tenant checks for the Operations routes: docs library, doc folders,
 * task templates, workflow templates and project workflows.
 *
 * Each of these was reachable across companies before:
 *   - /api/project-workflows/* read, edited and deleted by id alone (the table
 *     has no companyId — it is owned through its project)
 *   - PATCH /api/doc-folders/:id had no ownership check, and a {companyId} in
 *     the body moved the folder into the caller's tenant
 *   - PATCH /api/docs/:id passed the raw body to .set(), so a doc could be
 *     moved into another tenant or filed under a foreign folder
 *   - task / workflow templates saved foreign project, template and role ids
 *
 * Company B (an admin, so permission gates pass and ownership is what's under
 * test) attacks company A's records. Same harness as tenant-isolation.test.ts:
 * real Express app, NODE_ENV=test, the dev database, throwaway companies that
 * are deleted at the end.
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/operations-tenancy.test.ts
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

async function api(method: string, path: string, cookie: string, body?: any) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https", Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

async function createTenant(label: string) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `ops-tenancy-${label}-${unique}@tenanttest.local`;
  const password = "TenantTest123!";
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
    body: JSON.stringify({ email, password, firstName: label, lastName: "OpsTenancy", agreeToTerms: true }),
  });
  const regText = await reg.text();
  assert.strictEqual(reg.status, 200, `register ${label}: ${regText}`);
  const userId = JSON.parse(regText).user.id;
  const company = await storage.createCompany({ name: `Ops Tenancy Co ${label} ${unique}` } as any, userId);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
    body: JSON.stringify({ email, password }),
  });
  assert.strictEqual(login.status, 200, `login ${label}`);
  const cookie = ((login.headers as any).getSetCookie?.() ?? [])
    .find((c: string) => c.startsWith("connect.sid="))?.split(";")[0];
  assert.ok(cookie, `no session cookie for ${label}`);
  return { userId, companyId: company.id as string, cookie: cookie as string };
}

async function main() {
  const app = express();
  app.use(express.json());
  httpServer = await registerRoutes(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  console.log(`\nOperations cross-tenant tests (server on ${baseUrl})\n`);

  const A = await createTenant("A");
  const B = await createTenant("B");
  try {
    const projectA = await storage.createProject({ name: "Ops A Project", companyId: A.companyId, ownerId: A.userId, projectSubStatus: "lead_new" } as any);
    const projectB = await storage.createProject({ name: "Ops B Project", companyId: B.companyId, ownerId: B.userId, projectSubStatus: "lead_new" } as any);
    const workflowTplA = await storage.createWorkflowTemplate({ name: "WF A", companyId: A.companyId } as any);
    const workflowTplB = await storage.createWorkflowTemplate({ name: "WF B", companyId: B.companyId } as any);
    const projectWorkflowA = await storage.createProjectWorkflow({ projectId: projectA.id, workflowTemplateId: workflowTplA.id } as any);
    const taskTplA = await storage.createTaskTemplate({ title: "Task A", companyId: A.companyId } as any);
    const folderA = await storage.createDocFolder({ name: "Folder A", companyId: A.companyId } as any);
    const folderB = await storage.createDocFolder({ name: "Folder B", companyId: B.companyId } as any);
    const docB = await storage.createDoc({ title: "Doc B", companyId: B.companyId } as any);

    // --- project workflows ---
    await test("B cannot read A's project workflow", async () => {
      assert.strictEqual((await api("GET", `/api/project-workflows/${projectWorkflowA.id}`, B.cookie)).status, 404);
    });
    await test("B cannot list A's project's workflows", async () => {
      assert.strictEqual((await api("GET", `/api/projects/${projectA.id}/workflows`, B.cookie)).status, 404);
    });
    await test("B cannot edit A's project workflow", async () => {
      const r = await api("PATCH", `/api/project-workflows/${projectWorkflowA.id}`, B.cookie, { status: "cancelled" });
      assert.strictEqual(r.status, 404);
      assert.strictEqual((await storage.getProjectWorkflow(projectWorkflowA.id))?.status, "pending");
    });
    await test("B cannot delete A's project workflow", async () => {
      assert.strictEqual((await api("DELETE", `/api/project-workflows/${projectWorkflowA.id}`, B.cookie)).status, 404);
      assert.ok(await storage.getProjectWorkflow(projectWorkflowA.id), "A's workflow was deleted");
    });
    await test("B cannot attach a workflow to A's project", async () => {
      const r = await api("POST", "/api/project-workflows", B.cookie, { projectId: projectA.id, workflowTemplateId: workflowTplB.id });
      assert.strictEqual(r.status, 404);
    });
    await test("B cannot run A's workflow template on its own project", async () => {
      const r = await api("POST", "/api/project-workflows", B.cookie, { projectId: projectB.id, workflowTemplateId: workflowTplA.id });
      assert.strictEqual(r.status, 400);
    });
    await test("B can attach its own workflow to its own project", async () => {
      const r = await api("POST", "/api/project-workflows", B.cookie, { projectId: projectB.id, workflowTemplateId: workflowTplB.id });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    });

    // --- doc folders ---
    await test("B cannot rename A's doc folder", async () => {
      const r = await api("PATCH", `/api/doc-folders/${folderA.id}`, B.cookie, { name: "pwned" });
      assert.strictEqual(r.status, 404);
      const still = (await storage.getDocFolders(A.companyId)).find((f) => f.id === folderA.id);
      assert.strictEqual(still?.name, "Folder A");
    });
    await test("a folder can't be moved into another company via the body", async () => {
      const r = await api("PATCH", `/api/doc-folders/${folderB.id}`, B.cookie, { name: "Folder B2", companyId: A.companyId });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.ok((await storage.getDocFolders(B.companyId)).some((f) => f.id === folderB.id), "folder left company B");
    });
    await test("B cannot nest a folder under A's folder", async () => {
      const r = await api("POST", "/api/doc-folders", B.cookie, { name: "child", parentFolderId: folderA.id });
      assert.strictEqual(r.status, 400);
    });

    // --- docs ---
    await test("a doc can't be moved into another company via the body", async () => {
      const r = await api("PATCH", `/api/docs/${docB.id}`, B.cookie, { title: "Doc B2", companyId: A.companyId });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual((await storage.getDoc(docB.id))?.companyId, B.companyId);
    });
    await test("B cannot file a doc under A's folder", async () => {
      assert.strictEqual((await api("POST", "/api/docs", B.cookie, { title: "x", folderId: folderA.id })).status, 400);
      assert.strictEqual((await api("PATCH", `/api/docs/${docB.id}`, B.cookie, { folderId: folderA.id })).status, 400);
    });
    await test("B can file a doc under its own folder", async () => {
      const r = await api("POST", "/api/docs", B.cookie, { title: "mine", folderId: folderB.id });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    });

    // --- templates ---
    await test("a task template can't point at A's project", async () => {
      const r = await api("POST", "/api/systems/task-templates", B.cookie, { title: "t", projectId: projectA.id });
      assert.strictEqual(r.status, 400);
    });
    await test("a workflow template can't use A's task template", async () => {
      const r = await api("POST", "/api/systems/workflow-templates", B.cookie, { name: "w", taskTemplateIds: [taskTplA.id] });
      assert.strictEqual(r.status, 400);
      const p = await api("PATCH", `/api/systems/workflow-templates/${workflowTplB.id}`, B.cookie, { taskConfigs: [{ templateId: taskTplA.id }] });
      assert.strictEqual(p.status, 400);
    });
  } finally {
    await cleanup([A.companyId, B.companyId]);
  }
}

async function cleanup(companyIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM project_workflows WHERE project_id IN (SELECT id FROM projects WHERE company_id = ANY($1))`, [companyIds]],
    [`DELETE FROM workflow_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notes WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM task_templates WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM docs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM doc_folders WHERE company_id = ANY($1)`, [companyIds]],
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
  console.log(`\noperations-tenancy: ${passed} passed, ${failed} failed`);
  process.exit(code);
}

main()
  .then(() => shutdown(failed > 0 ? 1 : 0))
  .catch((err) => { console.error("\nFATAL: test harness crashed\n", err); shutdown(1); });

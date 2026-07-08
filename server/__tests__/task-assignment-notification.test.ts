/**
 * Task assignment notification integration tests.
 *
 * Verifies that `task_assigned` notifications fire from every task-assignee
 * write path (create, edit, bulk copy), not just the edit path, per the
 * shared `notifyTaskAssignment` helper in server/utils/domainNotifications.ts.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/task-assignment-notification.test.ts
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
    console.log(`  \u2713 ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.error(`  \u2717 ${name}\n      ${err?.message || err}`);
  }
}

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

interface Tenant {
  userId: string;
  email: string;
  password: string;
  companyId: string;
  cookie: string;
}

async function registerUser(label: string): Promise<{ userId: string; email: string; password: string }> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `task-assign-${label}-${unique}@tasktest.local`;
  const password = "TaskTest123!";

  const reg = await api("POST", "/api/auth/register", {
    body: { email, password, firstName: label, lastName: "TaskTest" },
  });
  assert.strictEqual(reg.status, 200, `register ${label} failed: ${JSON.stringify(reg.body)}`);
  const userId = reg.body.user.id;
  return { userId, email, password };
}

async function loginAs(email: string, password: string, label: string): Promise<string> {
  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.strictEqual(login.status, 200, `login ${label} failed: ${JSON.stringify(login.body)}`);
  const cookie = extractCookie(login.raw);
  assert.ok(cookie, `no session cookie for ${label}`);
  return cookie!;
}

// Registers a fresh user and attaches a brand-new company to them. This also
// assigns the built-in admin role (General Manager), which clears
// requirePermission gates.
async function createTenant(label: string): Promise<Tenant> {
  const { userId, email, password } = await registerUser(label);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const company = await storage.createCompany(
    { name: `Task Assign Co ${label} ${unique}` } as any,
    userId,
  );
  const cookie = await loginAs(email, password, label);
  return { userId, email, password, companyId: company.id, cookie };
}

// Registers a fresh user and moves them directly into an existing company,
// simulating an existing teammate (no company of their own).
async function createTeammate(label: string, companyId: string): Promise<Tenant> {
  const { userId, email, password } = await registerUser(label);
  await storage.updateUser(userId, { companyId } as any);
  const cookie = await loginAs(email, password, label);
  return { userId, email, password, companyId, cookie };
}

async function getNotifications(tenant: Tenant): Promise<any[]> {
  const r = await api("GET", "/api/notifications", { cookie: tenant.cookie });
  assert.strictEqual(r.status, 200, `get notifications failed: ${JSON.stringify(r.body)}`);
  return Array.isArray(r.body) ? r.body : r.body.notifications || [];
}

async function taskAssignedNotifsFor(tenant: Tenant, taskId: string): Promise<any[]> {
  const notifs = await getNotifications(tenant);
  return notifs.filter((n: any) => n.type === "task_assigned" && n.entityId === taskId);
}

async function main() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: false }));
  httpServer = await registerRoutes(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = httpServer.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  console.log(`\nTask assignment notification tests (server on ${baseUrl})\n`);

  const A = await createTenant("A");
  const B = await createTeammate("B", A.companyId);
  const C = await createTeammate("C", A.companyId);
  const companyIds = [A.companyId, B.companyId, C.companyId];
  const userIds = [A.userId, B.userId, C.userId];

  try {
    await test("creating a task with an assignee notifies that assignee", async () => {
      const r = await api("POST", "/api/tasks", {
        cookie: A.cookie,
        body: { title: "New task for B", type: "task", content: "", assigneeId: B.userId },
      });
      assert.strictEqual(r.status, 201, `create failed: ${JSON.stringify(r.body)}`);
      const task = r.body;
      const notifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(notifs.length, 1, "expected exactly one task_assigned notification for B");
      assert.ok(notifs[0].message.includes("New task for B"), "notification message missing task title");
    });

    await test("self-assigning on create does not notify the actor", async () => {
      const r = await api("POST", "/api/tasks", {
        cookie: A.cookie,
        body: { title: "Self assigned task", type: "task", content: "", assigneeId: A.userId },
      });
      assert.strictEqual(r.status, 201, `create failed: ${JSON.stringify(r.body)}`);
      const task = r.body;
      const notifs = await taskAssignedNotifsFor(A, task.id);
      assert.strictEqual(notifs.length, 0, "actor should not be notified of self-assignment");
    });

    await test("editing a task to change assignee notifies the newly-assigned user", async () => {
      const create = await api("POST", "/api/tasks", {
        cookie: A.cookie,
        body: { title: "Reassign me", type: "task", content: "" },
      });
      assert.strictEqual(create.status, 201, `create failed: ${JSON.stringify(create.body)}`);
      const task = create.body;

      const patch = await api("PATCH", `/api/tasks/${task.id}`, {
        cookie: A.cookie,
        body: { assigneeId: B.userId },
      });
      assert.strictEqual(patch.status, 200, `patch failed: ${JSON.stringify(patch.body)}`);

      const notifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(notifs.length, 1, "expected exactly one task_assigned notification for B after edit");
    });

    await test("re-saving a task with the same assignee does not duplicate the notification", async () => {
      const create = await api("POST", "/api/tasks", {
        cookie: A.cookie,
        body: { title: "No-op resave", type: "task", content: "", assigneeId: B.userId },
      });
      assert.strictEqual(create.status, 201, `create failed: ${JSON.stringify(create.body)}`);
      const task = create.body;

      // one notification from creation
      let notifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(notifs.length, 1, "expected exactly one notification after creation");

      // re-save with the same assignee (and an unrelated field change)
      const patch = await api("PATCH", `/api/tasks/${task.id}`, {
        cookie: A.cookie,
        body: { assigneeId: B.userId, priority: "high" },
      });
      assert.strictEqual(patch.status, 200, `patch failed: ${JSON.stringify(patch.body)}`);

      notifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(notifs.length, 1, "no-op re-save must not create a duplicate notification");
    });

    await test("bulk copyToBusiness carries the assignee and notifies them", async () => {
      const create = await api("POST", "/api/tasks", {
        cookie: A.cookie,
        body: { title: "Copy me to business", type: "task", content: "", assigneeId: B.userId, projectId: null },
      });
      assert.strictEqual(create.status, 201, `create failed: ${JSON.stringify(create.body)}`);
      const task = create.body;

      // Consume the creation notification so we can isolate the copy's notification.
      let notifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(notifs.length, 1, "expected exactly one notification after creation");

      const bulk = await api("POST", "/api/tasks/bulk-action", {
        cookie: A.cookie,
        body: { ids: [task.id], action: "copyToBusiness" },
      });
      assert.strictEqual(bulk.status, 200, `bulk action failed: ${JSON.stringify(bulk.body)}`);
      assert.strictEqual(bulk.body.success, 1, "bulk copy did not report success");

      const allNotifs = await getNotifications(B);
      const copyNotifs = allNotifs.filter(
        (n: any) => n.type === "task_assigned" && n.entityId !== task.id && n.message.includes("Copy me to business"),
      );
      assert.strictEqual(copyNotifs.length, 1, "expected exactly one notification for the copied task");
    });

    await test("creating a task with multiple assignees notifies all of them (excluding self)", async () => {
      const r = await api("POST", "/api/tasks", {
        cookie: A.cookie,
        body: {
          title: "Multi-assignee create",
          type: "task",
          content: "",
          assigneeIds: [B.userId, C.userId, A.userId],
        },
      });
      assert.strictEqual(r.status, 201, `create failed: ${JSON.stringify(r.body)}`);
      const task = r.body;

      const bNotifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(bNotifs.length, 1, "expected B to be notified once");
      const cNotifs = await taskAssignedNotifsFor(C, task.id);
      assert.strictEqual(cNotifs.length, 1, "expected C to be notified once");
      const aNotifs = await taskAssignedNotifsFor(A, task.id);
      assert.strictEqual(aNotifs.length, 0, "actor should never be notified of their own assignment");
    });

    await test("adding a new assignee to an already-assigned task only notifies the new one", async () => {
      const create = await api("POST", "/api/tasks", {
        cookie: A.cookie,
        body: { title: "Add a second assignee", type: "task", content: "", assigneeIds: [B.userId] },
      });
      assert.strictEqual(create.status, 201, `create failed: ${JSON.stringify(create.body)}`);
      const task = create.body;

      let bNotifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(bNotifs.length, 1, "expected exactly one notification for B after creation");

      const patch = await api("PATCH", `/api/tasks/${task.id}`, {
        cookie: A.cookie,
        body: { assigneeIds: [B.userId, C.userId] },
      });
      assert.strictEqual(patch.status, 200, `patch failed: ${JSON.stringify(patch.body)}`);

      bNotifs = await taskAssignedNotifsFor(B, task.id);
      assert.strictEqual(bNotifs.length, 1, "B was already assigned; must not get a duplicate notification");
      const cNotifs = await taskAssignedNotifsFor(C, task.id);
      assert.strictEqual(cNotifs.length, 1, "C is the newly-added assignee and must be notified");
    });
  } finally {
    await cleanup(companyIds, userIds);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error("Failed tests:\n  - " + failures.join("\n  - "));
  }
}

async function cleanup(companyIds: string[], userIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM notifications WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notes WHERE company_id = ANY($1)`, [companyIds]],
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

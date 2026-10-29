/**
 * Library sign-off: draft → in review → approved, with every approval kept as a
 * version, edits reopening an approved doc, archive/restore, and the
 * permission split between editing and approving.
 *
 * Same harness as operations-tenancy.test.ts: the real Express app on an
 * ephemeral port, NODE_ENV=test (strict auth and permission checks), the dev
 * database, throwaway companies deleted at the end.
 *
 * Run with:  NODE_ENV=test npx tsx --env-file-if-exists=.env server/__tests__/operations-library.test.ts
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
  const email = `ops-library-${label}-${unique}@tenanttest.local`;
  const password = "TenantTest123!";
  const reg = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email, password, firstName: label, lastName: "OpsLibrary", agreeToTerms: true }),
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
  const company = await storage.createCompany({ name: `Ops Library Co ${label} ${u.unique}` } as any, u.userId);
  return { userId: u.userId, companyId: company.id as string, cookie: await login(u.email, u.password) };
}

const p = (html: string) => ({ contentHtml: html, contentText: html.replace(/<[^>]+>/g, " ") });

async function main() {
  const app = express();
  app.use(express.json());
  httpServer = await registerRoutes(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  console.log(`\nLibrary sign-off tests (server on ${baseUrl})\n`);

  const A = await createTenant("A"); // General Manager → admin, may approve
  const B = await createTenant("B");
  try {
    let docId = "";

    await test("a new doc is a draft, whatever the body says", async () => {
      const r = await api("POST", "/api/docs", A.cookie, {
        title: "Bills hygiene", docType: "sop", status: "approved", currentVersion: 7, ...p("<p>Forward only real bills</p>"),
      });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      docId = r.body.id;
      assert.strictEqual(r.body.status, "draft");
      assert.strictEqual(r.body.currentVersion, 0);
      assert.strictEqual(r.body.docType, "sop");
    });

    await test("an edit can't set sign-off fields", async () => {
      const r = await api("PATCH", `/api/docs/${docId}`, A.cookie, { status: "approved", approvedByName: "forged", currentVersion: 3 });
      assert.strictEqual(r.status, 200);
      const doc = await storage.getDoc(docId);
      assert.strictEqual(doc?.status, "draft");
      assert.strictEqual(doc?.currentVersion, 0);
      assert.strictEqual(doc?.approvedByName, null);
    });

    await test("an unknown doc type is refused", async () => {
      assert.strictEqual((await api("PATCH", `/api/docs/${docId}`, A.cookie, { docType: "memo" })).status, 400);
    });

    await test("submit → in review; can't submit twice", async () => {
      const r = await api("POST", `/api/docs/${docId}/submit`, A.cookie);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.status, "in_review");
      assert.strictEqual((await api("POST", `/api/docs/${docId}/submit`, A.cookie)).status, 409);
    });

    await test("approve → approved as v1, with the text kept", async () => {
      const r = await api("POST", `/api/docs/${docId}/approve`, A.cookie);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.status, "approved");
      assert.strictEqual(r.body.currentVersion, 1);
      const list = await api("GET", `/api/docs/${docId}/versions`, A.cookie);
      assert.deepStrictEqual(list.body.map((v: any) => v.version), [1]);
      assert.strictEqual(list.body[0].contentHtml, undefined, "the list should not carry bodies");
      const v1 = await api("GET", `/api/docs/${docId}/versions/1`, A.cookie);
      assert.strictEqual(v1.body.contentHtml, "<p>Forward only real bills</p>");
      assert.strictEqual(v1.body.title, "Bills hygiene");
    });

    await test("re-saving the same words (different markup) keeps it approved", async () => {
      const r = await api("PATCH", `/api/docs/${docId}`, A.cookie, { contentHtml: "<p>Forward only real  bills</p>", contentText: "Forward only real bills " });
      assert.strictEqual(r.body.status, "approved");
    });

    await test("changing the words reopens it as a draft; v1 survives", async () => {
      const r = await api("PATCH", `/api/docs/${docId}`, A.cookie, p("<p>Forward only real bills and statements</p>"));
      assert.strictEqual(r.body.status, "draft");
      assert.strictEqual(r.body.currentVersion, 1);
      const v1 = await api("GET", `/api/docs/${docId}/versions/1`, A.cookie);
      assert.strictEqual(v1.body.contentHtml, "<p>Forward only real bills</p>");
    });

    await test("an approver can approve a draft directly → v2", async () => {
      const r = await api("POST", `/api/docs/${docId}/approve`, A.cookie);
      assert.strictEqual(r.body.currentVersion, 2);
      assert.deepStrictEqual((await api("GET", `/api/docs/${docId}/versions`, A.cookie)).body.map((v: any) => v.version), [2, 1]);
    });

    await test("approving an approved doc is refused (no empty versions)", async () => {
      assert.strictEqual((await api("POST", `/api/docs/${docId}/approve`, A.cookie)).status, 409);
    });

    await test("send back needs a review; the note reaches the author", async () => {
      await api("PATCH", `/api/docs/${docId}`, A.cookie, p("<p>v3 draft</p>"));
      assert.strictEqual((await api("POST", `/api/docs/${docId}/reject`, A.cookie, { note: "x" })).status, 409);
      await api("POST", `/api/docs/${docId}/submit`, A.cookie);
      const r = await api("POST", `/api/docs/${docId}/reject`, A.cookie, { note: "Add the statements step" });
      assert.strictEqual(r.body.status, "draft");
      assert.strictEqual(r.body.reviewNote, "Add the statements step");
    });

    await test("archived docs can't be edited; restore brings back approval only if unchanged", async () => {
      await api("POST", `/api/docs/${docId}/approve`, A.cookie); // v3
      assert.strictEqual((await api("POST", `/api/docs/${docId}/archive`, A.cookie)).body.status, "archived");
      assert.strictEqual((await api("PATCH", `/api/docs/${docId}`, A.cookie, p("<p>sneaky</p>"))).status, 409);
      const r = await api("POST", `/api/docs/${docId}/restore`, A.cookie);
      assert.strictEqual(r.body.status, "approved");
      assert.strictEqual(r.body.currentVersion, 3);
    });

    await test("another company can't review, archive or read the history", async () => {
      for (const action of ["submit", "approve", "reject", "archive", "restore"]) {
        assert.strictEqual((await api("POST", `/api/docs/${docId}/${action}`, B.cookie)).status, 404, action);
      }
      assert.strictEqual((await api("GET", `/api/docs/${docId}/versions`, B.cookie)).status, 404);
      assert.strictEqual((await api("GET", `/api/docs/${docId}/versions/1`, B.cookie)).status, 404);
    });

    // A non-admin in company A who may edit the library but not approve.
    const editor = await register("Editor");
    const role = await storage.createUserRole({ name: `Library editor ${editor.unique}`, companyId: A.companyId, userCategory: "team", isBuiltIn: false } as any);
    const perms = await storage.getPermissions();
    const libraryPerm = perms.find((x) => x.key === "operations.library");
    assert.ok(libraryPerm, "operations.library is not in the catalogue");
    await storage.setRolePermissions(role.id, [{ permissionId: libraryPerm!.id, allowedActions: ["view", "add", "edit"] }]);
    await storage.updateUser(editor.userId, { companyId: A.companyId, roleId: role.id, userCategory: "team" } as any);
    const editorCookie = await login(editor.email, editor.password);

    await test("an editor can write and send for review, but not approve or send back", async () => {
      const created = await api("POST", "/api/docs", editorCookie, { title: "Toolbox talk", ...p("<p>Weekly</p>") });
      assert.strictEqual(created.status, 201, JSON.stringify(created.body));
      assert.strictEqual((await api("POST", `/api/docs/${created.body.id}/submit`, editorCookie)).status, 200);
      assert.strictEqual((await api("POST", `/api/docs/${created.body.id}/approve`, editorCookie)).status, 403);
      assert.strictEqual((await api("POST", `/api/docs/${created.body.id}/reject`, editorCookie)).status, 403);
      assert.strictEqual((await api("DELETE", `/api/docs/${created.body.id}`, editorCookie)).status, 403);
    });
  } finally {
    await cleanup([A.companyId, B.companyId]);
  }
}

async function cleanup(companyIds: string[]) {
  const stmts: Array<[string, any[]]> = [
    [`DELETE FROM doc_versions WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM docs WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM doc_folders WHERE company_id = ANY($1)`, [companyIds]],
    [`DELETE FROM notes WHERE company_id = ANY($1)`, [companyIds]],
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
  console.log(`\noperations-library: ${passed} passed, ${failed} failed`);
  process.exit(code);
}

main()
  .then(() => shutdown(failed > 0 ? 1 : 0))
  .catch((err) => { console.error("\nFATAL: test harness crashed\n", err); shutdown(1); });

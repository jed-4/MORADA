/**
 * Note title autosave integration tests.
 *
 * Guards against the production data-loss bug where free-text Note titles were
 * silently blanked. The cause: the editor's autosave bundled the title into
 * every content save, so a partial PATCH could overwrite the stored title with
 * a stale/empty value — and a debounced title save scheduled for one note could
 * land on whichever note the user had switched to.
 *
 * The fix (client/src/pages/Notes.tsx) splits autosave so title and content
 * save independently and binds each debounced save to its note id. The server
 * PATCH /api/notes/:id is a *partial* update (only the fields present in the
 * body are written). These tests pin down that contract end-to-end so a future
 * refactor on either side cannot quietly reintroduce the title wipe.
 *
 * What is verified:
 *   1. A content-only PATCH (the exact payload the fixed editor sends when the
 *      body changes — contentHtml/contentText/content, NO title) leaves the
 *      stored title intact.
 *   2. A PATCH whose body omits `title` never changes the stored title, even
 *      when other fields are updated.
 *   3. The "switch notes before the debounce fires" race: a title edit for
 *      note A followed by a content edit for note B must never write note A's
 *      title onto note B. Each note keeps its own title.
 *   4. Positive control: a PATCH that *does* include `title` still updates it,
 *      so the partial-update contract isn't accidentally ignoring titles.
 *
 * The test boots the real Express app (registerRoutes) on an ephemeral port
 * with NODE_ENV=test so authentication is strictly enforced (the development
 * auth bypass only fires for NODE_ENV=development, and the production DB guard
 * only fires for NODE_ENV=production — so "test" gives us strict auth against
 * the dev database). It creates one throwaway company + user directly through
 * the storage layer, logs in over HTTP, and exercises the note routes. Every
 * row it creates is namespaced to that company and deleted again in cleanup.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/note-title-autosave.test.ts
 */

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import express from "express";
import assert from "node:assert";
import { registerRoutes } from "../routes";
import { storage } from "../storage";
import { pool } from "../db";

let baseUrl = "";
let httpServer: any = null;

// ---------------------------------------------------------------------------
// Tiny test harness (custom, so we control process exit — the session store's
// internal prune timer + pg pool would otherwise keep node:test from exiting).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// HTTP helpers
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
      // Required: cookie is `secure` + app uses `trust proxy`, so express-session
      // only issues / accepts the session cookie when it believes the connection
      // is HTTPS. Spoof the proxy header so the session is established over the
      // plain-HTTP test connection.
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

async function createTenant(label: string): Promise<Tenant> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `note-test-${label}-${unique}@notetest.local`;
  const password = "NoteTest123!";

  const reg = await api("POST", "/api/auth/register", {
    body: { email, password, firstName: label, lastName: "NoteTest" },
  });
  assert.strictEqual(reg.status, 200, `register ${label} failed: ${JSON.stringify(reg.body)}`);
  const userId = reg.body.user.id;

  // Attaching a company also assigns the user the General Manager (admin) role,
  // which clears requirePermission gates.
  const company = await storage.createCompany(
    { name: `Note Test Co ${label} ${unique}` } as any,
    userId,
  );

  const login = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.strictEqual(login.status, 200, `login ${label} failed: ${JSON.stringify(login.body)}`);
  const cookie = extractCookie(login.raw);
  assert.ok(cookie, `no session cookie for ${label}`);

  return { userId, email, password, companyId: company.id, cookie: cookie! };
}

async function createNote(tenant: Tenant, title: string): Promise<any> {
  const r = await api("POST", "/api/notes", {
    cookie: tenant.cookie,
    body: {
      title,
      content: "",
      contentHtml: "",
      contentText: "",
      visibility: "team_only",
      category: "General",
    },
  });
  assert.strictEqual(r.status, 201, `create note failed: ${JSON.stringify(r.body)}`);
  return r.body;
}

async function getNoteTitle(tenant: Tenant, id: string): Promise<string> {
  const r = await api("GET", `/api/notes/${id}`, { cookie: tenant.cookie });
  assert.strictEqual(r.status, 200, `get note failed: ${JSON.stringify(r.body)}`);
  return r.body.title;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
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

  console.log(`\nNote title autosave tests (server on ${baseUrl})\n`);

  const T = await createTenant("A");

  try {
    // ---- 1 & 2: content-only PATCH (omits title) leaves the title intact ----
    await test("content-only PATCH (omits title) leaves the stored title intact", async () => {
      const note = await createNote(T, "Original Title");
      // Exactly what the fixed editor sends on a body change: content fields,
      // crucially NO title.
      const r = await api("PATCH", `/api/notes/${note.id}`, {
        cookie: T.cookie,
        body: {
          contentHtml: "<p>some body text</p>",
          contentText: "some body text",
          content: "some body text",
        },
      });
      assert.strictEqual(r.status, 200, `patch failed: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.title, "Original Title", "PATCH response title changed");
      assert.strictEqual(
        await getNoteTitle(T, note.id),
        "Original Title",
        "stored title was overwritten by a content-only save",
      );
    });

    await test("a content edit can never persist an empty title", async () => {
      const note = await createNote(T, "Keep Me");
      // Even repeated content saves must never blank the title.
      for (let i = 0; i < 3; i++) {
        const r = await api("PATCH", `/api/notes/${note.id}`, {
          cookie: T.cookie,
          body: {
            contentHtml: `<p>edit ${i}</p>`,
            contentText: `edit ${i}`,
            content: `edit ${i}`,
          },
        });
        assert.strictEqual(r.status, 200, `patch ${i} failed: ${JSON.stringify(r.body)}`);
      }
      assert.strictEqual(
        await getNoteTitle(T, note.id),
        "Keep Me",
        "title was blanked/changed by content edits",
      );
    });

    await test("PATCH that omits title but updates other fields leaves title intact", async () => {
      const note = await createNote(T, "Title Survives");
      const r = await api("PATCH", `/api/notes/${note.id}`, {
        cookie: T.cookie,
        body: { visibility: "everyone", category: "Updated" },
      });
      assert.strictEqual(r.status, 200, `patch failed: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.visibility, "everyone", "visibility was not updated");
      assert.strictEqual(
        await getNoteTitle(T, note.id),
        "Title Survives",
        "stored title changed when only non-title fields were patched",
      );
    });

    // ---- 3: switch notes before the debounce fires ----
    // Simulates: user edits note A's title, then (before the 800ms debounce)
    // switches to note B and edits its body. The fixed client binds each save
    // to its note id and flushes the pending title save to note A, so note B
    // must receive ONLY the content change — never note A's title.
    await test("title edit on note A then content edit on note B keeps each title separate", async () => {
      const noteA = await createNote(T, "Note A Original");
      const noteB = await createNote(T, "Note B Original");

      // The debounced title save for note A flushes against note A's id.
      const ra = await api("PATCH", `/api/notes/${noteA.id}`, {
        cookie: T.cookie,
        body: { title: "Note A Edited" },
      });
      assert.strictEqual(ra.status, 200, `patch A failed: ${JSON.stringify(ra.body)}`);

      // Switching to note B and editing its body sends a content-only PATCH to
      // note B — it must NOT carry note A's title.
      const rb = await api("PATCH", `/api/notes/${noteB.id}`, {
        cookie: T.cookie,
        body: {
          contentHtml: "<p>note B body</p>",
          contentText: "note B body",
          content: "note B body",
        },
      });
      assert.strictEqual(rb.status, 200, `patch B failed: ${JSON.stringify(rb.body)}`);

      assert.strictEqual(
        await getNoteTitle(T, noteA.id),
        "Note A Edited",
        "note A's title edit did not persist",
      );
      assert.strictEqual(
        await getNoteTitle(T, noteB.id),
        "Note B Original",
        "note A's title bled onto note B",
      );
    });

    // ---- 4: positive control — an explicit title PATCH still updates it ----
    await test("control: a PATCH that includes title still updates the title", async () => {
      const note = await createNote(T, "Before Rename");
      const r = await api("PATCH", `/api/notes/${note.id}`, {
        cookie: T.cookie,
        body: { title: "After Rename" },
      });
      assert.strictEqual(r.status, 200, `patch failed: ${JSON.stringify(r.body)}`);
      assert.strictEqual(
        await getNoteTitle(T, note.id),
        "After Rename",
        "explicit title rename did not persist — partial update is dropping titles",
      );
    });
  } finally {
    await cleanup([T.companyId], [T.userId]);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error("Failed tests:\n  - " + failures.join("\n  - "));
  }
}

async function cleanup(companyIds: string[], userIds: string[]) {
  const stmts: Array<[string, any[]]> = [
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

/**
 * Client containment for /objects/* and /uploads/* — no database, no network.
 *
 * These paths are served outside /api, so clientAccessGate never sees them,
 * and their own guard only compares the URL's company with the session's — a
 * client's company IS the builder's. clientObjectGate is what keeps a client
 * to files referenced by records they can already see.
 *
 * The lookups are substituted (each real one is a join); what is tested here
 * is the decision: which source is consulted, under which permission, scoped
 * to which projects, and that team sessions are never touched.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/client-object-access.test.ts
 */

// Set before importing: server/db.ts throws without DATABASE_URL, and importing
// storage fires dbStorage.initialize() which WRITES. Overwritten
// unconditionally so this can never point at a real database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:1/faketestdb";

import assert from "node:assert";
import express from "express";
import type { Server } from "node:http";

const { objectTail, isObjectVisibleToClient, clientObjectGate } = await import("../middleware/clientObjectAccess");
const { PORTAL_KEYS } = await import("@shared/clientPortalPermissions");
type Lookups = import("../middleware/clientObjectAccess").ClientObjectLookups;

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

const CO = "co-builder";
const GRANTED = "proj-granted";
const OTHER = "proj-other";
const client = { id: "u-client", companyId: CO, userCategory: "client" } as any;

const url = (id: string) => `/objects/company/${CO}/uploads/${id}`;

/**
 * A fake world: which tail each source holds, and on which project. Each
 * lookup only answers for the projects it is handed, so a test passing a
 * project the client was not granted would show up as a wrong answer.
 */
function world(opts: { permissions?: string[]; granted?: string[] } = {}) {
  const permissions = new Set(opts.permissions ?? Object.values(PORTAL_KEYS));
  const granted = opts.granted ?? [GRANTED];
  const calls: string[] = [];
  const onProject = (rows: Record<string, string>) => (projectIds: string[], tail: string) =>
    Promise.resolve(!!rows[tail] && projectIds.includes(rows[tail]));
  const lookups: Lookups = {
    grantedProjectIds: async () => granted,
    hasPermission: async (_u, key) => {
      calls.push(`perm:${key}`);
      return permissions.has(key);
    },
    selectionOptionFile: onProject({ "uploads/opt-1": GRANTED, "uploads/opt-other": OTHER }),
    reviewDocument: (_c, p, t) => onProject({ "uploads/rev-1": GRANTED })(p, t),
    siteDiaryFile: onProject({ "uploads/diary-1": GRANTED }),
    messageAttachment: async (userId, tail) => userId === client.id && tail === "uploads/msg-1",
    companyLogo: async (companyId, tail) => companyId === CO && tail === "uploads/logo",
  };
  return { lookups, calls };
}

async function main() {
  console.log("\nobjectTail");

  await test("extracts the tail below the company segment", () => {
    assert.strictEqual(objectTail(url("abc-123")), "uploads/abc-123");
  });
  await test("refuses /uploads, raw /objects and traversal", () => {
    assert.strictEqual(objectTail("/uploads/enote-attachments/x.pdf"), null);
    assert.strictEqual(objectTail("/objects/uploads/abc"), null);
    assert.strictEqual(objectTail(`/objects/company/${CO}/uploads/../secret`), null);
  });
  await test("refuses LIKE metacharacters and spaces", () => {
    assert.strictEqual(objectTail(`/objects/company/${CO}/uploads/%`), null);
    assert.strictEqual(objectTail(`/objects/company/${CO}/uploads/a b`), null);
  });

  console.log("\nisObjectVisibleToClient");

  for (const [label, id] of [
    ["selection option file on a granted project", "opt-1"],
    ["review document on a granted project", "rev-1"],
    ["shared site diary photo", "diary-1"],
    ["attachment in a channel the client is in", "msg-1"],
    ["the company logo", "logo"],
  ] as const) {
    await test(`allows ${label}`, async () => {
      assert.strictEqual(await isObjectVisibleToClient(client, url(id), world().lookups), true);
    });
  }

  await test("refuses a file no client-visible record references (bill, estimate, cost sheet)", async () => {
    assert.strictEqual(await isObjectVisibleToClient(client, url("bill-attachment"), world().lookups), false);
  });
  await test("refuses a selection file on a project NOT granted", async () => {
    assert.strictEqual(await isObjectVisibleToClient(client, url("opt-other"), world().lookups), false);
  });
  await test("refuses everything project-scoped when no project is granted", async () => {
    const { lookups } = world({ granted: [] });
    assert.strictEqual(await isObjectVisibleToClient(client, url("opt-1"), lookups), false);
  });
  await test("the portal permission gates its source (no selections tick → no option files)", async () => {
    const { lookups } = world({ permissions: [PORTAL_KEYS.reviews] });
    assert.strictEqual(await isObjectVisibleToClient(client, url("opt-1"), lookups), false);
    assert.strictEqual(await isObjectVisibleToClient(client, url("rev-1"), lookups), true);
  });
  await test("message attachments need portal.messages", async () => {
    const { lookups } = world({ permissions: [] });
    assert.strictEqual(await isObjectVisibleToClient(client, url("msg-1"), lookups), false);
  });
  await test("the logo needs no permission", async () => {
    const { lookups } = world({ permissions: [] });
    assert.strictEqual(await isObjectVisibleToClient(client, url("logo"), lookups), true);
  });
  await test("every /uploads path is refused", async () => {
    assert.strictEqual(await isObjectVisibleToClient(client, "/uploads/contact-avatars/a.png", world().lookups), false);
  });

  console.log("\nclientObjectGate over HTTP");

  const { lookups, calls } = world();
  const app = express();
  app.use((req: any, _res, next) => {
    const who = req.get("x-test-user");
    req.user =
      who === "client" ? client : who === "team" ? { id: "u-team", companyId: CO, userCategory: "team" } : undefined;
    next();
  });
  app.get("/objects/company/:companyId/*", clientObjectGate(lookups), (_req, res) => res.send("FILE"));
  app.get("/uploads/*", clientObjectGate(lookups), (_req, res) => res.send("FILE"));
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const get = async (p: string, who: string) => {
    const r = await fetch(base + p, { headers: { "x-test-user": who } });
    return { status: r.status, body: await r.text() };
  };

  try {
    await test("client: allowed file → 200 with the bytes", async () => {
      const r = await get(url("opt-1"), "client");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body, "FILE");
    });
    await test("client: unreferenced file → 404, not 403", async () => {
      assert.strictEqual((await get(url("bill-attachment"), "client")).status, 404);
    });
    await test("client: /uploads → 404", async () => {
      assert.strictEqual((await get("/uploads/enote-attachments/x.pdf", "client")).status, 404);
    });
    await test("team: passes straight through with NO lookups", async () => {
      calls.length = 0;
      assert.strictEqual((await get(url("bill-attachment"), "team")).status, 200);
      assert.strictEqual((await get("/uploads/enote-attachments/x.pdf", "team")).status, 200);
      assert.deepStrictEqual(calls, []);
    });
  } finally {
    server.close();
  }

  console.log(`\nclient object access: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) console.error("Failed tests:\n  - " + failures.join("\n  - "));
}

main()
  .then(() => process.exit(failed > 0 ? 1 : 0))
  .catch((err) => {
    console.error("\nFATAL: test harness crashed\n", err);
    process.exit(1);
  });

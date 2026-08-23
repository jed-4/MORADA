/**
 * /uploads access-control tests — no database, no network.
 *
 * The mount these cover replaced an `express.static` in index.ts that sat
 * ABOVE setupAuth, so every file under uploads/ was readable with no session:
 * estimate-note attachments (up to 50 MB), gear photos, contact avatars.
 *
 * Two halves are tested differently:
 *   - the traversal guard is pure and tested directly
 *   - the handler is driven over HTTP with the ownership lookup substituted,
 *     since resolving an owner is a database join
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/uploads-access.test.ts
 */

// Set before importing: server/db.ts throws without DATABASE_URL, and importing
// storage fires dbStorage.initialize() which WRITES (ensure*/migrate*/backfill*).
// Overwritten unconditionally so this can never point at a real database.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:1/faketestdb";

import assert from "node:assert";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import type { Server } from "node:http";

const uploadsAccess = await import("../middleware/uploadsAccess");
const { isInsideUploadsRoot, UPLOADS_ROOT } = uploadsAccess;

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

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";

// Owner lookup substituted — the real one is a four-table join.
const OWNERS: Record<string, string> = {
  "/uploads/enote-attachments/a-file.pdf": COMPANY_A,
  "/uploads/gear-photos/a-photo.jpg": COMPANY_A,
  "/uploads/contact-avatars/a-avatar.png": COMPANY_A,
  "/uploads/enote-attachments/b-file.pdf": COMPANY_B,
};
const fakeResolver = async (p: string) => OWNERS[p] ?? null;

const app = express();
app.use((req: any, _res, next) => {
  const mode = req.get("x-test-identity") || "company-a";
  if (mode === "anonymous") {
    req.session = {};
  } else {
    req.user = { id: "u1", companyId: mode === "company-b" ? COMPANY_B : COMPANY_A };
    req.session = { userId: "u1", companyId: req.user.companyId };
  }
  next();
});
// A resolver that claims the caller owns EVERY path. The ownership check runs
// before the traversal guard, and a traversal string matches no stored fileUrl,
// so with the normal resolver a traversal test passes for the wrong reason —
// it is ownership, not the path guard, doing the refusing. This lets the
// traversal cases be tested in isolation.
const permissiveResolver = async () => COMPANY_A;

app.get("/uploads/*", (req, res) => {
  const resolver = req.get("x-test-resolver") === "permissive" ? permissiveResolver : fakeResolver;
  void uploadsAccess.serveUpload(req, res, resolver);
});

let baseUrl = "";
let server: Server;
let secretPath = "";

async function get(p: string, identity = "company-a", resolver?: "permissive") {
  const res = await fetch(`${baseUrl}${p}`, {
    headers: {
      "x-test-identity": identity,
      ...(resolver ? { "x-test-resolver": resolver } : {}),
    },
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  // Real files on disk for the happy path, so a 200 means bytes were served.
  fs.mkdirSync(path.join(UPLOADS_ROOT, "enote-attachments"), { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_ROOT, "gear-photos"), { recursive: true });
  fs.mkdirSync(path.join(UPLOADS_ROOT, "contact-avatars"), { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_ROOT, "enote-attachments", "a-file.pdf"), "A-CONTENT");
  fs.writeFileSync(path.join(UPLOADS_ROOT, "gear-photos", "a-photo.jpg"), "A-PHOTO");
  fs.writeFileSync(path.join(UPLOADS_ROOT, "contact-avatars", "a-avatar.png"), "A-AVATAR");
  fs.writeFileSync(path.join(UPLOADS_ROOT, "enote-attachments", "b-file.pdf"), "B-CONTENT");
  // A file on disk that no table references — the orphan case.
  fs.writeFileSync(path.join(UPLOADS_ROOT, "enote-attachments", "orphan.pdf"), "ORPHAN");
  // A secret outside the uploads root, as a traversal target.
  secretPath = path.join(os.tmpdir(), "uploads-traversal-target.txt");
  fs.writeFileSync(secretPath, "TOP-SECRET");

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  console.log(`\n/uploads access control (no DB) — ${baseUrl}\n`);

  await test("owner can fetch their own file in every subtree", async () => {
    for (const [p, expected] of [
      ["/uploads/enote-attachments/a-file.pdf", "A-CONTENT"],
      ["/uploads/gear-photos/a-photo.jpg", "A-PHOTO"],
      ["/uploads/contact-avatars/a-avatar.png", "A-AVATAR"],
    ] as const) {
      const r = await get(p, "company-a");
      assert.strictEqual(r.status, 200, `${p} → ${r.status}; legitimate serving must not break`);
      assert.strictEqual(r.body, expected, `${p} served the wrong bytes`);
    }
  });

  await test("another company cannot fetch the file and is not told it exists", async () => {
    const r = await get("/uploads/enote-attachments/a-file.pdf", "company-b");
    assert.strictEqual(r.status, 404, `expected 404, got ${r.status}`);
    assert.ok(!r.body.includes("A-CONTENT"), "company B received company A's file contents");
  });

  await test("company A likewise cannot reach company B's file", async () => {
    const r = await get("/uploads/enote-attachments/b-file.pdf", "company-a");
    assert.strictEqual(r.status, 404, `expected 404, got ${r.status}`);
    assert.ok(!r.body.includes("B-CONTENT"), "company A received company B's file contents");
  });

  await test("a session with no company gets nothing", async () => {
    const r = await get("/uploads/enote-attachments/a-file.pdf", "anonymous");
    assert.strictEqual(r.status, 404, `expected 404, got ${r.status}`);
    assert.ok(!r.body.includes("A-CONTENT"), "a company-less session received file contents");
  });

  await test("a file no table references is refused (no fall-through)", async () => {
    const r = await get("/uploads/enote-attachments/orphan.pdf", "company-a");
    assert.strictEqual(r.status, 404, `orphaned files must not serve, got ${r.status}`);
    assert.ok(!r.body.includes("ORPHAN"), "an unreferenced file was served");
  });

  await test("an unrecognised subtree is refused", async () => {
    const r = await get("/uploads/some-other-tree/file.txt", "company-a");
    assert.strictEqual(r.status, 404, `unknown subtrees must not serve, got ${r.status}`);
  });

  await test("path traversal cannot escape the uploads root even if ownership passes", async () => {
    // Two things make a naive traversal test pass for the wrong reason:
    //
    // 1. The ownership check runs first, and a traversal string matches no
    //    stored fileUrl — hence the permissive resolver here.
    // 2. fetch/undici normalise a literal "../" client-side, so
    //    "/uploads/../../etc/passwd" leaves as "/etc/passwd" and never reaches
    //    the route at all. Percent-encoded "%2e%2e%2f" survives and is what an
    //    attacker on a raw socket would send.
    //
    // So the payload is built from the ACTUAL relative path to a file that
    // ACTUALLY exists outside the root, with the separators encoded. A payload
    // that is merely "deep enough looking" resolves to a nonexistent path and
    // 404s whether or not the guard is there.
    const rel = path.relative(UPLOADS_ROOT, secretPath);
    const encodedEscape =
      "/uploads/" + rel.split(path.sep).map((s) => (s === ".." ? "%2e%2e" : encodeURIComponent(s))).join("%2f");

    // Sanity-check the payload really does target the secret, so this test
    // cannot quietly degrade into asserting nothing.
    assert.strictEqual(
      path.resolve(UPLOADS_ROOT, "." + decodeURIComponent(encodedEscape).replace(/^\/uploads/, "")),
      secretPath,
      "the traversal payload does not resolve to the target file — the test would be vacuous",
    );

    for (const p of [
      encodedEscape,
      "/uploads/%2e%2e%2f%2e%2e%2fetc/passwd",
      "/uploads/enote-attachments/..%2f..%2f..%2fetc/passwd",
      "/uploads/%252e%252e%252fetc/passwd",
      "/uploads/....//....//etc/passwd",
    ]) {
      const r = await get(p, "company-a", "permissive");
      assert.ok(
        r.status === 404 || r.status === 400,
        `traversal ${p} returned ${r.status} — expected refusal`,
      );
      assert.ok(!r.body.includes("root:"), `traversal ${p} leaked /etc/passwd`);
      assert.ok(!r.body.includes("TOP-SECRET"), `traversal ${p} leaked a file outside the root`);
    }
  });

  await test("isInsideUploadsRoot accepts only paths under the root", async () => {
    assert.ok(isInsideUploadsRoot(path.join(UPLOADS_ROOT, "enote-attachments", "x.pdf")));
    assert.ok(isInsideUploadsRoot(UPLOADS_ROOT));
    assert.ok(!isInsideUploadsRoot("/etc/passwd"));
    assert.ok(!isInsideUploadsRoot(path.join(UPLOADS_ROOT, "..", "secret.txt")));
    // The sibling-prefix case the trailing separator exists to catch.
    assert.ok(!isInsideUploadsRoot(UPLOADS_ROOT + "-sibling/x.txt"));
  });

  fs.rmSync(secretPath, { force: true });
  for (const f of [
    "enote-attachments/a-file.pdf",
    "enote-attachments/b-file.pdf",
    "enote-attachments/orphan.pdf",
    "gear-photos/a-photo.jpg",
    "contact-avatars/a-avatar.png",
  ]) {
    fs.rmSync(path.join(UPLOADS_ROOT, f), { force: true });
  }

  console.log(`\n/uploads access control: ${passed} passed, ${failed} failed\n`);
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

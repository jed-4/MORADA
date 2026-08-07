/**
 * pollAllBillInboxes fan-out tests — no database, no network.
 *
 * The DB-backed version of this in tenant-isolation.test.ts has to skip itself
 * whenever a real company on that database has a connected inbox, because the
 * fan-out would otherwise reach a live mailbox and import real invoices. A
 * green run there can therefore mean the fan-out was never exercised at all.
 * This file removes that hole: the storage layer and the Gmail client are both
 * substituted, so the real pollAllBillInboxes/pollBillInbox control flow runs
 * deterministically against fixtures.
 *
 * What it pins down — the behaviour that was broken before this branch, when
 * an unscoped `LIMIT 1` meant exactly one arbitrary company was ever polled:
 *   - every company with a connected inbox gets polled
 *   - each poll is handed its OWN company's credentials
 *   - every settings write lands on the row being polled, never another's
 *   - one tenant failing does not abort the rest, at both error layers
 *   - a settings row with no company_id is skipped, never guessed at
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/bill-inbox-fanout.test.ts
 */

// Set before importing anything: server/db.ts throws at import without a
// DATABASE_URL, and GoogleOAuthService's constructor throws without OAuth
// credentials. Neither is ever used — the Pool is lazy and never queried, and
// every Google call is intercepted below. The db.ts production guards that
// hard-block specific hosts only fire when NODE_ENV === "production".
process.env.NODE_ENV = "test";
// Overwritten unconditionally, never defaulted from the environment: importing
// server/storage.ts fires `dbStorage.initialize()` at module load, which runs
// ensure*Exist / migrate* / backfill* — all WRITES. Pointing this at a real
// database would run those against it. The loopback port refuses instantly and
// the failure is caught and logged by storage.ts itself.
process.env.DATABASE_URL = "postgres://fake:fake@127.0.0.1:1/faketestdb";
process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "fake-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "fake-client-secret";

import assert from "node:assert";

// Dynamic, and below the assignments above on purpose: static imports are
// hoisted, so server/db.ts would evaluate — and throw on the missing
// DATABASE_URL — before any of that env setup ran.
const { storage } = await import("../storage");
const { GoogleOAuthService } = await import("../services/googleOAuthService");
const { pollAllBillInboxes, pollBillInbox } = await import("../services/gmailBillPoller");

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
// Fixtures
//
// co-a  connected, healthy                          -> polled, succeeds
// co-b  connected, Gmail client refuses the token   -> polled, fails INSIDE
//                                                      pollBillInbox's catch
// co-d  connected, settings read blows up           -> polled, throws OUT of
//                                                      pollBillInbox entirely
// co-c  connected, healthy — ordered after the two
//       failures on purpose                         -> must still be polled
// co-null   connected but no company_id             -> must be skipped
// co-off    has credentials, polling disabled       -> must be skipped
// co-notok  polling enabled, no refresh token       -> must be skipped
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  companyId: string | null;
  billInboxPollingEnabled: boolean;
  billInboxGmailEmail: string | null;
  billInboxGmailAccessToken: string | null;
  billInboxGmailRefreshToken: string | null;
  billInboxGmailTokenExpiry: Date | null;
  billInboxStatus: string | null;
  billInboxLastError: string | null;
  billInboxLastPolledAt: Date | null;
}

function row(companyId: string | null, overrides: Partial<Row> = {}): Row {
  const key = companyId ?? "null";
  return {
    id: `settings-${key}`,
    companyId,
    billInboxPollingEnabled: true,
    billInboxGmailEmail: `${key}@inbox.test`,
    billInboxGmailAccessToken: `access-${key}`,
    billInboxGmailRefreshToken: `refresh-${key}`,
    billInboxGmailTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
    billInboxStatus: null,
    billInboxLastError: null,
    billInboxLastPolledAt: null,
    ...overrides,
  };
}

let rows: Row[] = [];
/** Every (companyId, refreshToken) pair the Gmail client was built with. */
let clientCalls: Array<{ companyId: string; refreshToken: string | null }> = [];
/** Every (companyId) a settings write was aimed at, in order. */
let writes: Array<{ companyId: string; fields: string[] }> = [];
/** Companies whose getCompanySettings should throw (simulates a DB blip). */
let readThrows = new Set<string>();
/** Companies whose Gmail client should refuse (simulates revoked consent). */
let clientThrows = new Set<string>();

function resetFixtures() {
  rows = [
    row("co-a"),
    row("co-b"),
    row("co-d"),
    row("co-c"),
    row(null),
    row("co-off", { billInboxPollingEnabled: false }),
    row("co-notok", { billInboxGmailRefreshToken: null }),
  ];
  clientCalls = [];
  writes = [];
  readThrows = new Set(["co-d"]);
  clientThrows = new Set(["co-b"]);
}

// --- Substitute the storage layer -----------------------------------------
// Patched on the instance: pollBillInbox reaches these through `storage.X(...)`
// at call time, so the real module-level singleton stays untouched otherwise.
(storage as any).getAllCompanySettings = async () => rows.map((r) => ({ ...r }));

(storage as any).getCompanySettings = async (companyId: string) => {
  if (!companyId) throw new Error("getCompanySettings requires a companyId");
  if (readThrows.has(companyId)) throw new Error(`simulated settings read failure for ${companyId}`);
  const found = rows.find((r) => r.companyId === companyId);
  return found ? { ...found } : undefined;
};

(storage as any).updateCompanySettings = async (fields: any, companyId: string) => {
  if (!companyId) throw new Error("updateCompanySettings requires a companyId");
  writes.push({ companyId, fields: Object.keys(fields) });
  const target = rows.find((r) => r.companyId === companyId);
  if (!target) return undefined;
  Object.assign(target, fields);
  return { ...target };
};

// --- Substitute the Gmail client ------------------------------------------
// Patching the prototype intercepts the instance gmailBillPoller builds for
// itself, without giving production code a test-only injection seam.
(GoogleOAuthService.prototype as any).getBillInboxGmailClient = async (
  settings: { billInboxGmailRefreshToken: string | null },
  companyId: string,
) => {
  clientCalls.push({ companyId, refreshToken: settings.billInboxGmailRefreshToken });
  if (clientThrows.has(companyId)) {
    throw new Error(`simulated invalid_grant for ${companyId}`);
  }
  return {
    users: {
      getProfile: async () => ({ data: { emailAddress: `${companyId}@inbox.test`, messagesTotal: 0 } }),
      messages: {
        // No messages: the poll completes its bookkeeping write and returns
        // without ever constructing a bill. Keeps this test about fan-out.
        list: async () => ({ data: { messages: [], resultSizeEstimate: 0 } }),
      },
    },
  };
};

// ---------------------------------------------------------------------------
async function main() {
  console.log("\nbill inbox fan-out (mocked storage + Gmail, no DB, no network)\n");

  resetFixtures();
  const result = await pollAllBillInboxes();

  await test("polls every company with a connected inbox", async () => {
    const polled = clientCalls.map((c) => c.companyId).sort();
    assert.deepStrictEqual(
      polled,
      ["co-a", "co-b", "co-c"],
      `expected a, b and c to be polled (co-d fails before its client is built), got ${JSON.stringify(polled)}`,
    );
  });

  await test("hands each poll its own company's credentials", async () => {
    for (const call of clientCalls) {
      assert.strictEqual(
        call.refreshToken,
        `refresh-${call.companyId}`,
        `company ${call.companyId} was polled with ${call.refreshToken} — another tenant's token`,
      );
    }
  });

  await test("every settings write lands on the company being polled", async () => {
    const targets = new Set(writes.map((w) => w.companyId));
    for (const t of targets) {
      assert.ok(
        ["co-a", "co-b", "co-c"].includes(t),
        `a poll wrote to ${t}, which should never have been polled`,
      );
    }
    // Each polled company's own row still holds its own credentials.
    for (const id of ["co-a", "co-b", "co-c"]) {
      const r = rows.find((x) => x.companyId === id)!;
      assert.strictEqual(r.billInboxGmailRefreshToken, `refresh-${id}`, `${id}'s refresh token was overwritten`);
      assert.strictEqual(r.billInboxGmailEmail, `${id}@inbox.test`, `${id}'s inbox address was overwritten`);
    }
  });

  await test("a tenant failing inside pollBillInbox does not abort the others", async () => {
    const b = rows.find((r) => r.companyId === "co-b")!;
    assert.strictEqual(b.billInboxStatus, "error", "co-b's failure was not recorded on its own row");
    assert.match(b.billInboxLastError || "", /invalid_grant/, "co-b's error detail was not stored");

    // co-c is ordered after both failures precisely to prove the loop survived.
    const c = rows.find((r) => r.companyId === "co-c")!;
    assert.ok(c.billInboxLastPolledAt, "co-c was never polled — an earlier tenant's failure aborted the run");
    assert.strictEqual(c.billInboxStatus, null, "co-c inherited another tenant's error status");
  });

  await test("a tenant throwing out of pollBillInbox does not abort the others", async () => {
    // co-d's settings read throws, which escapes pollBillInbox's internal
    // catches entirely — only the per-tenant try/catch in pollAllBillInboxes
    // stops it taking the whole cycle down.
    assert.ok(
      result.errors.some((e) => e.includes("co-d")),
      `co-d's failure was not reported: ${JSON.stringify(result.errors)}`,
    );
    const a = rows.find((r) => r.companyId === "co-a")!;
    assert.ok(a.billInboxLastPolledAt, "co-a was not polled");
  });

  await test("skips a settings row with no company_id", async () => {
    assert.ok(
      !clientCalls.some((c) => !c.companyId || c.companyId === "null"),
      "a row with no company_id was polled — the poll had no company to file bills against",
    );
    const orphan = rows.find((r) => r.companyId === null)!;
    assert.strictEqual(orphan.billInboxLastPolledAt, null, "the unowned row was written to");
    assert.strictEqual(orphan.billInboxStatus, null, "the unowned row was written to");
  });

  await test("skips disabled polling and rows with no refresh token", async () => {
    const polled = new Set(clientCalls.map((c) => c.companyId));
    assert.ok(!polled.has("co-off"), "polled a company that has polling switched off");
    assert.ok(!polled.has("co-notok"), "polled a company with no stored refresh token");
    assert.ok(
      !writes.some((w) => w.companyId === "co-off" || w.companyId === "co-notok"),
      "wrote to a company that should not have been polled",
    );
  });

  await test("pollBillInbox refuses to run with no companyId", async () => {
    await assert.rejects(
      async () => await (pollBillInbox as any)(),
      /requires a companyId/,
      "pollBillInbox ran unscoped — it would poll an arbitrary tenant's mailbox",
    );
    await assert.rejects(
      async () => await (pollBillInbox as any)(""),
      /requires a companyId/,
      "pollBillInbox accepted an empty companyId",
    );
  });

  await test("a single healthy tenant still polls normally", async () => {
    resetFixtures();
    rows = [row("solo")];
    readThrows = new Set();
    clientThrows = new Set();
    const r = await pollAllBillInboxes();
    assert.strictEqual(r.errors.length, 0, `unexpected errors: ${JSON.stringify(r.errors)}`);
    assert.deepStrictEqual(clientCalls.map((c) => c.companyId), ["solo"]);
    assert.ok(rows[0].billInboxLastPolledAt, "the only connected company was not polled");
  });

  await test("no connected inboxes is a no-op", async () => {
    resetFixtures();
    rows = [row("co-off", { billInboxPollingEnabled: false })];
    const r = await pollAllBillInboxes();
    assert.deepStrictEqual(r, { processed: 0, errors: [] });
    assert.strictEqual(clientCalls.length, 0, "built a Gmail client with nothing to poll");
  });

  console.log(`\nbill inbox fan-out: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) console.error("Failed tests:\n  - " + failures.join("\n  - "));
}

main()
  .then(() => process.exit(failed > 0 ? 1 : 0))
  .catch((err) => {
    console.error("\nFATAL: test harness crashed\n", err);
    process.exit(1);
  });

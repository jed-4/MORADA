/**
 * A bill linked to a VOIDED Xero invoice must go to Xero as a new bill.
 *
 * BILL-1805 (Bunnings $20.44, 20 Oct 2026) was refused with "Invoice not of
 * valid status for modification" after the earlier voided-bill fixes. Every
 * push was an edit to the voided invoice: either through a stored link, or
 * through Xero's POST /Invoices matching the voided copy on InvoiceNumber
 * (fixed in xeroService by creating with PUT).
 *
 * Run with:  npx tsx server/__tests__/xero-push-target.test.ts
 */

import assert from "node:assert";
import { pushToXeroTarget, xeroStatusForPush, type PushTargetDeps } from "../services/xeroPushTarget";

let passed = 0;
const pending: Promise<void>[] = [];
function test(name: string, fn: () => Promise<void> | void) {
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        console.log(`  ✓ ${name}`);
      }),
  );
}

class LockedError extends Error {}
const LOCKED = new LockedError("Invoice not of valid status for modification");

/** A fake Xero holding documents by id; records every call made to it. */
function fakeXero(docs: Record<string, string>, opts: { failUpdate?: Error } = {}) {
  const calls: string[] = [];
  let link: string | null = null;
  const deps: PushTargetDeps<{ InvoiceID: string }> = {
    async update(id) {
      calls.push(`update:${id}`);
      if (opts.failUpdate) throw opts.failUpdate;
      if (docs[id] === "VOIDED" || docs[id] === "DELETED" || docs[id] === "PAID") throw LOCKED;
      return { InvoiceID: id };
    },
    async createOrAdopt() {
      calls.push("createOrAdopt");
      docs["new-1"] = "SUBMITTED";
      link = "new-1";
      return { InvoiceID: "new-1" };
    },
    async getStatus(id) {
      calls.push(`getStatus:${id}`);
      return docs[id] ?? null;
    },
    async unlink(id) {
      calls.push(`unlink:${id}`);
      link = null;
    },
    isLockedError: (e) => e instanceof LockedError,
  };
  return { deps, calls, getLink: () => link };
}

console.log("\nXero push target\n");

// ─── The reported case ───────────────────────────────────────────────────────

test("stored link points to a voided invoice → unlink and create a new bill", async () => {
  const x = fakeXero({ "dead-1": "VOIDED" });
  const r = await pushToXeroTarget({ xeroId: "dead-1" }, x.deps);
  assert.strictEqual(r.result.InvoiceID, "new-1");
  assert.strictEqual(r.viaUnlinkedPath, true);
  assert.strictEqual(r.replacedDeadId, "dead-1");
  assert.deepStrictEqual(x.calls, ["update:dead-1", "getStatus:dead-1", "unlink:dead-1", "createOrAdopt"]);
});

test("stored link points to a DELETED invoice → same as voided", async () => {
  const x = fakeXero({ "dead-2": "DELETED" });
  const r = await pushToXeroTarget({ xeroId: "dead-2" }, x.deps);
  assert.strictEqual(r.replacedDeadId, "dead-2");
  assert.ok(x.calls.includes("createOrAdopt"));
});

test("a link already flagged voided skips the doomed edit entirely", async () => {
  const x = fakeXero({ "dead-1": "VOIDED" });
  const r = await pushToXeroTarget({ xeroId: "dead-1", knownDead: true }, x.deps);
  assert.strictEqual(r.replacedDeadId, "dead-1");
  assert.ok(!x.calls.includes("update:dead-1"), "must not send an edit to a known-voided bill");
});

test("a flagged void that was reversed in Xero is updated, not duplicated", async () => {
  // xeroVoidedAt can be stale until the next sync clears it.
  const x = fakeXero({ "live-1": "AUTHORISED" });
  const r = await pushToXeroTarget({ xeroId: "live-1", knownDead: true }, x.deps);
  assert.strictEqual(r.viaUnlinkedPath, false);
  assert.ok(!x.calls.includes("unlink:live-1"));
  assert.ok(!x.calls.includes("createOrAdopt"));
});

// ─── What must NOT be released ───────────────────────────────────────────────

test("a PAID invoice refuses the edit but is never unlinked or re-created", async () => {
  // Xero gives paid and voided the same refusal text — only the status tells
  // them apart, and re-creating a paid bill would pay it twice.
  const x = fakeXero({ "paid-1": "PAID" });
  await assert.rejects(pushToXeroTarget({ xeroId: "paid-1" }, x.deps), LockedError);
  assert.ok(!x.calls.some((c) => c.startsWith("unlink")));
  assert.ok(!x.calls.includes("createOrAdopt"));
});

test("status unreadable after a refusal → leave the link alone", async () => {
  const x = fakeXero({});
  x.deps.getStatus = async () => {
    throw new Error("Xero 503");
  };
  await assert.rejects(pushToXeroTarget({ xeroId: "dead-1" }, { ...x.deps, update: async () => { throw LOCKED; } }), LockedError);
  assert.ok(!x.calls.some((c) => c.startsWith("unlink")));
});

test("an unrelated validation error is rethrown without a status lookup", async () => {
  const other = new Error("Account code '1945' is not a valid code");
  const x = fakeXero({ "live-1": "SUBMITTED" }, { failUpdate: other });
  await assert.rejects(pushToXeroTarget({ xeroId: "live-1" }, x.deps), /not a valid code/);
  assert.ok(!x.calls.some((c) => c.startsWith("getStatus")));
});

test("a live link is simply updated", async () => {
  const x = fakeXero({ "live-1": "SUBMITTED" });
  const r = await pushToXeroTarget({ xeroId: "live-1" }, x.deps);
  assert.deepStrictEqual(x.calls, ["update:live-1"]);
  assert.strictEqual(r.viaUnlinkedPath, false);
});

test("no link → the unlinked path (adopt-or-create), no edit attempted", async () => {
  const x = fakeXero({});
  const r = await pushToXeroTarget({ xeroId: null }, x.deps);
  assert.deepStrictEqual(x.calls, ["createOrAdopt"]);
  assert.strictEqual(r.replacedDeadId, undefined);
});

// ─── Status on create ────────────────────────────────────────────────────────

test("a create is SUBMITTED (Awaiting Approval) whatever the Morada status", () => {
  for (const s of ["awaiting_approval", "awaiting_payment", "paid", null]) {
    assert.strictEqual(xeroStatusForPush(s, true), "SUBMITTED", `create from ${s}`);
  }
});

test("an update keeps the systems in step", () => {
  assert.strictEqual(xeroStatusForPush("awaiting_approval", false), "SUBMITTED");
  assert.strictEqual(xeroStatusForPush("awaiting_payment", false), "AUTHORISED");
  assert.strictEqual(xeroStatusForPush("paid", false), "AUTHORISED");
});

Promise.all(pending).then(
  () => console.log(`\n${passed} passed\n`),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

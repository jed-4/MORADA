/**
 * Bill pushes to Xero: voided links, status, and Morada duplicates.
 *
 * BILL-1805 (Bunnings $20.44, 20 Oct 2026) was refused with "Invoice not of
 * valid status for modification": every push was an edit to a voided Xero
 * bill (Xero's POST /Invoices matched it on InvoiceNumber — creates now use
 * PUT). Jed's rules from 20 Oct, each tested here:
 *
 *   1. A bill linked to a voided Xero bill is NEVER re-created by a push. It is
 *      flagged for the review queue; only "Re-create in Xero" sends it.
 *   2. Morada never sends AUTHORISED. Create = SUBMITTED; an update sends no
 *      status, so an edit can never change a bill's status in Xero.
 *   3. A push is blocked while another Morada bill has the same supplier +
 *      invoice number (BILL-1782 vs BILL-1746, both 7377/90275519).
 *
 * Run with:  npx tsx server/__tests__/xero-push-target.test.ts
 */

import assert from "node:assert";
import {
  findDuplicateBlocker,
  pushToXeroTarget,
  xeroStatusForPush,
  type PushTargetDeps,
} from "../services/xeroPushTarget";

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
    isLockedError: (e) => e instanceof LockedError,
  };
  return { deps, calls, getLink: () => link };
}

console.log("\nXero push target\n");

// ─── 1. Voided link: flag, never re-create ───────────────────────────────────

test("stored link points to a voided invoice → reported dead, nothing created", async () => {
  const x = fakeXero({ "dead-1": "VOIDED" });
  const r = await pushToXeroTarget({ xeroId: "dead-1" }, x.deps);
  assert.strictEqual(r.kind, "dead");
  assert.strictEqual(r.kind === "dead" && r.deadXeroId, "dead-1");
  assert.ok(!x.calls.includes("createOrAdopt"), "a push must never re-create a voided bill");
  assert.deepStrictEqual(x.calls, ["update:dead-1", "getStatus:dead-1"]);
});

test("stored link points to a DELETED invoice → same as voided", async () => {
  const x = fakeXero({ "dead-2": "DELETED" });
  const r = await pushToXeroTarget({ xeroId: "dead-2" }, x.deps);
  assert.strictEqual(r.kind, "dead");
  assert.ok(!x.calls.includes("createOrAdopt"));
});

test("a link already flagged voided sends no edit and creates nothing", async () => {
  const x = fakeXero({ "dead-1": "VOIDED" });
  const r = await pushToXeroTarget({ xeroId: "dead-1", knownDead: true }, x.deps);
  assert.strictEqual(r.kind, "dead");
  assert.deepStrictEqual(x.calls, ["getStatus:dead-1"]);
});

test("a flagged void that was reversed in Xero is updated normally", async () => {
  // xeroVoidedAt can be stale until the next sync clears it.
  const x = fakeXero({ "live-1": "AUTHORISED" });
  const r = await pushToXeroTarget({ xeroId: "live-1", knownDead: true }, x.deps);
  assert.strictEqual(r.kind, "pushed");
  assert.ok(!x.calls.includes("createOrAdopt"));
});

test("a PAID invoice's refusal is rethrown, never treated as voided", async () => {
  // Xero gives paid and voided the same refusal text.
  const x = fakeXero({ "paid-1": "PAID" });
  await assert.rejects(pushToXeroTarget({ xeroId: "paid-1" }, x.deps), LockedError);
  assert.ok(!x.calls.includes("createOrAdopt"));
});

test("status unreadable after a refusal → rethrow, never guess voided", async () => {
  const x = fakeXero({});
  x.deps.getStatus = async () => {
    throw new Error("Xero 503");
  };
  x.deps.update = async () => {
    throw LOCKED;
  };
  await assert.rejects(pushToXeroTarget({ xeroId: "dead-1" }, x.deps), LockedError);
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
  assert.ok(r.kind === "pushed" && !r.viaUnlinkedPath);
});

test("no link (e.g. after Re-create cleared it) → adopt-or-create", async () => {
  const x = fakeXero({});
  const r = await pushToXeroTarget({ xeroId: null }, x.deps);
  assert.deepStrictEqual(x.calls, ["createOrAdopt"]);
  assert.ok(r.kind === "pushed" && r.viaUnlinkedPath);
});

// ─── 2. Status: SUBMITTED on create, nothing on update ───────────────────────

test("a create is SUBMITTED (Awaiting Approval)", () => {
  assert.strictEqual(xeroStatusForPush(true), "SUBMITTED");
});

test("an update sends no status, so Xero keeps its own", () => {
  assert.strictEqual(xeroStatusForPush(false), undefined);
});

test("nothing ever sends AUTHORISED", () => {
  for (const c of [true, false]) assert.notStrictEqual(xeroStatusForPush(c), "AUTHORISED");
});

// ─── 3. Duplicate supplier + invoice number ──────────────────────────────────

const BUNNINGS = "sup-bunnings";
const b1746 = { id: "b1746", billNumber: "BILL-1746", supplierId: BUNNINGS, billReference: "7377/90275519", createdAt: "2026-09-20" };
const b1782 = { id: "b1782", billNumber: "BILL-1782", supplierId: BUNNINGS, billReference: "7377/90275519 ", createdAt: "2026-10-10" };

test("BILL-1782 is blocked by BILL-1746 (same supplier + number)", () => {
  const blocker = findDuplicateBlocker(b1782, [b1746]);
  assert.strictEqual(blocker?.billNumber, "BILL-1746");
});

test("the original, BILL-1746, stays pushable", () => {
  assert.strictEqual(findDuplicateBlocker(b1746, [b1782]), null);
});

test("number compared trimmed and case-insensitive", () => {
  const lower = { ...b1782, billReference: " 7377/90275519" };
  assert.ok(findDuplicateBlocker(lower, [b1746]));
  const ab = { ...b1746, billReference: "INV-9A" };
  assert.ok(findDuplicateBlocker({ ...b1782, billReference: "inv-9a" }, [ab]));
});

test("same number from a different supplier is not a duplicate", () => {
  assert.strictEqual(findDuplicateBlocker(b1782, [{ ...b1746, supplierId: "sup-other" }]), null);
});

test("no supplier or no number → never matched", () => {
  assert.strictEqual(findDuplicateBlocker({ ...b1782, supplierId: null }, [b1746]), null);
  assert.strictEqual(findDuplicateBlocker({ ...b1782, billReference: "  " }, [{ ...b1746, billReference: "" }]), null);
});

test("a copy Xero already holds blocks an older unlinked one", () => {
  const linkedLater = { ...b1782, xeroInvoiceId: "x-live" };
  assert.strictEqual(findDuplicateBlocker(b1746, [linkedLater])?.billNumber, "BILL-1782");
});

test("a bill Xero already holds is never blocked from staying in step", () => {
  assert.strictEqual(findDuplicateBlocker({ ...b1782, xeroInvoiceId: "x-live" }, [b1746]), null);
});

test("a voided link doesn't count as Xero holding it", () => {
  const voidedLater = { ...b1782, xeroInvoiceId: "x-dead", xeroVoidedAt: "2026-10-04" };
  assert.strictEqual(findDuplicateBlocker(b1746, [voidedLater]), null);
  assert.strictEqual(findDuplicateBlocker(voidedLater, [b1746])?.billNumber, "BILL-1746");
});

test("many copies: only the earliest is pushable", () => {
  const copies = Array.from({ length: 5 }, (_, i) => ({
    ...b1782, id: `c${i}`, billNumber: `BILL-18${i}`, createdAt: `2026-10-1${i}`,
  }));
  const all = [b1746, ...copies];
  const pushable = all.filter((b) => !findDuplicateBlocker(b, all));
  assert.deepStrictEqual(pushable.map((b) => b.billNumber), ["BILL-1746"]);
});

test("identical timestamps: exactly one of the pair is pushable", () => {
  const a = { ...b1746, id: "a", createdAt: "2026-10-01T00:00:00Z" };
  const b = { ...b1782, id: "b", createdAt: "2026-10-01T00:00:00Z" };
  const pushable = [a, b].filter((x) => !findDuplicateBlocker(x, [a, b]));
  assert.strictEqual(pushable.length, 1);
});

Promise.all(pending).then(
  () => console.log(`\n${passed} passed\n`),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

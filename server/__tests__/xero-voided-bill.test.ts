/**
 * A bill voided in Xero must not become a bill Morada can never send again.
 *
 * Sept 2026 Bunnings bills (invoice 7377/90275519) were voided in Xero on
 * 4 Oct and re-entered in Morada as BILL-1782..1803. Every push reported the
 * bill as already settled and nothing reached Xero.
 *
 * Two separate faults, and the second is the one that traps a bill forever:
 *
 *   1. "Already settled in Xero" was decided from Xero's error text alone —
 *      fixed separately (xero-locked-bill.test.ts). Voided and settled produce
 *      the SAME text from Xero but call for opposite things from the user: a
 *      settled bill is finished, a voided one has to be unlinked before it can
 *      go again.
 *
 *   2. A sync against a voided invoice mapped the Morada bill to `draft`, and
 *      draft bills never reach pushBillToXeroInternal at all. One sync and the
 *      bill was silently beyond syncing: no error, no badge, it simply never
 *      went again. Voiding a document in Xero says nothing about whether the
 *      work happened or the supplier invoice is real, which is the only thing
 *      the Morada status records.
 *
 * Run with:  npx tsx server/__tests__/xero-voided-bill.test.ts
 */

import assert from "node:assert";
import { deriveBillStatusFromXero, isDeadInXero, selectAdoptableBills } from "../services/xeroBillStatus";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("\nXero voided bills\n");

// ─── The trap ────────────────────────────────────────────────────────────────

test("a voided Xero invoice never demotes the bill to draft", () => {
  // The fault. `draft` is a one-way door: draft bills are not pushable.
  for (const dead of ["VOIDED", "DELETED"]) {
    for (const local of ["awaiting_approval", "awaiting_payment", "paid", "draft"]) {
      const { status } = deriveBillStatusFromXero(local, dead, 0, 19225);
      assert.strictEqual(status, local, `${local} + ${dead} must stay ${local}, got ${status}`);
      // The void itself must never be what makes a bill draft.
      if (local !== "draft") assert.notStrictEqual(status, "draft");
    }
  }
});

test("a voided invoice still leaves a note saying so", () => {
  const { voidNote } = deriveBillStatusFromXero("awaiting_approval", "VOIDED", 0, 19225);
  assert.ok(voidNote && /Voided\/Deleted in Xero/.test(voidNote));
});

test("an awaiting-approval bill stays pushable after a void", () => {
  // The whole point: BILL-1782 must still be able to reach Xero.
  const { status } = deriveBillStatusFromXero("awaiting_approval", "VOIDED", 0, 19225);
  assert.strictEqual(status, "awaiting_approval");
  // Mirrors isAutoPushEligible: draft and needs_review never push.
  assert.ok(status !== "draft" && status !== "needs_review");
});

test("voided and deleted are recognised whatever the casing", () => {
  for (const s of ["VOIDED", "DELETED", "voided", "Deleted"]) {
    assert.strictEqual(isDeadInXero(s), true, s);
  }
  for (const s of ["PAID", "AUTHORISED", "SUBMITTED", "DRAFT", "", null, undefined]) {
    assert.strictEqual(isDeadInXero(s as any), false, String(s));
  }
});

// ─── The live states still work ──────────────────────────────────────────────

test("PAID in Xero still marks the bill paid", () => {
  assert.strictEqual(deriveBillStatusFromXero("awaiting_payment", "PAID", 19225, 19225).status, "paid");
});

test("a locally paid bill is not demoted by a non-PAID update", () => {
  assert.strictEqual(deriveBillStatusFromXero("paid", "AUTHORISED", 0, 19225).status, "paid");
});

test("AUTHORISED with nothing paid is awaiting payment", () => {
  assert.strictEqual(deriveBillStatusFromXero("awaiting_approval", "AUTHORISED", 0, 19225).status, "awaiting_payment");
});

test("SUBMITTED with nothing paid is awaiting approval", () => {
  assert.strictEqual(deriveBillStatusFromXero("draft", "SUBMITTED", 0, 19225).status, "awaiting_approval");
});

test("a part payment is awaiting payment", () => {
  assert.strictEqual(deriveBillStatusFromXero("awaiting_approval", "AUTHORISED", 5000, 19225).status, "awaiting_payment");
});

test("an unrecognised Xero status changes nothing", () => {
  assert.strictEqual(deriveBillStatusFromXero("awaiting_approval", "WHATEVER", 0, 19225).status, "awaiting_approval");
});

// ─── Matching: a voided bill is never adopted ────────────────────────────────

const CONTACT = "c0ffee00-0000-0000-0000-000000000001";
const inv = (id: string, Status: string, ContactID = CONTACT) => ({ InvoiceID: id, Status, Contact: { ContactID } });

test("a VOIDED match is ignored, so the bill is created fresh", () => {
  // Xero 746193e3 (invoice 7377/90275519) voided 4 Oct 2026. Adopting it is
  // what made BILL-1782 point at a dead document.
  const hits = selectAdoptableBills([inv("746193e3", "VOIDED")], CONTACT);
  assert.strictEqual(hits.length, 0);
});

test("a DELETED match is ignored too", () => {
  assert.strictEqual(selectAdoptableBills([inv("a", "DELETED")], CONTACT).length, 0);
});

test("a live match is still adopted", () => {
  for (const live of ["AUTHORISED", "SUBMITTED", "PAID", "DRAFT"]) {
    const hits = selectAdoptableBills([inv("live", live)], CONTACT);
    assert.strictEqual(hits.length, 1, live);
  }
});

test("the live one is picked out of a mixed set", () => {
  // The real shape: an invoice number re-used after the first was voided.
  const hits = selectAdoptableBills(
    [inv("dead1", "VOIDED"), inv("live1", "AUTHORISED"), inv("dead2", "DELETED")],
    CONTACT,
  );
  assert.deepStrictEqual(hits.map(h => h.InvoiceID), ["live1"]);
});

test("the same invoice number against another supplier is not a match", () => {
  const hits = selectAdoptableBills([inv("x", "AUTHORISED", "someone-else")], CONTACT);
  assert.strictEqual(hits.length, 0);
});

test("an empty or missing result set is handled", () => {
  assert.deepStrictEqual(selectAdoptableBills([], CONTACT), []);
  assert.deepStrictEqual(selectAdoptableBills(null as any, CONTACT), []);
});

console.log(`\n${passed} passed\n`);

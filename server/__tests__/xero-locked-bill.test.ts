/**
 * "This bill is already settled in Xero" must only be said about a bill that
 * is actually in Xero.
 *
 * Xero refuses edits to a settled invoice with a validation message rather than
 * a distinct status, so the condition is matched on text. The bug that produced
 * this test: the text alone decided it. BILL-1746 — a new Bunnings bill, Sync
 * with Xero on, NO Xero link, status Awaiting Approval — was saved and the user
 * was told it was "already settled in Xero… its status has been pulled back
 * from Xero". There was no such bill in Xero (confirmed against the API), no
 * duplicate was created, and nothing was pulled back. The real reason Xero
 * rejected the create was swallowed along with it.
 *
 * Distinct from the double-push duplicate (#251): that one creates a second
 * bill, this one creates nothing and reports a falsehood.
 *
 * Run with:  npx tsx server/__tests__/xero-locked-bill.test.ts
 */

import assert from "node:assert";
import { isLockedInXero, messageLooksLocked } from "../services/xeroLockedBill";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const LINKED = "e5ee7daa-ea99-4388-bc1a-5f5835dbd4dd";
const err = (message: string) => [{ message }];

console.log("\nXero locked-bill detection\n");

// ─── The false positive ──────────────────────────────────────────────────────

test("an unlinked bill is never 'already settled', whatever Xero says", () => {
  // The BILL-1746 case. Every one of these texts used to trigger it.
  for (const msg of [
    "Invoice not of valid status for modification",
    "The Invoice has payments or credit notes allocated to it",
    "You must supply a LineItemID",
  ]) {
    assert.strictEqual(isLockedInXero(err(msg), null), false, `unlinked + "${msg}"`);
    assert.strictEqual(isLockedInXero(err(msg), undefined), false);
    assert.strictEqual(isLockedInXero(err(msg), ""), false);
  }
});

test("an unlinked bill's real validation error is left to surface", () => {
  // Returning false here is what sends it down the XERO_VALIDATION path, so the
  // user is told what Xero actually objected to instead of a comforting lie.
  assert.strictEqual(
    isLockedInXero(err("Account code 'XYZ' is not a valid code"), null),
    false,
  );
});

// ─── Still catching the real thing ───────────────────────────────────────────

test("a linked bill that Xero has settled is still detected", () => {
  for (const msg of [
    "Invoice not of valid status for modification",
    "The Invoice has payments or credit notes allocated to it",
    "This document has payments",
    "You must supply a LineItemID when updating",
  ]) {
    assert.strictEqual(isLockedInXero(err(msg), LINKED), true, msg);
  }
});

test("a linked bill rejected for an ordinary reason is not 'settled'", () => {
  assert.strictEqual(isLockedInXero(err("Account code 'XYZ' is not a valid code"), LINKED), false);
  assert.strictEqual(isLockedInXero(err("Contact name is required"), LINKED), false);
});

test("one locked message among several is enough", () => {
  const errs = [{ message: "Line 2: tax type is wrong" }, { message: "Invoice not of valid status" }];
  assert.strictEqual(isLockedInXero(errs, LINKED), true);
});

test("no validation errors at all is not a lock", () => {
  assert.strictEqual(isLockedInXero([], LINKED), false);
  assert.strictEqual(isLockedInXero(null, LINKED), false);
  assert.strictEqual(isLockedInXero(undefined, LINKED), false);
});

test("a missing or empty message does not throw or match", () => {
  assert.strictEqual(messageLooksLocked(null), false);
  assert.strictEqual(messageLooksLocked(undefined), false);
  assert.strictEqual(messageLooksLocked(""), false);
  assert.strictEqual(isLockedInXero([{}, { message: null }], LINKED), false);
});

console.log(`\n${passed} passed\n`);

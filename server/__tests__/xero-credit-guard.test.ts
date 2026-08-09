/**
 * Vendor-credit push guard (CREDIT_NOTES_PLAN.md §8, Phase 0).
 *
 * A vendor credit pushed through pushBillToXeroInternal became a normal ACCPAY
 * bill with positive amounts in the customer's Xero file — createBill/updateBill
 * hardcode `Type: "ACCPAY"` and the payload never carried `billType`. The guard
 * rejects `billType === "credit"` with a 422 CREDIT_NOT_SUPPORTED.
 *
 * The decisive assertion is the negative one: "receipt" must still push. A
 * guard written as `billType !== "bill"` would pass a naive credit test while
 * silently blocking worker reimbursements, which are genuine payables.
 *
 * No DB, no network — the guard is a pure predicate in
 * server/services/xeroCreditGuard.ts so it can be tested without booting
 * routes.ts (which opens a pool on import).
 *
 * Run with:  npx tsx server/__tests__/xero-credit-guard.test.ts
 */

import assert from "node:assert";
import {
  isVendorCredit,
  CREDIT_NOT_SUPPORTED,
  CREDIT_NOT_SUPPORTED_MESSAGE,
} from "../services/xeroCreditGuard";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}\n      ${err?.stack || err?.message || err}`);
  }
}

/**
 * Mirrors the guard block in pushBillToXeroInternal (routes.ts, immediately
 * after the tenant-ownership check). Kept in the test so the assertions read as
 * "what the push returns", not "what a boolean returns".
 */
function pushOutcome(bill: { billType?: string | null }) {
  if (isVendorCredit(bill.billType)) {
    return {
      ok: false as const,
      status: 422,
      error: CREDIT_NOT_SUPPORTED,
      message: CREDIT_NOT_SUPPORTED_MESSAGE,
    };
  }
  return { ok: true as const, status: 200 };
}

console.log("\nXero vendor-credit push guard\n");

test("a vendor credit is rejected with 422 CREDIT_NOT_SUPPORTED", () => {
  const result = pushOutcome({ billType: "credit" });
  assert.strictEqual(result.ok, false, "credit must not push");
  assert.strictEqual(result.status, 422, "422 — a validation error, not retryable");
  assert.strictEqual(result.error, "CREDIT_NOT_SUPPORTED");
  assert.match(result.message ?? "", /Xero/, "message tells the user what to do instead");
});

test("a normal supplier bill still pushes", () => {
  assert.strictEqual(pushOutcome({ billType: "bill" }).ok, true);
});

test("a receipt still pushes — it is a real payable, not a credit", () => {
  // Regression guard against `billType !== "bill"`.
  assert.strictEqual(pushOutcome({ billType: "receipt" }).ok, true);
});

test("a missing/legacy billType still pushes (column defaults to 'bill')", () => {
  assert.strictEqual(pushOutcome({}).ok, true);
  assert.strictEqual(pushOutcome({ billType: null }).ok, true);
});

test("isVendorCredit matches exactly, and is not truthiness-based", () => {
  assert.strictEqual(isVendorCredit("credit"), true);
  assert.strictEqual(isVendorCredit("Credit"), false, "enum values are lowercase");
  assert.strictEqual(isVendorCredit("credit_note"), false);
  assert.strictEqual(isVendorCredit(undefined), false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) console.error("Failed:\n  - " + failures.join("\n  - "));
process.exit(failed > 0 ? 1 : 0);

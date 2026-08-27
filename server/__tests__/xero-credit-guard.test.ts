/**
 * Vendor-credit routing at the Xero push boundary.
 *
 * A vendor credit pushed through pushBillToXeroInternal became a normal ACCPAY
 * bill with positive amounts in the customer's Xero file — createBill/updateBill
 * hardcode `Type: "ACCPAY"` and the payload never carried `billType`. It was
 * refused outright (422 CREDIT_NOT_SUPPORTED) until credits could be pushed
 * properly; they now go to /CreditNotes as ACCPAYCREDIT, so the same predicate
 * that used to refuse them is what routes them.
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
 * Mirrors the branch in pushBillToXeroInternal (routes.ts, immediately after
 * the tenant-ownership check). Kept in the test so the assertions read as
 * "which Xero document does this become", not "what does a boolean return".
 */
function pushTarget(bill: { billType?: string | null }) {
  return isVendorCredit(bill.billType)
    ? { endpoint: "/CreditNotes" as const, type: "ACCPAYCREDIT" as const }
    : { endpoint: "/Invoices" as const, type: "ACCPAY" as const };
}

console.log("\nXero vendor-credit push guard\n");

test("a vendor credit posts to /CreditNotes as ACCPAYCREDIT", () => {
  const target = pushTarget({ billType: "credit" });
  assert.strictEqual(target.endpoint, "/CreditNotes", "a credit is not an invoice");
  assert.strictEqual(target.type, "ACCPAYCREDIT", "ACCPAY would raise payables, not reduce them");
});

test("a normal supplier bill still posts to /Invoices as ACCPAY", () => {
  assert.deepStrictEqual(pushTarget({ billType: "bill" }), { endpoint: "/Invoices", type: "ACCPAY" });
});

test("a receipt still posts as ACCPAY — it is a real payable, not a credit", () => {
  // Regression guard against `billType !== "bill"`.
  assert.strictEqual(pushTarget({ billType: "receipt" }).type, "ACCPAY");
});

test("a missing/legacy billType still posts as ACCPAY (column defaults to 'bill')", () => {
  assert.strictEqual(pushTarget({}).type, "ACCPAY");
  assert.strictEqual(pushTarget({ billType: null }).type, "ACCPAY");
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

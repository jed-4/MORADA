/**
 * Monthly Actuals money formatting.
 *
 * Regression guard for the credit that rendered unsigned: a -$385.36
 * Warehouse-Rent line showed as "$0.4k" in the month cell while the column
 * totals treated it correctly, because the cell formatter took Math.abs().
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/overhead-money-format.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { formatSignedAbbreviatedMoney as fmt } from "@shared/money";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("\nMonthly Actuals cell formatting");

check("the Warehouse-Rent credit keeps its sign", () => {
  // The exact figure from Sep 2026 that started this.
  assert.strictEqual(fmt(-38536), "-$385");
});

check("credits at or above $1,000 keep the sign in k form", () => {
  assert.strictEqual(fmt(-129000), "-$1.3k");
  assert.strictEqual(fmt(-100000), "-$1.0k");
});

check("sub-$1,000 values stay whole dollars, not k", () => {
  assert.strictEqual(fmt(38536), "$385");
  assert.strictEqual(fmt(99900), "$999");
});

check("the $1,000 boundary switches to k", () => {
  assert.strictEqual(fmt(99999), "$1000");
  assert.strictEqual(fmt(100000), "$1.0k");
});

check("real August figures round the way the report reads", () => {
  assert.strictEqual(fmt(5194592), "$51.9k");   // SubContractors
  assert.strictEqual(fmt(272727), "$2.7k");     // Adv & Mktg - Photography
  assert.strictEqual(fmt(5531), "$55");         // Subscriptions - Morada
});

check("zero is not signed", () => {
  assert.strictEqual(fmt(0), "$0");
  assert.strictEqual(fmt(-0), "$0");
});

console.log(`\n${passed} checks passed\n`);

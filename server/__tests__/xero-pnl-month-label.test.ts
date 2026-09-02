/**
 * Xero P&L column-header parsing.
 *
 * A header this parser fails on is a whole month silently dropped from the
 * overhead sync — and for a CONFIRMED month that leaves the stored figures
 * frozen at stale values, because confirmed months are not cleared before a
 * rewrite. That is the failure mode behind the missing Jul/Aug 2026 costs, so
 * every header shape Xero has been observed to emit is pinned here.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/xero-pnl-month-label.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { parseXeroPnlMonthLabel as parse } from "@shared/xeroPnl";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("\nXero P&L month-label parsing");

check("four-digit year", () => {
  assert.strictEqual(parse("Jan 2025"), "2025-01");
  assert.strictEqual(parse("Aug 2026"), "2026-08");
});

check("two-digit year", () => {
  assert.strictEqual(parse("Jan 25"), "2025-01");
  assert.strictEqual(parse("Sep 26"), "2026-09");
});

check("day-first headers", () => {
  assert.strictEqual(parse("30 Apr 26"), "2026-04");
  assert.strictEqual(parse("30 Apr 2026"), "2026-04");
  assert.strictEqual(parse("31 Aug 2026"), "2026-08");
});

check("trailing YTD suffix still resolves the month", () => {
  assert.strictEqual(parse("30 Apr 2026 YTD"), "2026-04");
});

check("extra whitespace is tolerated", () => {
  assert.strictEqual(parse("  Jul   2026 "), "2026-07");
});

check("non-month headers are rejected rather than guessed", () => {
  assert.strictEqual(parse(""), null);
  assert.strictEqual(parse("Account"), null);
  assert.strictEqual(parse("Total"), null);
  assert.strictEqual(parse("Jan"), null); // month with no year is not a column we can place
});

check("the full Apr-Sep 2026 window round-trips", () => {
  const labels = ["Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"];
  assert.deepStrictEqual(
    labels.map(parse),
    ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"],
  );
});

console.log(`\n${passed} checks passed\n`);

/**
 * billLinesGapCents — the "lines don't add up to the bill" warning.
 *
 * Run: npx tsx server/__tests__/bill-lines-gap.test.ts
 */
import assert from "node:assert";
import { billLinesDisagree, billLinesGapCents } from "../../shared/billTotals";

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const gst = "GST on expenses";

test("BILL-1481: inc-GST lines on an Exclusive bill are flagged (out by $48.55)", () => {
  const gap = billLinesGapCents({ subtotal: 48560, taxMode: "exclusive" }, [{ total: 53415, tax: gst }]);
  assert.strictEqual(gap, -4855);
  assert.strictEqual(billLinesDisagree(gap), true);
});

test("the same lines under Inclusive agree", () => {
  const gap = billLinesGapCents({ subtotal: 48559, taxMode: "inclusive" }, [{ total: 53415, tax: gst }]);
  assert.strictEqual(billLinesDisagree(gap), false);
});

test("a few cents of rounding is not flagged", () => {
  assert.strictEqual(billLinesDisagree(billLinesGapCents({ subtotal: 10002, taxMode: "exclusive" }, [{ total: 10000, tax: gst }])), false);
});

test("a bill with no lines is never flagged (it counts at its subtotal)", () => {
  assert.strictEqual(billLinesGapCents({ subtotal: 211250, taxMode: "exclusive" }, []), 0);
});

console.log(`\n${passed} passed`);

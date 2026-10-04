/**
 * The rounding adjustment at the Xero push/import boundary.
 *
 * A bill's total can be adjusted in Morada to match the figure printed on the
 * supplier's invoice. The Xero payload carries no total — Xero computes it from
 * the lines — so that adjustment only survives if it is pushed as its own line.
 * Three ways that went wrong, each of which left Morada and Xero disagreeing
 * about what a bill was worth:
 *
 *   1. The rounding line hardcoded TaxType "NONE". Many AU orgs do not have
 *      NONE active (the push path resolves a GST-free type for every other
 *      line precisely because of this), so on those orgs adjusting the rounding
 *      failed the entire push.
 *   2. With no account code to post it to, the line was dropped with a console
 *      warning — no error, no flag, just a silent cent of disagreement.
 *   3. Re-importing folded the rounding line into the subtotal while
 *      roundingCents still carried it, so the bill stopped agreeing with its
 *      own math and double-counted on the next line edit.
 *
 * The decisive assertions are the round trips: what Xero computes from our
 * payload must equal the stored total to the cent, and reading Xero back must
 * reproduce the bill unchanged — in BOTH inc- and ex-GST modes, since the two
 * carry GST in different places and a fix for one can break the other.
 *
 * No DB, no network: the math lives in server/services/xeroBillRounding.ts so
 * it can be tested without booting routes.ts (which opens a pool on import).
 *
 * Run with:  npx tsx server/__tests__/xero-bill-rounding.test.ts
 */

import assert from "node:assert";
import {
  buildRoundingLine,
  xeroComputedTotals,
  importXeroTotals,
  isGstFreeTaxType,
  type XeroPayloadLine,
} from "../services/xeroBillRounding";
import { computeBillTotalsCents, XERO_ROUNDING_LINE_DESCRIPTION } from "@shared/billTotals";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** Build the payload the push path would send, and what Morada has stored. */
function scenario(opts: {
  lineTotalsCents: number[];
  taxable: boolean[];
  taxMode: "inclusive" | "exclusive";
  roundingCents: number;
  gstFreeExpenseTaxType?: string;
  accountCode?: string | undefined;
}) {
  const gstFree = opts.gstFreeExpenseTaxType ?? "EXEMPTEXPENSES";
  const payload: XeroPayloadLine[] = opts.lineTotalsCents.map((cents, i) => ({
    description: `Line ${i + 1}`,
    quantity: 1,
    unitAmount: cents / 100,
    taxType: opts.taxable[i] ? "INPUT" : gstFree,
    accountCode: "400",
  }));

  const built = buildRoundingLine({
    roundingCents: opts.roundingCents,
    accountCode: "accountCode" in opts ? opts.accountCode : "400",
    gstFreeExpenseTaxType: gstFree,
  });
  if (built.ok) payload.push(built.line);

  const stored = computeBillTotalsCents(
    opts.lineTotalsCents.map((cents, i) => ({
      total: cents,
      tax: opts.taxable[i] ? "GST on expenses" : "No GST",
    })),
    opts.taxMode,
    10,
    opts.roundingCents,
  );

  return { payload, stored, built };
}

console.log("\nXero bill rounding\n");

// ─── The core promise: Xero's total equals Morada's, to the cent ────────────

for (const taxMode of ["exclusive", "inclusive"] as const) {
  for (const rounding of [1, -1, 3, -5, 5]) {
    test(`${taxMode} bill, ${rounding > 0 ? "+" : ""}${rounding}c rounding → Xero total matches stored total`, () => {
      // Line amounts whose per-line GST is a whole number of cents, so this
      // asserts the rounding line and nothing else. Where per-line GST is
      // fractional, Morada and Xero already disagree for a separate reason —
      // seen in "GST is rounded per line by Xero" below.
      const { payload, stored } = scenario({
        lineTotalsCents: [12340, 6780, 50000],
        taxable: [true, true, false],
        taxMode,
        roundingCents: rounding,
      });
      const xero = xeroComputedTotals(payload, taxMode, 10);
      assert.strictEqual(
        xero.total,
        stored.total,
        `Xero would compute ${xero.total}c but Morada stored ${stored.total}c`,
      );
    });
  }
}

test("a bill with no rounding gets no rounding line", () => {
  const { payload, built } = scenario({
    lineTotalsCents: [10000],
    taxable: [true],
    taxMode: "exclusive",
    roundingCents: 0,
  });
  assert.strictEqual(built.ok, false);
  assert.ok(!payload.some(l => l.description === XERO_ROUNDING_LINE_DESCRIPTION));
});

// ─── 1. The tax type must be the org's, never a hardcoded NONE ──────────────

test("rounding line carries the resolved GST-free tax type, not NONE", () => {
  const built = buildRoundingLine({
    roundingCents: 1,
    accountCode: "400",
    gstFreeExpenseTaxType: "EXEMPTEXPENSES",
  });
  assert.ok(built.ok);
  assert.strictEqual(built.line.taxType, "EXEMPTEXPENSES");
  assert.notStrictEqual(built.line.taxType, "NONE", "hardcoding NONE fails the push on orgs without it");
});

test("the rounding line is never taxed, whichever GST-free type the org uses", () => {
  for (const t of ["NONE", "EXEMPTEXPENSES", "BASEXCLUDED"]) {
    assert.ok(isGstFreeTaxType(t), `${t} must count as GST-free`);
    const totals = xeroComputedTotals(
      [{ quantity: 1, unitAmount: 0.01, taxType: t }],
      "exclusive",
      10,
    );
    assert.strictEqual(totals.tax, 0, `${t} must add no GST`);
    assert.strictEqual(totals.total, 1);
  }
});

// ─── 2. No account code is a failure, not a silent drop ─────────────────────

test("no account code refuses the push instead of dropping the adjustment", () => {
  const built = buildRoundingLine({
    roundingCents: -2,
    accountCode: undefined,
    gstFreeExpenseTaxType: "EXEMPTEXPENSES",
  });
  assert.strictEqual(built.ok, false);
  assert.strictEqual((built as any).reason, "NO_ACCOUNT");
});

test("dropping the line is exactly the cent of disagreement being guarded against", () => {
  // What the old code did: skip the line, push the rest.
  const { stored } = scenario({
    lineTotalsCents: [12340],
    taxable: [true],
    taxMode: "exclusive",
    roundingCents: 1,
    accountCode: undefined,
  });
  const withoutRounding = xeroComputedTotals(
    [{ quantity: 1, unitAmount: 123.4, taxType: "INPUT", accountCode: "400" }],
    "exclusive",
    10,
  );
  assert.strictEqual(stored.total - withoutRounding.total, 1, "silently dropping it costs exactly the rounding");
});

// ─── 3. The round trip must not revert the rounding ─────────────────────────

for (const taxMode of ["exclusive", "inclusive"] as const) {
  for (const rounding of [1, -1, 4]) {
    test(`${taxMode} bill, ${rounding > 0 ? "+" : ""}${rounding}c → re-sync reproduces the bill unchanged`, () => {
      const { payload, stored } = scenario({
        lineTotalsCents: [12340, 6789],
        taxable: [true, false],
        taxMode,
        roundingCents: rounding,
      });
      const xero = xeroComputedTotals(payload, taxMode, 10);

      // What Xero hands back on a later sync.
      const invoice = {
        SubTotal: xero.subtotal / 100,
        TotalTax: xero.tax / 100,
        Total: xero.total / 100,
        LineItems: payload.map(l => ({
          Description: l.description,
          LineAmount: Math.round((l.quantity ?? 1) * (l.unitAmount ?? 0) * 100) / 100,
        })),
      };

      const imported = importXeroTotals(invoice);
      assert.strictEqual(imported.total, stored.total, "total must survive the round trip");
      assert.strictEqual(imported.subtotal, stored.subtotal, "rounding must not land in the subtotal");
      assert.strictEqual(imported.tax, stored.tax, "tax must be unchanged");
      assert.strictEqual(imported.roundingCents, rounding, "the adjustment must come back intact");
      // The invariant the old import broke.
      assert.strictEqual(
        imported.subtotal + imported.tax + imported.roundingCents,
        imported.total,
        "bill must agree with its own math",
      );
    });
  }
}

test("a supplier line genuinely called Rounding is not mistaken for ours", () => {
  const imported = importXeroTotals({
    SubTotal: 500.0,
    TotalTax: 50.0,
    Total: 550.0,
    // Too large to be a rounding adjustment — a real expense line.
    LineItems: [{ Description: "Rounding", LineAmount: 500.0 }],
  });
  assert.strictEqual(imported.subtotal, 50000, "a real line must stay in the subtotal");
  assert.strictEqual(imported.roundingCents, 0);
});

test("an untouched bill imports with no rounding at all", () => {
  const imported = importXeroTotals({
    SubTotal: 100.0,
    TotalTax: 10.0,
    Total: 110.0,
    LineItems: [{ Description: "Timber", LineAmount: 100.0 }],
  });
  assert.strictEqual(imported.roundingCents, 0);
  assert.strictEqual(imported.subtotal, 10000);
  assert.strictEqual(imported.total, 11000);
});

// ─── Separate, deeper defect this work uncovered ────────────────────────────

test("GST is rounded per line by Xero but once on the sum by Morada — they diverge", () => {
  // $123.45 + $67.89, both taxable, ex-GST.
  //   Xero:   round(1234.5) + round(678.9) = 1235 + 679 = 1914c
  //   Morada: round(1234.5  +      678.9)  =        1913c
  // Nothing to do with the manual rounding adjustment: these are plain lines.
  // It is why a bill can disagree with Xero by a cent with no adjustment set,
  // and why adjustments were being applied by hand in the first place.
  const lines = [
    { quantity: 1, unitAmount: 123.45, taxType: "INPUT" },
    { quantity: 1, unitAmount: 67.89, taxType: "INPUT" },
  ];
  const xero = xeroComputedTotals(lines, "exclusive", 10);
  const morada = computeBillTotalsCents(
    [
      { total: 12345, tax: "GST on expenses" },
      { total: 6789, tax: "GST on expenses" },
    ],
    "exclusive",
    10,
    0,
  );

  assert.strictEqual(xero.tax, 1914, "Xero rounds each line's GST");
  assert.strictEqual(morada.tax, 1913, "Morada rounds the summed GST once");
  assert.strictEqual(
    xero.total - morada.total,
    1,
    "documented gap: changing this is a money-model decision, not part of this fix",
  );
});

console.log(`\n${passed} passed\n`);

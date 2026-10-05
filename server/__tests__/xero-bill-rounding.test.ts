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
import { computeBillTotalsCents, splitLineGstCents, XERO_ROUNDING_LINE_DESCRIPTION } from "@shared/billTotals";

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
      const { payload, stored } = scenario({
        lineTotalsCents: [12345, 6789, 50000],
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
    lineTotalsCents: [12345],
    taxable: [true],
    taxMode: "exclusive",
    roundingCents: 1,
    accountCode: undefined,
  });
  const withoutRounding = xeroComputedTotals(
    [{ quantity: 1, unitAmount: 123.45, taxType: "INPUT", accountCode: "400" }],
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
        lineTotalsCents: [12345, 6789],
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

// ─── GST is rounded per line, the way Xero does it ──────────────────────────

test("GST rounds per line, matching Xero — $123.45 + $67.89 is 1914c not 1913c", () => {
  // The cent that was being reconciled by hand. Morada used to sum the untaxed
  // amounts and round once:  round(1234.5 + 678.9) = 1913c.
  // Xero rounds each line:   round(1234.5) + round(678.9) = 1914c.
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

  assert.strictEqual(xero.tax, 1914);
  assert.strictEqual(morada.tax, 1914, "Morada must round per line too");
  assert.strictEqual(morada.total, xero.total, "no cent left to reconcile by hand");
});

test("Morada and Xero agree on every total, over many generated bills", () => {
  // The old per-sum rounding disagreed on ~25% of 2-line bills and ~61% of
  // 10-line ones, by up to 3c. One disagreement here is a regression.
  let rng = 1;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let checked = 0;

  for (const taxMode of ["exclusive", "inclusive"] as const) {
    for (const lineCount of [1, 2, 3, 5, 10]) {
      for (let t = 0; t < 400; t++) {
        const cents: number[] = [];
        const taxable: boolean[] = [];
        for (let i = 0; i < lineCount; i++) {
          cents.push(Math.floor(rand() * 200000) + 1);
          taxable.push(rand() > 0.2);
        }
        const rounding = [0, 0, 0, 1, -1, 2][Math.floor(rand() * 6)];
        const { payload, stored } = scenario({
          lineTotalsCents: cents,
          taxable,
          taxMode,
          roundingCents: rounding,
        });
        const xero = xeroComputedTotals(payload, taxMode, 10);
        assert.strictEqual(
          xero.total,
          stored.total,
          `${taxMode} ${lineCount}-line bill, rounding ${rounding}: Xero ${xero.total}c vs Morada ${stored.total}c`,
        );
        assert.strictEqual(xero.tax, stored.tax, `${taxMode} ${lineCount}-line bill: GST differs`);
        checked++;
      }
    }
  }
  assert.strictEqual(checked, 4000);
});

test("an inclusive line's parts always add back to the line", () => {
  // Backing GST out of an inc-GST amount is where a cent goes missing if the
  // two halves are rounded independently.
  for (let cents = 1; cents <= 3000; cents++) {
    const { ex, gst } = splitLineGstCents(cents, true, "inclusive", 10);
    assert.strictEqual(ex + gst, cents, `${cents}c split into ${ex} + ${gst}`);
  }
});

test("a GST-free line is never taxed, in either mode", () => {
  for (const mode of ["inclusive", "exclusive"] as const) {
    const { ex, gst } = splitLineGstCents(12345, false, mode, 10);
    assert.strictEqual(gst, 0);
    assert.strictEqual(ex, 12345);
  }
});

// ─── The GST scheme change cannot move a bill by dollars ────────────────────

test("per-line GST moves a bill by at most half a cent per taxable line", () => {
  // A prod audit surfaced bills whose stored header differs from their lines by
  // dollars — up to $135.80 — and that was read as fallout from per-line GST
  // rounding. It cannot be. Each line's GST is rounded once, so the error is
  // under half a cent per line; summed, the two schemes differ by less than
  // (n+1)/2 cents. Dollars require tens of thousands of lines. Whatever moves a
  // bill by dollars is the stored header disagreeing with its own lines, which
  // is a different problem with a different cause.
  const oldScheme = (lines: Array<[number, boolean]>, rate: number) => {
    let subtotal = 0, tax = 0;
    for (const [cents, taxable] of lines) { subtotal += cents; if (taxable) tax += cents * rate; }
    return Math.round(subtotal) + Math.round(tax);
  };

  let rng = 11;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (const n of [1, 2, 5, 10, 50, 200, 500]) {
    let worst = 0;
    for (let t = 0; t < 600; t++) {
      const raw: Array<[number, boolean]> = Array.from({ length: n }, () => [
        Math.floor(rand() * 500000) + 1,
        true,
      ]);
      const now = computeBillTotalsCents(
        raw.map(([cents]) => ({ total: cents, tax: "GST on expenses" })),
        "exclusive",
        10,
        0,
      );
      worst = Math.max(worst, Math.abs(now.total - oldScheme(raw, 0.1)));
    }
    const bound = Math.ceil((n + 1) / 2);
    assert.ok(worst <= bound, `${n} lines moved ${worst}c, over the ${bound}c bound`);
  }

  // The headline: no ordinary bill can move by a dollar.
  const twentyLines = Array.from({ length: 20 }, (_, i) => ({
    total: 10000 + i * 777,
    tax: "GST on expenses" as const,
  }));
  const moved = Math.abs(
    computeBillTotalsCents(twentyLines, "exclusive", 10, 0).total -
      oldScheme(twentyLines.map(l => [l.total, true] as [number, boolean]), 0.1),
  );
  assert.ok(moved <= 11, `a 20-line bill moved ${moved}c`);
});

console.log(`\n${passed} passed\n`);

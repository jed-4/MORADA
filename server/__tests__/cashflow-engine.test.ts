/**
 * Cashflow forecast engine — pure functions over shared/cashflow.
 *
 * The forecast is only useful if its numbers can be trusted, so these tests
 * pin the rules most likely to go quietly wrong:
 *
 *   1. Dates. A due date stored as local midnight in AEST is the PREVIOUS day
 *      in UTC; reading it through toISOString() moves a bill a day early and
 *      can drop it into the wrong month.
 *   2. Money is never lost or invented. Spreading $100 over 3 months must add
 *      back to $100, and a supplier credit must come back as money IN.
 *   3. GST is worked out, not typed in: collected minus paid per BAS quarter,
 *      landing on the ATO due date.
 *   4. The running balance rolls forward and flags the first period under the
 *      buffer.
 */
import assert from "node:assert";
import {
  addMonths,
  basPeriodFor,
  buildForecast,
  buildPeriods,
  monthlyClaimDates,
  occurrences,
  splitEvenly,
  toDateKey,
  type ForecastInput,
} from "@shared/cashflow";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function baseInput(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    today: "2026-09-23",
    granularity: "month",
    periodCount: 12,
    settings: {
      bufferCents: 5_000_000,
      clientPayDays: 14,
      supplierPayDays: 30,
      defaultMarginPercent: 20,
      basFrequency: "quarterly",
      basViaAgent: false,
      fortnightAnchor: null,
    },
    openingBalanceCents: 18_432_000,
    jobs: [],
    invoices: [],
    bills: [],
    expenses: [],
    openPeriodGstCents: {},
    ...overrides,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// --- dates -----------------------------------------------------------------

check("a due date picked at AEST midnight stays on its own day", () => {
  // 28 Oct 2026 00:00 AEDT (UTC+11) is 27 Oct 13:00 UTC.
  const stored = new Date("2026-10-27T13:00:00.000Z");
  assert.strictEqual(stored.toISOString().slice(0, 10), "2026-10-27"); // the trap
  assert.strictEqual(toDateKey(stored), "2026-10-28");
});

check("text date columns are taken literally", () => {
  assert.strictEqual(toDateKey("2027-07-31"), "2027-07-31");
  assert.strictEqual(toDateKey(null), null);
});

check("adding months clamps to the end of a short month", () => {
  assert.strictEqual(addMonths("2027-01-31", 1), "2027-02-28");
  assert.strictEqual(addMonths("2026-12-15", 2), "2027-02-15");
});

// --- recurrence ------------------------------------------------------------

check("monthly on the 31st keeps coming back to the 31st", () => {
  const dates = occurrences("2026-08-31", "monthly", null, "2026-09-01", "2026-12-31");
  assert.deepStrictEqual(dates, ["2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31"]);
});

check("occurrences before the window are skipped and the end date stops them", () => {
  const dates = occurrences("2026-09-01", "fortnightly", "2026-10-20", "2026-09-23", "2027-01-01");
  assert.deepStrictEqual(dates, ["2026-09-29", "2026-10-13"]);
});

check("a one-off payment falls once, only inside the window", () => {
  assert.deepStrictEqual(occurrences("2026-11-05", "once", null, "2026-09-23", "2027-09-30"), ["2026-11-05"]);
  assert.deepStrictEqual(occurrences("2026-08-05", "once", null, "2026-09-23", "2027-09-30"), []);
});

// --- spreading -------------------------------------------------------------

check("splitting never loses or invents a cent", () => {
  assert.deepStrictEqual(splitEvenly(10_000, 3), [3_334, 3_333, 3_333]);
  assert.deepStrictEqual(splitEvenly(-10_000, 3), [-3_334, -3_333, -3_333]);
  assert.strictEqual(sum(splitEvenly(27_500_001, 7)), 27_500_001);
});

check("claims fall at each month end, the last on the job's end date", () => {
  assert.deepStrictEqual(monthlyClaimDates("2026-09-23", "2026-12-10"), [
    "2026-09-30",
    "2026-10-31",
    "2026-11-30",
    "2026-12-10",
  ]);
});

// --- BAS dates ---------------------------------------------------------------

check("quarterly BAS follows the financial-year quarters and ATO due dates", () => {
  assert.deepStrictEqual(basPeriodFor("2026-09-23", "quarterly"), {
    key: "2026-07",
    start: "2026-07-01",
    end: "2026-09-30",
    due: "2026-10-28",
  });
  assert.strictEqual(basPeriodFor("2026-11-02", "quarterly").due, "2027-02-28");
  assert.strictEqual(basPeriodFor("2027-02-10", "quarterly").due, "2027-04-28");
  assert.strictEqual(basPeriodFor("2027-05-10", "quarterly").due, "2027-07-28");
});

check("lodging through an agent moves quarters 1, 3 and 4 later", () => {
  assert.strictEqual(basPeriodFor("2026-09-23", "quarterly", true).due, "2026-11-25");
  assert.strictEqual(basPeriodFor("2026-11-02", "quarterly", true).due, "2027-02-28");
  assert.strictEqual(basPeriodFor("2027-02-10", "quarterly", true).due, "2027-05-26");
  assert.strictEqual(basPeriodFor("2027-05-10", "quarterly", true).due, "2027-08-25");
});

check("monthly BAS is due on the 21st of the next month", () => {
  assert.strictEqual(basPeriodFor("2026-12-05", "monthly").due, "2027-01-21");
});

// --- periods ---------------------------------------------------------------

check("fortnights are counted from the pay-cycle anchor", () => {
  const periods = buildPeriods("2026-09-23", "fortnight", 3, "2026-09-07");
  assert.deepStrictEqual(
    periods.map((p) => [p.start, p.end]),
    [
      ["2026-09-21", "2026-10-04"],
      ["2026-10-05", "2026-10-18"],
      ["2026-10-19", "2026-11-01"],
    ],
  );
});

// --- the forecast ------------------------------------------------------------

check("an overdue invoice lands today, flagged, not in the past", () => {
  const r = buildForecast(
    baseInput({
      invoices: [
        {
          id: "inv1",
          projectId: "p1",
          projectName: "Whitfield St",
          label: "INV-1001",
          balanceCents: 4_800_000,
          gstRatio: 1 / 11,
          dueDate: "2026-09-01",
          invoiceDate: "2026-08-18",
        },
      ],
    }),
  );
  const ev = r.events.find((e) => e.sourceId === "inv1")!;
  assert.strictEqual(ev.date, "2026-09-23");
  assert.strictEqual(ev.overdue, true);
  assert.strictEqual(r.lines.find((l) => l.id === "job:p1")!.values[0], 4_800_000);
});

check("a supplier credit comes back as money in on the costs line", () => {
  const r = buildForecast(
    baseInput({
      bills: [
        { id: "b1", projectId: "p1", label: "Bill", balanceCents: 110_000, gstRatio: 1 / 11, dueDate: "2026-10-15", billDate: "2026-09-15" },
        { id: "c1", projectId: "p1", label: "Credit", balanceCents: -11_000, gstRatio: 1 / 11, dueDate: "2026-10-15", billDate: "2026-09-15" },
      ],
    }),
  );
  const costs = r.lines.find((l) => l.id === "job_costs")!;
  assert.strictEqual(costs.values[1], -110_000 + 11_000);
});

check("a business bill (no job) goes on the business expenses line", () => {
  const r = buildForecast(
    baseInput({
      bills: [{ id: "b2", projectId: null, label: "Rent", balanceCents: 240_000, gstRatio: 1 / 11, dueDate: "2026-10-01", billDate: "2026-09-20" }],
    }),
  );
  assert.strictEqual(r.lines.find((l) => l.id === "business_expenses")!.values[1], -240_000);
});

check("a job's remaining claims spread evenly and add back to the total", () => {
  const r = buildForecast(
    baseInput({
      jobs: [
        {
          projectId: "p1",
          name: "Hunter Rd",
          phase: "construction",
          mode: "even",
          winPercent: 100,
          clientPayDays: 14,
          remainingToClaimCents: 30_000_000,
          remainingCostCents: 0,
          costBasis: "budget",
          startDate: "2026-01-10",
          endDate: "2027-02-28",
        },
      ],
    }),
  );
  const claims = r.events.filter((e) => e.source === "claim");
  // Sep 26 … Feb 27 = 6 month-ends, each paid 14 days later.
  assert.strictEqual(claims.length, 6);
  assert.strictEqual(sum(claims.map((e) => e.amountCents)), 30_000_000);
  assert.strictEqual(claims[0].date, "2026-10-14");
});

check("a prospective job is weighted by its win chance", () => {
  const r = buildForecast(
    baseInput({
      jobs: [
        {
          projectId: "p2",
          name: "Coastal House",
          phase: "lead",
          mode: "even",
          winPercent: 50,
          clientPayDays: 14,
          remainingToClaimCents: 52_800_000,
          remainingCostCents: 42_240_000,
          costBasis: "margin",
          startDate: "2027-04-01",
          endDate: "2028-03-31",
        },
      ],
    }),
  );
  // $528k at 50% over 12 months = $22k a month. The forecast ends 31 Aug 27,
  // so only the Apr–Jul claims are paid inside it (the July claim on 14 Aug;
  // August's lands on 14 Sep, outside).
  const claims = r.events.filter((e) => e.source === "claim");
  assert.strictEqual(sum(claims.map((e) => e.amountCents)), 2_200_000 * 4);
  assert.ok(r.warnings.some((w) => w.code === "job_cost_from_margin"));
});

check("business expenses repeat inside the forecast window only", () => {
  const r = buildForecast(
    baseInput({
      expenses: [{ id: "e1", name: "Rent", amountCents: 240_000, hasGst: true, frequency: "monthly", nextDate: "2026-10-01", endDate: null }],
    }),
  );
  const rent = r.events.filter((e) => e.sourceId === "e1");
  assert.strictEqual(rent.length, 11); // Oct 26 … Aug 27
  assert.strictEqual(rent[0].gstCents, -21_818);
});

check("GST: collected minus paid for the quarter, paid on the due date", () => {
  const r = buildForecast(
    baseInput({
      // $5,000 GST already collected this quarter before today.
      openPeriodGstCents: { "2026-07": 500_000 },
      invoices: [
        { id: "i", projectId: "p1", projectName: "J", label: "INV", balanceCents: 1_100_000, gstRatio: 1 / 11, dueDate: "2026-09-28", invoiceDate: "2026-09-14" },
      ],
      bills: [{ id: "b", projectId: "p1", label: "B", balanceCents: 550_000, gstRatio: 1 / 11, dueDate: "2026-09-29", billDate: "2026-09-01" }],
    }),
  );
  const bas = r.events.filter((e) => e.source === "bas");
  assert.strictEqual(bas.length, 1);
  assert.strictEqual(bas[0].date, "2026-10-28");
  // 5,000 + 1,000 collected − 500 paid = 5,500 to the ATO.
  assert.strictEqual(bas[0].amountCents, -550_000);
});

check("a quarter with more GST paid than collected is a refund", () => {
  const r = buildForecast(
    baseInput({
      bills: [{ id: "b", projectId: null, label: "Truck", balanceCents: 9_900_000, gstRatio: 1 / 11, dueDate: "2026-11-10", billDate: "2026-11-01" }],
    }),
  );
  const bas = r.events.find((e) => e.source === "bas")!;
  assert.strictEqual(bas.date, "2027-02-28");
  assert.strictEqual(bas.amountCents, 900_000);
});

check("the balance rolls forward and flags the first period under the buffer", () => {
  const r = buildForecast(
    baseInput({
      openingBalanceCents: 8_000_000,
      expenses: [{ id: "e", name: "Wages", amountCents: 1_500_000, hasGst: false, frequency: "monthly", nextDate: "2026-09-28", endDate: null }],
    }),
  );
  assert.deepStrictEqual(r.closingCents.slice(0, 3), [6_500_000, 5_000_000, 3_500_000]);
  assert.strictEqual(r.openingCents[1], r.closingCents[0]);
  assert.strictEqual(r.firstBelowBufferIndex, 2);
  assert.strictEqual(r.lowest.periodIndex, 11);
});

check("no bank balance starts from zero and says so", () => {
  const r = buildForecast(baseInput({ openingBalanceCents: null }));
  assert.strictEqual(r.openingBalanceCents, 0);
  assert.ok(r.warnings.some((w) => w.code === "no_opening_balance"));
});

check("a job with no end date is spread over six months, with a warning", () => {
  const r = buildForecast(
    baseInput({
      jobs: [
        {
          projectId: "p3",
          name: "Bayview",
          phase: "construction",
          mode: "even",
          winPercent: 100,
          clientPayDays: 14,
          remainingToClaimCents: 600_000,
          remainingCostCents: 0,
          costBasis: "budget",
          startDate: "2026-06-01",
          endDate: null,
        },
      ],
    }),
  );
  assert.strictEqual(r.events.filter((e) => e.source === "claim").length, 6);
  assert.ok(r.warnings.some((w) => w.code === "job_no_end_date"));
});

console.log(`\ncashflow-engine: ${passed} passed`);

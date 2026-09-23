/**
 * Cashflow what-ifs — template expansion and how the engine applies them.
 *
 * What these pin:
 *   1. The money maths a builder will check on a calculator: a finance
 *      repayment, an employee's all-in cost.
 *   2. GST on a vehicle: the whole GST on the price comes back at the next
 *      BAS whether it's bought outright or on a chattel mortgage — even
 *      though only the deposit leaves the bank on day one.
 *   3. A what-if only counts when it's switched on, and the baseline never
 *      includes one — that difference is what the "Can we afford it?" panel
 *      reads.
 */
import assert from "node:assert";
import {
  buildForecast,
  employeeCost,
  expandWhatIf,
  loanRepaymentCents,
  type EmployeeParams,
  type ForecastInput,
  type VehicleParams,
  type WhatIfDefinition,
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

const ctx = { clientPayDays: 14, supplierPayDays: 30 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const employee = (over: Partial<EmployeeParams> = {}): EmployeeParams => ({
  role: "Site supervisor",
  payType: "salary",
  annualSalaryCents: 11_000_000,
  hourlyRateCents: 0,
  hoursPerWeek: 38,
  payCycle: "fortnightly",
  startDate: "2027-01-04",
  endDate: null,
  superPercent: 12,
  workcoverPercent: 2.8,
  payrollTaxPercent: 0,
  ...over,
});

const truck = (over: Partial<VehicleParams> = {}): VehicleParams => ({
  priceCents: 9_900_000,
  purchaseDate: "2026-11-10",
  payWith: "finance",
  depositCents: 3_000_000,
  termMonths: 60,
  ratePercent: 7.9,
  balloonCents: 0,
  regoInsuranceYearlyCents: 420_000,
  runningMonthlyCents: 126_000,
  savingsMonthlyCents: 0,
  ...over,
});

const def = (over: Partial<WhatIfDefinition>): WhatIfDefinition => ({
  id: "w1",
  name: "Tipper truck",
  template: "vehicle",
  isEnabled: true,
  params: truck(),
  lines: [],
  ...over,
});

function input(over: Partial<ForecastInput> = {}): ForecastInput {
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
    ...over,
  };
}

// --- maths -----------------------------------------------------------------

check("finance repayment: $69,000 over 5 years at 7.9% is about $1,396 a month", () => {
  const pmt = loanRepaymentCents(6_900_000, 7.9, 60);
  assert.ok(pmt >= 139_500 && pmt <= 139_700, `got ${pmt}`);
});

check("a zero-rate loan is the principal split evenly; a balloon lowers the repayment", () => {
  assert.strictEqual(loanRepaymentCents(1_200_000, 0, 12), 100_000);
  assert.ok(loanRepaymentCents(6_900_000, 7.9, 60, 2_000_000) < loanRepaymentCents(6_900_000, 7.9, 60));
});

check("employee: $110k salary, fortnightly, 12% super, 2.8% WorkCover", () => {
  const c = employeeCost(employee());
  assert.strictEqual(c.wagesPerPayCents, 423_077);
  assert.strictEqual(c.superPerPayCents, 50_769);
  assert.strictEqual(c.workcoverPerYearCents, 308_000);
  assert.strictEqual(c.totalPerYearCents, (423_077 + 50_769) * 26 + 308_000);
});

check("hourly pay: rate × hours × 52 weeks", () => {
  const c = employeeCost(employee({ payType: "hourly", hourlyRateCents: 5_500, hoursPerWeek: 38 }));
  assert.strictEqual(c.grossPerYearCents, 5_500 * 38 * 52);
});

// --- expansion -------------------------------------------------------------

check("employee wages and super carry no GST and start one pay after the start date", () => {
  const w = expandWhatIf(def({ template: "employee", name: "Supervisor", params: employee() }), ctx);
  const wages = w.streams.find((s) => s.name.endsWith("wages"))!;
  assert.strictEqual(wages.gstCents, 0);
  assert.strictEqual(wages.frequency, "fortnightly");
  assert.strictEqual(wages.startDate, "2027-01-17");
  assert.ok(w.streams.every((s) => s.gstCents === 0));
});

check("buying outright: the price goes out once with its full GST credit", () => {
  const w = expandWhatIf(def({ params: truck({ payWith: "cash" }) }), ctx);
  const buy = w.streams.find((s) => s.name.endsWith("purchase"))!;
  assert.strictEqual(buy.amountCents, -9_900_000);
  assert.strictEqual(buy.gstCents, -900_000);
});

check("chattel mortgage: only the deposit leaves the bank, but the whole GST comes back", () => {
  const w = expandWhatIf(def({}), ctx);
  const deposit = w.streams.find((s) => s.name.endsWith("deposit"))!;
  assert.strictEqual(deposit.amountCents, -3_000_000);
  assert.strictEqual(deposit.gstCents, -900_000);
  const repay = w.streams.find((s) => s.name.endsWith("repayments"))!;
  assert.strictEqual(repay.startDate, "2026-12-10");
  assert.strictEqual(repay.endDate, "2031-11-10");
  assert.strictEqual(repay.gstCents, 0);
});

check("win a job: claims weighted by win chance, costs by margin", () => {
  const w = expandWhatIf(
    def({ template: "win_job", name: "Coastal", params: { valueCents: 52_800_000, startDate: "2027-04-01", months: 12, winPercent: 50, marginPercent: 20 } }),
    ctx,
  );
  const claims = w.streams.find((s) => s.name.endsWith("claims"))!;
  const costs = w.streams.find((s) => s.name.endsWith("costs"))!;
  assert.strictEqual(claims.amountCents, 2_200_000);
  assert.strictEqual(claims.startDate, "2027-05-14");
  assert.strictEqual(costs.amountCents, -1_760_000);
});

check("user lines are added on top of any template", () => {
  const w = expandWhatIf(
    def({
      template: "custom",
      params: {},
      lines: [{ name: "Ute finance", direction: "out", amountCents: 86_600, hasGst: false, frequency: "monthly", startDate: "2027-01-01", endDate: null }],
    }),
    ctx,
  );
  assert.deepStrictEqual(w.streams.map((s) => [s.name, s.amountCents]), [["Ute finance", -86_600]]);
});

// --- in the forecast ---------------------------------------------------------

check("a what-if that's switched on gets its own line; the baseline leaves it out", () => {
  const w = expandWhatIf(def({ params: truck({ regoInsuranceYearlyCents: 0, runningMonthlyCents: 0 }) }), ctx);
  const r = buildForecast(input({ whatIfs: [w] }));
  const line = r.lines.find((l) => l.id === "whatif:w1")!;
  assert.strictEqual(line.section, "whatif");
  assert.strictEqual(line.values[2], -3_000_000); // deposit in November
  // Repayments Dec 26 … Aug 27 = 9 of them.
  assert.strictEqual(sum(line.values), -3_000_000 - loanRepaymentCents(6_900_000, 7.9, 60) * 9);
  assert.ok(r.closingCents[11] < r.baselineClosingCents[11]);
});

check("the truck's GST credit lowers the BAS — only when the what-if is on", () => {
  const w = expandWhatIf(def({ params: truck({ regoInsuranceYearlyCents: 0, runningMonthlyCents: 0 }) }), ctx);
  const on = buildForecast(input({ whatIfs: [w] }));
  const off = buildForecast(input({ whatIfs: [{ ...w, enabled: false }] }));
  const bas = (r: typeof on) => r.events.filter((e) => e.source === "bas").reduce((s, e) => s + e.amountCents, 0);
  assert.strictEqual(bas(off), 0);
  assert.strictEqual(bas(on), 900_000); // refund on the Oct–Dec BAS, 28 Feb
  assert.deepStrictEqual(off.closingCents, off.baselineClosingCents);
});

check("net includes what-ifs; in and out don't", () => {
  const w = expandWhatIf(
    def({ template: "one_off", name: "Bonus", params: { amountCents: 1_000_000, date: "2026-12-15", hasGst: false, direction: "out" } }),
    ctx,
  );
  const r = buildForecast(input({ whatIfs: [w] }));
  assert.strictEqual(r.whatIfCents[3], -1_000_000);
  assert.strictEqual(r.outCents[3], 0);
  assert.strictEqual(r.netCents[3], -1_000_000);
  assert.strictEqual(r.baselineLowest.cents, 18_432_000);
});

console.log(`\ncashflow-whatifs: ${passed} passed`);

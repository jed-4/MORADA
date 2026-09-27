/**
 * Business expenses carry their register group, so the forecast can break the
 * "Business expenses" line down by group without changing its total.
 */
import assert from "node:assert";
import { buildForecast, GROUP_UNALLOCATED_BILLS, GROUP_UNCATEGORISED, LINE_BUSINESS_EXPENSES, type ForecastInput } from "@shared/cashflow";

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

const input: ForecastInput = {
  today: "2026-09-27",
  granularity: "month",
  periodCount: 3,
  settings: { bufferCents: 0, clientPayDays: 14, supplierPayDays: 30, defaultMarginPercent: 20, basFrequency: "quarterly", basViaAgent: false, fortnightAnchor: null },
  openingBalanceCents: 10_000_000,
  jobs: [],
  invoices: [],
  bills: [{ id: "b", projectId: null, label: "Office chairs", balanceCents: 88_000, gstRatio: 1 / 11, dueDate: "2026-10-10", billDate: "2026-09-20" }],
  expenses: [
    { id: "rent", name: "Rent", amountCents: 440_000, hasGst: true, frequency: "monthly", nextDate: "2026-10-01", endDate: null, category: "Premises" },
    { id: "ins", name: "Insurance", amountCents: 120_000, hasGst: true, frequency: "monthly", nextDate: "2026-10-05", endDate: null, category: " Insurance " },
    { id: "x", name: "Mystery", amountCents: 10_000, hasGst: false, frequency: "monthly", nextDate: "2026-10-09", endDate: null, category: "" },
  ],
  openPeriodGstCents: {},
};
const f = buildForecast(input);
const expenseEvents = f.events.filter((e) => e.lineId === LINE_BUSINESS_EXPENSES);

check("each expense payment carries its group (trimmed); blank is uncategorised", () => {
  const groupOf = (id: string) => new Set(expenseEvents.filter((e) => e.sourceId === id).map((e) => e.group));
  assert.deepStrictEqual([...groupOf("rent")], ["Premises"]);
  assert.deepStrictEqual([...groupOf("ins")], ["Insurance"]);
  assert.deepStrictEqual([...groupOf("x")], [GROUP_UNCATEGORISED]);
});

check("a company bill not on a job is its own group", () => {
  assert.strictEqual(expenseEvents.find((e) => e.sourceId === "b")?.group, GROUP_UNALLOCATED_BILLS);
});

check("the groups add up to the Business expenses line, period by period", () => {
  const line = f.lines.find((l) => l.id === LINE_BUSINESS_EXPENSES)!;
  f.periods.forEach((p, i) => {
    const inPeriod = expenseEvents.filter((e) => e.date >= p.start && e.date <= p.end).reduce((s, e) => s + e.amountCents, 0);
    assert.strictEqual(inPeriod, line.values[i]);
  });
});

console.log(`\ncashflow-expense-groups: ${passed} passed`);

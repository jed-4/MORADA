/**
 * Draft invoices linked to a schedule item (JobInput.linkedClaims): claimed
 * when the item finishes, paid clientPayDays later, and taken off what's left
 * to spread — so the job's total never changes, only its timing.
 */
import assert from "node:assert";
import { buildForecast, type ForecastInput, type JobInput } from "@shared/cashflow";

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

const job = (over: Partial<JobInput> = {}): JobInput => ({
  projectId: "p",
  name: "Coastal House",
  phase: "construction",
  mode: "even",
  winPercent: 100,
  clientPayDays: 14,
  remainingToClaimCents: 30_000_000,
  remainingCostCents: 0,
  costBasis: "margin",
  startDate: "2026-10-01",
  endDate: "2027-03-31",
  ...over,
});
const input = (j: JobInput): ForecastInput => ({
  today: "2026-09-27",
  granularity: "month",
  periodCount: 12,
  settings: { bufferCents: 0, clientPayDays: 14, supplierPayDays: 30, defaultMarginPercent: 20, basFrequency: "quarterly", basViaAgent: false, fortnightAnchor: null },
  openingBalanceCents: 0,
  jobs: [j],
  invoices: [],
  bills: [],
  expenses: [],
  openPeriodGstCents: {},
});
const claims = { invoiceId: "inv3", label: "Claim 3 — Lock-up", amountCents: 12_000_000, date: "2026-12-10" as const };
const jobIn = (f: ReturnType<typeof buildForecast>) => f.events.filter((e) => e.lineId === "job:p");
const sum = (es: { amountCents: number }[]) => es.reduce((s, e) => s + e.amountCents, 0);

check("a linked draft is paid its pay days after the item finishes, linked to the invoice", () => {
  const e = jobIn(buildForecast(input(job({ linkedClaims: [claims] })))).find((x) => x.sourceId === "inv3")!;
  assert.strictEqual(e.date, "2026-12-24");
  assert.strictEqual(e.amountCents, 12_000_000);
  assert.strictEqual(e.source, "invoice");
});

check("the job's total is unchanged: the linked draft comes off what's spread", () => {
  const without = sum(jobIn(buildForecast(input(job()))));
  const withLinked = sum(jobIn(buildForecast(input(job({ linkedClaims: [claims] })))));
  assert.strictEqual(withLinked, without);
});

check("moving the schedule item moves the claim", () => {
  const later = jobIn(buildForecast(input(job({ linkedClaims: [{ ...claims, date: "2027-02-03" }] })))).find((x) => x.sourceId === "inv3")!;
  assert.strictEqual(later.date, "2027-02-17");
});

check("an item that already finished is claimed from today", () => {
  const past = jobIn(buildForecast(input(job({ linkedClaims: [{ ...claims, date: "2026-08-01" }] })))).find((x) => x.sourceId === "inv3")!;
  assert.strictEqual(past.date, "2026-10-11");
});

check("weighted by win %, like the rest of the job", () => {
  const e = jobIn(buildForecast(input(job({ winPercent: 50, linkedClaims: [claims] })))).find((x) => x.sourceId === "inv3")!;
  assert.strictEqual(e.amountCents, 6_000_000);
});

check("a job on typed-in monthly amounts ignores links", () => {
  const f = buildForecast(input(job({ mode: "manual", manualAmounts: [{ month: "2026-11-01", amountCents: 5_000_000 }], linkedClaims: [claims] })));
  assert.ok(!jobIn(f).some((x) => x.sourceId === "inv3"));
});

console.log(`\ncashflow-linked-claims: ${passed} passed`);

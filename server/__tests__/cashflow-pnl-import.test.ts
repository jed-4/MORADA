/**
 * Business expenses from the Xero P&L — shared/cashflow/pnlImport.
 * Timing is read off last year's pattern; GST added back where it's paid;
 * non-cash and already-forecast accounts left out, with reasons.
 */
import assert from "node:assert";
import { coverage, exclusionReason, gstApplies, groupFor, proposeFromPnl, readTiming, yearExOf, type PnlAccount } from "@shared/cashflow";

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

const TODAY = "2026-09-27";
// Oct 2025 … Sep 2026
const MONTHS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
const acct = (code: string, name: string, monthly: number[], over: Partial<PnlAccount> = {}): PnlAccount => ({
  code, name, type: "EXPENSE", taxType: "INPUT", months: MONTHS, monthlyExCents: monthly, ...over,
});
const flat = (v: number) => MONTHS.map(() => v);

check("even spend is monthly, next payment mid-month on or after today", () => {
  const t = readTiming(MONTHS, flat(400_000), TODAY)!;
  assert.deepStrictEqual([t.frequency, t.paymentExCents, t.nextDate, t.pattern], ["monthly", 400_000, "2026-10-15", "Every month"]);
});

check("one big month is a yearly bill in that month", () => {
  const m = flat(0); m[9] = 600_000; // July 2026
  const t = readTiming(MONTHS, m, TODAY)!;
  assert.deepStrictEqual([t.frequency, t.paymentExCents, t.nextDate, t.pattern], ["yearly", 600_000, "2027-07-15", "Once a year, in July"]);
});

check("four lumps three months apart are quarterly", () => {
  const m = flat(0); m[0] = 150_000; m[3] = 160_000; m[6] = 155_000; m[9] = 165_000; // Oct, Jan, Apr, Jul
  const t = readTiming(MONTHS, m, TODAY)!;
  assert.deepStrictEqual([t.frequency, t.paymentExCents, t.nextDate], ["quarterly", 157_500, "2026-10-15"]);
});

check("patchy spend is averaged, so the year's total is right", () => {
  const m = flat(0); m[1] = 90_000; m[2] = 20_000; m[7] = 50_000; m[8] = 80_000; m[11] = 10_000;
  const t = readTiming(MONTHS, m, TODAY)!;
  assert.strictEqual(t.frequency, "monthly");
  assert.ok(Math.abs(t.paymentExCents * 12 - 250_000) <= 12, "a year of the average ≈ the year's spend (to the cent a month)");
  assert.strictEqual(t.pattern, "Averaged — spend was irregular");
});

check("nothing spent → nothing proposed", () => {
  assert.strictEqual(readTiming(MONTHS, flat(0), TODAY), null);
});

check("job costs, depreciation, tax and PAYG are left out with a reason", () => {
  assert.match(exclusionReason({ type: "DIRECTCOSTS", name: "Subcontractors" })!, /Job cost/);
  assert.strictEqual(exclusionReason({ type: "DEPRECIATN", name: "Depreciation" }), "Not cash");
  assert.strictEqual(exclusionReason({ type: "EXPENSE", name: "Amortisation of goodwill" }), "Not cash");
  assert.match(exclusionReason({ type: "EXPENSE", name: "Income Tax Expense" })!, /Tax/);
  assert.match(exclusionReason({ type: "EXPENSE", name: "PAYG Withholding" })!, /BAS/);
  assert.strictEqual(exclusionReason({ type: "OVERHEADS", name: "Rent" }), null);
});

check("GST only where the account's tax type pays it", () => {
  assert.strictEqual(gstApplies("INPUT"), true);
  assert.strictEqual(gstApplies("EXEMPTEXPENSES"), false);
  assert.strictEqual(gstApplies("BASEXCLUDED"), false);
  assert.strictEqual(gstApplies(null), false);
});

check("accounts land in the starter groups", () => {
  assert.deepStrictEqual(
    ["Wages and Salaries", "Superannuation", "Rent", "Light, Power, Heating", "Motor Vehicle Expenses", "Insurance", "Subscriptions", "Bank Fees", "Advertising", "Accounting", "Freight"].map(groupFor),
    ["People", "People", "Premises", "Premises", "Vehicles", "Insurance", "Software", "Finance", "Marketing", "Admin", "Other"],
  );
});

check("proposals add GST back; wages stay GST-free; exclusions listed", () => {
  const { proposals, excluded } = proposeFromPnl(
    [
      acct("469", "Rent", flat(400_000)),
      acct("477", "Wages and Salaries", flat(1_600_000), { taxType: "BASEXCLUDED" }),
      acct("310", "Cost of Goods Sold", flat(9_000_000), { type: "DIRECTCOSTS" }),
      acct("416", "Depreciation", flat(50_000), { type: "DEPRECIATN" }),
      acct("499", "Unused", flat(0)),
    ],
    TODAY,
  );
  const rent = proposals.find((p) => p.accountCode === "469")!;
  const wages = proposals.find((p) => p.accountCode === "477")!;
  assert.deepStrictEqual([rent.amountCents, rent.hasGst, rent.category, rent.yearExCents], [440_000, true, "Premises", 4_800_000]);
  assert.deepStrictEqual([wages.amountCents, wages.hasGst, wages.category], [1_600_000, false, "People"]);
  assert.deepStrictEqual(excluded.map((e) => e.accountCode), ["310", "416"]);
  assert.ok(!proposals.some((p) => p.accountCode === "499"));
});

check("coverage: imported lines account for their accounts; a split leaves a visible gap", () => {
  const props = [
    { accountCode: "469", accountName: "Rent", yearExCents: 4_800_000 },
    { accountCode: "485", accountName: "Subscriptions", yearExCents: 1_440_000 },
  ];
  const cov = coverage(props, [
    { xeroAccountCode: "469", amountCents: 440_000, hasGst: true, frequency: "monthly", isActive: true },
    { xeroAccountCode: "485", amountCents: 99_000, hasGst: true, frequency: "monthly", isActive: true }, // $900 ex of $1,200/mo
    { xeroAccountCode: null, amountCents: 250_000, hasGst: false, frequency: "monthly", isActive: true }, // loan — not on the P&L
  ]);
  assert.strictEqual(cov.accounts[0].gapYearExCents, 0);
  assert.strictEqual(cov.accounts[1].gapYearExCents, 360_000);
  assert.strictEqual(cov.percent, Math.round(((4_800_000 + 1_080_000) / 6_240_000) * 100));
});

check("a paused line doesn't count as covering its account", () => {
  assert.strictEqual(yearExOf({ xeroAccountCode: "469", amountCents: 440_000, hasGst: true, frequency: "monthly", isActive: false }), 0);
});

console.log(`\ncashflow-pnl-import: ${passed} passed`);

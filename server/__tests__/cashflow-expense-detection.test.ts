/**
 * Finding regular business payments in Xero spend — shared/cashflow/expenseDetection.
 *
 * These rules decide what gets suggested; the AI only names and explains
 * them. The mistakes that would matter: suggesting a job cost as a business
 * expense (double-counting it against the job), suggesting the ATO (GST is
 * already forecast), calling an irregular supplier "monthly", or putting the
 * next payment in the past.
 */
import assert from "node:assert";
import { detectRecurring, spendRecordsFromXero, xeroDateKey, type SpendRecord } from "@shared/cashflow";

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

const TODAY = "2026-09-23";
const rec = (name: string, date: string, amountCents: number, over: Partial<SpendRecord> = {}): SpendRecord => ({
  contactKey: `c:${name}`,
  contactId: null,
  contactName: name,
  date,
  amountCents,
  gstCents: Math.round(amountCents / 11),
  accountNames: ["Rent"],
  description: "",
  jobTracked: false,
  ...over,
});
const monthly = (name: string, day: number, amountCents: number, months = 12, over: Partial<SpendRecord> = {}) =>
  Array.from({ length: months }, (_, i) => {
    const m = ((8 - i + 12 * 2) % 12) + 1; // Sep 26 backwards
    const y = i <= 8 ? 2026 : 2025;
    return rec(name, `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`, amountCents, over);
  });

check("rent paid on the 1st every month: monthly, high confidence, next on the 1st", () => {
  const { patterns } = detectRecurring(monthly("Yard Landlord", 1, 240_000), TODAY);
  assert.strictEqual(patterns.length, 1);
  const p = patterns[0];
  assert.deepStrictEqual([p.frequency, p.amountCents, p.confidence, p.nextDate, p.hasGst], ["monthly", 240_000, "high", "2026-10-01", true]);
});

check("the typical amount is the median, so one odd month doesn't skew it", () => {
  const rs = monthly("Bunnings Trade", 15, 115_000);
  rs[3].amountCents = 900_000;
  assert.strictEqual(detectRecurring(rs, TODAY).patterns[0].amountCents, 115_000);
});

check("a supplier mostly coded to jobs is a job cost, not a suggestion", () => {
  const rs = monthly("Coates Hire", 20, 165_000).map((r, i) => ({ ...r, jobTracked: i < 9 }));
  const { patterns, skipped } = detectRecurring(rs, TODAY);
  assert.strictEqual(patterns.length, 0);
  assert.deepStrictEqual(skipped.map((s) => [s.contactName, s.reason]), [["Coates Hire", "job_cost"]]);
});

check("the ATO is left out — BAS is already forecast", () => {
  const { patterns, skipped } = detectRecurring(
    [rec("Australian Taxation Office", "2026-07-28", 1_400_000), rec("Australian Taxation Office", "2026-04-28", 1_600_000)],
    TODAY,
  );
  assert.strictEqual(patterns.length, 0);
  assert.strictEqual(skipped[0].reason, "ato");
});

check("fortnightly wages are fortnightly and carry no GST", () => {
  const rs = Array.from({ length: 20 }, (_, i) => rec("Office payroll", addDaysKey("2026-09-18", -14 * i), 655_000, { gstCents: 0 }));
  const p = detectRecurring(rs, TODAY).patterns[0];
  assert.deepStrictEqual([p.frequency, p.hasGst, p.nextDate], ["fortnightly", false, "2026-10-02"]);
});

check("one big payment a while ago might be a yearly renewal (low confidence)", () => {
  const p = detectRecurring([rec("Allianz", "2026-01-14", 980_000)], TODAY).patterns[0];
  assert.deepStrictEqual([p.frequency, p.confidence, p.nextDate], ["yearly", "low", "2027-01-14"]);
});

check("one small payment is a one-off, not a suggestion", () => {
  assert.strictEqual(detectRecurring([rec("Officeworks", "2026-05-02", 8_900)], TODAY).skipped[0].reason, "one_off");
});

check("payments at random gaps are irregular", () => {
  const rs = ["2025-10-02", "2025-10-09", "2026-01-20", "2026-01-27", "2026-06-30"].map((d) => rec("Randoms", d, 10_000));
  assert.strictEqual(detectRecurring(rs, TODAY).skipped[0].reason, "irregular");
});

check("a subscription that stopped is flagged as lapsed", () => {
  const p = detectRecurring(monthly("Adobe", 5, 8_900, 12).filter((r) => r.date <= "2026-06-05"), TODAY).patterns[0];
  assert.strictEqual(p.lapsed, true);
});

check("the biggest yearly cost comes first", () => {
  const { patterns } = detectRecurring([...monthly("Phone", 12, 38_000), ...monthly("Rent", 1, 240_000)], TODAY);
  assert.deepStrictEqual(patterns.map((p) => p.contactName), ["Rent", "Phone"]);
});

check("Xero dates: DateString and /Date()/ both read as the calendar day", () => {
  assert.strictEqual(xeroDateKey("2026-09-01T00:00:00"), "2026-09-01");
  assert.strictEqual(xeroDateKey("/Date(1756684800000+0000)/"), "2025-09-01");
  assert.strictEqual(xeroDateKey(undefined), null);
});

check("Xero bills and bank spend become records; job tracking marks job costs", () => {
  const records = spendRecordsFromXero({
    bills: [
      {
        Contact: { ContactID: "c1", Name: "Coates Hire" },
        DateString: "2026-08-20T00:00:00",
        Total: 1650,
        TotalTax: 150,
        LineItems: [{ AccountCode: "310", Description: "Tipper hire", Tracking: [{ TrackingOptionID: "job-opt" }] }],
      },
    ],
    bankTransactions: [
      { Contact: { Name: "Telstra" }, DateString: "2026-08-12T00:00:00", Total: 380, TotalTax: 34.55, LineItems: [{ AccountCode: "489" }] },
    ],
    accountNames: new Map([["489", "Telephone & Internet"]]),
    jobTrackingOptionIds: new Set(["job-opt"]),
  });
  assert.deepStrictEqual(
    records.map((r) => [r.contactKey, r.amountCents, r.gstCents, r.jobTracked, r.accountNames]),
    [
      ["c1", 165_000, 15_000, true, ["310"]],
      ["name:telstra", 38_000, 3_455, false, ["Telephone & Internet"]],
    ],
  );
});

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10); // UTC midnight: safe for pure date maths
}

console.log(`\ncashflow-expense-detection: ${passed} passed`);

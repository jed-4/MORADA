/**
 * Job costs still to come — shared/cashflow/jobCosts.
 *
 * The number must agree with the Budget page (actual + what's left of budget)
 * and never count a dollar twice: a PO that's committed isn't also "budget
 * still to spend", labour already done isn't still to spend, and subbie hours
 * waiting on a PO aren't both committed and budget. These pin that, plus when
 * each dollar is paid.
 */
import assert from "node:assert";
import { assembleJobCostInputs, planJobCosts, poUnbilled, type JobCostInput, type JobCostRows } from "@shared/cashflow";

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
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function base(over: Partial<JobCostInput> = {}): JobCostInput {
  return {
    today: "2026-09-23",
    supplierPayDays: 30,
    jobName: "Whitfield",
    budgetLines: [],
    labourExByKey: {},
    committedPos: [],
    awaitingPoLabourExCents: 0,
    scheduleItems: [],
    window: { from: "2026-09-23", to: "2026-12-31" },
    ...over,
  };
}

// --- PO left to bill -------------------------------------------------------

check("PO left to bill: value minus its bills, credits ignored, never negative", () => {
  const po = { total: 1_100_000, gstAmount: 100_000 };
  assert.deepStrictEqual(
    poUnbilled(po, [
      { total: 440_000, tax: 40_000, billType: "bill" },
      { total: 110_000, tax: 10_000, billType: "credit" },
    ]),
    { incCents: 660_000, exCents: 600_000 },
  );
  assert.deepStrictEqual(poUnbilled(po, [{ total: 2_000_000, tax: 0, billType: "bill" }]).incCents, 0);
});

// --- what's still to spend --------------------------------------------------

check("still to spend = budget − billed − labour − committed, per code", () => {
  const plan = planJobCosts(
    base({
      budgetLines: [{ key: "frame", label: "Framing", budgetedExCents: 10_000_000, billedExCents: 3_000_000 }],
      labourExByKey: { frame: 1_000_000 },
      committedPos: [{ id: "po1", label: "PO-12", requiredBy: "2026-10-15", unbilledIncCents: 2_200_000, unbilledExCents: 2_000_000, byKey: [{ key: "frame", exCents: 2_000_000 }] }],
    }),
  );
  assert.strictEqual(plan.lines[0].remainingExCents, 4_000_000);
  // 4,000,000 ex → 4,400,000 inc, plus the PO's 2,200,000.
  assert.strictEqual(plan.totalIncCents, 4_400_000 + 2_200_000);
});

check("an overspent code has nothing left, not a negative", () => {
  const plan = planJobCosts(base({ budgetLines: [{ key: "a", label: "A", budgetedExCents: 100, billedExCents: 500 }] }));
  assert.strictEqual(plan.lines[0].remainingExCents, 0);
  assert.strictEqual(plan.chunks.length, 0);
});

check("subbie hours awaiting a PO are paid soon and taken off what's left", () => {
  const plan = planJobCosts(
    base({
      budgetLines: [
        { key: "a", label: "A", budgetedExCents: 3_000_000, billedExCents: 0 },
        { key: "b", label: "B", budgetedExCents: 1_000_000, billedExCents: 0 },
      ],
      awaitingPoLabourExCents: 400_000,
    }),
  );
  const subbie = plan.chunks.find((c) => c.label.includes("awaiting a PO"))!;
  assert.strictEqual(subbie.amountCents, -400_000);
  assert.strictEqual(subbie.gstCents, 0);
  assert.strictEqual(subbie.date, "2026-10-23");
  assert.deepStrictEqual(plan.lines.map((l) => l.remainingExCents), [2_700_000, 900_000]);
});

// --- when it's paid ---------------------------------------------------------

check("a committed PO is paid supplier days after its required-by date", () => {
  const plan = planJobCosts(
    base({ committedPos: [{ id: "p", label: "PO-7", requiredBy: "2026-11-02", unbilledIncCents: 550_000, unbilledExCents: 500_000, byKey: [] }] }),
  );
  assert.deepStrictEqual(plan.chunks.map((c) => [c.date, c.amountCents, c.gstCents]), [["2026-12-02", -550_000, -50_000]]);
});

check("a PO with no date is paid when its code's scheduled work ends", () => {
  const plan = planJobCosts(
    base({
      scheduleItems: [{ key: "roof", start: "2026-10-01", end: "2026-11-20" }],
      committedPos: [{ id: "p", label: "PO-8", requiredBy: null, unbilledIncCents: 110_000, unbilledExCents: 100_000, byKey: [{ key: "roof", exCents: 100_000 }] }],
    }),
  );
  assert.strictEqual(plan.chunks.find((c) => c.label === "PO-8")!.date, "2026-12-20");
});

check("what's left on a code follows its schedule items, by month, to the cent", () => {
  const plan = planJobCosts(
    base({
      budgetLines: [{ key: "tile", label: "Tiling", budgetedExCents: 3_000_000, billedExCents: 0 }],
      scheduleItems: [{ key: "tile", start: "2026-11-10", end: "2027-01-20" }],
    }),
  );
  // Nov, Dec, Jan work → paid 30 days after each month end (Jan: after the item ends).
  assert.deepStrictEqual(plan.chunks.map((c) => c.date), ["2026-12-30", "2027-01-30", "2027-02-19"]);
  assert.strictEqual(sum(plan.chunks.map((c) => c.amountCents)), -3_300_000);
});

check("two items on one code share it by how long each runs", () => {
  const plan = planJobCosts(
    base({
      budgetLines: [{ key: "k", label: "K", budgetedExCents: 1_000_000, billedExCents: 0 }],
      scheduleItems: [
        { key: "k", start: "2026-10-01", end: "2026-10-10" }, // 10 days
        { key: "k", start: "2026-11-01", end: "2026-11-30" }, // 30 days
      ],
    }),
  );
  assert.deepStrictEqual(plan.chunks.map((c) => c.amountCents), [-275_000, -825_000]);
});

check("a code with no schedule items is spread evenly over the job", () => {
  const plan = planJobCosts(base({ budgetLines: [{ key: "x", label: "Prelims", budgetedExCents: 400_000, billedExCents: 0 }] }));
  // Sep … Dec = 4 months.
  assert.strictEqual(plan.chunks.length, 4);
  assert.strictEqual(sum(plan.chunks.map((c) => c.amountCents)), -440_000);
});

check("work scheduled in the past but not done yet is paid from today", () => {
  const plan = planJobCosts(
    base({
      budgetLines: [{ key: "k", label: "K", budgetedExCents: 100_000, billedExCents: 0 }],
      scheduleItems: [{ key: "k", start: "2026-06-01", end: "2026-07-31" }],
    }),
  );
  assert.deepStrictEqual(plan.chunks.map((c) => c.date), ["2026-10-23"]);
});

// --- from database rows ------------------------------------------------------

const noRows = (): JobCostRows => ({
  lineRows: [],
  poRows: [],
  poItemRows: [],
  linkedBillRows: [],
  labourRows: [],
  splitRows: [],
  awaitingRows: [],
  itemRows: [],
});

check("a PO's unbilled value is split across its codes pro rata by item value", () => {
  const rows = noRows();
  rows.poRows.push({ id: "po", projectId: "p", poNumber: "PO-1", supplierName: "Bluey", requiredByDate: null, total: 1_100_000, gstAmount: 100_000 });
  // Inclusive PO: item totals are inc GST, so ex = total − gst.
  rows.poItemRows.push(
    { purchaseOrderId: "po", costCodeId: "frame", total: 825_000, gstAmount: 75_000, gstMode: "inclusive" },
    { purchaseOrderId: "po", costCodeId: "roof", total: 275_000, gstAmount: 25_000, gstMode: "inclusive" },
  );
  rows.linkedBillRows.push({ poId: "po", total: 550_000, tax: 50_000, billType: "bill" });
  const po = assembleJobCostInputs(rows).get("p")!.committedPos[0];
  assert.strictEqual(po.unbilledExCents, 500_000);
  assert.deepStrictEqual(po.byKey, [{ key: "frame", exCents: 375_000 }, { key: "roof", exCents: 125_000 }]);
  assert.strictEqual(po.label, "Bluey — PO-1");
});

check("labour goes to a timesheet's cost-code splits, else its own code", () => {
  const rows = noRows();
  rows.labourRows.push(
    { id: "t1", projectId: "p", costCodeId: "frame", total: "400.00" },
    { id: "t2", projectId: "p", costCodeId: "frame", total: "300.00" },
  );
  rows.splitRows.push({ timesheetId: "t1", costCodeId: "roof", total: "250.00" }, { timesheetId: "t1", costCodeId: "frame", total: "150.00" });
  assert.deepStrictEqual(assembleJobCostInputs(rows).get("p")!.labourExByKey, { roof: 25_000, frame: 45_000 });
});

check("uncoded budget rows key by title; completed schedule items are left out", () => {
  const rows = noRows();
  rows.lineRows.push({ projectId: "p", costCodeId: null, title: "Variations", budgeted: 100, actual: 0 });
  rows.itemRows.push(
    { projectId: "p", costCodeId: "k", startDate: "2026-10-01", endDate: "2026-10-31", status: "in_progress" },
    { projectId: "p", costCodeId: "k", startDate: "2026-08-01", endDate: "2026-08-31", status: "completed" },
  );
  rows.awaitingRows.push({ projectId: "p", duration: "7.5", rate: "60.00" });
  const d = assembleJobCostInputs(rows).get("p")!;
  assert.strictEqual(d.budgetLines[0].key, "other:Variations");
  assert.strictEqual(d.scheduleItems.length, 1);
  assert.strictEqual(d.awaitingPoLabourExCents, 45_000);
});

console.log(`\ncashflow-jobcosts: ${passed} passed`);

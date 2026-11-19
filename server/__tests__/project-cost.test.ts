/**
 * Project cost — shared/projectCost.ts, the one calculation behind the Budget
 * page. Pins: the header (totals) is the sum of the rows; variations land on
 * their own cost code; bills with no lines still count; labour is split by
 * cost code with no subcontractor filter; everything is ex-GST cents.
 *
 * Run: npx tsx server/__tests__/project-cost.test.ts
 */
import assert from "node:assert";
import {
  allocateLabourCents,
  computeProjectCost,
  UNCATEGORISED_KEY,
  VARIATIONS_KEY,
  variationRowKeyResolver,
  type ProjectCostInputs,
  type ProjectCostTotals,
} from "@shared/projectCost";

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

const CARP = "cc-carp";
const ELEC = "cc-elec";
const OLD = "cc-old"; // an inactive code — still has a name

function inputs(over: Partial<ProjectCostInputs> = {}): ProjectCostInputs {
  return {
    costCodes: [
      { id: CARP, code: "300", title: "Carpentry", categoryId: "cat-structure" },
      { id: ELEC, code: "410", title: "Electrical", categoryId: "cat-services" },
      { id: OLD, code: "999", title: "Old code", categoryId: null },
    ],
    categories: [
      { id: "cat-structure", code: "3", title: "Structure" },
      { id: "cat-services", code: "4", title: "Services" },
    ],
    estimateItems: [],
    variationItems: [],
    bills: [],
    billLines: [],
    labour: [],
    committed: [],
    ...over,
  };
}

const row = (cost: ReturnType<typeof computeProjectCost>, key: string) => {
  const r = cost.rows.find((x) => x.key === key);
  assert.ok(r, `row ${key} missing`);
  return r!;
};

function assertTotalsAreSumOfRows(cost: ReturnType<typeof computeProjectCost>) {
  for (const k of Object.keys(cost.totals) as (keyof ProjectCostTotals)[]) {
    const sum = cost.rows.reduce((s, r) => s + r[k], 0);
    assert.strictEqual(cost.totals[k], sum, `totals.${k} ≠ sum of rows`);
  }
}

console.log("project cost");

check("original budget is builder cost ex GST (qty × unit cost, wastage in, no markup)", () => {
  const cost = computeProjectCost(inputs({
    estimateItems: [
      { costCode: CARP, unitCostExTax: 50, quantity: 10, markupPercent: 25, wastagePercent: 10 },
      // Fixed-price allowance: cached inc price less its GST.
      { costCode: ELEC, unitCostExTax: 0, quantity: 1, priceIncTax: 1100, taxAmount: 100 },
    ],
  }));
  assert.strictEqual(row(cost, CARP).originalBudgetCents, 55000);
  assert.strictEqual(row(cost, ELEC).originalBudgetCents, 100000);
  assert.strictEqual(cost.totals.originalBudgetCents, 155000);
});

check("approved variations go on their own cost code; revised = original + variations", () => {
  const cost = computeProjectCost(inputs({
    estimateItems: [{ costCode: CARP, unitCostExTax: 100, quantity: 10 }],
    variationItems: [
      { costCode: CARP, unitCostExTax: 200, quantity: 2 },
      { costCode: CARP, unitCostExTax: -50, quantity: 1 }, // a credit line
      { costCode: ELEC, unitCostExTax: 300, quantity: null }, // blank qty = 1
    ],
  }));
  const carp = row(cost, CARP);
  assert.strictEqual(carp.originalBudgetCents, 100000);
  assert.strictEqual(carp.variationsCents, 35000);
  assert.strictEqual(carp.revisedBudgetCents, 135000);
  assert.strictEqual(row(cost, ELEC).variationsCents, 30000);
  assert.strictEqual(row(cost, ELEC).originalBudgetCents, 0);
  assert.strictEqual(cost.totals.revisedBudgetCents, 165000);
});

check("variation lines with the code TEXT map to that code; unknown or blank go to the Variations row", () => {
  const cost = computeProjectCost(inputs({
    variationItems: [
      { costCode: "300", unitCostExTax: 10, quantity: 1 }, // legacy text → Carpentry
      { costCode: "plumbing", unitCostExTax: 20, quantity: 1 }, // unrecognised
      { costCode: null, unitCostExTax: 30, quantity: 1 },
    ],
  }));
  assert.strictEqual(row(cost, CARP).variationsCents, 1000);
  assert.strictEqual(row(cost, VARIATIONS_KEY).variationsCents, 5000);
});

check("bills: GST stripped from inclusive taxable lines, credits negative, uncoded lines uncategorised", () => {
  const cost = computeProjectCost(inputs({
    bills: [
      { id: "b1", billType: "bill", taxMode: "inclusive", subtotal: 0 },
      { id: "b2", billType: "credit", taxMode: "exclusive", subtotal: 0 },
    ],
    billLines: [
      { billId: "b1", costCodeId: CARP, total: 11000, tax: "GST on expenses" },
      { billId: "b1", costCodeId: null, total: 5000, tax: "No GST" },
      { billId: "b2", costCodeId: CARP, total: 2000, tax: "GST on expenses" },
    ],
  }));
  assert.strictEqual(row(cost, CARP).billsCents, 10000 - 2000);
  assert.strictEqual(row(cost, UNCATEGORISED_KEY).billsCents, 5000);
});

check("a bill with no line items counts at its ex-GST subtotal under Uncategorised", () => {
  const cost = computeProjectCost(inputs({
    bills: [
      { id: "b1", billType: "bill", taxMode: "inclusive", subtotal: 500000 },
      { id: "b2", billType: "credit", taxMode: "exclusive", subtotal: 10000 },
      { id: "b3", billType: "bill", taxMode: "exclusive", subtotal: 99999 },
    ],
    billLines: [{ billId: "b3", costCodeId: CARP, total: 99999, tax: "No GST" }],
  }));
  assert.strictEqual(row(cost, UNCATEGORISED_KEY).billsCents, 500000 - 10000);
  assert.strictEqual(row(cost, CARP).billsCents, 99999); // b3 counted once, by its lines
  assert.deepStrictEqual(cost.billsWithoutLines.map((b) => b.billId).sort(), ["b1", "b2"]);
  assert.strictEqual(cost.totals.billsCents, 500000 - 10000 + 99999);
});

check("spent, committed, remaining and forecast final per row", () => {
  const cost = computeProjectCost(inputs({
    estimateItems: [
      { costCode: CARP, unitCostExTax: 1000, quantity: 10 }, // $10,000
      { costCode: ELEC, unitCostExTax: 1000, quantity: 5 }, // $5,000
    ],
    bills: [{ id: "b1", billType: "bill", taxMode: "exclusive", subtotal: 0 }],
    billLines: [
      { billId: "b1", costCodeId: CARP, total: 400000, tax: "No GST" },
      { billId: "b1", costCodeId: ELEC, total: 450000, tax: "No GST" },
    ],
    labour: [{ costCodeId: CARP, cents: 100000 }],
    committed: [{ costCodeId: CARP, cents: 200000 }, { costCodeId: ELEC, cents: 150000 }],
  }));
  const carp = row(cost, CARP);
  assert.strictEqual(carp.spentCents, 500000);
  assert.strictEqual(carp.remainingCents, 1000000 - 500000 - 200000);
  assert.strictEqual(carp.forecastFinalCents, 1000000); // still under budget → budget
  const elec = row(cost, ELEC);
  assert.strictEqual(elec.remainingCents, 500000 - 450000 - 150000); // −$1,000
  assert.strictEqual(elec.forecastFinalCents, 600000); // overrunning → spent + committed
  assert.strictEqual(cost.totals.forecastFinalCents, 1600000);
});

check("totals are always the sum of the rows", () => {
  const cost = computeProjectCost(inputs({
    estimateItems: [
      { costCode: CARP, unitCostExTax: 12.34, quantity: 3 },
      { costCategoryId: "cat-services", unitCostExTax: 7, quantity: 9 },
      { unitCostExTax: 5, quantity: 1 },
    ],
    variationItems: [{ costCode: null, unitCostExTax: 99.99, quantity: 1 }],
    bills: [{ id: "b1", billType: "bill", taxMode: "inclusive", subtotal: 0 }, { id: "b2", billType: "bill", taxMode: "inclusive", subtotal: 777 }],
    billLines: [{ billId: "b1", costCodeId: OLD, total: 1234, tax: "GST on expenses" }],
    labour: [{ costCodeId: null, cents: 4321 }, { costCodeId: ELEC, cents: 1000 }],
    committed: [{ costCodeId: "cc-from-elsewhere", cents: 50 }],
  }));
  assertTotalsAreSumOfRows(cost);
});

check("rows carry server-built labels and category, by id", () => {
  const cost = computeProjectCost(inputs({
    estimateItems: [
      { costCode: CARP, unitCostExTax: 1, quantity: 1 },
      { costCode: OLD, unitCostExTax: 1, quantity: 1 },
      { costCategoryId: "cat-services", unitCostExTax: 1, quantity: 1 },
    ],
    committed: [{ costCodeId: "cc-unknown", cents: 10 }],
  }));
  const carp = row(cost, CARP);
  assert.strictEqual(carp.label, "300 - Carpentry");
  assert.strictEqual(carp.categoryId, "cat-structure");
  assert.strictEqual(carp.categoryLabel, "3 - Structure");
  assert.strictEqual(row(cost, OLD).label, "999 - Old code"); // inactive code keeps its name
  const cat = row(cost, "cat:cat-services");
  assert.strictEqual(cat.kind, "category");
  assert.strictEqual(cat.categoryLabel, "4 - Services");
  assert.strictEqual(row(cost, "cc-unknown").label, "Unknown cost code");
});

check("variation drill-down key matches the row the cost landed in", () => {
  const keyOf = variationRowKeyResolver(inputs().costCodes);
  assert.strictEqual(keyOf(CARP), CARP);
  assert.strictEqual(keyOf(" 300 "), CARP);
  assert.strictEqual(keyOf("plumbing"), VARIATIONS_KEY);
  assert.strictEqual(keyOf(null), VARIATIONS_KEY);
  // Code text shared by two codes is ambiguous — never guessed.
  const dupe = variationRowKeyResolver([{ id: "a", code: "500" }, { id: "b", code: "500" }]);
  assert.strictEqual(dupe("500"), VARIATIONS_KEY);
});

check("empty project: no rows, zero totals", () => {
  const cost = computeProjectCost(inputs());
  assert.strictEqual(cost.rows.length, 0);
  assert.strictEqual(cost.totals.spentCents, 0);
});

console.log("labour allocation");

check("splits share the timesheet total by dollars, remainder on the last split", () => {
  const out = allocateLabourCents({
    timesheets: [{ id: "t1", total: "100.00", costCodeId: null, workItemId: null }],
    splits: [
      { timesheetId: "t1", costCodeId: CARP, total: "1", duration: "1" },
      { timesheetId: "t1", costCodeId: ELEC, total: "2", duration: "1" },
    ],
    workItemCostCode: new Map(),
  });
  assert.deepStrictEqual(out.map((o) => [o.costCodeId, o.cents]), [[CARP, 3333], [ELEC, 6667]]);
});

check("no splits: timesheet code, then the estimate line's code, then none", () => {
  const out = allocateLabourCents({
    timesheets: [
      { id: "t1", total: "10", costCodeId: CARP, workItemId: "w1" },
      { id: "t2", total: "20", costCodeId: null, workItemId: "w1" },
      { id: "t3", total: "30", costCodeId: null, workItemId: null },
    ],
    splits: [],
    workItemCostCode: new Map([["w1", ELEC]]),
  });
  assert.deepStrictEqual(out.map((o) => [o.costCodeId, o.cents]), [[CARP, 1000], [ELEC, 2000], [null, 3000]]);
});

check("$0 timesheets (subcontractors) add nothing — no flag check needed", () => {
  const out = allocateLabourCents({
    timesheets: [{ id: "t1", total: "0", costCodeId: CARP, workItemId: null }],
    splits: [{ timesheetId: "t1", costCodeId: CARP, total: "0", duration: "8" }],
    workItemCostCode: new Map(),
  });
  assert.deepStrictEqual(out, []);
});

console.log(`\n${passed} passed`);

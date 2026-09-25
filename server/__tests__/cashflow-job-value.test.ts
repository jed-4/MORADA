/**
 * What a job is worth on the forecast — shared/cashflow/jobValue.
 *
 * A signed contract always wins (the forecast must agree with it); until then
 * the builder's own forecast value, then the client budget / cost figure.
 */
import assert from "node:assert";
import { jobBaseValue } from "@shared/cashflow";

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

const bare = { contractPrice: null, clientBudget: null, contractCost: null };

check("a job with nothing set is worth nothing, and says so", () => {
  assert.deepStrictEqual(jobBaseValue(bare, null, "lead", null), { cents: 0, source: "none" });
});

check("the builder's forecast value fills the gap", () => {
  assert.deepStrictEqual(jobBaseValue(bare, null, "pre_construction", 85_000_000), { cents: 85_000_000, source: "forecast" });
});

check("the forecast value wins over the client budget", () => {
  assert.deepStrictEqual(jobBaseValue({ ...bare, clientBudget: 60_000_000 }, null, "lead", 85_000_000), { cents: 85_000_000, source: "forecast" });
});

check("without one, a lead falls back to its client budget", () => {
  assert.deepStrictEqual(jobBaseValue({ ...bare, clientBudget: 60_000_000 }, null, "lead", null), { cents: 60_000_000, source: "budget" });
});

check("a signed contract always wins over a forecast value", () => {
  assert.deepStrictEqual(jobBaseValue({ ...bare, contractPrice: 90_000_000 }, null, "construction", 85_000_000), { cents: 90_000_000, source: "contract" });
  assert.deepStrictEqual(jobBaseValue(bare, 91_000_000, "construction", 85_000_000), { cents: 91_000_000, source: "contract" });
});

check("a $0 contract price isn't a contract", () => {
  assert.deepStrictEqual(jobBaseValue({ ...bare, contractPrice: 0 }, null, "pre_construction", 85_000_000), { cents: 85_000_000, source: "forecast" });
});

console.log(`\ncashflow-job-value: ${passed} passed`);

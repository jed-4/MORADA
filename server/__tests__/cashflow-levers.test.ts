/**
 * "Ways to make it work" — shared/cashflow/levers.
 *
 * Every suggestion must be backed by a real engine run: shown only when it
 * helps, and labelled with what it actually does to the lowest balance.
 */
import assert from "node:assert";
import { findLevers, shiftWhatIf, type ForecastInput, type WhatIfDefinition } from "@shared/cashflow";

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
    openingBalanceCents: 8_000_000,
    jobs: [],
    invoices: [],
    bills: [],
    expenses: [],
    openPeriodGstCents: {},
    ...over,
  };
}

const oneOff = (amountCents: number, date: string, id = "w"): WhatIfDefinition => ({
  id,
  name: "Excavator",
  template: "one_off",
  isEnabled: true,
  params: { amountCents, date, hasGst: false, direction: "out" },
  lines: [],
});

check("shifting a what-if moves every date together", () => {
  const def: WhatIfDefinition = {
    ...oneOff(100, "2026-11-10"),
    lines: [{ name: "x", direction: "out", amountCents: 1, hasGst: false, frequency: "monthly", startDate: "2026-11-01", endDate: "2027-03-01" }],
  };
  const s = shiftWhatIf(def, 3);
  assert.strictEqual((s.params as any).date, "2027-02-10");
  assert.deepStrictEqual([s.lines[0].startDate, s.lines[0].endDate], ["2027-02-01", "2027-06-01"]);
});

check("nothing to suggest when the what-if already fits", () => {
  assert.deepStrictEqual(findLevers(input(), oneOff(1_000_000, "2026-11-01"), [], ctx), []);
});

check("start it later: the first month that keeps the buffer", () => {
  // $50k out in Nov takes $80k to $30k. A $30k claim lands in Feb 27, so from
  // a start in Feb (paid out after the claim arrives) the buffer holds.
  const base = input({
    invoices: [{ id: "i", projectId: "p", projectName: "J", label: "INV", balanceCents: 3_000_000, gstRatio: 0, dueDate: "2027-02-01", invoiceDate: "2027-01-18" }],
  });
  const levers = findLevers(base, oneOff(5_000_000, "2026-11-01"), [], ctx);
  const delay = levers.find((l) => l.id === "delay")!;
  assert.strictEqual(delay.label, "Start it in Feb 27 instead");
  assert.strictEqual(delay.staysAboveBuffer, true);
});

check("winning the prospective jobs is offered when it helps", () => {
  const base = input({
    jobs: [
      {
        projectId: "p",
        name: "Coastal House",
        phase: "lead",
        mode: "even",
        winPercent: 50,
        clientPayDays: 14,
        remainingToClaimCents: 10_000_000,
        remainingCostCents: 0,
        costBasis: "margin",
        startDate: "2026-10-01",
        endDate: "2027-01-31",
      },
    ],
  });
  // Claims start mid-November; the $90k goes out in December, so winning
  // the whole job (not half) makes December's balance higher.
  const levers = findLevers(base, oneOff(9_000_000, "2026-12-05"), [], ctx);
  const win = levers.find((l) => l.id === "win")!;
  assert.strictEqual(win.label, "If you win Coastal House");
  assert.ok(win.lowestCents >= 3_500_000, `lowest ${win.lowestCents}`);
});

check("a later start that would fall off the end of the forecast isn't offered", () => {
  // Nothing helps within the window: the only "fix" would be to push it past Aug 27.
  const levers = findLevers(input({ openingBalanceCents: 1_000_000 }), oneOff(2_000_000, "2026-10-01"), [], ctx);
  assert.ok(levers.every((l) => l.id !== "delay" || !/Sep 27|Aug 27|Jul 27/.test(l.label)));
});

check("dropping another what-if is offered, named", () => {
  const levers = findLevers(input(), oneOff(2_000_000, "2026-11-01"), [{ ...oneOff(3_000_000, "2026-10-15", "o"), name: "Truck" }], ctx);
  assert.ok(levers.some((l) => l.label === "Without Truck" && l.staysAboveBuffer));
});

check("a vehicle bought with cash is offered on finance", () => {
  const truck: WhatIfDefinition = {
    id: "t",
    name: "Tipper",
    template: "vehicle",
    isEnabled: true,
    params: {
      priceCents: 9_900_000,
      purchaseDate: "2026-11-10",
      payWith: "cash",
      depositCents: 0,
      termMonths: 60,
      ratePercent: 7.9,
      balloonCents: 0,
      regoInsuranceYearlyCents: 0,
      runningMonthlyCents: 0,
      savingsMonthlyCents: 0,
    },
    lines: [],
  };
  const levers = findLevers(input(), truck, [], ctx);
  assert.ok(levers.some((l) => l.id === "finance"));
});

console.log(`\ncashflow-levers: ${passed} passed`);

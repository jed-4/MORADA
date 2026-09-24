/**
 * Claims linked to the schedule — the engine's "claims" job mode.
 *
 * The rule a builder cares about: a claim is paid N days after the schedule
 * item it's tied to finishes, and the total never drifts from what's left on
 * the contract. So these tests pin:
 *   1. Timing: linked stage → item finish + pay days; a stage already due
 *      but not claimed → claimed now, not in the past.
 *   2. Totals: extra left to claim (approved variations) rides on the NEXT
 *      claim; less left (part-claimed) scales every stage down; never lose
 *      or invent a cent.
 *   3. Unlinked stages are spread evenly and flagged.
 */
import assert from "node:assert";
import {
  buildForecast,
  resolveClaimStages,
  suggestScheduleItem,
  type ClaimStageInput,
  type ForecastInput,
  type JobInput,
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
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function job(stages: ClaimStageInput[], over: Partial<JobInput> = {}): JobInput {
  return {
    projectId: "p1",
    name: "Whitfield St",
    phase: "construction",
    mode: "claims",
    winPercent: 100,
    clientPayDays: 14,
    remainingToClaimCents: sum(stages.map((s) => s.amountCents)),
    remainingCostCents: 0,
    costBasis: "budget",
    startDate: "2026-03-01",
    endDate: "2027-07-31",
    claimStages: stages,
    ...over,
  };
}

function run(j: JobInput) {
  const input: ForecastInput = {
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
    openingBalanceCents: 0,
    jobs: [j],
    invoices: [],
    bills: [],
    expenses: [],
    openPeriodGstCents: {},
  };
  const r = buildForecast(input);
  return { r, claims: r.events.filter((e) => e.source === "claim") };
}

const stages: ClaimStageInput[] = [
  { id: "s1", name: "Fixing", amountCents: 4_800_000, date: "2026-10-08" },
  { id: "s2", name: "Wet areas", amountCents: 6_200_000, date: "2026-11-26" },
  { id: "s3", name: "Cabinetry", amountCents: 5_500_000, date: "2027-01-29" },
];

check("a linked claim is paid its pay-days after the schedule item finishes", () => {
  const { claims } = run(job(stages));
  assert.deepStrictEqual(
    claims.map((c) => [c.label, c.date, c.amountCents]),
    [
      ["Whitfield St — Fixing", "2026-10-22", 4_800_000],
      ["Whitfield St — Wet areas", "2026-12-10", 6_200_000],
      ["Whitfield St — Cabinetry", "2027-02-12", 5_500_000],
    ],
  );
});

check("a stage whose item already finished but isn't claimed goes out now", () => {
  const { claims } = run(job([{ id: "s0", name: "Enclosed", amountCents: 1_000_000, date: "2026-08-28" }]));
  assert.strictEqual(claims[0].date, "2026-10-07"); // today + 14
});

check("extra left to claim (approved variations) rides on the next claim", () => {
  const { claims } = run(job(stages, { remainingToClaimCents: 16_500_000 + 385_000 }));
  assert.strictEqual(claims[0].amountCents, 4_800_000 + 385_000);
  assert.strictEqual(sum(claims.map((c) => c.amountCents)), 16_885_000);
});

check("less left than the stages hold scales every stage down, to the cent", () => {
  const { claims } = run(job(stages, { remainingToClaimCents: 10_000_001 }));
  assert.strictEqual(sum(claims.map((c) => c.amountCents)), 10_000_001);
  // Proportions kept: Fixing is 48/165 of the whole.
  assert.strictEqual(claims[0].amountCents, Math.round((4_800_000 * 10_000_001) / 16_500_000));
});

check("unlinked stages are spread evenly over the job and flagged", () => {
  const { r, claims } = run(
    job([...stages, { id: "s4", name: "Final", amountCents: 1_000_000, date: null }], { endDate: "2027-01-31" }),
  );
  const unlinked = claims.filter((c) => c.label.endsWith("not linked yet"));
  assert.strictEqual(unlinked.length, 5); // Sep 26 … Jan 27 month-ends
  assert.strictEqual(sum(unlinked.map((c) => c.amountCents)), 1_000_000);
  assert.ok(r.warnings.some((w) => w.code === "job_unlinked_claims"));
});

check("a prospective job's claims are weighted by win chance", () => {
  const { claims } = run(job(stages, { winPercent: 50 }));
  assert.strictEqual(sum(claims.map((c) => c.amountCents)), 8_250_000);
});

check("with no stages at all, what's left is spread evenly", () => {
  const { claims } = run(job([], { remainingToClaimCents: 600_000, endDate: "2027-02-28" }));
  assert.strictEqual(claims.length, 6);
  assert.strictEqual(sum(claims.map((c) => c.amountCents)), 600_000);
});

// --- resolving stages against invoices (shared/cashflow/claims) -------------


const row = (id: string, percent: number | null, amountCents: number | null = null) => ({
  id,
  name: id,
  percent,
  amountCents,
  scheduleItemId: null,
  plannedDate: null,
  itemName: null,
  itemEnd: null,
  itemActualEnd: null,
});

check("stages are used up in order by the claim % invoiced", () => {
  const r = resolveClaimStages([row("a", 20), row("b", 30), row("c", 50)], 100_000_00, 35, 0);
  assert.deepStrictEqual(r.map((s) => [s.state, s.unclaimedCents]), [["claimed", 0], ["part", 15_000_00], ["to_claim", 50_000_00]]);
});

check("with no claim rows, the invoiced total uses them up instead", () => {
  const r = resolveClaimStages([row("a", 50), row("b", 50)], 100_000_00, 0, 60_000_00);
  assert.deepStrictEqual(r.map((s) => s.unclaimedCents), [0, 40_000_00]);
});

check("a stage left under a dollar short by rounding counts as claimed", () => {
  // 20% + 30% + 50% of an odd contract, fully invoiced: the last stage would be 1c short.
  const contract = 49_738_473;
  const r = resolveClaimStages([row("a", 20), row("b", 30), row("c", 50)], contract, 0, contract);
  assert.ok(r.every((s) => s.state === "claimed" && s.unclaimedCents === 0));
});

check("a linked item's actual finish wins over its planned finish", () => {
  const r = resolveClaimStages(
    [{ ...row("a", 100), scheduleItemId: "i1", itemEnd: new Date("2027-03-01T00:00:00+11:00"), itemActualEnd: new Date("2027-02-20T00:00:00+11:00") }],
    100_00,
    0,
    0,
  );
  assert.strictEqual(r[0].date, "2027-02-20");
  assert.strictEqual(r[0].dateSource, "schedule");
});

check("suggestions match stage names to schedule items, milestones first", () => {
  const items = [
    { id: "t", name: "Lock-up windows install", type: "task", category: "construction", endDate: null },
    { id: "m", name: "Lock-Up Stage", type: "milestone", category: "construction", endDate: null },
    { id: "x", name: "Demolition", type: "task", category: "construction", endDate: null },
  ];
  assert.strictEqual(suggestScheduleItem("Lock-up claim", items), "m");
  assert.strictEqual(suggestScheduleItem("Deposit", items), null);
});

console.log(`\ncashflow-claims: ${passed} passed`);

/**
 * Prints one company's cashflow forecast as text, to check the numbers by hand.
 *
 *   npx tsx --env-file-if-exists=.env scripts/cashflow-forecast-check.ts
 *   npx tsx --env-file-if-exists=../MORADA/.env scripts/…   # from a worktree with no .env of its own
 *   ... --company <companyId>     # default: the company with the most jobs
 *   ... --fortnight               # fortnightly instead of monthly
 *   ... --events                  # also list every dated cash event
 *
 * Read-only. Needs migration 0090 on the database it points at.
 */
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { loadCashflow } from "../server/services/cashflowService";
import { buildForecast, toDateKey } from "@shared/cashflow";
import { formatCents } from "@shared/money";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};

async function main() {
  let companyId = arg("--company");
  if (!companyId) {
    const rows = await db.execute(sql`
      select company_id, count(*)::int as jobs from projects
      where company_id is not null and current_system_phase in ('pre_construction', 'construction')
      group by company_id order by jobs desc limit 1`);
    companyId = (rows.rows[0] as any)?.company_id;
    if (!companyId) throw new Error("No company has Pre-construction or Construction jobs");
  }

  const today = toDateKey(new Date())!;
  const load = await loadCashflow(companyId, {
    today,
    granularity: process.argv.includes("--fortnight") ? "fortnight" : "month",
  });
  const r = buildForecast(load.input);
  const $ = (c: number) => formatCents(c);

  console.log(`Company ${companyId} · today ${today}`);
  console.log(`Opening balance: ${$(r.openingBalanceCents)} (${load.opening.source ?? "none"})${load.opening.error ? ` — ${load.opening.error}` : ""}`);
  console.log(`Buffer: ${$(r.bufferCents)} · lowest ${$(r.lowest.cents)} in ${r.periods[r.lowest.periodIndex].label}` +
    (r.firstBelowBufferIndex == null ? " · never below buffer" : ` · first below buffer ${r.periods[r.firstBelowBufferIndex].label}`));

  console.log("\nJobs");
  for (const j of load.jobs) {
    console.log(
      `  ${j.included ? "✓" : " "} ${j.name.padEnd(32).slice(0, 32)} ${j.phase.padEnd(16)} ` +
        `contract ${$(j.contractCents).padStart(12)} · invoiced ${$(j.invoicedCents).padStart(12)} · ` +
        `left ${$(j.remainingToClaimCents).padStart(12)} · cost to come ${$(j.remainingCostCents).padStart(12)} (${j.costBasis}) · ` +
        `${j.startDate ?? "?"} → ${j.endDate ?? "?"} · ${j.winPercent}%`,
    );
  }

  console.log(`\nInputs: ${load.input.invoices.length} unpaid invoices · ${load.input.bills.length} unpaid bills · ` +
    `${load.input.expenses.length} expenses · open-period GST ${JSON.stringify(load.input.openPeriodGstCents)}`);

  const w = 12;
  console.log("\n" + "".padEnd(26) + r.periods.map((p) => p.label.padStart(w)).join(""));
  const row = (label: string, values: number[]) =>
    console.log(label.padEnd(26).slice(0, 26) + values.map((v) => (v ? $(v) : "–").padStart(w)).join(""));
  row("Opening", r.openingCents);
  for (const l of r.lines) row(`${l.section === "in" ? "+" : "−"} ${l.label}`, l.values);
  row("Net", r.netCents);
  row("Closing", r.closingCents);

  if (r.warnings.length) {
    console.log("\nWarnings");
    for (const wn of r.warnings) console.log(`  · ${wn.message}`);
  }

  if (process.argv.includes("--events")) {
    console.log("\nEvents");
    for (const e of r.events) {
      console.log(`  ${e.date} ${$(e.amountCents).padStart(13)} ${e.overdue ? "(overdue) " : ""}${e.label}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

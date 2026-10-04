/**
 * How many stored bill headers change under per-line GST rounding?
 *
 *   npx tsx scripts/audit-bill-gst-rounding.ts [--csv <file>]
 *
 * READ ONLY. It issues SELECTs and writes nothing, so it is safe to point at
 * production — which is the point: before any backfill touches financial
 * records, you should know exactly how many bills move and by how much.
 *
 * Why there is anything to find: bill headers (subtotal/tax/total) are a cache
 * of the line items. They used to be computed by summing the untaxed line
 * amounts and rounding the GST once at the end; Xero rounds GST per line, so
 * the two disagreed by a cent or three on bills with several taxable lines.
 * The helper now rounds per line, which means a header stored under the old
 * scheme can differ from what the same lines compute today.
 *
 * Nothing is broken while they differ — `recomputeBillTotals` rewrites a bill's
 * header whenever its lines are touched, so bills heal as they are edited. This
 * tells you whether that is enough or whether a backfill is worth the risk.
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { bills as billsTable, billLineItems, companySettings } from "../shared/schema";
import { eq } from "drizzle-orm";
import { computeBillTotalsCents } from "../shared/billTotals";
import { writeFileSync } from "node:fs";

const money = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

async function main() {
  const csvArg = process.argv.indexOf("--csv");
  const csvPath = csvArg >= 0 ? process.argv[csvArg + 1] : null;

  const allBills = await db.select().from(billsTable);
  const rateByCompany = new Map<string, number>();
  for (const s of await db.select().from(companySettings)) {
    rateByCompany.set(s.companyId as string, Number((s as any).taxRate ?? 10) || 10);
  }

  const changed: Array<{
    id: string; billNumber: string; status: string; taxMode: string;
    lines: number; storedTotal: number; newTotal: number; delta: number; taxDelta: number;
  }> = [];

  let checked = 0;
  let noLines = 0;

  for (const bill of allBills) {
    const lines = await db.select().from(billLineItems).where(eq(billLineItems.billId, bill.id));
    if (lines.length === 0) { noLines++; continue; }
    checked++;

    const taxRate = rateByCompany.get((bill as any).companyId) ?? 10;
    const taxMode = (bill as any).taxMode === "inclusive" ? "inclusive" : "exclusive";
    const now = computeBillTotalsCents(
      lines.map((l: any) => ({ total: l.total ?? 0, tax: l.tax })),
      taxMode,
      taxRate,
      (bill as any).roundingCents ?? 0,
    );

    const storedTotal = (bill as any).total ?? 0;
    const delta = now.total - storedTotal;
    const taxDelta = now.tax - ((bill as any).tax ?? 0);
    if (delta !== 0 || taxDelta !== 0) {
      changed.push({
        id: bill.id,
        billNumber: (bill as any).billNumber ?? "",
        status: (bill as any).status ?? "",
        taxMode,
        lines: lines.length,
        storedTotal,
        newTotal: now.total,
        delta,
        taxDelta,
      });
    }
  }

  console.log(`\nBills:            ${allBills.length}`);
  console.log(`  with lines:     ${checked}`);
  console.log(`  no lines:       ${noLines} (skipped — nothing to recompute from)`);
  console.log(`  header changes: ${changed.length}` +
    (checked ? `  (${((changed.length / checked) * 100).toFixed(1)}%)` : ""));

  if (changed.length > 0) {
    const deltas = changed.map(c => Math.abs(c.delta));
    const worst = Math.max(...deltas);
    const net = changed.reduce((s, c) => s + c.delta, 0);
    console.log(`  largest change: ${money(worst)}`);
    console.log(`  net movement:   ${money(net)} across all bills`);

    const byStatus = new Map<string, number>();
    for (const c of changed) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
    console.log("\n  by status:");
    for (const [status, n] of Array.from(byStatus.entries()).sort((a, b) => b[1] - a[1])) {
      // Paid bills matter most: their header is what a payment was reconciled against.
      console.log(`    ${String(status).padEnd(20)} ${n}${status === "paid" ? "   <- already paid" : ""}`);
    }

    console.log("\n  first 20:");
    for (const c of changed.slice(0, 20)) {
      console.log(`    ${c.billNumber.padEnd(18)} ${c.taxMode.padEnd(10)} ${String(c.lines).padStart(3)} lines  ` +
        `${money(c.storedTotal).padStart(12)} → ${money(c.newTotal).padStart(12)}  (${c.delta > 0 ? "+" : ""}${c.delta}c)`);
    }

    if (csvPath) {
      const header = "billId,billNumber,status,taxMode,lines,storedTotalCents,newTotalCents,deltaCents,taxDeltaCents\n";
      const rows = changed.map(c =>
        [c.id, c.billNumber, c.status, c.taxMode, c.lines, c.storedTotal, c.newTotal, c.delta, c.taxDelta].join(","),
      ).join("\n");
      writeFileSync(csvPath, header + rows + "\n");
      console.log(`\n  written to ${csvPath}`);
    }
  }

  console.log("\nRead-only: nothing was written.\n");
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());

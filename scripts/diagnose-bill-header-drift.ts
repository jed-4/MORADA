/**
 * Why does a bill's stored header differ from its lines?
 *
 *   npx tsx scripts/diagnose-bill-header-drift.ts [--csv <file>] [--lines]
 *
 * READ ONLY — SELECTs only, writes nothing, safe against production.
 *
 * The earlier audit (audit-bill-gst-rounding.ts) compared each bill's STORED
 * header against a FRESHLY COMPUTED one and reported the difference as though
 * it were caused by per-line GST rounding. That conflates two unrelated things,
 * and the dollar-sized movers it surfaced are the second one:
 *
 *   A. GST SCHEME  (PR #249)  — tax rounded per line instead of once on the
 *      sum. Bounded by half a cent per taxable line: a 10-line bill can move
 *      at most 5c. It cannot produce dollars.
 *
 *   B. HEADER DRIFT (pre-existing) — the stored header does not describe the
 *      stored lines at all. The usual cause is a Xero sync: syncBillFromXeroInternal
 *      writes Xero's SubTotal/TotalTax/Total onto every linked bill, but only
 *      re-imports LINE ITEMS when the bill is still draft. So on a submitted or
 *      paid bill the header becomes Xero's while the lines stay Morada's, and
 *      the two can differ by any amount. That is deliberate — Xero is the
 *      authority on what the bill is worth — but it means "recompute from
 *      lines" would overwrite the authoritative figure.
 *
 * This script reports A and B separately for every bill, so the two can never
 * be read as one number again.
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { bills as billsTable, billLineItems, companySettings } from "../shared/schema";
import { eq } from "drizzle-orm";
import { computeBillTotalsCents, type BillTaxMode } from "../shared/billTotals";
import { writeFileSync } from "node:fs";

const money = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;

/**
 * The header math as it was BEFORE #249: sum the untaxed amounts as floats and
 * round the GST once at the end. Kept verbatim here so the comparison does not
 * depend on checking out an old commit.
 */
function computeBillTotalsCentsOLD(
  lineItems: Array<{ total: number; tax: string | null }>,
  taxMode: BillTaxMode,
  taxRatePercent: number,
  roundingCents: number = 0,
) {
  const rate = (Number(taxRatePercent) || 0) / 100;
  let subtotal = 0;
  let tax = 0;
  for (const li of lineItems) {
    const lineTotal = li.total || 0;
    const taxable = li.tax === "GST on expenses";
    if (taxMode === "inclusive") {
      if (taxable) {
        const ex = lineTotal / (1 + rate);
        subtotal += ex;
        tax += lineTotal - ex;
      } else {
        subtotal += lineTotal;
      }
    } else {
      subtotal += lineTotal;
      if (taxable) tax += lineTotal * rate;
    }
  }
  const subtotalCents = Math.round(subtotal);
  const taxCents = Math.round(tax);
  const rounding = Math.round(Number(roundingCents) || 0);
  return { subtotal: subtotalCents, tax: taxCents, total: subtotalCents + taxCents + rounding };
}

async function main() {
  const csvArg = process.argv.indexOf("--csv");
  const csvPath = csvArg >= 0 ? process.argv[csvArg + 1] : null;
  const showLines = process.argv.includes("--lines");

  const allBills = await db.select().from(billsTable);
  const rateByCompany = new Map<string, number>();
  for (const s of await db.select().from(companySettings)) {
    rateByCompany.set(s.companyId as string, Number((s as any).taxRate ?? 10) || 10);
  }

  type Row = {
    id: string; billNumber: string; status: string; taxMode: string; lines: number;
    storedSubtotal: number; storedTax: number; storedTotal: number;
    oldTotal: number; newTotal: number; oldTax: number; newTax: number;
    gstDelta: number;        // A — caused by #249
    driftDelta: number;      // B — stored header vs its own lines, pre-existing
    roundingCents: number; linkedToXero: boolean; xeroReviewReason: string | null;
  };

  const rows: Row[] = [];
  let checked = 0, noLines = 0;

  for (const bill of allBills) {
    const lines = await db.select().from(billLineItems).where(eq(billLineItems.billId, bill.id));
    if (lines.length === 0) { noLines++; continue; }
    checked++;

    const taxRate = rateByCompany.get((bill as any).companyId) ?? 10;
    const taxMode: BillTaxMode = (bill as any).taxMode === "inclusive" ? "inclusive" : "exclusive";
    const shaped = lines.map((l: any) => ({ total: l.total ?? 0, tax: l.tax }));
    const rounding = (bill as any).roundingCents ?? 0;

    const oldT = computeBillTotalsCentsOLD(shaped, taxMode, taxRate, rounding);
    const newT = computeBillTotalsCents(shaped, taxMode, taxRate, rounding);
    const storedTotal = (bill as any).total ?? 0;

    const gstDelta = newT.total - oldT.total;      // what #249 changes
    const driftDelta = oldT.total - storedTotal;   // what was already wrong

    if (gstDelta !== 0 || driftDelta !== 0 || newT.tax !== ((bill as any).tax ?? 0)) {
      rows.push({
        id: bill.id, billNumber: (bill as any).billNumber ?? "", status: (bill as any).status ?? "",
        taxMode, lines: lines.length,
        storedSubtotal: (bill as any).subtotal ?? 0, storedTax: (bill as any).tax ?? 0, storedTotal,
        oldTotal: oldT.total, newTotal: newT.total, oldTax: oldT.tax, newTax: newT.tax,
        gstDelta, driftDelta,
        roundingCents: rounding,
        linkedToXero: !!(bill as any).xeroInvoiceId,
        xeroReviewReason: (bill as any).xeroReviewReason ?? null,
      });
    }
  }

  const gstMovers = rows.filter(r => r.gstDelta !== 0);
  const driftMovers = rows.filter(r => r.driftDelta !== 0);
  const worstGst = gstMovers.reduce((m, r) => Math.max(m, Math.abs(r.gstDelta)), 0);
  const worstDrift = driftMovers.reduce((m, r) => Math.max(m, Math.abs(r.driftDelta)), 0);

  console.log(`\nBills: ${allBills.length}   with lines: ${checked}   no lines: ${noLines}\n`);
  console.log(`A. GST SCHEME  (caused by #249)`);
  console.log(`   bills whose TOTAL moves: ${gstMovers.length}`);
  console.log(`   largest movement:        ${money(worstGst)}`);
  console.log(`   over 5c:                 ${gstMovers.filter(r => Math.abs(r.gstDelta) > 5).length}  <- must be 0`);
  console.log(`\nB. HEADER DRIFT (pre-existing, NOT caused by #249)`);
  console.log(`   bills whose stored header disagrees with their own lines: ${driftMovers.length}`);
  console.log(`   largest disagreement:    ${money(worstDrift)}`);
  console.log(`   of those, linked to Xero: ${driftMovers.filter(r => r.linkedToXero).length}`);
  console.log(`   of those, already paid:   ${driftMovers.filter(r => r.status === "paid").length}`);

  const dollarMovers = driftMovers
    .filter(r => Math.abs(r.driftDelta) > 5)
    .sort((a, b) => Math.abs(b.driftDelta) - Math.abs(a.driftDelta));

  if (dollarMovers.length > 0) {
    console.log(`\n   The dollar-level ones (${dollarMovers.length}) — stored header vs its own lines:\n`);
    for (const r of dollarMovers.slice(0, 25)) {
      console.log(`   ${r.billNumber.padEnd(18)} ${r.status.padEnd(16)} ${r.taxMode.padEnd(10)} ${String(r.lines).padStart(3)} lines`);
      console.log(`     stored  sub ${money(r.storedSubtotal).padStart(12)}  tax ${money(r.storedTax).padStart(10)}  total ${money(r.storedTotal).padStart(12)}`);
      console.log(`     lines   ->                                       total ${money(r.oldTotal).padStart(12)}   (drift ${r.driftDelta > 0 ? "+" : ""}${money(r.driftDelta)})`);
      console.log(`     #249 would move it a further ${r.gstDelta}c` +
        `   | xero-linked: ${r.linkedToXero ? "yes" : "no"}` +
        `${r.xeroReviewReason ? `  flagged: ${r.xeroReviewReason}` : ""}` +
        `${r.roundingCents ? `  rounding: ${r.roundingCents}c` : ""}`);
      if (showLines) {
        const ls = await db.select().from(billLineItems).where(eq(billLineItems.billId, r.id));
        for (const l of ls as any[]) {
          console.log(`       ${String(l.description ?? "").slice(0, 46).padEnd(48)} ${money(l.total ?? 0).padStart(12)}  ${l.tax ?? "—"}`);
        }
      }
      console.log("");
    }
  }

  if (csvPath) {
    const header = "billId,billNumber,status,taxMode,lines,storedSubtotal,storedTax,storedTotal," +
      "oldComputedTotal,newComputedTotal,gstDeltaCents,driftDeltaCents,roundingCents,linkedToXero,xeroReviewReason\n";
    writeFileSync(csvPath, header + rows.map(r => [
      r.id, r.billNumber, r.status, r.taxMode, r.lines, r.storedSubtotal, r.storedTax, r.storedTotal,
      r.oldTotal, r.newTotal, r.gstDelta, r.driftDelta, r.roundingCents, r.linkedToXero, r.xeroReviewReason ?? "",
    ].join(",")).join("\n") + "\n");
    console.log(`   written to ${csvPath}`);
  }

  console.log("\nRead-only: nothing was written.\n");
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());

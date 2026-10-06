/**
 * Which bills exist more than once in Xero?
 *
 *   npx tsx scripts/find-duplicate-xero-bills.ts [--csv <file>]
 *
 * READ ONLY. It reads from Xero and from the database and writes to neither —
 * nothing is voided, deleted or relinked. Safe against production.
 *
 * BILL-1743 was pushed twice and became two authorised ACCPAY bills in the
 * customer's Xero, one second apart, under the same Reference. Nothing noticed:
 * Morada links to one InvoiceID and has no idea the other exists, so the
 * supplier's invoice is in the accounts twice and will be paid twice unless a
 * human spots it.
 *
 * Groups every non-voided ACCPAY bill in Xero by supplier invoice number and by
 * BILL- reference, and reports any group with more than one invoice — flagging
 * which copy (if any) Morada is actually linked to.
 */

import "dotenv/config";
import { db } from "../server/db";
import { bills as billsTable, companies } from "../shared/schema";
import { eq } from "drizzle-orm";
import { xeroService } from "../server/services/xeroService";
import { storage } from "../server/storage";
import { writeFileSync } from "node:fs";

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

type Dup = {
  key: string;
  kind: "invoice number" | "reference";
  invoices: Array<{ id: string; number: string; reference: string; total: number; status: string; updated: string; linked: boolean }>;
};

async function main() {
  const csvArg = process.argv.indexOf("--csv");
  const csvPath = csvArg >= 0 ? process.argv[csvArg + 1] : null;

  const allCompanies = await db.select().from(companies);
  const dups: Dup[] = [];

  for (const company of allCompanies) {
    const connection = await storage.getXeroConnectionByCompanyId(company.id);
    if (!connection || !connection.isActive) continue;

    console.log(`\n${company.name || company.id}`);
    const xeroBills = await xeroService.listAllBills(connection.id).catch((e: any) => {
      console.log(`  could not read Xero: ${e?.message || e}`);
      return [] as any[];
    });
    if (xeroBills.length === 0) continue;

    const linked = new Set(
      (await db.select({ xeroInvoiceId: billsTable.xeroInvoiceId })
        .from(billsTable).where(eq(billsTable.companyId, company.id)))
        .map(b => b.xeroInvoiceId).filter(Boolean) as string[],
    );

    const live = xeroBills.filter((inv: any) => {
      const st = String(inv.Status || "").toUpperCase();
      return st !== "VOIDED" && st !== "DELETED";
    });
    console.log(`  ${live.length} live ACCPAY bills in Xero`);

    const group = (keyOf: (inv: any) => string | null, kind: Dup["kind"]) => {
      const map = new Map<string, any[]>();
      for (const inv of live) {
        const k = (keyOf(inv) || "").trim();
        if (!k) continue;
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(inv);
      }
      for (const [k, invs] of map) {
        if (invs.length < 2) continue;
        dups.push({
          key: k,
          kind,
          invoices: invs.map((inv: any) => ({
            id: inv.InvoiceID,
            number: inv.InvoiceNumber || "",
            reference: inv.Reference || "",
            total: Number(inv.Total || 0),
            status: inv.Status || "",
            updated: inv.UpdatedDateUTC || "",
            linked: linked.has(inv.InvoiceID),
          })),
        });
      }
    };

    group((inv) => inv.InvoiceNumber, "invoice number");
    // Morada writes its own bill number into Xero's Reference, so two invoices
    // sharing one is a bill that was pushed twice — the BILL-1743 shape.
    group((inv) => (/^BILL-/i.test(inv.Reference || "") ? inv.Reference : null), "reference");
  }

  // The same pair can surface under both keys; report it once.
  const seen = new Set<string>();
  const unique = dups.filter(d => {
    const sig = d.invoices.map(i => i.id).sort().join("|");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });

  console.log(`\n${"=".repeat(60)}`);
  if (unique.length === 0) {
    console.log("No duplicate Xero bills found.\n");
  } else {
    console.log(`${unique.length} duplicate group(s):\n`);
    for (const d of unique) {
      console.log(`  ${d.kind} "${d.key}" — ${d.invoices.length} copies`);
      for (const inv of d.invoices) {
        console.log(`    ${inv.id}  ${money(inv.total).padStart(12)}  ${inv.status.padEnd(10)} ` +
          `updated ${inv.updated}  ${inv.linked ? "<- Morada links to this one" : "orphan (Morada does not know about it)"}`);
      }
      console.log("");
    }
    console.log("Nothing was changed. Remove the extra copies in Xero yourself.\n");
  }

  if (csvPath) {
    const header = "key,kind,xeroInvoiceId,invoiceNumber,reference,total,status,updatedUTC,linkedInMorada\n";
    const rows = unique.flatMap(d => d.invoices.map(i =>
      [d.key, d.kind, i.id, i.number, i.reference, i.total, i.status, i.updated, i.linked].join(",")));
    writeFileSync(csvPath, header + rows.join("\n") + "\n");
    console.log(`Written to ${csvPath}\n`);
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  // exit rather than pool.end(): importing storage kicks off its own
  // initialisation, which would then query a closed pool and print a confusing
  // stack after the report.
  .finally(() => process.exit(process.exitCode ?? 0));

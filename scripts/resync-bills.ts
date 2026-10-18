/**
 * Queue named bills for another push to Xero.
 *
 *   npx tsx scripts/resync-bills.ts --bills BILL-1782,BILL-1783
 *   npx tsx scripts/resync-bills.ts --range BILL-1782..BILL-1803
 *   npx tsx scripts/resync-bills.ts --range BILL-1782..BILL-1803 --apply
 *
 * DRY RUN BY DEFAULT. Without --apply it reads, reports and writes nothing.
 *
 * Even with --apply it does not push anything itself: it puts a job on the
 * Xero push queue and the running server's worker picks it up within ~45s,
 * through exactly the same code path a save uses. Nothing here talks to Xero
 * except to ask whether a linked invoice has been voided.
 *
 * Refusals come before writes, and a refusal is never overridable by a flag.
 * The one that matters: a bill whose supplier invoice number is already on
 * another Morada bill is never queued. BILL-1782 and BILL-1746 both carry
 * 7377/90275519, and pushing the second would put the same supplier invoice
 * into Xero twice.
 */

import "dotenv/config";
import { db } from "../server/db";
import { bills as billsTable, contacts } from "../shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { enqueueXeroPush } from "../server/services/xeroPushQueue";
import { isDeadInXero } from "../server/services/xeroBillStatus";
import { storage } from "../server/storage";
import { xeroService } from "../server/services/xeroService";

type Verdict = { bill: any; ok: boolean; reason?: string; note?: string };

/** Statuses that never reach the push path — queueing them does nothing. */
const UNPUSHABLE = new Set(["draft", "needs_review"]);

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const names: string[] = [];
  const list = get("--bills");
  if (list) names.push(...list.split(",").map(s => s.trim()).filter(Boolean));

  const range = get("--range");
  if (range) {
    const m = /^([A-Za-z-]*?)(\d+)\.\.(?:[A-Za-z-]*?)(\d+)$/.exec(range.trim());
    if (!m) throw new Error(`--range must look like BILL-1782..BILL-1803, got "${range}"`);
    const [, prefix, fromStr, toStr] = m;
    const from = Number(fromStr), to = Number(toStr);
    if (to < from) throw new Error("--range end is before its start");
    if (to - from > 500) throw new Error("--range is too wide (max 500)");
    for (let n = from; n <= to; n++) names.push(`${prefix}${n}`);
  }

  return { names: Array.from(new Set(names)), apply: argv.includes("--apply") };
}

async function main() {
  const { names, apply } = parseArgs();
  if (names.length === 0) {
    console.log("Nothing to do. Pass --bills BILL-1,BILL-2 or --range BILL-1782..BILL-1803.\n");
    return;
  }

  console.log(`\n${apply ? "APPLY" : "DRY RUN"} — ${names.length} bill(s) requested\n`);

  const rows = await db
    .select({
      id: billsTable.id,
      billNumber: billsTable.billNumber,
      billReference: billsTable.billReference,
      status: billsTable.status,
      companyId: billsTable.companyId,
      supplierId: billsTable.supplierId,
      sendToXero: billsTable.sendToXero,
      xeroInvoiceId: billsTable.xeroInvoiceId,
      supplierName: contacts.name,
    })
    .from(billsTable)
    .leftJoin(contacts, eq(billsTable.supplierId, contacts.id))
    .where(inArray(billsTable.billNumber, names));

  const found = new Map(rows.map(r => [r.billNumber, r]));
  const verdicts: Verdict[] = [];

  for (const name of names) {
    const bill = found.get(name);
    if (!bill) { verdicts.push({ bill: { billNumber: name }, ok: false, reason: "not found" }); continue; }

    if (!bill.companyId) { verdicts.push({ bill, ok: false, reason: "no company on the bill" }); continue; }
    if (UNPUSHABLE.has(String(bill.status))) {
      verdicts.push({ bill, ok: false, reason: `status "${bill.status}" never pushes` });
      continue;
    }
    if (String(bill.status) === "paid") { verdicts.push({ bill, ok: false, reason: "paid — never overwrite" }); continue; }
    if (!bill.sendToXero && !bill.xeroInvoiceId) {
      verdicts.push({ bill, ok: false, reason: "Sync with Xero is off" });
      continue;
    }

    // THE guard: the same supplier invoice number on another Morada bill.
    if (bill.billReference) {
      const clash = await db
        .select({ billNumber: billsTable.billNumber, status: billsTable.status })
        .from(billsTable)
        .where(and(
          sql`lower(trim(${billsTable.billReference})) = lower(${bill.billReference.trim()})`,
          eq(billsTable.companyId, bill.companyId),
          sql`${billsTable.id} <> ${bill.id}`,
        ))
        .limit(3);
      if (clash.length > 0) {
        verdicts.push({
          bill, ok: false,
          reason: `invoice ${bill.billReference} is also on ${clash.map(c => `${c.billNumber} (${c.status})`).join(", ")}`,
        });
        continue;
      }
    }

    // A link to a voided Xero invoice has to be cleared by a human first.
    if (bill.xeroInvoiceId) {
      try {
        const connection = await storage.getXeroConnectionByCompanyId(bill.companyId);
        if (connection?.isActive) {
          const inv = await xeroService.getInvoice(connection.id, bill.xeroInvoiceId).catch(() => null);
          if (inv && isDeadInXero(inv.Status)) {
            verdicts.push({ bill, ok: false, reason: `linked Xero bill is ${inv.Status} — unlink it first` });
            continue;
          }
        }
      } catch (e: any) {
        verdicts.push({ bill, ok: false, reason: `could not check Xero: ${e?.message || e}` });
        continue;
      }
    }

    verdicts.push({ bill, ok: true, note: bill.xeroInvoiceId ? "will update the linked Xero bill" : "will create a new Xero bill" });
  }

  const go = verdicts.filter(v => v.ok);
  const no = verdicts.filter(v => !v.ok);

  if (no.length) {
    console.log(`Refused (${no.length}):`);
    for (const v of no) console.log(`  ${String(v.bill.billNumber).padEnd(14)} ${v.reason}`);
    console.log("");
  }
  if (go.length) {
    console.log(`Would queue (${go.length}):`);
    for (const v of go) {
      console.log(`  ${String(v.bill.billNumber).padEnd(14)} ${String(v.bill.supplierName ?? "—").padEnd(28)} ${v.note}`);
    }
    console.log("");
  }

  if (!apply) {
    console.log("Dry run — nothing was written. Re-run with --apply to queue these.\n");
    return;
  }
  if (go.length === 0) {
    console.log("Nothing eligible to queue.\n");
    return;
  }

  for (const v of go) {
    await enqueueXeroPush(v.bill.companyId, v.bill.id);
    console.log(`  queued ${v.bill.billNumber}`);
  }
  console.log(`\n${go.length} queued. The push worker drains every ~45s — watch the server log for ` +
    `"xero.bill.push.ok" / "xero.bill.push.failed".\n`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));

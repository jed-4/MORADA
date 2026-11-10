/**
 * Which issued client invoices were re-saved by the "Edit saves instantly" bug?
 *
 *   export PROD_URL='<Production Database connection string>'
 *   npx tsx scripts/audit-invoice-edit-resaves.ts            # since 3 Nov 2026
 *   SINCE=2026-11-01 npx tsx scripts/audit-invoice-edit-resaves.ts
 *
 * READ ONLY: every statement is a SELECT and nothing is written.
 *
 * It reads PROD_URL and deliberately ignores DATABASE_URL, because the Replit
 * Shell's DATABASE_URL is the DEV database. Check the row counts it prints
 * first. If they look like dev, or empty, stop.
 *
 * Why: from #349 until #378, clicking Edit on an issued invoice also clicked
 * Save (Edit and Save shared one slot; the browser finished the click as a
 * submit). An invoice save rebuilds its lines and totals from the project's
 * LIVE contract, variations and bills, so an issued invoice could be silently
 * rewritten to a different total — and, with "sync to Xero" on, the Xero copy
 * updated to match. On dev this turned INV-1003 from $174,084.66 into
 * $41,499.70 with $87,042.33 already paid against it.
 *
 * Every invoice save logs an `activities` row (type "invoice", action
 * "updated"). This lists issued invoices with such a row since SINCE. It
 * can't tell you the old total — the email log keeps a copy of every invoice
 * email (with its figures), and Xero keeps the invoice's history.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.PROD_URL;
if (!url) {
  console.error("Set PROD_URL first. DATABASE_URL is ignored on purpose (it is dev in the Replit Shell).");
  process.exit(1);
}
const since = process.env.SINCE || "2026-11-03";
const sql = neon(url);
const money = (c: number | null) => (c == null ? "—" : `${c < 0 ? "-" : ""}$${(Math.abs(Number(c)) / 100).toFixed(2)}`);

async function main() {
  const [counts] = await sql`select
    (select count(*)::int from activities) activities,
    (select count(*)::int from client_invoices) client_invoices,
    (select count(*)::int from companies) companies`;
  console.log("\n== Is this production? ==");
  console.log(counts);

  const rows = await sql`
    select ci.invoice_number, ci.status, p.name project, ci.total_amount, ci.paid_amount,
           ci.xero_invoice_id is not null in_xero, ci.send_to_xero,
           count(a.id)::int saves, min(a.created_at)::text first_save, max(a.created_at)::text last_save,
           string_agg(distinct a.user_name, ', ') by_users
    from client_invoices ci
    join activities a on a.entity_id = ci.id and a.activity_type = 'invoice' and a.action = 'updated'
    left join projects p on p.id = ci.project_id
    where ci.status <> 'draft' and a.created_at >= ${since}::date
    group by ci.id, p.name
    order by max(a.created_at) desc`;

  console.log(`\n== Issued invoices saved since ${since} (${rows.length}) ==`);
  console.table(rows.map((r: any) => ({
    invoice: r.invoice_number,
    status: r.status,
    project: r.project,
    total_now: money(r.total_amount),
    paid: money(r.paid_amount),
    "paid > total": Number(r.paid_amount) > Number(r.total_amount) ? "YES" : "",
    xero: r.in_xero ? (r.send_to_xero ? "linked, sync on" : "linked") : "",
    saves: r.saves,
    last_save: r.last_save,
    by: r.by_users,
  })));
  console.log(
    "\nEach row was saved after it was issued. A deliberate edit is fine; the risky ones are saves nobody meant to make.\n" +
    "Check each against the invoice email in the Email log (or Xero's invoice history). 'paid > total' is a near-certain clobber.\n",
  );
}

main().catch((e) => { console.error(e); process.exit(1); });

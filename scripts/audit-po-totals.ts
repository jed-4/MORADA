/**
 * How many purchase orders have the wrong saved total, and who would lose
 * access under the PO permission gate?
 *
 *   export PROD_URL='<Production Database connection string>'
 *   npx tsx scripts/audit-po-totals.ts
 *
 * READ ONLY: every statement is a SELECT and nothing is written.
 *
 * It reads PROD_URL and deliberately ignores DATABASE_URL, because the Replit
 * Shell's DATABASE_URL is the DEV database. Check the row counts it prints
 * first: real production has tens of thousands of activities and real company
 * names. If they look like dev, or empty, stop.
 *
 * Why: nothing rolls PO lines up into purchase_orders.subtotal/gst_amount/total,
 * so a saved header can be $0 above priced lines, or stale after any line edit.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.PROD_URL;
if (!url) {
  console.error("Set PROD_URL first. DATABASE_URL is ignored on purpose (it is dev in the Replit Shell).");
  process.exit(1);
}
const sql = neon(url);
const money = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(Number(c)) / 100).toFixed(2)}`;

async function main() {
  const [counts] = await sql`select
    (select count(*)::int from activities) activities,
    (select count(*)::int from bills) bills,
    (select count(*)::int from companies) companies,
    (select count(*)::int from projects) projects,
    (select count(*)::int from purchase_orders) purchase_orders`;
  console.log("\n== Is this production? ==");
  console.log(counts);
  console.log((await sql`select name from companies order by name`).map((c: any) => c.name).join(", "));

  console.log("\n== POs by status and type ==");
  console.table(await sql`select status, po_type, gst_mode, count(*)::int n, sum(total)::bigint saved_total_cents
    from purchase_orders group by 1,2,3 order by 1,2,3`);

  // ex = lines before GST, inc = with 10% on non GST-free lines. A header is
  // only called wrong if it matches neither, so this stays an honest floor
  // while the GST convention is undecided.
  const rows: any[] = await sql`
    with lines as (
      select purchase_order_id id, count(*)::int n,
        round(sum(quantity * unit_price))::bigint ex,
        round(sum(quantity * unit_price * case when is_gst_free then 1 else 1.1 end))::bigint inc
      from purchase_order_items group by 1
    )
    select p.id, p.po_number, c.name company, p.status, p.po_type, p.gst_mode, p.total saved,
      l.n line_count, coalesce(l.ex,0)::bigint ex, coalesce(l.inc,0)::bigint inc
    from purchase_orders p
    join companies c on c.id = p.company_id
    left join lines l on l.id = p.id`;

  const near = (a: number, b: number) => Math.abs(Number(a) - Number(b)) <= 5;
  const zero = rows.filter((r) => r.line_count && Number(r.saved) === 0 && Number(r.ex) > 0);
  const stale = rows.filter((r) => r.line_count && Number(r.saved) !== 0 && !near(r.saved, r.ex) && !near(r.saved, r.inc));
  const noLines = rows.filter((r) => !r.line_count && Number(r.saved) !== 0);
  const blank = rows.filter((r) => !r.line_count && Number(r.saved) === 0);

  console.log("\n== Saved total versus lines ==");
  console.log(`Total POs:                         ${rows.length}`);
  console.log(`Saved total matches lines:         ${rows.length - zero.length - stale.length - noLines.length - blank.length}`);
  console.log(`$0 saved, but priced lines:        ${zero.length}  (lines worth ${money(zero.reduce((s, r) => s + Number(r.inc), 0))} inc GST)`);
  console.log(`Saved total differs from lines:    ${stale.length}`);
  console.log(`Saved total but no lines:          ${noLines.length}  (site/RFQ POs, ${money(noLines.reduce((s, r) => s + Number(r.saved), 0))})`);
  console.log(`Empty ($0, no lines):              ${blank.length}`);
  const show = [...zero, ...stale];
  if (show.length) {
    console.log("\nWorst 30 by difference:");
    console.table(show
      .sort((a, b) => Math.abs(b.inc - b.saved) - Math.abs(a.inc - a.saved))
      .slice(0, 30)
      .map((r) => ({ po: r.po_number, company: r.company, status: r.status, gst: r.gst_mode, saved: money(r.saved), lines_ex: money(r.ex), lines_inc: money(r.inc) })));
  }

  console.log("\n== Other damage ==");
  const [o] = await sql`select
    (select count(*)::int from purchase_orders where required_by_date < '1971-01-01') date_1970,
    (select count(*)::int from purchase_order_items i join purchase_orders p on p.id = i.purchase_order_id
       where p.source_estimate_id is not null and i.unit_price = 0) estimate_lines_at_zero,
    (select count(*)::int from purchase_order_items where source_timesheet_id is not null and unit_price = 0) timesheet_lines_at_zero,
    (select count(*)::int from bills b where b.matched_site_po_id is not null
       and not exists (select 1 from purchase_orders p where p.id = b.matched_site_po_id)) bills_pointing_at_deleted_po,
    (select count(*)::int from bills b join purchase_orders p on p.id = b.matched_site_po_id
       where p.company_id <> b.company_id) bills_linked_across_companies`;
  console.log(o);
  console.log("\nTimesheets on more than one PO (paid-twice risk):");
  console.table(await sql`select source_timesheet_id, count(distinct purchase_order_id)::int pos
    from purchase_order_items where source_timesheet_id is not null
    group by 1 having count(distinct purchase_order_id) > 1 limit 20`);
  console.log("POs with duplicate numbers:");
  console.table(await sql`select company_id, po_number, count(*)::int n from purchase_orders
    group by 1,2 having count(*) > 1 limit 20`);

  console.log("\n== Roles under the new PO permission gate ==");
  console.log("Admin-level roles pass regardless. 'NONE' means the role loses main POs (own site POs still work).");
  console.table(await sql`
    select c.name company, r.name role, count(distinct u.id)::int users,
      coalesce(max(rp.allowed_actions::text), 'NONE') purchase_orders,
      (select count(*)::int from purchase_orders po where po.created_by_id = any(array_agg(u.id))) pos_created
    from user_roles r
    join companies c on c.id = r.company_id
    join users u on u.role_id = r.id
    left join permissions p on p.key = 'financial.purchase_orders'
    left join role_permissions rp on rp.role_id = r.id and rp.permission_id = p.id
    group by c.name, r.name order by 1, 2`);
  console.log("\nUsers with no role at all:");
  console.table(await sql`select c.name company, u.user_category, count(*)::int users from users u
    join companies c on c.id = u.company_id where u.role_id is null group by 1,2`);
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Fill in draft POs saved at $0 above priced lines, using shared/poTotals.ts.
 *
 *   export PROD_URL='<Production Database connection string>'
 *   npx tsx scripts/fix-po-zero-headers.ts           # reports only, writes nothing
 *   npx tsx scripts/fix-po-zero-headers.ts --apply   # writes those headers
 *
 * Safe to re-run: it only touches drafts whose saved total is 0. Finalised POs
 * and any header with a value are never written.
 *
 * Run by hand, after a backup. It reads PROD_URL and deliberately ignores
 * DATABASE_URL, because the Replit Shell's DATABASE_URL is the DEV database.
 */
import { neon } from "@neondatabase/serverless";
import { computePOTotalsCents, hasPricedLine } from "../shared/poTotals";

const url = process.env.PROD_URL;
if (!url) {
  console.error("Set PROD_URL first. DATABASE_URL is ignored on purpose (it is dev in the Replit Shell).");
  process.exit(1);
}
const sql = neon(url);
const apply = process.argv.includes("--apply");
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

async function zeroDrafts() {
  const pos: any[] = await sql`select id, po_number, gst_mode from purchase_orders
    where status = 'draft' and total = 0 order by po_number`;
  if (!pos.length) return [];
  const rows: any[] = await sql`select purchase_order_id, quantity, unit_price, total, is_gst_free
    from purchase_order_items where purchase_order_id = any(${pos.map((p) => p.id)})`;
  return pos.flatMap((po) => {
    const lines = rows.filter((r) => r.purchase_order_id === po.id).map((r) => ({
      quantity: r.quantity, unitPrice: r.unit_price, total: r.total, isGstFree: r.is_gst_free,
    }));
    if (!hasPricedLine(lines)) return [];
    return [{
      ...po,
      gstFreeLines: `${lines.filter((l) => l.isGstFree).length} of ${lines.length}`,
      ...computePOTotalsCents(lines, po.gst_mode),
    }];
  });
}

async function main() {
  const found = await zeroDrafts();
  console.log(`Before: ${found.length} draft POs at $0 with priced lines`);
  console.table(found.map((p) => ({
    po: p.po_number, gst: p.gst_mode, gst_free_lines: p.gstFreeLines,
    subtotal: money(p.subtotal), gst_amount: money(p.gstAmount), total: money(p.total),
  })));
  if (!apply) {
    console.log("Nothing written. Add --apply to save these totals.");
    return;
  }
  for (const p of found) {
    await sql`update purchase_orders
      set subtotal = ${p.subtotal}, gst_amount = ${p.gstAmount}, total = ${p.total}, updated_at = now()
      where id = ${p.id} and status = 'draft' and total = 0`;
  }
  console.log(`After: ${(await zeroDrafts()).length} draft POs at $0 with priced lines`);
}

main().catch((e) => { console.error(e); process.exit(1); });

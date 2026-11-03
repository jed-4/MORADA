/**
 * Clear "required by" dates that were saved as 1 Jan 1970 when left blank.
 *
 *   export PROD_URL='<Production Database connection string>'
 *   npx tsx scripts/fix-po-1970-dates.ts           # reports only, writes nothing
 *   npx tsx scripts/fix-po-1970-dates.ts --apply   # sets them to NULL
 *
 * Safe to re-run: it only touches required_by_date < '1971-01-01'.
 *
 * Run by hand, after a backup, and only once the code fix is live, or the next
 * save of a blank date refills them. It reads PROD_URL and deliberately ignores
 * DATABASE_URL, because the Replit Shell's DATABASE_URL is the DEV database.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.PROD_URL;
if (!url) {
  console.error("Set PROD_URL first. DATABASE_URL is ignored on purpose (it is dev in the Replit Shell).");
  process.exit(1);
}
const sql = neon(url);
const apply = process.argv.includes("--apply");

const report = async (label: string) => {
  const [r] = await sql`select count(*)::int n, min(created_at) oldest, max(created_at) newest
    from purchase_orders where required_by_date < '1971-01-01'`;
  console.log(`${label}: ${r.n} POs${r.n ? ` (created ${r.oldest} to ${r.newest})` : ""}`);
};

async function main() {
  console.log("Purchase orders in this database:", (await sql`select count(*)::int n from purchase_orders`)[0].n);
  await report("Before");
  if (!apply) {
    console.log("Nothing written. Add --apply to clear them.");
    return;
  }
  await sql`update purchase_orders set required_by_date = null where required_by_date < '1971-01-01'`;
  await report("After");
}

main().catch((e) => { console.error(e); process.exit(1); });

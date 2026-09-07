/**
 * Which database is DATABASE_URL actually pointing at?
 *
 * Read-only. Host names are not trustworthy here (see the prod-database-ops
 * notes — "ep-delicate-flower" has been both), so this reports ROW COUNTS, which
 * are. Run this before any DDL.
 *
 *   npx tsx --env-file-if-exists=.env scripts/identify-db.ts
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file-if-exists=.env");
  process.exit(1);
}

// The WebSocket driver cannot reach Neon from this machine; the HTTP one can.
const sql = neon(url);

async function main() {
  const [meta] = await sql`SELECT current_database() AS db, current_user AS usr, version() AS ver`;
  console.log(`database : ${meta.db}`);
  console.log(`user     : ${meta.usr}`);
  console.log(`host     : ${url!.replace(/:[^:@]*@/, ":****@").replace(/^.*@/, "")}`);

  const counts: Array<[string, string]> = [
    ["companies", "companies"],
    ["users", "users"],
    ["projects", "projects"],
    ["bills", "bills"],
    ["selections", "selections"],
    ["selection_templates", "selection_templates"],
    ["products", "products"],
  ];
  console.log(`\nrow counts (the reliable signal):`);
  for (const [label, table] of counts) {
    try {
      const rows = await sql(`SELECT count(*)::int AS n FROM ${table}`);
      console.log(`  ${label.padEnd(22)} ${String(rows[0].n).padStart(7)}`);
    } catch (err: any) {
      console.log(`  ${label.padEnd(22)} ${"—".padStart(7)}  (${err.message?.split("\n")[0]})`);
    }
  }

  console.log(`\nproduct library tables present?`);
  for (const t of ["products", "product_images", "selection_template_options"]) {
    const [r] = await sql`SELECT to_regclass(${"public." + t}) IS NOT NULL AS present`;
    console.log(`  ${t.padEnd(30)} ${r.present ? "yes" : "NO"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

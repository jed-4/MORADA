/**
 * One-off: apply migration 0042_project_contracted_total to the DEV database.
 *
 * There is no psql on this machine, so migrations are applied via the same
 * @neondatabase/serverless driver the app uses.
 *
 * Refuses to run against anything but the known dev endpoint — the real
 * production database is ep-delicate-flower and must never be touched by this.
 *
 * Run with:  node --env-file=../MORADA/.env scripts/apply-migration-0042.mjs
 */

import { readFileSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const url = new URL(process.env.DATABASE_URL);
console.log(`[migrate] target host=${url.hostname} db=${url.pathname.slice(1)}`);

// Hard allow-list. Anything else — prod (ep-delicate-flower), the Replit dev
// proxy (helium), the retired ep-muddy-sunset — aborts before any write.
if (!url.hostname.startsWith("ep-jolly-tooth-")) {
  console.error(`[migrate] ABORT: ${url.hostname} is not the dev endpoint (expected ep-jolly-tooth-*).`);
  process.exit(1);
}

const sql = readFileSync("migrations/0042_project_contracted_total.sql", "utf8");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("[migrate] 0042 applied.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("[migrate] FAILED, rolled back:", err.message);
  process.exitCode = 1;
} finally {
  client.release();
}

// Verify the columns landed.
const { rows } = await pool.query(
  `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
    WHERE table_name = 'projects'
      AND column_name IN ('contracted_total_ex_gst_cents','contracted_total_inc_gst_cents','contracted_at','contracted_estimate_id')
    ORDER BY column_name`,
);
console.table(rows);

await pool.end();

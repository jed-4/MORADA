#!/usr/bin/env node
/**
 * Pre-flight for migration 0043 (unique index on company_settings.company_id).
 *
 * CREATE UNIQUE INDEX fails if any company already owns two settings rows, and
 * a duplicate is also the thing that made the old `LIMIT 1` reads
 * non-deterministic. Run this against BOTH dev and prod before applying 0043.
 *
 * Usage (from the repo root):
 *   node scripts/check-company-settings-duplicates.mjs
 *   DATABASE_URL='postgres://...' node scripts/check-company-settings-duplicates.mjs
 *
 * Reads DATABASE_URL from the environment, falling back to .env in the repo
 * root. Read-only — it issues SELECTs and nothing else.
 *
 * Exit codes: 0 = safe to apply 0043, 1 = duplicates or NULL company_id found
 * (STOP and dedupe first), 2 = could not connect.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envFile = readFileSync(join(here, "..", ".env"), "utf8");
    for (const line of envFile.split("\n")) {
      const m = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env — fall through
  }
  return null;
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error("No DATABASE_URL found (env or .env). Pass it inline:");
  console.error("  DATABASE_URL='postgres://...' node scripts/check-company-settings-duplicates.mjs");
  process.exit(2);
}

// Show which endpoint we're talking to, never the credentials.
try {
  const u = new URL(databaseUrl);
  console.log(`Database: ${u.hostname}${u.pathname}\n`);
} catch {
  console.log("Database: (unparseable URL)\n");
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
} catch (err) {
  console.error("Could not connect:", err.message);
  process.exit(2);
}

let failed = false;

try {
  const { rows: totals } = await client.query(
    `SELECT count(*)::int AS total,
            count(company_id)::int AS with_company,
            count(*) FILTER (WHERE company_id IS NULL)::int AS null_company
       FROM company_settings`,
  );
  const t = totals[0];
  console.log(`company_settings rows: ${t.total} total, ${t.with_company} with company_id, ${t.null_company} NULL`);

  const { rows: dupes } = await client.query(
    `SELECT company_id, count(*)::int AS n
       FROM company_settings
      WHERE company_id IS NOT NULL
      GROUP BY company_id
     HAVING count(*) > 1
      ORDER BY n DESC`,
  );

  if (dupes.length === 0) {
    console.log("\nDuplicate company_id rows: NONE — safe to apply 0043.");
  } else {
    failed = true;
    console.log(`\nDuplicate company_id rows: ${dupes.length} company/companies affected. DO NOT apply 0043 yet.`);
    for (const d of dupes) console.log(`  company_id=${d.company_id} has ${d.n} rows`);

    // Show enough to make the keep/drop call by hand.
    const { rows: detail } = await client.query(
      `SELECT id, company_id, company_name, updated_at, created_at,
              (bill_inbox_gmail_refresh_token IS NOT NULL) AS has_gmail_token
         FROM company_settings
        WHERE company_id IN (
                SELECT company_id FROM company_settings
                 WHERE company_id IS NOT NULL
                 GROUP BY company_id HAVING count(*) > 1)
        ORDER BY company_id, updated_at DESC NULLS LAST`,
    );
    console.log("\nRows involved (newest first per company):");
    for (const r of detail) {
      console.log(
        `  id=${r.id} company_id=${r.company_id} name=${JSON.stringify(r.company_name)} ` +
          `updated=${r.updated_at?.toISOString?.() ?? r.updated_at} gmail_token=${r.has_gmail_token}`,
      );
    }
    console.log("\nDeduping is a judgment call (which row is authoritative, which holds the live");
    console.log("Gmail credentials) — decide per company, don't script it blind.");
  }

  if (t.null_company > 0) {
    failed = true;
    console.log(`\nWARNING: ${t.null_company} row(s) have a NULL company_id.`);
    console.log("The unique index permits multiple NULLs so 0043 will still apply, but those");
    console.log("rows are now unreachable: reads are scoped by company_id and the legacy");
    console.log("self-heal claim was removed. Run the startup backfill or set company_id by hand.");
  }
} catch (err) {
  console.error("Query failed:", err.message);
  failed = true;
} finally {
  await client.end();
}

process.exit(failed ? 1 : 0);

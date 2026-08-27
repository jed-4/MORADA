// Applies migrations/0057_contacts_company_id_index.sql and reports the result.
//
// CREATE INDEX CONCURRENTLY cannot run inside a transaction, so this uses the
// plain HTTP driver and issues the statement on its own. Safe to re-run.
//
//   node --env-file-if-exists=.env scripts/apply-0057-contacts-index.mjs
//   node --env-file-if-exists=.env scripts/apply-0057-contacts-index.mjs --check

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);
const checkOnly = process.argv.includes("--check");

const describe = async () => {
  const rows = await sql`
    SELECT i.indexname, i.indexdef, x.indisvalid
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_index x ON x.indexrelid = c.oid
    WHERE i.tablename = 'contacts'
    ORDER BY i.indexname
  `;
  return rows;
};

const before = await describe();
console.log("contacts indexes before:");
for (const r of before) console.log(`  ${r.indexname}${r.indisvalid ? "" : "  [INVALID]"}`);

if (!checkOnly) {
  const invalid = before.find((r) => r.indexname === "contacts_company_id_name_idx" && !r.indisvalid);
  if (invalid) {
    console.error("\ncontacts_company_id_name_idx exists but is INVALID (an earlier run was interrupted).");
    console.error("DROP INDEX contacts_company_id_name_idx; then re-run.");
    process.exit(1);
  }

  const started = Date.now();
  await sql`CREATE INDEX CONCURRENTLY IF NOT EXISTS contacts_company_id_name_idx ON contacts (company_id, name)`;
  console.log(`\napplied in ${Date.now() - started}ms`);

  const after = await describe();
  const created = after.find((r) => r.indexname === "contacts_company_id_name_idx");
  console.log(`\ncontacts_company_id_name_idx: ${created ? (created.indisvalid ? "present, valid" : "present but INVALID") : "MISSING"}`);
  if (created) console.log(`  ${created.indexdef}`);
}

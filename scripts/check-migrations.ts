/**
 * Which migrations are actually on this database?
 *
 *   npx tsx --env-file-if-exists=.env scripts/check-migrations.ts
 *   DATABASE_URL='<prod url>' npx tsx scripts/check-migrations.ts
 *   ... --from 0068        # only look at 0069 onwards
 *
 * Read-only. There is no migrations tracking table here — they are applied by
 * hand — so "applied" is inferred from EFFECTS: every table and column a
 * migration claims to create is checked against information_schema.
 *
 * Self-maintaining on purpose. It parses the .sql files rather than holding a
 * list, so a new migration is covered the moment it lands and nobody has to
 * remember to update this.
 *
 * What it cannot see: a migration whose only effect is data (an UPDATE or a
 * backfill), or an index. Those are reported as UNKNOWN rather than quietly
 * counted as applied — a checker that overstates is worse than none.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const ROOT = join(import.meta.dirname ?? ".", "..");
const fromIdx = process.argv.indexOf("--from");
const FROM = fromIdx !== -1 ? process.argv[fromIdx + 1] : "0000";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

interface Claim { table: string; column?: string }

/** Tables and columns a migration says it creates. */
function claimsOf(text: string): Claim[] {
  // Strip comments first: an inline `--` can carry a semicolon, and a commented
  // CREATE TABLE would otherwise be read as a real one.
  const body = text
    .split("\n")
    .map((l) => { const i = l.indexOf("--"); return i === -1 ? l : l.slice(0, i); })
    .join("\n");

  const claims: Claim[] = [];
  for (const m of body.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi)) {
    claims.push({ table: m[1].toLowerCase() });
  }
  for (const m of body.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?["`]?(\w+)["`]?[\s\S]*?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi)) {
    claims.push({ table: m[1].toLowerCase(), column: m[2].toLowerCase() });
  }
  return claims;
}

async function main() {
  const [meta] = await sql`SELECT current_database() AS db`;
  const files = readdirSync(join(ROOT, "migrations"))
    .filter((f) => /^\d{4}.*\.sql$/.test(f))
    .filter((f) => f.slice(0, 4) >= FROM)
    .sort();

  // Two queries for the whole run, not two per migration.
  const tables = new Set(
    (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)
      .map((r: any) => r.table_name.toLowerCase()),
  );
  const columns = new Set(
    (await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`)
      .map((r: any) => `${r.table_name.toLowerCase()}.${r.column_name.toLowerCase()}`),
  );

  console.log(`\ndatabase: ${meta.db}   (${files.length} migration file(s) from ${FROM})\n`);

  const missing: string[] = [];
  const unknown: string[] = [];
  for (const f of files) {
    const claims = claimsOf(readFileSync(join(ROOT, "migrations", f), "utf8"));
    if (claims.length === 0) {
      unknown.push(f);
      console.log(`  ?  ${f.padEnd(46)} no table/column to check (data or index only)`);
      continue;
    }
    const absent = claims.filter((c) =>
      c.column ? !columns.has(`${c.table}.${c.column}`) : !tables.has(c.table),
    );
    if (absent.length === 0) {
      console.log(`  ✓  ${f.padEnd(46)} applied`);
    } else {
      missing.push(f);
      const what = absent.map((c) => (c.column ? `${c.table}.${c.column}` : c.table)).join(", ");
      console.log(`  ✗  ${f.padEnd(46)} MISSING: ${what}`);
    }
  }

  console.log("");
  if (missing.length === 0) {
    console.log(`Nothing missing.${unknown.length ? `  ${unknown.length} could not be checked — see "?" above.` : ""}`);
  } else {
    console.log(`${missing.length} migration(s) not applied:`);
    for (const f of missing) console.log(`  npx tsx scripts/apply-sql-migration.ts migrations/${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

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
 * remember to update this. The parser lives in scripts/lib/migrationClaims.ts,
 * shared with scripts/check-schema-sync.ts, which asks the same question of
 * shared/schema.ts instead of a database.
 *
 * What it cannot see: a migration whose only effect is data (an UPDATE or a
 * backfill), or an index. Those are reported as UNKNOWN rather than quietly
 * counted as applied — a checker that overstates is worse than none.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { claimsOf, foldEffects, isSuperseded, migrationFileNames } from "./lib/migrationClaims.ts";

const ROOT = join(import.meta.dirname ?? ".", "..");
const fromIdx = process.argv.indexOf("--from");
const FROM = fromIdx !== -1 ? process.argv[fromIdx + 1] : "0000";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

async function main() {
  const [meta] = await sql`SELECT current_database() AS db`;
  const allNames = migrationFileNames(readdirSync(join(ROOT, "migrations")));
  const files = migrationFileNames(allNames, FROM);

  // Folded over ALL migrations, not just the --from subset: a column renamed by
  // a later file is gone from the database by design, and reporting it as
  // missing made the migration that added it look permanently unapplied.
  const effects = foldEffects(
    allNames.map((name) => ({ name, sql: readFileSync(join(ROOT, "migrations", name), "utf8") })),
  );

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
    const all = claimsOf(readFileSync(join(ROOT, "migrations", f), "utf8"));
    const claims = all.filter((c) => !isSuperseded(c, effects));
    if (all.length > 0 && claims.length === 0) {
      console.log(`  ~  ${f.padEnd(46)} superseded by a later migration`);
      continue;
    }
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

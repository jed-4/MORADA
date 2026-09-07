/**
 * Applies a .sql migration file over the Neon HTTP driver.
 *
 *   npx tsx --env-file-if-exists=.env scripts/apply-sql-migration.ts migrations/0068_x.sql
 *   ... --dry   # print the statements without running them
 *
 * The WebSocket driver cannot reach Neon from this machine, and the HTTP driver
 * takes one statement per call, so the file is split on top-level semicolons and
 * replayed in order. Every statement in the Product Library migrations is
 * IF NOT EXISTS, so a partial run is safe to repeat.
 *
 * Prints the database it is about to write to first. Check it against
 * scripts/identify-db.ts before answering for anything.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const file = process.argv.find((a) => a.endsWith(".sql"));
const DRY = process.argv.includes("--dry");
if (!file) { console.error("usage: apply-sql-migration.ts <file.sql> [--dry]"); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);

/**
 * Strips `--` comments, then splits on semicolons. No $$ bodies and no `--`
 * inside string literals in these files, so this stays simple.
 *
 * INLINE comments must go too, not just whole-line ones: a trailing
 * `-- cents; NULL = use ...` contains a semicolon, and leaving it in splits one
 * statement into two, the second of which is comment prose. The dry run caught
 * exactly that.
 */
function statements(text: string): string[] {
  return text
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const stmts = statements(readFileSync(file!, "utf8"));
  const [meta] = await sql`SELECT current_database() AS db`;
  console.log(`${DRY ? "DRY RUN" : "APPLYING"} ${file}`);
  console.log(`database: ${meta.db}\n`);

  for (const [i, stmt] of stmts.entries()) {
    const label = stmt.split("\n")[0].slice(0, 78);
    if (DRY) { console.log(`  ${i + 1}. ${label}`); continue; }
    try {
      await sql(stmt);
      console.log(`  ✓ ${i + 1}. ${label}`);
    } catch (err: any) {
      console.error(`  ✗ ${i + 1}. ${label}`);
      console.error(`      ${err.message?.split("\n")[0]}`);
      process.exit(1);
    }
  }
  console.log(`\n${DRY ? `${stmts.length} statement(s) would run.` : `${stmts.length} statement(s) applied.`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

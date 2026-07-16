/**
 * Apply a single .sql migration inside a transaction, against an explicitly
 * chosen connection string.
 *
 * Why this exists instead of `drizzle-kit push`:
 *   push diffs the WHOLE of shared/schema.ts against the live database and
 *   applies whatever it thinks the difference is. On this repo it currently
 *   tries to DROP A PRIMARY KEY (error 42P16). It is not safe here. This
 *   script runs exactly the SQL you point it at, in one transaction, and
 *   rolls the whole thing back if any statement fails.
 *
 * Why it makes you name the env var:
 *   this repo has more than one database URL floating around, and they are
 *   NOT interchangeable — see the guards in server/db.ts:
 *     - DATABASE_URL          — what the app actually reads. The real one.
 *     - NEON_DATABASE_URL     — a STALE database with an outdated schema.
 *                               server/db.ts hard-blocks it in production.
 *     - host "helium"         — Replit's dev-only proxy. Never production.
 *   Migrating the wrong one is silent: the migration "succeeds", production
 *   is untouched, and you find out when the app 500s. So --check prints every
 *   candidate and --apply demands you name one.
 *
 * Usage:
 *   npx tsx scripts/apply-migration.ts --check
 *   npx tsx scripts/apply-migration.ts <file.sql> --apply --var=DATABASE_URL
 *
 * Never prints passwords.
 */
import { readFileSync, existsSync } from "node:fs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const CANDIDATE_VARS = ["DATABASE_URL", "NEON_DATABASE_URL", "POSTGRES_URL"];

/** Endpoints that must never be treated as production. See server/db.ts. */
function endpointWarning(hostname: string): string | null {
  if (hostname === "helium") {
    return "Replit's DEV-ONLY proxy. This is not production.";
  }
  if (hostname.startsWith("ep-muddy-sunset-aelsjwoz")) {
    return "The STALE database (outdated schema). server/db.ts hard-blocks this in production.";
  }
  return null;
}

function describe(varName: string, raw: string) {
  try {
    const u = new URL(raw);
    const warning = endpointWarning(u.hostname);
    return {
      varName,
      host: u.hostname,
      db: u.pathname.replace(/^\//, "") || "(default)",
      user: u.username || "(none)",
      warning,
    };
  } catch {
    return { varName, host: "(unparseable)", db: "?", user: "?", warning: "Could not parse as a URL." };
  }
}

function printCandidates() {
  console.log("Database URLs visible in this shell:\n");
  let found = 0;
  for (const v of CANDIDATE_VARS) {
    const raw = process.env[v];
    if (!raw) {
      console.log(`  ${v.padEnd(20)} (not set)`);
      continue;
    }
    found++;
    const d = describe(v, raw);
    console.log(`  ${d.varName.padEnd(20)} host=${d.host}`);
    console.log(`  ${"".padEnd(20)} db=${d.db}  user=${d.user}`);
    if (d.warning) console.log(`  ${"".padEnd(20)} *** ${d.warning} ***`);
    console.log("");
  }
  if (!found) console.log("  none of the known variables are set.\n");
  console.log("The app reads DATABASE_URL (see server/db.ts).");
  console.log("Confirm the host above matches your PRODUCTION Neon endpoint before applying.");
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const apply = args.includes("--apply");
  const varArg = args.find((a) => a.startsWith("--var="))?.split("=")[1];
  const file = args.find((a) => a.endsWith(".sql"));

  if (check || (!apply && !file)) {
    printCandidates();
    return;
  }

  if (!apply) {
    console.error("Refusing to run: pass --apply to actually write, or --check to inspect.");
    process.exitCode = 1;
    return;
  }
  if (!file) {
    console.error("Refusing to run: no .sql file given.");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Refusing to run: ${file} not found. Is the branch pulled?`);
    process.exitCode = 1;
    return;
  }
  if (!varArg) {
    console.error("Refusing to run: name the env var explicitly, e.g. --var=DATABASE_URL");
    console.error("(This repo has multiple database URLs and they are not interchangeable.)\n");
    printCandidates();
    process.exitCode = 1;
    return;
  }
  const conn = process.env[varArg];
  if (!conn) {
    console.error(`Refusing to run: ${varArg} is not set in this shell.`);
    process.exitCode = 1;
    return;
  }

  const d = describe(varArg, conn);
  const sql = readFileSync(file, "utf8");
  const statements = sql.split(";").filter((s) => s.trim() && !s.trim().startsWith("--")).length;

  console.log(`Target:     ${d.varName}`);
  console.log(`Host:       ${d.host}`);
  console.log(`Database:   ${d.db}`);
  console.log(`User:       ${d.user}`);
  console.log(`Migration:  ${file} (${statements} statements)`);
  if (d.warning) {
    console.error(`\nABORTED — ${d.warning}`);
    console.error("This is not the production database. Nothing was changed.");
    process.exitCode = 1;
    return;
  }
  console.log("");

  const pool = new Pool({ connectionString: conn });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("=====================================");
    console.log(" SUCCESS — migration applied and committed.");
    console.log(`  ${file}`);
    console.log(`  host=${d.host} db=${d.db}`);
    console.log("=====================================");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection may already be gone; the transaction dies with it either way */
    }
    console.error("=====================================");
    console.error(" ROLLED BACK — nothing was changed.");
    console.error(`  ${(err as Error).message}`);
    console.error("=====================================");
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("ROLLED BACK / FAILED before applying:", (err as Error).message);
  process.exit(1);
});

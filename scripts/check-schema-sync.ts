/**
 * Does the code still declare everything the database has?
 *
 *   npx tsx scripts/check-schema-sync.ts            # check
 *   npx tsx scripts/check-schema-sync.ts --update   # re-bless the route inventory
 *
 * Why this exists: a merge of a long-lived branch reverted shared/schema.ts and
 * server/routes.ts to a state from before several features, and NOTHING failed.
 * The columns were still in the database (migrations are applied by hand, so a
 * schema revert cannot remove them) and getEstimateItems swallows query errors
 * and returns [], so the only symptom was estimates rendering empty. It was
 * found two PRs later by counting tsc errors.
 *
 * Three checks, all mechanical:
 *
 *   1. Migrations vs shared/schema.ts — every table and column a migration
 *      creates must still be declared in Drizzle, unless a later migration
 *      dropped or renamed it. No baseline: this must be clean, always.
 *
 *   2. Route inventory — every route registration, against a committed list.
 *      A route that disappears fails the check. It may legitimately go, but it
 *      has to go in a diff someone can see, not inside a merge resolution.
 *
 *   3. Orphan modules — every module under shared/, server/services/ and
 *      server/middleware/, nested directories included, must be imported by
 *      something. This is the half of
 *      the clobber the route inventory misses: the lost routes.ts hunks were
 *      mostly CALLS into server/services/quantityFormulas.ts, which stayed on
 *      disk with nothing importing it.
 *
 * None of them prove anything WORKS. They prove a declaration is still there,
 * which is exactly the thing a bad merge resolution takes away silently.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claimsOf, foldEffects, isSuperseded, migrationFileNames } from "./lib/migrationClaims.ts";

const ROOT = join(import.meta.dirname ?? ".", "..");
const INVENTORY = join(ROOT, "scripts", "route-inventory.json");
const UPDATE = process.argv.includes("--update");

const ROUTE_FILES = ["server/routes.ts", "server/auth.ts", "server/index.ts", "server/replitAuth.ts"];

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

let failed = false;
function fail(lines: string[]) {
  failed = true;
  for (const line of lines) console.log(line);
}

// ── 1. Migrations vs the Drizzle schema ──────────────────────────────────────

/**
 * The columns object of each pgTable, by table name.
 *
 * Bounded by the first line that starts with `}` — the close of the object
 * literal — which works for both `pgTable("t", { ... })` and the
 * `pgTable("t", { ... }, (table) => ({ ... }))` form that carries indexes.
 */
function schemaTableBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const m of source.matchAll(/pgTable\(\s*"(\w+)"\s*,/g)) {
    const from = m.index!;
    const end = source.slice(from).search(/\n\}/);
    blocks.set(m[1].toLowerCase(), source.slice(from, end === -1 ? undefined : from + end));
  }
  return blocks;
}

function checkSchemaDeclaresMigrations() {
  const names = migrationFileNames(readdirSync(join(ROOT, "migrations")));
  const files = names.map((name) => ({ name, sql: read(`migrations/${name}`) }));
  const effects = foldEffects(files);
  const blocks = schemaTableBlocks(read("shared/schema.ts"));

  const missing: string[] = [];

  for (const [table, file] of effects.tables) {
    if (effects.droppedTables.has(table)) continue;
    if (!blocks.has(table)) missing.push(`  ${table.padEnd(44)} added by ${file}`);
  }
  for (const [key, file] of effects.columns) {
    const [table, column] = key.split(".");
    if (effects.droppedTables.has(table) || effects.droppedColumns.has(key)) continue;
    const block = blocks.get(table);
    if (!block) continue; // the table itself is already reported
    if (!new RegExp(`"${column}"`).test(block)) missing.push(`  ${key.padEnd(44)} added by ${file}`);
  }

  console.log(
    `schema: ${effects.tables.size} table(s) and ${effects.columns.size} column(s) claimed by `
    + `${files.length} migration(s); ${blocks.size} pgTable(s) declared`,
  );
  if (missing.length === 0) {
    console.log("  ✓ shared/schema.ts declares all of them\n");
    return;
  }
  fail([
    `  ✗ ${missing.length} in the database but NOT declared in shared/schema.ts:`,
    ...missing,
    "",
    "  Drizzle builds insert schemas FROM the table, so a column missing here is",
    "  silently stripped from every write. If this appeared after a merge, the",
    "  merge resolution took the branch's copy of shared/schema.ts — restore the",
    "  declarations from main rather than re-adding them by hand.",
    "",
  ]);
}

// ── 2. Route inventory ───────────────────────────────────────────────────────

const ROUTE_START = /^\s*app\.(get|post|patch|put|delete|all)\(/;
const PATH_SAME_LINE = /^\s*app\.(get|post|patch|put|delete|all)\(\s*(['"`])(.*?)\2/;
const PATH_NEXT_LINE = /^\s*(['"`])(.*?)\1/;

/** Every route registration, as "<file> <VERB> <path>". */
function routeInventory(): string[] {
  const found = new Set<string>();
  for (const rel of ROUTE_FILES) {
    const lines = read(rel).split("\n");
    lines.forEach((line, i) => {
      if (!ROUTE_START.test(line)) return;
      const same = line.match(PATH_SAME_LINE);
      const next = same ? null : (lines[i + 1] ?? "").match(PATH_NEXT_LINE);
      const verb = (same ?? line.match(ROUTE_START)!)[1].toUpperCase();
      const path = same ? same[3] : next?.[2];
      if (path) found.add(`${rel} ${verb} ${path}`);
    });
  }
  return [...found].sort();
}

function checkRouteInventory() {
  const routes = routeInventory();

  if (UPDATE) {
    writeFileSync(INVENTORY, `${JSON.stringify({
      note: "Every route the server registers. A route that DISAPPEARS fails scripts/check-schema-sync.ts — "
        + "rerun it with --update to bless a deliberate removal, so the removal lands in a reviewable diff.",
      routes,
    }, null, 2)}\n`);
    console.log(`routes: wrote ${routes.length} to scripts/route-inventory.json\n`);
    return;
  }

  const blessed: string[] = JSON.parse(readFileSync(INVENTORY, "utf8")).routes;
  const live = new Set(routes);
  const gone = blessed.filter((r) => !live.has(r));
  const added = routes.filter((r) => !blessed.includes(r));

  console.log(`routes: ${routes.length} registered, ${blessed.length} in the inventory`);
  if (gone.length === 0) {
    console.log(`  ✓ nothing disappeared${added.length ? `  (${added.length} new — run --update)` : ""}\n`);
    if (added.length) {
      fail([
        "  ✗ new routes are not in the inventory:",
        ...added.map((r) => `  + ${r}`),
        "    npx tsx scripts/check-schema-sync.ts --update",
        "",
      ]);
    }
    return;
  }
  fail([
    `  ✗ ${gone.length} route(s) in the inventory are no longer registered:`,
    ...gone.map((r) => `  - ${r}`),
    "",
    "  If you meant to remove them, rerun with --update and commit the inventory",
    "  so the removal is visible. If you did not, a merge resolution dropped them.",
    "",
  ]);
}

// ── 3. Orphan modules ────────────────────────────────────────────────────────

/** Directories where an unimported module means something went missing. */
const MODULE_DIRS = ["shared", "server/services", "server/middleware"];
/** Where imports are looked for. Everything, because anything may import them. */
const SOURCE_DIRS = ["shared", "server", "client/src"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Every module specifier the codebase imports, static or dynamic. */
function importedSpecifiers(): Set<string> {
  const specs = new Set<string>();
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(dir)) {
      for (const m of read(file).matchAll(/(?:from|import\(|require\()\s*['"`]([^'"`]+)['"`]/g)) {
        specs.add(m[1].replace(/\.js$/, ""));
      }
    }
  }
  return specs;
}

function checkNoOrphanModules() {
  const specs = [...importedSpecifiers()];
  const orphans: string[] = [];
  let checked = 0;

  // Nested too: shared/cashflow/ is a dozen modules of the newest work, which
  // is exactly what a stale branch's merge resolution would take back.
  for (const dir of MODULE_DIRS) {
    for (const file of sourceFiles(dir).filter((f) => /\.ts$/.test(f) && !/\.d\.ts$/.test(f))) {
      const parts = file.replace(/\.ts$/, "").split("/");
      const base = parts.pop()!;
      const parent = parts.pop();
      checked++;
      // `@shared/pricing` and `./services/quantityFormulas` both end in
      // <parent>/<base>, which keeps the two templateOptionSync modules apart.
      // A same-directory `./base` import counts, and a directory's index.ts is
      // reached by importing the directory itself.
      const referenced = specs.some((s) =>
        s.endsWith(`${parent}/${base}`)
        || s === `./${base}`
        || s === `../${base}`
        || (base === "index" && s.endsWith(`/${parent}`)),
      );
      if (!referenced) orphans.push(`  ${file}`);
    }
  }

  console.log(`modules: ${checked} in ${MODULE_DIRS.join(", ")}`);
  if (orphans.length === 0) {
    console.log("  ✓ every one of them is imported somewhere\n");
    return;
  }
  fail([
    `  ✗ ${orphans.length} module(s) that nothing imports:`,
    ...orphans,
    "",
    "  Either the module is dead and should be deleted in its own commit, or its",
    "  caller was lost — which is how the routes.ts half of the merge clobber",
    "  looked: the service was still on disk, just never called.",
    "",
  ]);
}

// ── Per-migration view, for the applied-vs-superseded question ───────────────
// claimsOf is exercised here too, so a parser change that breaks
// scripts/check-migrations.ts fails in CI rather than against a database.

function checkClaimParserAgrees() {
  const names = migrationFileNames(readdirSync(join(ROOT, "migrations")));
  const files = names.map((name) => ({ name, sql: read(`migrations/${name}`) }));
  const effects = foldEffects(files);
  let dataOnly = 0;
  let superseded = 0;
  for (const { name, sql } of files) {
    const claims = claimsOf(sql);
    if (claims.length === 0) { dataOnly++; continue; }
    for (const claim of claims) {
      if (isSuperseded(claim, effects)) { superseded++; continue; }
      const key = claim.column ? `${claim.table}.${claim.column}` : claim.table;
      const known = claim.column ? effects.columns.has(key) : effects.tables.has(claim.table);
      if (!known) {
        fail([`  ✗ ${name}: claims ${key}, which the folded effects do not know about`]);
      }
    }
  }
  console.log(
    `claims: every migration's claims accounted for `
    + `(${dataOnly} data/index only, ${superseded} superseded by a later migration)\n`,
  );
}

console.log("");
checkSchemaDeclaresMigrations();
checkRouteInventory();
checkNoOrphanModules();
checkClaimParserAgrees();

if (failed) {
  console.log("check-schema-sync: FAILED");
  process.exit(1);
}
console.log("check-schema-sync: ok");

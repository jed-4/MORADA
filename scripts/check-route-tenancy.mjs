#!/usr/bin/env node
/**
 * Tenancy ratchet.
 *
 * Three mechanical checks over the server source. None of them prove a check
 * is CORRECT — they prove one is present. The point is that the known-bad set
 * can only shrink: a new route or a new create-schema cannot join it.
 *
 *   1. Route scoping   — every app.<verb>() handler must mention a tenancy
 *                        token, unless it is in the baseline.
 *   2. Drizzle .where() — a query that starts company-scoped and then chains a
 *                        second .where() silently DROPS the company predicate
 *                        (the second replaces the first). Always an error.
 *   3. Create schemas   — an insert*Schema used to parse a request body must
 *                        omit its tenancy FK fields, so a parent id can never
 *                        arrive from the client.
 *
 * Baseline: scripts/route-tenancy-baseline.json. Entries that no longer
 * trigger are reported as stale and fail too, so the file cannot rot.
 *
 *   node scripts/check-route-tenancy.mjs            # check
 *   node scripts/check-route-tenancy.mjs --update   # rewrite the baseline
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "route-tenancy-baseline.json");
const UPDATE = process.argv.includes("--update");

const ROUTE_FILES = ["server/routes.ts", "server/auth.ts", "server/index.ts", "server/replitAuth.ts"];

/**
 * Tokens that indicate the handler considered tenancy at all. Deliberately
 * broad — a user-scoped predicate (req.user.id) is legitimate isolation
 * because a user belongs to exactly one company.
 */
const TENANCY_TOKEN = new RegExp([
  "companyId", "company_id",
  "enforceProjectCompany", "getOwned\\w+", "ownsAll\\w*",
  "getSessionCompanyId", "requireCompany",
  "req\\.user!?\\.id", "req\\.user\\?\\.id", "userId",
].join("|"));

const ROUTE_START = /^\s*app\.(get|post|patch|put|delete|all)\(/;
const PATH_ON_LINE = /^\s*app\.(get|post|patch|put|delete|all)\(\s*(['"`])(.*?)\2/;
const PATH_NEXT_LINE = /^\s*(['"`])(.*?)\1/;

function readLines(rel) {
  try { return readFileSync(join(ROOT, rel), "utf8").split("\n"); }
  catch { return null; }
}


/**
 * The handler body, bounded by brace balance from the app.<verb>( line.
 *
 * Slicing "until the next route registration" is wrong: a route followed by
 * helper code absorbs that code's tokens and looks scoped when it is not.
 * That flaw was caught by the script's own self-test.
 */
function handlerBody(lines, startLine) {
  let depth = 0, seen = false, out = [];
  for (let i = startLine - 1; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    for (const ch of line) {
      if (ch === "(" || ch === "{") { depth++; seen = true; }
      else if (ch === ")" || ch === "}") depth--;
    }
    if (seen && depth <= 0) break;
    if (out.length > 500) break;   // runaway guard
  }
  return out.join("\n");
}

/** The `VERB /path` of the route enclosing a character offset, for stable keys. */
function enclosingRoute(src, offset) {
  const before = src.slice(0, offset);
  const re = /app\.(get|post|patch|put|delete|all)\(\s*(['"`])(.*?)\2/g;
  let last = null, m;
  while ((m = re.exec(before)) !== null) last = `${m[1].toUpperCase()} ${m[3]}`;
  return last ?? "<module scope>";
}

/** ---- check 1: route handlers ---- */
function scanRoutes() {
  const unscoped = [];
  let total = 0;
  for (const rel of ROUTE_FILES) {
    const lines = readLines(rel);
    if (!lines) continue;
    const starts = [];
    for (let i = 0; i < lines.length; i++) {
      if (!ROUTE_START.test(lines[i])) continue;
      const m = PATH_ON_LINE.exec(lines[i]);
      let path = m?.[3];
      if (!path) path = PATH_NEXT_LINE.exec(lines[i + 1] ?? "")?.[2] ?? "<unresolved>";
      starts.push({ line: i + 1, verb: ROUTE_START.exec(lines[i])[1].toUpperCase(), path });
    }
    for (let k = 0; k < starts.length; k++) {
      total++;
      const body = handlerBody(lines, starts[k].line);
      if (!TENANCY_TOKEN.test(body)) {
        unscoped.push(`${rel} ${starts[k].verb} ${starts[k].path}`);
      }
    }
  }
  return { unscoped, total };
}

/** ---- check 2: chained .where() that replaces a company predicate ---- */
function scanChainedWhere() {
  const lines = readLines("server/storage.ts") ?? [];
  const hits = [];
  let name = null, start = 0;
  const flush = (end) => {
    if (!name) return;
    const body = lines.slice(start, end).join("\n");
    const first = /(?:let|const)\s+query\s*=\s*[\s\S]{0,400}?\.where\(([^\n]*)/.exec(body);
    if (first && /query\s*=\s*query\.where\(/.test(body) && /companyId/.test(first[1])) {
      hits.push(`server/storage.ts ${name}`);
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s{2}async (\w+)\(/.exec(lines[i]);
    if (m) { flush(i); name = m[1]; start = i; }
  }
  flush(lines.length);
  return hits;
}

/** ---- check 3: create-schemas must omit their tenancy FK fields ---- */
const FK_FIELDS = ["companyId"];

/**
 * insert<X>Schema → does its table carry company_id?
 * Only schemas backed by a tenant-owned table are worth flagging; the rest
 * have no companyId to omit and would be pure noise.
 */
function tenantOwnedSchemas() {
  const src = readFileSync(join(ROOT, "shared/schema.ts"), "utf8");
  const withCompany = new Set();
  const tableRe = /export const (\w+) = pgTable\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\n\s*\}/g;
  let t;
  while ((t = tableRe.exec(src)) !== null) {
    if (/companyId:\s*\w+\("company_id"/.test(t[3])) withCompany.add(t[1]);
  }
  const schemas = new Set();
  const schemaRe = /export const (insert\w+Schema)\s*=\s*createInsertSchema\(\s*(\w+)\s*\)/g;
  let m;
  while ((m = schemaRe.exec(src)) !== null) {
    if (withCompany.has(m[2])) schemas.add(m[1]);
  }
  return schemas;
}

function scanCreateSchemas() {
  const lines = readLines("server/routes.ts") ?? [];
  const tenantSchemas = tenantOwnedSchemas();
  const hits = [];
  // insertXSchema.safeParse(req.body) / .parse(req.body) with no .omit() that
  // drops companyId between the schema name and the parse call.
  const re = /(insert\w+Schema)((?:\s*\.\s*\w+\([^)]*\))*?)\s*\.\s*(?:safe)?[Pp]arse\(\s*(?:req\.body|\{\s*\.\.\.req\.body)/g;
  const src = lines.join("\n");
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, schema, chain] = m;
    if (!tenantSchemas.has(schema)) continue;   // table has no company_id to omit
    if (FK_FIELDS.some((f) => !new RegExp(`omit\\([^)]*${f}\\s*:\\s*true`).test(chain))) {
      // Keyed on the enclosing route, NOT a line number: line-numbered keys
      // churn the whole baseline every time anything above them shifts.
      hits.push(`${enclosingRoute(src, m.index)} — ${schema}`);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
const { unscoped, total } = scanRoutes();
const chained = scanChainedWhere();
const schemas = scanCreateSchemas();

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify({
    note: "Known-unscoped call sites. This list may only SHRINK — see scripts/check-route-tenancy.mjs.",
    unscopedRoutes: unscoped.sort(),
    createSchemasAcceptingFks: schemas.sort(),
  }, null, 2) + "\n");
  console.log(`baseline written: ${unscoped.length} routes, ${schemas.length} schemas`);
  process.exit(0);
}

let baseline;
try { baseline = JSON.parse(readFileSync(BASELINE, "utf8")); }
catch { console.error(`missing ${BASELINE} — run with --update to create it`); process.exit(1); }

const knownRoutes = new Set(baseline.unscopedRoutes ?? []);
const knownSchemas = new Set(baseline.createSchemasAcceptingFks ?? []);

const newRoutes = unscoped.filter((r) => !knownRoutes.has(r));
const staleRoutes = [...knownRoutes].filter((r) => !unscoped.includes(r));
const newSchemas = schemas.filter((s) => !knownSchemas.has(s));
const staleSchemas = [...knownSchemas].filter((s) => !schemas.includes(s));

let failed = false;
const report = (title, items, hint) => {
  if (!items.length) return;
  failed = true;
  console.error(`\n${title} (${items.length})\n${hint}`);
  for (const i of items) console.error(`  ${i}`);
};

report("NEW routes with no tenancy check", newRoutes,
  "  Every handler must scope by the session's company. Use enforceProjectCompany,\n" +
  "  a getOwnedX guard, or a userId predicate. If it genuinely has no tenant data,\n" +
  "  say so in a comment mentioning companyId and it will pass.");

report("NEW create-schemas accepting a tenancy FK from the body", newSchemas,
  "  .omit({ companyId: true }) on the schema and read it from the session instead.");

report("Chained .where() that drops a companyId predicate", chained,
  "  A second .where() REPLACES the first in Drizzle. Collect predicates and\n" +
  "  apply one .where(and(...conds)). This check has no baseline — always fix it.");

if (staleRoutes.length || staleSchemas.length) {
  failed = true;
  console.error(`\nStale baseline entries (${staleRoutes.length + staleSchemas.length})`);
  console.error("  These were fixed or removed. Run --update so the ratchet tightens.");
  for (const i of [...staleRoutes, ...staleSchemas]) console.error(`  ${i}`);
}

if (!failed) {
  console.log(`tenancy ratchet ok — ${total} routes scanned, ` +
              `${unscoped.length} known-unscoped, 0 new, 0 chained-where`);
}
process.exit(failed ? 1 : 0);

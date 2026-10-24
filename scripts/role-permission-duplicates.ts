/**
 * Duplicate grants in role_permissions — more than one row for the same
 * (role_id, permission_id).
 *
 * Until migration 0110 the table had no unique constraint, so a backfill that
 * relied on a 23505 catch, or two overlapping saves of a role, could add a
 * second row. The readers do not agree on what two rows mean:
 *   - requirePermission (route gate) passes if ANY row allows the action
 *   - checkUserPermission / userHasPermission take whichever row comes first
 *   - /api/auth/user effectivePermissions keeps the LAST row (what the UI shows)
 * so a disagreeing pair can let a route through that the UI hides, or the
 * reverse. 0110 collapses every pair to the union.
 *
 *   npx tsx --env-file-if-exists=.env scripts/role-permission-duplicates.ts
 *   ... --list     # print every duplicate group, not just the summary
 *
 * Read-only.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file-if-exists=.env");
  process.exit(1);
}
const sql = neon(url);
const listAll = process.argv.includes("--list");

const norm = (v: unknown) => {
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  return JSON.stringify(v ?? null);
};

async function main() {
  console.log(`Database host: ${new URL(url!).host}`);
  const [counts] = (await sql`
    SELECT (SELECT count(*)::int FROM companies) AS companies,
           (SELECT count(*)::int FROM user_roles) AS roles,
           (SELECT count(*)::int FROM role_permissions) AS grants
  `) as any[];
  console.log(`companies=${counts.companies} roles=${counts.roles} role_permissions=${counts.grants}`);

  const [idx] = (await sql`
    SELECT count(*)::int AS n FROM pg_indexes
    WHERE tablename = 'role_permissions' AND indexdef ILIKE '%UNIQUE%(role_id, permission_id)%'
  `) as any[];
  console.log(`unique (role_id, permission_id) index present: ${idx.n > 0 ? "yes" : "no"}`);

  const rows = (await sql`
    SELECT rp.id, rp.role_id, rp.permission_id, rp.allowed_actions, rp.view_scope,
           rp.viewable_role_ids, rp.created_at, p.key, r.name AS role, c.name AS company
    FROM role_permissions rp
    JOIN (
      SELECT role_id, permission_id FROM role_permissions
      GROUP BY role_id, permission_id HAVING count(*) > 1
    ) d ON d.role_id = rp.role_id AND d.permission_id = rp.permission_id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    LEFT JOIN user_roles r ON r.id = rp.role_id
    LEFT JOIN companies c ON c.id = r.company_id
    ORDER BY c.name, r.name, p.key, rp.created_at
  `) as any[];

  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const k = `${row.role_id}|${row.permission_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  }

  let extraRows = 0;
  let disagreeActions = 0;
  let disagreeScope = 0;
  let disagreeViewable = 0;
  const roles = new Set<string>();
  const byKey = new Map<string, number>();

  for (const g of groups.values()) {
    extraRows += g.length - 1;
    roles.add(g[0].role_id);
    byKey.set(g[0].key, (byKey.get(g[0].key) ?? 0) + 1);
    const a = new Set(g.map((r) => norm(r.allowed_actions))).size > 1;
    const s = new Set(g.map((r) => norm(r.view_scope))).size > 1;
    const v = new Set(g.map((r) => norm(r.viewable_role_ids))).size > 1;
    if (a) disagreeActions++;
    if (s) disagreeScope++;
    if (v) disagreeViewable++;
    if (listAll || a || s || v) {
      const flags = [a && "actions", s && "view_scope", v && "viewable_role_ids"].filter(Boolean).join(", ");
      console.log(`\n${g[0].company} / ${g[0].role} / ${g[0].key} — ${g.length} rows${flags ? `  DISAGREE: ${flags}` : ""}`);
      for (const r of g) {
        console.log(`   ${r.id}  actions=${norm(r.allowed_actions)} scope=${r.view_scope} viewable=${norm(r.viewable_role_ids)} created=${new Date(r.created_at).toISOString()}`);
      }
    }
  }

  console.log("\n— summary —");
  console.log(`duplicate groups:        ${groups.size}`);
  console.log(`surplus rows:            ${extraRows}  (rows 0110 would delete)`);
  console.log(`roles affected:          ${roles.size}`);
  console.log(`groups disagreeing on allowed_actions:    ${disagreeActions}`);
  console.log(`groups disagreeing on view_scope:         ${disagreeScope}`);
  console.log(`groups disagreeing on viewable_role_ids:  ${disagreeViewable}`);
  if (byKey.size > 0) {
    console.log("groups by permission key:");
    for (const [k, n] of [...byKey.entries()].sort((x, y) => y[1] - x[1])) console.log(`   ${n}\t${k}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

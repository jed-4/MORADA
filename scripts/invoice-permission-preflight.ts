/**
 * Before "Progress Claims" (projects.invoices) is enforced for team members:
 * who would keep seeing client invoices, and who would lose them?
 *
 * Until now the permission only gated the client portal, so nobody had a
 * reason to tick it correctly for staff. Run this against a database, fix the
 * roles in Settings → Roles & Permissions, and run it again.
 *
 *   npx tsx --env-file-if-exists=.env scripts/invoice-permission-preflight.ts
 *   ... --company Lighthouse     # only companies whose name contains this
 *
 * Read-only. Admin-like roles (built-in + name contains admin / owner /
 * general manage) bypass permissions, the same rule requirePermission uses.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with --env-file-if-exists=.env");
  process.exit(1);
}
const sql = neon(url);
const ci = process.argv.indexOf("--company");
const companyFilter = ci > 0 ? process.argv[ci + 1] ?? "" : "";

const adminLike = (name: string, builtIn: boolean) => {
  const n = name.toLowerCase();
  return builtIn && (n.includes("admin") || n.includes("owner") || n.includes("general manage"));
};

async function main() {
  const rows = (await sql`
    SELECT c.name AS company, r.id AS role_id, r.name AS role, r.is_built_in AS built_in,
           rp.allowed_actions AS actions,
           (SELECT count(*)::int FROM users u WHERE u.role_id = r.id AND u.is_active) AS active_users,
           (SELECT string_agg(coalesce(nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''), u.email), ', ' ORDER BY u.first_name)
              FROM users u WHERE u.role_id = r.id AND u.is_active) AS people
    FROM user_roles r
    JOIN companies c ON c.id = r.company_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
      AND rp.permission_id = (SELECT id FROM permissions WHERE key = 'projects.invoices')
    WHERE r.user_category = 'team' AND r.is_active
      AND c.name ILIKE ${"%" + companyFilter + "%"}
    ORDER BY c.name, r.display_order, r.name
  `) as any[];

  let company = "";
  for (const r of rows) {
    if (r.company !== company) {
      company = r.company;
      console.log(`\n${company}`);
    }
    const actions: string[] = Array.isArray(r.actions) ? r.actions : r.actions ? JSON.parse(r.actions) : [];
    const access = adminLike(r.role, r.built_in)
      ? "ALL (admin — always)"
      : actions.includes("view")
        ? `keeps: ${actions.join(", ")}`
        : "LOSES invoice access";
    console.log(`  ${String(r.role).padEnd(24)} ${access.padEnd(40)} ${r.active_users} active${r.people ? ` — ${r.people}` : ""}`);
  }
  console.log("\nTick Progress Claims → View (and Send for whoever sends claims) on the roles that should keep access.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

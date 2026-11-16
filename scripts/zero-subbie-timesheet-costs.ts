/**
 * Subcontractor timesheets that still carry a cost.
 *
 *   npx tsx scripts/zero-subbie-timesheet-costs.ts            # READ ONLY report
 *   npx tsx scripts/zero-subbie-timesheet-costs.ts --apply    # set those costs to $0
 *
 * Why: a subcontractor (users.is_subcontractor) is costed through their PO and
 * bill. Their timesheet should record hours only. The dialog zeroed the
 * timesheet's own total, but cost-code SPLIT rows kept the person's rate and
 * total, and entries from other paths (mobile, import, older versions) could
 * carry a rate too. Those amounts counted as job labour on top of the bill.
 *
 * Saving now forces $0 for subcontractors (server/storage.ts), and the labour
 * rollups skip them, so this only tidies the stored rows. It touches
 * hourly_rate and total on timesheets and timesheet_cost_codes for
 * subcontractor users, and nothing else — hours, status, PO links and dates
 * are left alone. The PO raised from their hours prices them off the PROFILE
 * rate, which this does not touch.
 *
 * Run the report first. --apply runs in one transaction.
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");

  const timesheetRows = await db.execute(sql`
    select t.id, t.date, t.status, t.duration, t.hourly_rate, t.total,
           coalesce(nullif(trim(u.first_name || ' ' || coalesce(u.last_name, '')), ''), 'Unnamed') as who,
           u.company_id
    from timesheets t
    join users u on u.id = t.user_id
    where u.is_subcontractor = true
      and (t.hourly_rate <> 0 or t.total <> 0)
    order by u.company_id, who, t.date`);

  const splitRows = await db.execute(sql`
    select s.id, s.timesheet_id, s.duration, s.hourly_rate, s.total, t.status,
           coalesce(nullif(trim(u.first_name || ' ' || coalesce(u.last_name, '')), ''), 'Unnamed') as who,
           u.company_id
    from timesheet_cost_codes s
    join timesheets t on t.id = s.timesheet_id
    join users u on u.id = t.user_id
    where u.is_subcontractor = true
      and (s.hourly_rate <> 0 or s.total <> 0)
    order by u.company_id, who`);

  const ts = timesheetRows.rows as any[];
  const sp = splitRows.rows as any[];
  const sum = (rows: any[]) => rows.reduce((a, r) => a + Number(r.total || 0), 0);
  const approvedSplitTotal = sum(sp.filter((r) => r.status === "approved"));

  console.log(`Subcontractor timesheets with a rate/total: ${ts.length}  (total $${sum(ts).toFixed(2)})`);
  console.log(`Subcontractor split rows with a rate/total: ${sp.length}  (total $${sum(sp).toFixed(2)}, approved $${approvedSplitTotal.toFixed(2)})`);

  const byPerson = new Map<string, { ts: number; split: number; dollars: number }>();
  for (const r of [...ts.map((r) => ({ ...r, kind: "ts" })), ...sp.map((r) => ({ ...r, kind: "split" }))]) {
    const key = `${r.company_id} · ${r.who}`;
    const e = byPerson.get(key) ?? { ts: 0, split: 0, dollars: 0 };
    if (r.kind === "ts") e.ts++; else e.split++;
    e.dollars += Number(r.total || 0);
    byPerson.set(key, e);
  }
  for (const [k, v] of byPerson) {
    console.log(`  ${k}: ${v.ts} timesheet(s), ${v.split} split row(s), $${v.dollars.toFixed(2)}`);
  }

  if (!apply) {
    console.log("\nREAD ONLY — nothing changed. Re-run with --apply to set these to $0.");
    return;
  }
  if (ts.length === 0 && sp.length === 0) {
    console.log("\nNothing to change.");
    return;
  }

  await db.transaction(async (tx) => {
    const a = await tx.execute(sql`
      update timesheets t set hourly_rate = 0, total = 0, updated_at = now()
      from users u
      where u.id = t.user_id and u.is_subcontractor = true
        and (t.hourly_rate <> 0 or t.total <> 0)`);
    const b = await tx.execute(sql`
      update timesheet_cost_codes s set hourly_rate = 0, total = 0, updated_at = now()
      from timesheets t join users u on u.id = t.user_id
      where t.id = s.timesheet_id and u.is_subcontractor = true
        and (s.hourly_rate <> 0 or s.total <> 0)`);
    console.log(`\nAPPLIED: ${a.rowCount ?? "?"} timesheet(s), ${b.rowCount ?? "?"} split row(s) set to $0.`);
  });
  console.log("Recalculate each affected project's labour hours budget / budget (open the Budget page, or it refreshes on the next timesheet change).");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());

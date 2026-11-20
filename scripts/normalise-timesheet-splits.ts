/**
 * One rate per timesheet — repair stored cost-code splits.
 *
 *   npx tsx scripts/normalise-timesheet-splits.ts            # dry run (default)
 *   npx tsx scripts/normalise-timesheet-splits.ts --apply    # write the fixes
 *
 * DRY RUN WRITES NOTHING, so it is safe to point at production first.
 *
 * What it fixes: split rows (timesheet_cost_codes) used to carry their own
 * typed rate and total, which drifted from the timesheet. Every split is
 * re-stamped with the timesheet's rate, dollars = split hours × that rate, and
 * a single legacy "mirror" row also takes the timesheet's hours. Where the
 * timesheet has no cost code of its own, the mirror's code is copied onto it.
 *
 * Budget effect: none. The cost engine (shared/projectCost.ts) takes the money
 * from the timesheet's own total and only uses splits to share it out, so the
 * figure on every Budget page is the same before and after. The report says
 * where a split's SHARE of a timesheet could move (multi-split rows whose
 * stored dollars were out of proportion to their hours).
 *
 * Also reported, never changed: single mirror rows whose cost code differs
 * from the timesheet's own code. The budget currently files those under the
 * mirror's code; someone should decide which code is right.
 */

import "dotenv/config";
import { db, pool } from "../server/db";
import { timesheets, timesheetCostCodes } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { normalisedSplit, splitNeedsNormalising } from "../shared/timesheetSplits";

const APPLY = process.argv.includes("--apply");

async function main() {
  const host = (process.env.DATABASE_URL || "").match(/@([^/:]+)/)?.[1] ?? "unknown";
  console.log(`Database host: ${host}`);
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY RUN (nothing is written)\n");

  const splits = await db.select().from(timesheetCostCodes);
  const byTs = new Map<string, typeof splits>();
  for (const s of splits) {
    const list = byTs.get(s.timesheetId) ?? [];
    list.push(s);
    byTs.set(s.timesheetId, list);
  }
  const ids = [...byTs.keys()];
  const headers = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const t of await db.select({
      id: timesheets.id, duration: timesheets.duration, hourlyRate: timesheets.hourlyRate,
      total: timesheets.total, costCodeId: timesheets.costCodeId, date: timesheets.date,
    }).from(timesheets).where(inArray(timesheets.id, chunk))) headers.set(t.id, t);
  }

  let rowsToFix = 0, mirrorRows = 0, realSplitTimesheets = 0, shareMoves = 0;
  const codeFromMirror: string[] = [];
  const codeConflicts: Array<{ id: string; date: string; tsCode: string; mirrorCode: string }> = [];
  const worst: Array<{ id: string; date: string; stored: string; want: string }> = [];
  const updates: Array<{ id: string; set: any }> = [];

  for (const [tsId, rows] of byTs) {
    const h = headers.get(tsId);
    if (!h) continue; // orphan split rows (timesheet gone) — left alone
    if (rows.length === 1) {
      mirrorRows++;
      const m = rows[0];
      if (!h.costCodeId && m.costCodeId) codeFromMirror.push(tsId);
      else if (h.costCodeId && m.costCodeId && h.costCodeId !== m.costCodeId) {
        codeConflicts.push({ id: tsId, date: String(h.date).slice(0, 10), tsCode: h.costCodeId, mirrorCode: m.costCodeId });
      }
    } else {
      realSplitTimesheets++;
      // Would this timesheet's per-code SHARE move? (engine shares by dollars)
      const storedDollars = rows.map((r) => Number(r.total) || 0);
      const hours = rows.map((r) => Number(r.duration) || 0);
      const sd = storedDollars.reduce((a, b) => a + b, 0), sh = hours.reduce((a, b) => a + b, 0);
      if (sd > 0 && sh > 0 && rows.some((_, i) => Math.abs(storedDollars[i] / sd - hours[i] / sh) > 0.001)) shareMoves++;
    }
    for (const r of rows) {
      if (!splitNeedsNormalising(h, r, rows.length)) continue;
      rowsToFix++;
      const want = normalisedSplit(h, r, rows.length);
      updates.push({ id: r.id, set: want });
      worst.push({ id: tsId, date: String(h.date).slice(0, 10), stored: `${r.duration}h × $${r.hourlyRate} = $${r.total}`, want: `${want.duration}h × $${want.hourlyRate} = $${want.total}` });
    }
  }

  console.log(`Split rows: ${splits.length} across ${byTs.size} timesheets`);
  console.log(`  single legacy mirror rows: ${mirrorRows}`);
  console.log(`  real splits (2+ rows):     ${realSplitTimesheets}`);
  console.log(`Rows to re-stamp: ${rowsToFix}`);
  console.log(`Timesheets whose cost-code share could move (multi-split only): ${shareMoves}`);
  console.log(`Timesheets with no cost code that take the mirror's code: ${codeFromMirror.length}`);
  console.log(`Mirror code ≠ timesheet code (REPORTED, NOT CHANGED): ${codeConflicts.length}`);
  for (const c of codeConflicts.slice(0, 20)) console.log(`   ${c.date} ts ${c.id.slice(0, 8)} timesheet=${c.tsCode.slice(0, 8)} mirror=${c.mirrorCode.slice(0, 8)}`);
  console.log(`\nSample of rows to re-stamp (up to 25):`);
  for (const w of worst.slice(0, 25)) console.log(`   ${w.date} ts ${w.id.slice(0, 8)}  ${w.stored}  →  ${w.want}`);

  if (!APPLY) {
    console.log(`\nDry run complete. Re-run with --apply to write ${updates.length} row(s) and ${codeFromMirror.length} timesheet code(s).`);
    return;
  }
  for (const u of updates) {
    await db.update(timesheetCostCodes).set({ ...u.set, updatedAt: new Date() }).where(eq(timesheetCostCodes.id, u.id));
  }
  for (const tsId of codeFromMirror) {
    const code = byTs.get(tsId)![0].costCodeId;
    await db.update(timesheets).set({ costCodeId: code }).where(eq(timesheets.id, tsId));
  }
  console.log(`\nApplied: ${updates.length} split row(s) re-stamped, ${codeFromMirror.length} timesheet code(s) filled.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());

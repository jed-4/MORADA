import { db } from "../db";
import { eq, and, or, isNotNull, inArray } from "drizzle-orm";
import { xeroService } from "../services/xeroService";
import {
  overheadMonthActuals,
  overheadItems,
  overheadCategories,
  overheadMonthStatus,
  companyIncomeActuals,
  companyDirectCostActuals,
} from "@shared/schema";

const SAVED_HISTORY_MONTHS = 18;
const XERO_MAX_PERIODS_PER_CALL = 12;

export type RollingMonth = { year: number; month: number };

export function buildRollingWindow(monthCount: number): RollingMonth[] {
  const today = new Date();
  let y = today.getFullYear();
  let m = today.getMonth();
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  const months: RollingMonth[] = [];
  for (let i = 0; i < monthCount; i++) {
    months.unshift({ year: y, month: m });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return months;
}

function chunkWindow(months: RollingMonth[]): RollingMonth[][] {
  const chunks: RollingMonth[][] = [];
  for (let i = 0; i < months.length; i += XERO_MAX_PERIODS_PER_CALL) {
    chunks.push(months.slice(i, i + XERO_MAX_PERIODS_PER_CALL));
  }
  return chunks;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

type PnLResult = Awaited<ReturnType<typeof xeroService.getProfitAndLossReport>>;

function mergePnL(target: PnLResult, src: PnLResult) {
  for (const [code, data] of Object.entries(src.byAccount)) {
    if (!target.byAccount[code]) target.byAccount[code] = { name: data.name, amounts: {} };
    Object.assign(target.byAccount[code].amounts, data.amounts);
  }
  for (const acc of src.accounts) {
    if (!target.accounts.find(a => a.code === acc.code)) target.accounts.push(acc);
  }
  Object.assign(target.incomeTotals, src.incomeTotals);
  Object.assign(target.directCostTotals, src.directCostTotals);
  for (const [name, amounts] of Object.entries(src.incomeByAccount)) {
    if (!target.incomeByAccount[name]) target.incomeByAccount[name] = {};
    Object.assign(target.incomeByAccount[name], amounts);
  }
  for (const [name, amounts] of Object.entries(src.directCostByAccount)) {
    if (!target.directCostByAccount[name]) target.directCostByAccount[name] = {};
    Object.assign(target.directCostByAccount[name], amounts);
  }
}

async function fetchPnLForWindow(connectionId: string, months: RollingMonth[]): Promise<PnLResult> {
  const merged: PnLResult = {
    byAccount: {},
    accounts: [],
    incomeTotals: {},
    directCostTotals: {},
    incomeByAccount: {},
    directCostByAccount: {},
  };
  for (const chunk of chunkWindow(months)) {
    if (!chunk.length) continue;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const fromDate = `${first.year}-${pad2(first.month)}-01`;
    const toDate = `${last.year}-${pad2(last.month)}-${pad2(lastDayOfMonth(last.year, last.month))}`;
    const result = await xeroService.getProfitAndLossReport(connectionId, fromDate, toDate);
    mergePnL(merged, result);
  }
  return merged;
}

export interface SyncResult {
  synced: number;
  drifted: number;
  monthsCovered: number;
}

/**
 * Sync overhead actuals, income totals and direct cost totals from Xero P&L.
 *
 * Behaviour:
 * - Pulls the trailing 18 complete months from Xero (chunked across multiple
 *   API calls because Xero caps a single P&L request at ~12 columns).
 * - Before writing, deletes every actuals row in the window for months that
 *   are NOT confirmed (preserves confirmation status in `overheadMonthStatus`
 *   and lets stale rows from old buggy syncs disappear cleanly).
 * - For confirmed months, overwrites in place and flags drift when the new
 *   value differs from the existing one.
 * - Populates the JSONB `breakdown` columns on income/direct-cost actuals
 *   with per-Xero-account amounts so the UI can render account-level rows.
 * - Skips writing into `overhead_month_actuals` for items whose Xero account
 *   is a DIRECTCOSTS type — those belong in the Direct Costs section only,
 *   never under Overheads.
 */
export async function syncOverheadActualsForCompany(
  companyId: string,
  connectionId: string,
): Promise<SyncResult> {
  const window = buildRollingWindow(SAVED_HISTORY_MONTHS);
  const result = await fetchPnLForWindow(connectionId, window);

  const companyItems = await db
    .select({ id: overheadItems.id, code: overheadItems.xeroAccountCode, type: overheadItems.xeroAccountType })
    .from(overheadItems)
    .innerJoin(overheadCategories, eq(overheadItems.categoryId, overheadCategories.id))
    .where(and(eq(overheadCategories.companyId, companyId), isNotNull(overheadItems.xeroAccountCode)));
  const itemByCode = new Map<string, { id: string; type: string | null }>();
  for (const i of companyItems) {
    if (i.code) itemByCode.set(i.code, { id: i.id, type: i.type });
  }
  const allCompanyItemIds = companyItems.map(i => i.id);

  const confirmedRows = await db
    .select({ year: overheadMonthStatus.year, month: overheadMonthStatus.month })
    .from(overheadMonthStatus)
    .where(and(eq(overheadMonthStatus.companyId, companyId), isNotNull(overheadMonthStatus.confirmedAt)));
  const confirmedSet = new Set(confirmedRows.map(s => `${s.year}__${s.month}`));

  const unconfirmedMonths = window.filter(({ year, month }) => !confirmedSet.has(`${year}__${month}`));

  if (unconfirmedMonths.length > 0) {
    const monthCondition = or(
      ...unconfirmedMonths.map(({ year, month }) =>
        and(eq(companyIncomeActuals.year, year), eq(companyIncomeActuals.month, month)),
      ),
    );
    await db.delete(companyIncomeActuals).where(and(eq(companyIncomeActuals.companyId, companyId), monthCondition));

    const dcCondition = or(
      ...unconfirmedMonths.map(({ year, month }) =>
        and(eq(companyDirectCostActuals.year, year), eq(companyDirectCostActuals.month, month)),
      ),
    );
    await db.delete(companyDirectCostActuals).where(and(eq(companyDirectCostActuals.companyId, companyId), dcCondition));

    if (allCompanyItemIds.length > 0) {
      const ohCondition = or(
        ...unconfirmedMonths.map(({ year, month }) =>
          and(eq(overheadMonthActuals.year, year), eq(overheadMonthActuals.month, month)),
        ),
      );
      await db.delete(overheadMonthActuals).where(and(inArray(overheadMonthActuals.itemId, allCompanyItemIds), ohCondition));
    }
  }

  let synced = 0;
  let drifted = 0;

  // Overhead items — by Xero account code. Skip DIRECTCOSTS-typed items so
  // they don't double-count under both Overheads and Direct Costs.
  for (const [accountCode, accountData] of Object.entries(result.byAccount)) {
    const item = itemByCode.get(accountCode);
    if (!item) continue;
    if (item.type === "DIRECTCOSTS") continue;

    for (const [monthKey, amount] of Object.entries(accountData.amounts)) {
      const [yyyy, mm] = monthKey.split("-").map(Number);
      if (!yyyy || !mm) continue;
      const actualCents = Math.round(amount * 100);
      const isConfirmed = confirmedSet.has(`${yyyy}__${mm}`);

      let hasDrift = false;
      if (isConfirmed) {
        const [existing] = await db
          .select({ actualCents: overheadMonthActuals.actualCents })
          .from(overheadMonthActuals)
          .where(and(eq(overheadMonthActuals.itemId, item.id), eq(overheadMonthActuals.year, yyyy), eq(overheadMonthActuals.month, mm)));
        hasDrift = !!existing && existing.actualCents !== actualCents;
        if (hasDrift) drifted++;
      }

      await db
        .insert(overheadMonthActuals)
        .values({ itemId: item.id, year: yyyy, month: mm, actualCents, xeroImported: true, driftedSinceConfirmed: hasDrift, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [overheadMonthActuals.itemId, overheadMonthActuals.year, overheadMonthActuals.month],
          set: { actualCents, xeroImported: true, driftedSinceConfirmed: hasDrift, updatedAt: new Date() },
        });
      synced++;
    }
  }

  // Income totals + per-account breakdown
  const incomeMonths = Array.from(new Set<string>(Object.keys(result.incomeTotals)));
  for (const monthKey of incomeMonths) {
    const [yyyy, mm] = monthKey.split("-").map(Number);
    if (!yyyy || !mm) continue;
    const amount = result.incomeTotals[monthKey] || 0;
    const incomeCents = Math.round(amount * 100);
    const breakdown: Record<string, number> = {};
    for (const [accountName, monthAmounts] of Object.entries(result.incomeByAccount)) {
      const accountTotal = monthAmounts[monthKey];
      if (accountTotal && accountTotal !== 0) {
        breakdown[accountName] = Math.round(accountTotal * 100);
      }
    }
    await db
      .insert(companyIncomeActuals)
      .values({ companyId, year: yyyy, month: mm, incomeCents, breakdown, xeroImported: true, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [companyIncomeActuals.companyId, companyIncomeActuals.year, companyIncomeActuals.month],
        set: { incomeCents, breakdown, xeroImported: true, updatedAt: new Date() },
      });
  }

  // Direct cost totals + per-account breakdown
  const dcMonths = Array.from(new Set<string>(Object.keys(result.directCostTotals)));
  for (const monthKey of dcMonths) {
    const [yyyy, mm] = monthKey.split("-").map(Number);
    if (!yyyy || !mm) continue;
    const amount = result.directCostTotals[monthKey] || 0;
    const directCostCents = Math.round(amount * 100);
    const breakdown: Record<string, number> = {};
    for (const [accountName, monthAmounts] of Object.entries(result.directCostByAccount)) {
      const accountTotal = monthAmounts[monthKey];
      if (accountTotal && accountTotal !== 0) {
        breakdown[accountName] = Math.round(accountTotal * 100);
      }
    }
    await db
      .insert(companyDirectCostActuals)
      .values({ companyId, year: yyyy, month: mm, directCostCents, breakdown, xeroImported: true, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [companyDirectCostActuals.companyId, companyDirectCostActuals.year, companyDirectCostActuals.month],
        set: { directCostCents, breakdown, xeroImported: true, updatedAt: new Date() },
      });
  }

  return { synced, drifted, monthsCovered: window.length };
}

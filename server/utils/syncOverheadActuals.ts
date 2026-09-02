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
  overheadSyncReconciliation,
} from "@shared/schema";

const SAVED_HISTORY_MONTHS = 18;
const XERO_MAX_PERIODS_PER_CALL = 12;

export type RollingMonth = { year: number; month: number };

// Build a rolling N-month window ending at the CURRENT (in-progress) month.
// Including the current month means the BusinessOverheads "current month"
// column gets refreshed on every sync and any stale current-month rows from
// previous buggy syncs are cleaned up by the unconfirmed-month deletion pass
// in syncOverheadActualsForCompany. With monthCount=18 and today=May 2026,
// this yields Dec 2024 → May 2026 (17 complete + 1 in-progress).
export function buildRollingWindow(monthCount: number): RollingMonth[] {
  const today = new Date();
  let y = today.getFullYear();
  let m = today.getMonth() + 1; // 1-indexed: 1=Jan … 12=Dec
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

function mergeTotals(
  target: Record<string, { income: number; directCosts: number; expenses: number }>,
  src: Record<string, { income: number; directCosts: number; expenses: number }>,
) {
  // Chunks never overlap (they partition the window), so a straight copy is
  // correct — no accumulation, which would double-count on a retry.
  for (const [monthKey, totals] of Object.entries(src)) target[monthKey] = { ...totals };
}

function mergePnL(target: PnLResult, src: PnLResult) {
  for (const [code, data] of Object.entries(src.byAccount)) {
    if (!target.byAccount[code]) target.byAccount[code] = { name: data.name, type: data.type, amounts: {} };
    Object.assign(target.byAccount[code].amounts, data.amounts);
  }
  mergeTotals(target.parsedTotals, src.parsedTotals);
  mergeTotals(target.reportTotals, src.reportTotals);
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
    parsedTotals: {},
    reportTotals: {},
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
  /** Overhead items created because Xero had an account we had never seen. */
  itemsCreated: number;
  /** Months where what we stored disagrees with Xero's own P&L section totals. */
  mismatchedMonths: Array<{ year: number; month: number; incomeDiffCents: number; directCostDiffCents: number; expenseDiffCents: number }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A month is only worth flagging when it is off by more than a rounding cent. */
const RECONCILE_TOLERANCE_CENTS = 1;

/**
 * Sync overhead actuals, income totals and direct cost totals from Xero P&L.
 *
 * Behaviour:
 * - Pulls 18 trailing months from Xero — the in-progress current month plus
 *   the previous 17 complete months — chunked across multiple API calls
 *   (Xero caps a single P&L request at 12 columns).
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
  let itemsCreated = 0;

  // An account Xero reports but we have no overhead item for used to be dropped
  // on the floor here (`if (!item) continue`) — silently, with no row, no log
  // and no total. That is why "Subscriptions - Morada" and "Adv & Mktg -
  // Photography" had money in Xero and nothing at all in Monthly Actuals: the
  // item list is a snapshot taken whenever someone last pressed "Sync accounts",
  // so every account added to Xero since then was invisible.
  //
  // Now we create the missing item on the spot. Guards:
  //  - only for accounts carrying a real Xero code (a UUID key means the account
  //    has no code, so there is no stable upsert key — warn instead of guessing);
  //  - only when the account actually has money in the window, so the ~50
  //    permanently-zero accounts in a typical chart of accounts stay out of the
  //    grid;
  //  - never for DIRECTCOSTS, which belong to the Direct Costs section.
  let overheadsCategoryId: string | null = null;
  const ensureOverheadsCategory = async (): Promise<string> => {
    if (overheadsCategoryId) return overheadsCategoryId;
    const [existing] = await db
      .select({ id: overheadCategories.id })
      .from(overheadCategories)
      .where(and(eq(overheadCategories.companyId, companyId), eq(overheadCategories.name, "Overheads")));
    if (existing) {
      overheadsCategoryId = existing.id;
      return overheadsCategoryId;
    }
    const [created] = await db
      .insert(overheadCategories)
      .values({ companyId, name: "Overheads", sortOrder: 0 })
      .returning();
    overheadsCategoryId = created.id;
    return overheadsCategoryId;
  };

  for (const [accountCode, accountData] of Object.entries(result.byAccount)) {
    let item = itemByCode.get(accountCode);

    if (!item) {
      const hasMoney = Object.values(accountData.amounts).some(v => Math.round(v * 100) !== 0);
      if (!hasMoney) continue;
      if (accountData.type === "DIRECTCOSTS") continue;
      if (UUID_RE.test(accountCode)) {
        console.warn(
          `[OverheadSync] Xero account "${accountData.name}" has activity but no account code — cannot map it to an overhead item. Give it a code in Xero.`,
        );
        continue;
      }
      const categoryId = await ensureOverheadsCategory();
      const [createdItem] = await db
        .insert(overheadItems)
        .values({
          categoryId,
          name: accountData.name || accountCode,
          frequency: "monthly",
          budgetCents: 0,
          xeroAccountCode: accountCode,
          xeroAccountType: accountData.type || "EXPENSE",
          xeroSynced: true,
          notes: null,
          sortOrder: 0,
        })
        .returning();
      item = { id: createdItem.id, type: createdItem.xeroAccountType };
      itemByCode.set(accountCode, item);
      itemsCreated++;
      console.log(
        `[OverheadSync] Created overhead item for previously unmapped Xero account ${accountCode} "${accountData.name}" (company ${companyId})`,
      );
    }

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

  // ── Reconciliation guard ──────────────────────────────────────────────────
  // Everything above writes optimistically, one account-month at a time, and
  // for CONFIRMED months it does not delete first — so a run that dies partway
  // leaves those months frozen at stale values with no drift flag and no signal
  // anywhere. Compare what we now hold against Xero's own P&L section totals and
  // record the difference, so Monthly Actuals can say so out loud.
  const mismatchedMonths = await verifySyncedTotals(companyId, window, result.reportTotals);

  return { synced, drifted, monthsCovered: window.length, itemsCreated, mismatchedMonths };
}

/**
 * Compare stored month totals against Xero's reported section totals and persist
 * the result. Never throws: a reconciliation failure must not fail a sync that
 * otherwise succeeded (and the table may not be migrated yet on this database).
 */
async function verifySyncedTotals(
  companyId: string,
  window: RollingMonth[],
  reportTotals: Record<string, { income: number; directCosts: number; expenses: number }>,
): Promise<SyncResult["mismatchedMonths"]> {
  const mismatched: SyncResult["mismatchedMonths"] = [];
  try {
    const [incomeRows, dcRows, ohRows] = await Promise.all([
      db
        .select({ year: companyIncomeActuals.year, month: companyIncomeActuals.month, cents: companyIncomeActuals.incomeCents })
        .from(companyIncomeActuals)
        .where(eq(companyIncomeActuals.companyId, companyId)),
      db
        .select({ year: companyDirectCostActuals.year, month: companyDirectCostActuals.month, cents: companyDirectCostActuals.directCostCents })
        .from(companyDirectCostActuals)
        .where(eq(companyDirectCostActuals.companyId, companyId)),
      db
        .select({ year: overheadMonthActuals.year, month: overheadMonthActuals.month, cents: overheadMonthActuals.actualCents })
        .from(overheadMonthActuals)
        .innerJoin(overheadItems, eq(overheadMonthActuals.itemId, overheadItems.id))
        .innerJoin(overheadCategories, eq(overheadItems.categoryId, overheadCategories.id))
        .where(eq(overheadCategories.companyId, companyId)),
    ]);

    const key = (y: number, m: number) => `${y}__${m}`;
    const storedIncome = new Map<string, number>();
    for (const r of incomeRows) storedIncome.set(key(r.year, r.month), r.cents);
    const storedDc = new Map<string, number>();
    for (const r of dcRows) storedDc.set(key(r.year, r.month), r.cents);
    const storedOh = new Map<string, number>();
    for (const r of ohRows) storedOh.set(key(r.year, r.month), (storedOh.get(key(r.year, r.month)) || 0) + r.cents);

    for (const { year, month } of window) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      const xero = reportTotals[monthKey];
      // A month absent from the report is itself the failure mode we are hunting
      // (the "missing column" case) — but we cannot tell an absent column from a
      // genuinely empty month, so only reconcile months Xero actually reported.
      if (!xero) continue;

      const xeroIncomeCents = Math.round(xero.income * 100);
      const xeroDirectCostCents = Math.round(xero.directCosts * 100);
      const xeroExpenseCents = Math.round(xero.expenses * 100);
      const storedIncomeCents = storedIncome.get(key(year, month)) || 0;
      const storedDirectCostCents = storedDc.get(key(year, month)) || 0;
      const storedExpenseCents = storedOh.get(key(year, month)) || 0;

      const incomeDiffCents = storedIncomeCents - xeroIncomeCents;
      const directCostDiffCents = storedDirectCostCents - xeroDirectCostCents;
      const expenseDiffCents = storedExpenseCents - xeroExpenseCents;

      await db
        .insert(overheadSyncReconciliation)
        .values({
          companyId, year, month,
          xeroIncomeCents, xeroDirectCostCents, xeroExpenseCents,
          storedIncomeCents, storedDirectCostCents, storedExpenseCents,
          checkedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [overheadSyncReconciliation.companyId, overheadSyncReconciliation.year, overheadSyncReconciliation.month],
          set: {
            xeroIncomeCents, xeroDirectCostCents, xeroExpenseCents,
            storedIncomeCents, storedDirectCostCents, storedExpenseCents,
            checkedAt: new Date(),
          },
        });

      const worst = Math.max(Math.abs(incomeDiffCents), Math.abs(directCostDiffCents), Math.abs(expenseDiffCents));
      if (worst > RECONCILE_TOLERANCE_CENTS) {
        mismatched.push({ year, month, incomeDiffCents, directCostDiffCents, expenseDiffCents });
        console.warn(
          `[OverheadSync] ${monthKey} does not match Xero — income ${incomeDiffCents / 100}, direct costs ${directCostDiffCents / 100}, overheads ${expenseDiffCents / 100} (stored minus Xero, company ${companyId})`,
        );
      }
    }
  } catch (err) {
    console.error("[OverheadSync] Reconciliation check failed (sync itself was unaffected):", err);
  }
  return mismatched;
}

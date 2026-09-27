// Business expenses from the Xero P&L (the register, not Overheads — kept
// separate on purpose). Reads the last 12 COMPLETE months of the P&L — this
// month is part-way and would understate every account — and leaves the
// working-out to shared/cashflow/pnlImport so it's tested without Xero.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { xeroService } from "./xeroService";
import { businessExpenses } from "@shared/schema";
import {
  addMonths,
  coverage,
  groupFor,
  gstApplies,
  monthStart,
  proposeFromPnl,
  type DateKey,
  type Frequency,
  type PnlAccount,
  type PnlProposal,
  yearExOf,
} from "@shared/cashflow";
import { incGstFromEx } from "@shared/money";

export class PnlImportError extends Error {}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; accounts: PnlAccount[]; fromMonth: string; toMonth: string }>();

/** The last 12 complete months, oldest first, as 'YYYY-MM'. */
export function lastTwelveMonths(today: DateKey): string[] {
  const thisMonth = monthStart(today);
  return Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 12).slice(0, 7));
}

async function loadPnlAccounts(companyId: string, today: DateKey, fresh = false) {
  const hit = cache.get(companyId);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit;

  const connection = await storage.getXeroConnectionByCompanyId(companyId);
  if (!connection) throw new PnlImportError("Xero isn't connected");

  const months = lastTwelveMonths(today);
  const toMonth = months[11];
  const [y, m] = toMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [report, chart] = await Promise.all([
    xeroService.getProfitAndLossReport(connection.id, `${months[0]}-01`, `${toMonth}-${String(lastDay).padStart(2, "0")}`),
    xeroService.getAccounts(connection.id, { types: ["EXPENSE", "OVERHEADS", "DIRECTCOSTS", "DEPRECIATN"] }),
  ]);
  const taxByCode = new Map<string, string>();
  for (const a of chart) if (a.Code) taxByCode.set(String(a.Code).trim(), a.TaxType ?? null);

  const accounts: PnlAccount[] = Object.entries(report.byAccount).map(([code, a]) => ({
    code,
    name: a.name,
    type: a.type,
    taxType: taxByCode.get(code) ?? null,
    months,
    // The report is in dollars, ex GST.
    monthlyExCents: months.map((mk) => Math.round((a.amounts[mk] ?? 0) * 100)),
  }));
  const entry = { at: Date.now(), accounts, fromMonth: months[0], toMonth };
  cache.set(companyId, entry);
  return entry;
}

async function registerLines(companyId: string) {
  return db
    .select({
      xeroAccountCode: businessExpenses.xeroAccountCode,
      amountCents: businessExpenses.amountCents,
      hasGst: businessExpenses.hasGst,
      frequency: businessExpenses.frequency,
      isActive: businessExpenses.isActive,
    })
    .from(businessExpenses)
    .where(eq(businessExpenses.companyId, companyId));
}

export interface PnlOverview {
  xeroConnected: boolean;
  fromMonth?: string;
  toMonth?: string;
  /** Accounts not in the register yet, ready to import. */
  proposals: PnlProposal[];
  excluded: { accountCode: string; accountName: string; yearExCents: number; reason: string }[];
  coverage?: ReturnType<typeof coverage> & { notOnPnlYearExCents: number };
  error?: string;
}

/** What the P&L proposes, and how much of it the register accounts for. */
export async function getPnlOverview(companyId: string, today: DateKey, fresh = false): Promise<PnlOverview> {
  const connection = await storage.getXeroConnectionByCompanyId(companyId);
  if (!connection) return { xeroConnected: false, proposals: [], excluded: [] };
  try {
    const [{ accounts, fromMonth, toMonth }, lines] = await Promise.all([loadPnlAccounts(companyId, today, fresh), registerLines(companyId)]);
    const { proposals, excluded } = proposeFromPnl(accounts, today);
    const imported = new Set(lines.map((l) => l.xeroAccountCode).filter(Boolean));
    const cov = coverage(proposals, lines.map((l) => ({ ...l, frequency: l.frequency as Frequency })));
    const notOnPnlYearExCents = lines
      .filter((l) => !l.xeroAccountCode)
      .reduce((s, l) => s + yearExOf({ ...l, frequency: l.frequency as Frequency }), 0);
    return {
      xeroConnected: true,
      fromMonth,
      toMonth,
      proposals: proposals.filter((p) => !imported.has(p.accountCode)),
      excluded,
      coverage: { ...cov, notOnPnlYearExCents },
    };
  } catch (err: any) {
    if (err instanceof PnlImportError) return { xeroConnected: true, proposals: [], excluded: [], error: err.message };
    console.error("[pnl-expenses] read failed:", err?.message ?? err);
    return { xeroConnected: true, proposals: [], excluded: [], error: "Couldn't read the P&L from Xero." };
  }
}

/**
 * Adds the chosen accounts to the register. Worked out again here from Xero,
 * never from amounts the browser sends; accounts already in the register are
 * skipped, so importing twice is harmless.
 */
export async function importFromPnl(companyId: string, today: DateKey, accountCodes: string[]): Promise<number> {
  const { accounts } = await loadPnlAccounts(companyId, today);
  const { proposals } = proposeFromPnl(accounts, today);
  const lines = await registerLines(companyId);
  const imported = new Set(lines.map((l) => l.xeroAccountCode).filter(Boolean));
  const wanted = new Set(accountCodes);
  const chosen = proposals.filter((p) => wanted.has(p.accountCode) && !imported.has(p.accountCode));
  if (chosen.length === 0) return 0;
  await db.insert(businessExpenses).values(
    chosen.map((p, i) => ({
      companyId,
      name: p.name,
      category: p.category,
      amountCents: p.amountCents,
      hasGst: p.hasGst,
      frequency: p.frequency,
      nextDate: p.nextDate,
      source: "pnl",
      xeroAccountCode: p.accountCode,
      notes: `From the Xero P&L (${p.accountCode} ${p.accountName}): ${p.pattern.toLowerCase()}.`,
      sortOrder: i,
    })),
  );
  return chosen.length;
}

/**
 * The part of an account the register doesn't cover yet, as one monthly line
 * ("Other Subscriptions"), so the register adds up to the P&L.
 */
export async function addRemainder(companyId: string, today: DateKey, accountCode: string): Promise<boolean> {
  const overview = await getPnlOverview(companyId, today);
  const acc = overview.coverage?.accounts.find((a) => a.accountCode === accountCode);
  if (!acc || acc.gapYearExCents <= 0) return false;
  const { accounts } = await loadPnlAccounts(companyId, today);
  const source = accounts.find((a) => a.code === accountCode);
  const hasGst = gstApplies(source?.taxType ?? null);
  const monthlyEx = Math.round(acc.gapYearExCents / 12);
  const [existing] = await db
    .select({ id: businessExpenses.id, amountCents: businessExpenses.amountCents })
    .from(businessExpenses)
    .where(and(eq(businessExpenses.companyId, companyId), eq(businessExpenses.xeroAccountCode, accountCode), eq(businessExpenses.source, "pnl_remainder")))
    .limit(1);
  const values = {
    name: `Other ${acc.accountName.toLowerCase()}`,
    category: groupFor(acc.accountName),
    amountCents: hasGst ? incGstFromEx(monthlyEx) : monthlyEx,
    hasGst,
    frequency: "monthly" as const,
    nextDate: addMonths(monthStart(today), 1).slice(0, 8) + "15",
    updatedAt: new Date(),
  };
  if (existing) {
    // Topping up the one remainder line rather than adding another: the gap
    // is what's still missing ON TOP of what it already covers.
    await db
      .update(businessExpenses)
      .set({ ...values, amountCents: existing.amountCents + values.amountCents })
      .where(and(eq(businessExpenses.id, existing.id), eq(businessExpenses.companyId, companyId)));
  } else {
    await db.insert(businessExpenses).values({
      ...values,
      companyId,
      source: "pnl_remainder",
      xeroAccountCode: accountCode,
      notes: `The part of ${accountCode} ${acc.accountName} not covered by other lines — averaged from the last 12 months of the P&L.`,
    });
  }
  return true;
}

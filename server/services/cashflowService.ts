// Loads one company's data into a ForecastInput for the cashflow engine
// (shared/cashflow). All the business rules about WHICH rows count live here;
// the arithmetic lives in the engine.
//
// Every query is company-scoped and they all run at once: Neon is ~400 ms a
// round trip from Australia, so nothing is queried per job in a loop.

import { and, asc, desc, eq, inArray, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { xeroService } from "./xeroService";
import {
  bills,
  billPayments,
  budgetLineItems,
  budgets,
  businessExpenses,
  cashflowSettings,
  clientInvoicePayments,
  clientInvoices,
  contacts,
  projectCashflowManual,
  projectCashflowSettings,
  projectClaimStages,
  proposalPaymentMilestones,
  proposals,
  scheduleItems,
  projects,
  purchaseOrderItems,
  purchaseOrders,
  schedules,
  timesheetCostCodes,
  timesheets,
  users,
  variations,
  whatIfLines,
  whatIfs,
  type CashflowSettings,
} from "@shared/schema";
import {
  addDays,
  basPeriodFor,
  buildForecast,
  expandWhatIf,
  jobBaseValue,
  jobDateWindow,
  assembleJobCostInputs,
  planJobCosts,
  type JobCostData,
  toDateKey,
  type BillInput,
  type CashflowJobRow,
  type ClaimScheduleItem,
  type CostChunk,
  type ClaimStageInput,
  type ResolvedClaimStage,
  type StageRow,
  claimedPercentOf,
  resolveClaimStages,
  suggestScheduleItem,
  type OpeningBalance,
  type DateKey,
  type ExpenseInput,
  type ForecastInput,
  type ForecastResult,
  type Frequency,
  type InvoiceInput,
  type JobInput,
  type JobMode,
  type JobPhase,
  type PeriodGranularity,
  type WhatIfDefinition,
  type WhatIfLine,
  type WhatIfTemplate,
} from "@shared/cashflow";
import { dollarsToCents, exGstFromInc, incGstFromEx } from "@shared/money";
import { frozenContractTotalFrom, isApprovedVariationStatus } from "@shared/projectMetrics";
import { invoiceBalanceCents, isIssuedInvoice } from "@shared/invoiceMetrics";

const FORECAST_PHASES: JobPhase[] = ["lead", "pre_construction", "construction"];

export const CASHFLOW_SETTINGS_DEFAULTS: Omit<CashflowSettings, "companyId" | "updatedAt"> = {
  bufferCents: 5_000_000,
  clientPayDays: 14,
  supplierPayDays: 30,
  defaultMarginPercent: 20,
  defaultPeriod: "month",
  fortnightAnchor: null,
  bankAccountIds: null,
  manualOpeningBalanceCents: null,
  gstBasis: "cash",
  basFrequency: "quarterly",
  basViaAgent: false,
};

export async function getCashflowSettings(companyId: string): Promise<CashflowSettings> {
  const [row] = await db.select().from(cashflowSettings).where(eq(cashflowSettings.companyId, companyId)).limit(1);
  return row ?? { companyId, updatedAt: new Date(0), ...CASHFLOW_SETTINGS_DEFAULTS };
}

// ── Opening balance ─────────────────────────────────────────────────────────

const BALANCE_TTL_MS = 5 * 60 * 1000;
const balanceCache = new Map<string, { value: Awaited<ReturnType<typeof xeroService.getBankAccountBalances>>; expiresAt: number; fetchedAt: string }>();

export function clearCashflowBalanceCache(companyId: string): void {
  balanceCache.delete(companyId);
}

/**
 * Today's bank balance. A balance typed in by hand wins — it's how you correct
 * Xero when the bank feed is behind — until "Sync from Xero" clears it.
 * Without a typed balance, Xero supplies it when connected.
 */
export async function getOpeningBalance(companyId: string, settings: CashflowSettings): Promise<OpeningBalance> {
  const connection = await storage.getXeroConnectionByCompanyId(companyId);
  const xeroConnected = !!connection;

  if (settings.manualOpeningBalanceCents != null || !connection) {
    return {
      cents: settings.manualOpeningBalanceCents,
      source: settings.manualOpeningBalanceCents == null ? null : "manual",
      accounts: [],
      xeroConnected,
    };
  }

  try {
    let hit = balanceCache.get(companyId);
    if (!hit || hit.expiresAt <= Date.now()) {
      hit = {
        value: await xeroService.getBankAccountBalances(connection.id),
        expiresAt: Date.now() + BALANCE_TTL_MS,
        fetchedAt: new Date().toISOString(),
      };
      balanceCache.set(companyId, hit);
    }
    const chosen = settings.bankAccountIds && settings.bankAccountIds.length > 0 ? new Set(settings.bankAccountIds) : null;
    const accounts = hit.value.map((a) => ({
      id: a.accountId,
      name: a.name,
      balanceCents: dollarsToCents(a.xeroBalance),
      included: chosen ? chosen.has(a.accountId) : true,
    }));
    return {
      cents: accounts.filter((a) => a.included).reduce((s, a) => s + a.balanceCents, 0),
      source: "xero",
      accounts,
      xeroConnected,
      fetchedAt: hit.fetchedAt,
    };
  } catch (err: any) {
    console.error("[cashflow] Xero bank balance failed:", err?.message ?? err);
    return { cents: null, source: null, accounts: [], xeroConnected, error: "Couldn't read the bank balance from Xero." };
  }
}

// ── Jobs register ───────────────────────────────────────────────────────────


export interface CashflowLoad {
  input: ForecastInput;
  settings: CashflowSettings;
  opening: OpeningBalance;
  jobs: CashflowJobRow[];
  whatIfs: WhatIfDefinition[];
}

/** The BAS periods whose GST hasn't been paid yet: this one, and last one if it isn't due yet. */
function openBasWindowStart(today: DateKey, settings: CashflowSettings): DateKey {
  const freq = settings.basFrequency === "monthly" ? "monthly" : "quarterly";
  const current = basPeriodFor(today, freq, settings.basViaAgent);
  const previous = basPeriodFor(addDays(current.start, -1), freq, settings.basViaAgent);
  return previous.due >= today ? previous.start : current.start;
}

function stageRowsQuery(where: SQL | undefined) {
  return db
    .select({
      id: projectClaimStages.id,
      projectId: projectClaimStages.projectId,
      name: projectClaimStages.name,
      percent: projectClaimStages.percent,
      amountCents: projectClaimStages.amountCents,
      scheduleItemId: projectClaimStages.scheduleItemId,
      plannedDate: projectClaimStages.plannedDate,
      itemName: scheduleItems.name,
      itemEnd: scheduleItems.endDate,
      itemActualEnd: scheduleItems.actualEndDate,
    })
    .from(projectClaimStages)
    .leftJoin(scheduleItems, eq(projectClaimStages.scheduleItemId, scheduleItems.id))
    .where(where)
    .orderBy(asc(projectClaimStages.sortOrder));
}

// ── Job costs inputs ────────────────────────────────────────────────────────

/** PO statuses whose unbilled value is committed (COMMITTED_COST_PLAN.md §4a). */
const NOT_COMMITTED_PO_STATUSES = ["draft", "pending_approval", "cancelled", "paid"] as const;

/**
 * Everything planJobCosts needs, per project, in one round of parallel
 * company-scoped queries.
 *
 * Budget and billed figures come from budget_line_items — what the Budget
 * page shows, as of its last recalculation (every bill change triggers one).
 */
export async function loadJobCostInputs(companyId: string): Promise<Map<string, JobCostData>> {
  const [lineRows, poRows, poItemRows, linkedBillRows, labourRows, splitRows, awaitingRows, itemRows] = await Promise.all([
    db
      .select({
        projectId: budgets.projectId,
        costCodeId: budgetLineItems.costCodeId,
        title: budgetLineItems.costCodeTitle,
        budgeted: budgetLineItems.budgetedAmount,
        actual: budgetLineItems.actualAmount,
      })
      .from(budgetLineItems)
      .innerJoin(budgets, eq(budgetLineItems.budgetId, budgets.id))
      .innerJoin(projects, eq(budgets.projectId, projects.id))
      .where(eq(projects.companyId, companyId)),
    db
      .select({
        id: purchaseOrders.id,
        projectId: purchaseOrders.projectId,
        poNumber: purchaseOrders.poNumber,
        supplierName: purchaseOrders.supplierName,
        requiredByDate: purchaseOrders.requiredByDate,
        total: purchaseOrders.total,
        gstAmount: purchaseOrders.gstAmount,
      })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.companyId, companyId), notInArray(purchaseOrders.status, [...NOT_COMMITTED_PO_STATUSES]))),
    db
      .select({
        purchaseOrderId: purchaseOrderItems.purchaseOrderId,
        costCodeId: purchaseOrderItems.costCodeId,
        total: purchaseOrderItems.total,
        gstAmount: purchaseOrderItems.gstAmount,
        gstMode: purchaseOrders.gstMode,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrderItems.purchaseOrderId, purchaseOrders.id))
      .where(and(eq(purchaseOrders.companyId, companyId), notInArray(purchaseOrders.status, [...NOT_COMMITTED_PO_STATUSES]))),
    db
      .select({ poId: bills.matchedSitePOId, total: bills.total, tax: bills.tax, billType: bills.billType })
      .from(bills)
      .where(and(eq(bills.companyId, companyId), sql`${bills.matchedSitePOId} is not null`)),
    // Employee labour (subcontractors are paid through POs and bills).
    db
      .select({ id: timesheets.id, projectId: timesheets.projectId, costCodeId: timesheets.costCodeId, total: timesheets.total })
      .from(timesheets)
      .innerJoin(projects, eq(timesheets.projectId, projects.id))
      .where(and(eq(projects.companyId, companyId), eq(timesheets.status, "approved"), sql`${timesheets.poStatus} is null`)),
    db
      .select({ timesheetId: timesheetCostCodes.timesheetId, costCodeId: timesheetCostCodes.costCodeId, total: timesheetCostCodes.total })
      .from(timesheetCostCodes)
      .innerJoin(timesheets, eq(timesheetCostCodes.timesheetId, timesheets.id))
      .innerJoin(projects, eq(timesheets.projectId, projects.id))
      .where(and(eq(projects.companyId, companyId), eq(timesheets.status, "approved"), sql`${timesheets.poStatus} is null`)),
    // Subbie hours approved but not on a PO yet: hours × the subbie's profile rate.
    db
      .select({ projectId: timesheets.projectId, duration: timesheets.duration, rate: users.hourlyRate })
      .from(timesheets)
      .innerJoin(projects, eq(timesheets.projectId, projects.id))
      .innerJoin(users, eq(timesheets.userId, users.id))
      .where(and(eq(projects.companyId, companyId), eq(timesheets.status, "approved"), eq(timesheets.poStatus, "awaiting_po"))),
    db
      .select({
        projectId: schedules.projectId,
        costCodeId: scheduleItems.costCodeId,
        startDate: scheduleItems.startDate,
        endDate: scheduleItems.endDate,
        status: scheduleItems.status,
      })
      .from(scheduleItems)
      .innerJoin(schedules, eq(scheduleItems.scheduleId, schedules.id))
      .innerJoin(projects, eq(schedules.projectId, projects.id))
      .where(and(eq(projects.companyId, companyId), eq(schedules.isArchived, false), sql`${scheduleItems.costCodeId} is not null`)),
  ]);

  return assembleJobCostInputs({ lineRows, poRows, poItemRows, linkedBillRows, labourRows, splitRows, awaitingRows, itemRows });
}

/** Every what-if with its hand-added lines, in display order. */
export async function loadWhatIfs(companyId: string): Promise<WhatIfDefinition[]> {
  const [rows, lines] = await Promise.all([
    db.select().from(whatIfs).where(eq(whatIfs.companyId, companyId)).orderBy(whatIfs.sortOrder, whatIfs.createdAt),
    db.select().from(whatIfLines).where(eq(whatIfLines.companyId, companyId)).orderBy(whatIfLines.sortOrder),
  ]);
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    template: w.template as WhatIfTemplate,
    isEnabled: w.isEnabled,
    params: (w.params ?? {}) as WhatIfDefinition["params"],
    lines: lines
      .filter((l) => l.whatIfId === w.id)
      .map(
        (l): WhatIfLine => ({
          name: l.name,
          direction: l.direction === "in" ? "in" : "out",
          amountCents: l.amountCents,
          hasGst: l.hasGst,
          frequency: l.frequency as Frequency,
          startDate: l.startDate,
          endDate: l.endDate,
        }),
      ),
  }));
}

export async function loadCashflow(
  companyId: string,
  opts: { today: DateKey; granularity?: PeriodGranularity; periodCount?: number },
): Promise<CashflowLoad> {
  const settings = await getCashflowSettings(companyId);
  const granularity: PeriodGranularity =
    opts.granularity ?? (settings.defaultPeriod === "fortnight" ? "fortnight" : "month");
  const periodCount = opts.periodCount ?? (granularity === "fortnight" ? 26 : 12);
  const today = opts.today;
  const gstFrom = openBasWindowStart(today, settings);

  const [
    projectRows,
    jobSettingsRows,
    manualRows,
    invoiceRows,
    variationRows,
    billRows,
    costInputs,
    scheduleRows,
    expenseRows,
    invoicePaymentRows,
    billPaymentRows,
    opening,
    whatIfDefs,
    stageRows,
  ] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        jobNumber: projects.jobNumber,
        phase: projects.currentSystemPhase,
        contractPrice: projects.contractPrice,
        contractCost: projects.contractCost,
        clientBudget: projects.clientBudget,
        contractedAt: projects.contractedAt,
        contractedTotalExGstCents: projects.contractedTotalExGstCents,
        contractedTotalIncGstCents: projects.contractedTotalIncGstCents,
        startDate: projects.startDate,
        endDate: projects.endDate,
        proposedStartDate: projects.proposedStartDate,
        proposedEndDate: projects.proposedEndDate,
      })
      .from(projects)
      .where(
        and(
          eq(projects.companyId, companyId),
          eq(projects.isArchived, false),
          eq(projects.isBusiness, false),
          inArray(projects.currentSystemPhase, FORECAST_PHASES),
        ),
      ),
    db.select().from(projectCashflowSettings).where(eq(projectCashflowSettings.companyId, companyId)),
    db.select().from(projectCashflowManual).where(eq(projectCashflowManual.companyId, companyId)),
    // Invoices are scoped through their project: client_invoices.company_id is
    // null on legacy rows.
    db
      .select({
        id: clientInvoices.id,
        projectId: clientInvoices.projectId,
        projectName: projects.name,
        invoiceNumber: clientInvoices.invoiceNumber,
        status: clientInvoices.status,
        invoiceDate: clientInvoices.invoiceDate,
        dueDate: clientInvoices.dueDate,
        totalAmount: clientInvoices.totalAmount,
        gstAmount: clientInvoices.gstAmount,
        paidAmount: clientInvoices.paidAmount,
        balanceAmount: clientInvoices.balanceAmount,
        contractClaimRows: clientInvoices.contractClaimRows,
      })
      .from(clientInvoices)
      .innerJoin(projects, eq(clientInvoices.projectId, projects.id))
      .where(and(eq(projects.companyId, companyId), ne(clientInvoices.status, "draft"), ne(clientInvoices.status, "cancelled"))),
    db
      .select({ projectId: variations.projectId, status: variations.status, totalAmount: variations.totalAmount })
      .from(variations)
      .innerJoin(projects, eq(variations.projectId, projects.id))
      .where(eq(projects.companyId, companyId)),
    // Bills with money still to move.
    db
      .select({
        id: bills.id,
        projectId: bills.projectId,
        billNumber: bills.billNumber,
        billReference: bills.billReference,
        supplierName: contacts.name,
        billType: bills.billType,
        billDate: bills.billDate,
        dueDate: bills.dueDate,
        total: bills.total,
        tax: bills.tax,
        paidAmount: bills.paidAmount,
      })
      .from(bills)
      .leftJoin(contacts, eq(bills.supplierId, contacts.id))
      .where(and(eq(bills.companyId, companyId), ne(bills.status, "paid"))),
    loadJobCostInputs(companyId),
    db
      .select({
        projectId: schedules.projectId,
        category: schedules.scheduleCategory,
        startDate: schedules.startDate,
        endDate: schedules.endDate,
      })
      .from(schedules)
      .innerJoin(projects, eq(schedules.projectId, projects.id))
      .where(and(eq(projects.companyId, companyId), eq(schedules.isArchived, false))),
    db
      .select()
      .from(businessExpenses)
      .where(and(eq(businessExpenses.companyId, companyId), eq(businessExpenses.isActive, true))),
    // GST already collected in BAS periods not yet paid.
    db
      .select({
        amount: clientInvoicePayments.amount,
        paymentDate: clientInvoicePayments.paymentDate,
        totalAmount: clientInvoices.totalAmount,
        gstAmount: clientInvoices.gstAmount,
      })
      .from(clientInvoicePayments)
      .innerJoin(clientInvoices, eq(clientInvoicePayments.invoiceId, clientInvoices.id))
      .innerJoin(projects, eq(clientInvoices.projectId, projects.id))
      .where(
        and(
          eq(projects.companyId, companyId),
          eq(clientInvoicePayments.isVoided, false),
          sql`${clientInvoicePayments.paymentDate} >= ${gstFrom}::date - interval '1 day'`,
        ),
      ),
    // … and GST already paid to suppliers in them.
    db
      .select({
        amount: billPayments.amount,
        paymentDate: billPayments.paymentDate,
        total: bills.total,
        tax: bills.tax,
        billType: bills.billType,
      })
      .from(billPayments)
      .innerJoin(bills, eq(billPayments.billId, bills.id))
      .where(
        and(
          eq(bills.companyId, companyId),
          eq(billPayments.isVoided, false),
          sql`${billPayments.paymentDate} >= ${gstFrom}::date - interval '1 day'`,
        ),
      ),
    getOpeningBalance(companyId, settings),
    loadWhatIfs(companyId),
    stageRowsQuery(eq(projectClaimStages.companyId, companyId)),
  ]);

  // ── Per-job aggregates ─────────────────────────────────────────────────────
  const invoicedByProject = new Map<string, number>();
  const claimedPctByProject = new Map<string, number>();
  for (const inv of invoiceRows) {
    if (!isIssuedInvoice(inv.status)) continue;
    invoicedByProject.set(inv.projectId, (invoicedByProject.get(inv.projectId) ?? 0) + (inv.totalAmount || 0));
    claimedPctByProject.set(inv.projectId, (claimedPctByProject.get(inv.projectId) ?? 0) + claimedPercentOf(inv.contractClaimRows));
  }
  const stagesByProject = new Map<string, StageRow[]>();
  for (const st of stageRows) {
    const list = stagesByProject.get(st.projectId) ?? [];
    list.push(st);
    stagesByProject.set(st.projectId, list);
  }
  const variationsByProject = new Map<string, number>();
  for (const v of variationRows) {
    if (!isApprovedVariationStatus(v.status)) continue;
    variationsByProject.set(v.projectId, (variationsByProject.get(v.projectId) ?? 0) + (Number(v.totalAmount) || 0));
  }
  const jobSettings = new Map(jobSettingsRows.map((r) => [r.projectId, r]));

  // Construction schedule dates win over pre-construction, which win over
  // the dates typed on the project.
  const scheduleDates = new Map<string, { start: DateKey | null; end: DateKey | null; rank: number }>();
  for (const s of scheduleRows) {
    const rank = s.category === "construction" ? 2 : 1;
    const start = toDateKey(s.startDate);
    const end = toDateKey(s.endDate);
    const prev = scheduleDates.get(s.projectId);
    if (!prev || rank > prev.rank) {
      scheduleDates.set(s.projectId, { start, end, rank });
    } else if (rank === prev.rank) {
      if (start && (!prev.start || start < prev.start)) prev.start = start;
      if (end && (!prev.end || end > prev.end)) prev.end = end;
    }
  }

  const manualByProject = new Map<string, { month: DateKey; amountCents: number }[]>();
  for (const m of manualRows) {
    const list = manualByProject.get(m.projectId) ?? [];
    list.push({ month: m.month, amountCents: m.amountCents });
    manualByProject.set(m.projectId, list);
  }

  const jobRows: CashflowJobRow[] = [];
  const claimStagesByProject = new Map<string, ClaimStageInput[]>();
  const costChunksByProject = new Map<string, CostChunk[]>();
  for (const p of projectRows) {
    const phase = (p.phase ?? "lead") as JobPhase;
    const ps = jobSettings.get(p.id);
    const included = ps?.included ?? phase !== "lead";

    const value = jobBaseValue(p, frozenContractTotalFrom(p)?.incGstCents, phase, ps?.forecastValueCents);
    const baseContract = value.cents;
    const contractCents = baseContract + (variationsByProject.get(p.id) ?? 0);
    const invoicedCents = invoicedByProject.get(p.id) ?? 0;
    const remainingToClaimCents = Math.max(0, contractCents - invoicedCents);

    const stages = resolveClaimStages(
      stagesByProject.get(p.id) ?? [],
      baseContract,
      claimedPctByProject.get(p.id) ?? 0,
      invoicedCents,
    );

    // The builder's forecast dates win; then the schedule; then the project's own dates.
    const sched = scheduleDates.get(p.id);
    const projStart = toDateKey(p.proposedStartDate) ?? toDateKey(p.startDate);
    const projEnd = toDateKey(p.proposedEndDate) ?? toDateKey(p.endDate);
    const startDate = ps?.forecastStart ?? sched?.start ?? projStart;
    const endDate = ps?.forecastEnd ?? sched?.end ?? projEnd;
    const dateSource: CashflowJobRow["dateSource"] =
      ps?.forecastStart || ps?.forecastEnd ? "forecast" : sched?.start || sched?.end ? "schedule" : projStart || projEnd ? "project" : "none";

    // Costs to come: from the budget, bills, labour, open POs and the
    // schedule when the job has a budget; otherwise estimated from margin.
    const costData = costInputs.get(p.id);
    let costBasis: "budget" | "margin" = "margin";
    let remainingCostCents: number;
    let committedCents = 0;
    if (costData && costData.budgetLines.some((l) => l.budgetedExCents > 0)) {
      const w = jobDateWindow(startDate, endDate, today);
      const plan = planJobCosts({
        ...costData,
        today,
        supplierPayDays: settings.supplierPayDays,
        jobName: p.name,
        window: { from: w.from, to: w.to },
      });
      costBasis = "budget";
      remainingCostCents = plan.totalIncCents;
      committedCents = plan.committedIncCents;
      costChunksByProject.set(p.id, plan.chunks);
    } else {
      remainingCostCents = incGstFromEx(
        Math.round(exGstFromInc(remainingToClaimCents) * (1 - settings.defaultMarginPercent / 100)),
      );
    }

    jobRows.push({
      projectId: p.id,
      name: p.name,
      jobNumber: p.jobNumber,
      phase,
      included,
      customised: !!ps,
      mode: (ps?.mode as JobMode) ?? (stages.length > 0 ? "claims" : "even"),
      winPercent: ps?.winPercent ?? (phase === "lead" ? 50 : 100),
      clientPayDays: ps?.clientPayDays ?? settings.clientPayDays,
      clientPayDaysOverride: ps?.clientPayDays ?? null,
      contractCents,
      invoicedCents,
      remainingToClaimCents,
      remainingCostCents,
      committedCents,
      costBasis,
      startDate,
      endDate,
      valueSource: value.source,
      dateSource,
      forecastValueCents: ps?.forecastValueCents ?? null,
      forecastStart: (ps?.forecastStart as DateKey | null) ?? null,
      forecastEnd: (ps?.forecastEnd as DateKey | null) ?? null,
      manualAmounts: manualByProject.get(p.id) ?? [],
      claimStageCount: stages.length,
      unlinkedClaimStageCount: stages.filter((st) => st.state !== "claimed" && !st.date).length,
    });
    claimStagesByProject.set(
      p.id,
      stages
        .filter((st) => st.unclaimedCents > 0)
        .map((st): ClaimStageInput => ({ id: st.id, name: st.name, amountCents: st.unclaimedCents, date: st.date })),
    );
  }

  const jobs: JobInput[] = jobRows
    .filter((j) => j.included)
    .map((j) => ({
      projectId: j.projectId,
      name: j.name,
      phase: j.phase,
      mode: j.mode,
      winPercent: j.winPercent,
      clientPayDays: j.clientPayDays,
      remainingToClaimCents: j.remainingToClaimCents,
      remainingCostCents: j.remainingCostCents,
      costBasis: j.costBasis,
      startDate: j.startDate,
      endDate: j.endDate,
      manualAmounts: j.manualAmounts,
      claimStages: claimStagesByProject.get(j.projectId),
      costChunks: costChunksByProject.get(j.projectId),
    }));

  // ── Money already owed either way ─────────────────────────────────────────
  // Receivables count whether or not the job is ticked: the money is owed.
  const invoices: InvoiceInput[] = [];
  for (const inv of invoiceRows) {
    if (!isIssuedInvoice(inv.status) || inv.status === "paid") continue;
    // balance_amount is NOT NULL DEFAULT 0, so a row that never had it
    // written reads as "nothing owed". An unpaid invoice with a zero balance
    // falls back to total − paid.
    const balance = invoiceBalanceCents(inv) || (inv.totalAmount || 0) - (inv.paidAmount || 0);
    if (balance <= 0) continue;
    invoices.push({
      id: inv.id,
      projectId: inv.projectId,
      projectName: inv.projectName,
      label: inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : "Invoice",
      balanceCents: balance,
      gstRatio: inv.totalAmount ? (inv.gstAmount || 0) / inv.totalAmount : 0,
      dueDate: toDateKey(inv.dueDate),
      invoiceDate: toDateKey(inv.invoiceDate) ?? today,
    });
  }

  const billInputs: BillInput[] = [];
  for (const b of billRows) {
    const outstanding = (b.total || 0) - (b.paidAmount || 0);
    if (outstanding === 0) continue;
    const sign = b.billType === "credit" ? -1 : 1;
    const who = b.supplierName ?? "Supplier";
    billInputs.push({
      id: b.id,
      projectId: b.projectId,
      label: `${who} — ${b.billReference || b.billNumber}`,
      balanceCents: sign * outstanding,
      gstRatio: b.total ? (b.tax || 0) / b.total : 0,
      dueDate: toDateKey(b.dueDate),
      billDate: toDateKey(b.billDate) ?? today,
    });
  }

  const expenses: ExpenseInput[] = expenseRows.map((e) => ({
    id: e.id,
    name: e.name,
    amountCents: e.amountCents,
    hasGst: e.hasGst,
    frequency: e.frequency as Frequency,
    nextDate: e.nextDate,
    endDate: e.endDate,
  }));

  // GST that moved before today in periods the ATO hasn't been paid for.
  const basFreq = settings.basFrequency === "monthly" ? "monthly" : "quarterly";
  const openPeriodGstCents: Record<string, number> = {};
  const addGst = (date: DateKey | null, gst: number) => {
    if (!date || date < gstFrom || date >= today || !gst) return;
    const key = basPeriodFor(date, basFreq, settings.basViaAgent).key;
    openPeriodGstCents[key] = (openPeriodGstCents[key] ?? 0) + gst;
  };
  for (const p of invoicePaymentRows) {
    const ratio = p.totalAmount ? (p.gstAmount || 0) / p.totalAmount : 0;
    addGst(toDateKey(p.paymentDate), Math.round(p.amount * ratio));
  }
  for (const p of billPaymentRows) {
    const ratio = p.total ? (p.tax || 0) / p.total : 0;
    const sign = p.billType === "credit" ? 1 : -1;
    addGst(toDateKey(p.paymentDate), sign * Math.round(p.amount * ratio));
  }

  const input: ForecastInput = {
    today,
    granularity,
    periodCount,
    settings: {
      bufferCents: settings.bufferCents,
      clientPayDays: settings.clientPayDays,
      supplierPayDays: settings.supplierPayDays,
      defaultMarginPercent: settings.defaultMarginPercent,
      basFrequency: basFreq,
      basViaAgent: settings.basViaAgent,
      fortnightAnchor: settings.fortnightAnchor,
    },
    openingBalanceCents: opening.cents,
    jobs,
    invoices,
    bills: billInputs,
    expenses,
    openPeriodGstCents,
    whatIfs: whatIfDefs.map((d) =>
      expandWhatIf(d, { clientPayDays: settings.clientPayDays, supplierPayDays: settings.supplierPayDays }),
    ),
  };

  return { input, settings, opening, jobs: jobRows, whatIfs: whatIfDefs };
}

/**
 * The forecast plus everything it was built from. `input` goes to the browser
 * so the What-ifs screen can re-run the engine as you type — toggling or
 * editing a what-if redraws without a round trip.
 */
export async function getForecast(
  companyId: string,
  opts: { today: DateKey; granularity?: PeriodGranularity; periodCount?: number },
): Promise<{
  forecast: ForecastResult;
  input: ForecastInput;
  whatIfs: WhatIfDefinition[];
  opening: OpeningBalance;
  settings: CashflowSettings;
}> {
  const load = await loadCashflow(companyId, opts);
  return {
    forecast: buildForecast(load.input),
    input: load.input,
    whatIfs: load.whatIfs,
    opening: load.opening,
    settings: load.settings,
  };
}

// ── One job's claim schedule (Projects tab drawer) ──────────────────────────

export interface ClaimSchedule {
  projectId: string;
  originalContractCents: number;
  invoicedCents: number;
  claimedPercent: number;
  stages: ResolvedClaimStage[];
  scheduleItems: ClaimScheduleItem[];
  /** Best schedule item for each unlinked stage, by name. */
  suggestions: Record<string, string>;
  /** Payment milestones on the job's accepted proposal, if any. */
  proposalMilestoneCount: number;
}

async function ownedProject(companyId: string, projectId: string) {
  const [p] = await db
    .select({
      id: projects.id,
      contractPrice: projects.contractPrice,
      contractCost: projects.contractCost,
      clientBudget: projects.clientBudget,
      contractedAt: projects.contractedAt,
      contractedTotalExGstCents: projects.contractedTotalExGstCents,
      contractedTotalIncGstCents: projects.contractedTotalIncGstCents,
      phase: projects.currentSystemPhase,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
    .limit(1);
  return p ?? null;
}

async function latestAcceptedProposalId(companyId: string, projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .innerJoin(projects, eq(proposals.projectId, projects.id))
    .where(and(eq(proposals.projectId, projectId), eq(projects.companyId, companyId), eq(proposals.status, "accepted")))
    .orderBy(desc(proposals.acceptedDate), desc(proposals.version))
    .limit(1);
  return row?.id ?? null;
}

export async function getClaimSchedule(companyId: string, projectId: string): Promise<ClaimSchedule | null> {
  const project = await ownedProject(companyId, projectId);
  if (!project) return null;

  const [stageRows, invoiceRows, itemRows, proposalId] = await Promise.all([
    stageRowsQuery(and(eq(projectClaimStages.projectId, projectId), eq(projectClaimStages.companyId, companyId))),
    db
      .select({ status: clientInvoices.status, totalAmount: clientInvoices.totalAmount, contractClaimRows: clientInvoices.contractClaimRows })
      .from(clientInvoices)
      .where(eq(clientInvoices.projectId, projectId)),
    db
      .select({
        id: scheduleItems.id,
        name: scheduleItems.name,
        type: scheduleItems.type,
        endDate: scheduleItems.endDate,
        actualEndDate: scheduleItems.actualEndDate,
        category: schedules.scheduleCategory,
      })
      .from(scheduleItems)
      .innerJoin(schedules, eq(scheduleItems.scheduleId, schedules.id))
      .where(and(eq(schedules.projectId, projectId), eq(schedules.isArchived, false)))
      .orderBy(asc(scheduleItems.endDate)),
    latestAcceptedProposalId(companyId, projectId),
  ]);

  const milestones = proposalId
    ? await db.select({ id: proposalPaymentMilestones.id }).from(proposalPaymentMilestones).where(eq(proposalPaymentMilestones.proposalId, proposalId))
    : [];

  const issued = invoiceRows.filter((i) => isIssuedInvoice(i.status));
  const invoicedCents = issued.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const claimedPercent = issued.reduce((s, i) => s + claimedPercentOf(i.contractClaimRows), 0);
  const phase = (project.phase ?? "lead") as JobPhase;
  const [ps] = await db
    .select({ forecastValueCents: projectCashflowSettings.forecastValueCents })
    .from(projectCashflowSettings)
    .where(and(eq(projectCashflowSettings.projectId, projectId), eq(projectCashflowSettings.companyId, companyId)));
  const originalContractCents = jobBaseValue(project, frozenContractTotalFrom(project)?.incGstCents, phase, ps?.forecastValueCents).cents;

  const stages = resolveClaimStages(stageRows, originalContractCents, claimedPercent, invoicedCents);
  const items: ClaimScheduleItem[] = itemRows.map((it) => ({
    id: it.id,
    name: it.name,
    type: it.type,
    category: it.category,
    endDate: toDateKey(it.actualEndDate ?? it.endDate),
  }));
  const suggestions: Record<string, string> = {};
  for (const st of stages) {
    if (st.scheduleItemId || st.state === "claimed") continue;
    const id = suggestScheduleItem(st.name, items);
    if (id) suggestions[st.id] = id;
  }

  return {
    projectId,
    originalContractCents,
    invoicedCents,
    claimedPercent,
    stages,
    scheduleItems: items,
    suggestions,
    proposalMilestoneCount: milestones.length,
  };
}

export class ClaimStageError extends Error {}

export async function replaceClaimStages(
  companyId: string,
  projectId: string,
  stages: {
    name: string;
    percent: number | null;
    amountCents: number | null;
    scheduleItemId: string | null;
    plannedDate: string | null;
  }[],
): Promise<void> {
  if (!(await ownedProject(companyId, projectId))) throw new ClaimStageError("Project not found");

  // A stage may only link to one of THIS job's schedule items.
  const itemIds = Array.from(new Set(stages.map((s) => s.scheduleItemId).filter((x): x is string => !!x)));
  if (itemIds.length > 0) {
    const found = await db
      .select({ id: scheduleItems.id })
      .from(scheduleItems)
      .innerJoin(schedules, eq(scheduleItems.scheduleId, schedules.id))
      .where(and(inArray(scheduleItems.id, itemIds), eq(schedules.projectId, projectId)));
    if (found.length !== itemIds.length) throw new ClaimStageError("A linked schedule item isn't on this job");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(projectClaimStages)
      .where(and(eq(projectClaimStages.projectId, projectId), eq(projectClaimStages.companyId, companyId)));
    if (stages.length > 0) {
      await tx.insert(projectClaimStages).values(stages.map((st, i) => ({ ...st, sortOrder: i, projectId, companyId })));
    }
  });
}

/** Copies the accepted proposal's payment milestones in as the job's claim stages. */
export async function seedClaimStagesFromProposal(companyId: string, projectId: string): Promise<number> {
  if (!(await ownedProject(companyId, projectId))) throw new ClaimStageError("Project not found");
  const [existing] = await db
    .select({ id: projectClaimStages.id })
    .from(projectClaimStages)
    .where(and(eq(projectClaimStages.projectId, projectId), eq(projectClaimStages.companyId, companyId)))
    .limit(1);
  if (existing) throw new ClaimStageError("This job already has claims set up");

  const proposalId = await latestAcceptedProposalId(companyId, projectId);
  if (!proposalId) throw new ClaimStageError("No accepted proposal on this job");
  const milestones = await db
    .select()
    .from(proposalPaymentMilestones)
    .where(eq(proposalPaymentMilestones.proposalId, proposalId))
    .orderBy(asc(proposalPaymentMilestones.order));
  if (milestones.length === 0) throw new ClaimStageError("The accepted proposal has no payment milestones");

  await db.insert(projectClaimStages).values(
    milestones.map((m, i) => ({
      companyId,
      projectId,
      name: m.name,
      sortOrder: i,
      percent: m.amountCents == null ? m.percentage ?? 0 : null,
      amountCents: m.amountCents ?? null,
      sourceMilestoneId: m.id,
    })),
  );
  return milestones.length;
}

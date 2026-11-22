/**
 * Loads a project's cost inputs and runs the one cost calculation
 * (shared/projectCost.ts), plus saving its snapshot to budgets /
 * budget_line_items for the readers that still use the stored rows (cash flow
 * forecast, company KPIs).
 *
 * Reads are batched: one query for the project, then every other input in
 * parallel. Pass `exec` (a transaction) when called from inside a write so the
 * calculation sees that write's uncommitted rows.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import type { CommittedPo } from "@shared/cashflow/jobCosts";
import * as schema from "@shared/schema";
import {
  allocateLabourCents,
  isPoCostedTimesheet,
  computeProjectCost,
  variationLineCostCents,
  variationRowKeyResolver,
  type ProjectCost,
  type ProjectCostRow,
} from "@shared/projectCost";

type Exec = typeof db | any;

export interface LoadedProjectCost extends ProjectCost {
  projectId: string;
  companyId: string;
  /** The open POs behind `committed` (only when includeCommitted). */
  committedPos: CommittedPo[];
}

export async function loadProjectCost(
  projectId: string,
  opts: { exec?: Exec; includeCommitted?: boolean } = {},
): Promise<LoadedProjectCost | null> {
  const exec: Exec = opts.exec ?? db;
  const [project] = await exec
    .select({ id: schema.projects.id, companyId: schema.projects.companyId })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project?.companyId) return null;
  const companyId: string = project.companyId;

  const approvedTs = and(eq(schema.timesheets.projectId, projectId), eq(schema.timesheets.status, "approved"));

  const [costCodes, categories, estimateItems, variationItems, bills, billLines, timesheets, splits, committedData, completions] =
    await Promise.all([
      // ALL of the company's codes, inactive included, so old lines still get a name.
      exec
        .select({
          id: schema.costCodes.id,
          code: schema.costCodes.code,
          title: schema.costCodes.title,
          categoryId: schema.costCodes.categoryId,
        })
        .from(schema.costCodes)
        .where(eq(schema.costCodes.companyId, companyId)),
      exec
        .select({ id: schema.costCategories.id, code: schema.costCategories.code, title: schema.costCategories.title })
        .from(schema.costCategories)
        .where(eq(schema.costCategories.companyId, companyId)),
      exec
        .select({
          unitCostExTax: schema.estimateItems.unitCostExTax,
          quantity: schema.estimateItems.quantity,
          wastagePercent: schema.estimateItems.wastagePercent,
          priceIncTax: schema.estimateItems.priceIncTax,
          taxAmount: schema.estimateItems.taxAmount,
          costCode: schema.estimateItems.costCode,
          costCategoryId: schema.estimateItems.costCategoryId,
        })
        .from(schema.estimateItems)
        .innerJoin(schema.estimates, eq(schema.estimateItems.estimateId, schema.estimates.id))
        .where(and(eq(schema.estimates.projectId, projectId), eq(schema.estimates.status, "contract"))),
      exec
        .select({
          costCode: schema.variationItems.costCode,
          unitCostExTax: schema.variationItems.unitCostExTax,
          quantity: schema.variationItems.quantity,
        })
        .from(schema.variationItems)
        .innerJoin(schema.variations, eq(schema.variationItems.variationId, schema.variations.id))
        .where(and(eq(schema.variations.projectId, projectId), eq(schema.variations.status, "approved"))),
      exec
        .select({
          id: schema.bills.id,
          billType: schema.bills.billType,
          taxMode: schema.bills.taxMode,
          subtotal: schema.bills.subtotal,
        })
        .from(schema.bills)
        .where(eq(schema.bills.projectId, projectId)),
      exec
        .select({
          billId: schema.billLineItems.billId,
          costCodeId: schema.billLineItems.costCodeId,
          total: schema.billLineItems.total,
          tax: schema.billLineItems.tax,
        })
        .from(schema.billLineItems)
        .innerJoin(schema.bills, eq(schema.billLineItems.billId, schema.bills.id))
        .where(eq(schema.bills.projectId, projectId)),
      exec
        .select({
          id: schema.timesheets.id,
          total: schema.timesheets.total,
          costCodeId: schema.timesheets.costCodeId,
          workItemId: schema.timesheets.workItemId,
          poStatus: schema.timesheets.poStatus,
        })
        .from(schema.timesheets)
        .where(approvedTs),
      exec
        .select({
          timesheetId: schema.timesheetCostCodes.timesheetId,
          costCodeId: schema.timesheetCostCodes.costCodeId,
          total: schema.timesheetCostCodes.total,
          duration: schema.timesheetCostCodes.duration,
        })
        .from(schema.timesheetCostCodes)
        .innerJoin(schema.timesheets, eq(schema.timesheetCostCodes.timesheetId, schema.timesheets.id))
        .where(approvedTs),
      opts.includeCommitted ? loadCommitted(companyId, projectId) : Promise.resolve({ lines: [], pos: [] }),
      exec
        .select({ rowKey: schema.projectCostCompletions.rowKey })
        .from(schema.projectCostCompletions)
        .where(eq(schema.projectCostCompletions.projectId, projectId)),
    ]);
  const committed = committedData.lines;

  // Timesheets logged against an estimate line, with no cost code of their own.
  const workItemIds = Array.from(new Set(
    (timesheets as { costCodeId: string | null; workItemId: string | null; poStatus: string | null }[])
      .filter((t) => !isPoCostedTimesheet(t))
      .filter((t) => !t.costCodeId && t.workItemId)
      .map((t) => t.workItemId as string),
  ));
  const workItemCostCode = new Map<string, string>();
  if (workItemIds.length > 0) {
    const items = await exec
      .select({ id: schema.estimateItems.id, costCode: schema.estimateItems.costCode })
      .from(schema.estimateItems)
      .where(inArray(schema.estimateItems.id, workItemIds));
    for (const it of items) if (it.costCode) workItemCostCode.set(it.id, it.costCode);
  }

  const labour = allocateLabourCents({ timesheets, splits, workItemCostCode })
    .map((l) => ({ costCodeId: l.costCodeId, cents: l.cents }));

  const cost = computeProjectCost({
    costCodes,
    categories,
    estimateItems,
    variationItems,
    bills,
    billLines,
    labour,
    committed,
    completeKeys: (completions as { rowKey: string }[]).map((c) => c.rowKey),
  });
  return { ...cost, projectId, companyId, committedPos: committedData.pos };
}

/**
 * The approved variation lines behind one cost row's Variations figure — the
 * drill-down. `rowKey` is a ProjectCostRow.key (a cost code id, or "variations").
 */
export async function loadVariationLinesForRow(projectId: string, companyId: string, rowKey: string) {
  const [costCodes, lines] = await Promise.all([
    db.select({ id: schema.costCodes.id, code: schema.costCodes.code })
      .from(schema.costCodes)
      .where(eq(schema.costCodes.companyId, companyId)),
    db.select({
      id: schema.variationItems.id,
      variationId: schema.variations.id,
      variationNumber: schema.variations.variationNumber,
      variationName: schema.variations.name,
      name: schema.variationItems.name,
      description: schema.variationItems.description,
      quantity: schema.variationItems.quantity,
      unitType: schema.variationItems.unitType,
      unitCostExTax: schema.variationItems.unitCostExTax,
      costCode: schema.variationItems.costCode,
    })
      .from(schema.variationItems)
      .innerJoin(schema.variations, eq(schema.variationItems.variationId, schema.variations.id))
      .where(and(eq(schema.variations.projectId, projectId), eq(schema.variations.status, "approved")))
      .orderBy(schema.variations.variationNumber, schema.variationItems.sortOrder),
  ]);
  const keyOf = variationRowKeyResolver(costCodes);
  const matched = lines
    .filter((l) => keyOf(l.costCode) === rowKey)
    .map(({ costCode: _c, ...l }) => ({ ...l, costCents: variationLineCostCents(l) }));
  return { total: matched.reduce((s, l) => s + l.costCents, 0), lines: matched };
}

/** Open PO value not yet billed, plus subbie hours awaiting a PO — per cost code. */
async function loadCommitted(
  companyId: string,
  projectId: string,
): Promise<{ lines: { costCodeId: string | null; cents: number }[]; pos: CommittedPo[] }> {
  const { loadJobCostInputs } = await import("./cashflowService");
  const data = (await loadJobCostInputs(companyId, projectId)).get(projectId);
  if (!data) return { lines: [], pos: [] };
  const toCode = (key: string) => (key.startsWith("other:") ? null : key);
  const out: { costCodeId: string | null; cents: number }[] = [];
  for (const po of data.committedPos) for (const k of po.byKey) out.push({ costCodeId: toCode(k.key), cents: k.exCents });
  for (const [key, cents] of Object.entries(data.awaitingPoLabourExByKey)) out.push({ costCodeId: toCode(key), cents });
  return { lines: out, pos: data.committedPos };
}

/** The stored line-item columns for one cost row. `actualAmount` stays BILLS ONLY — the cash flow forecast adds labour itself. */
function storedLineValues(budgetId: string, row: ProjectCostRow, sortOrder: number) {
  const forecast = Math.max(row.revisedBudgetCents, row.billsCents + row.labourCents);
  const variance = row.revisedBudgetCents - forecast;
  return {
    budgetId,
    costCodeId: row.costCodeId,
    costCodeTitle: row.label,
    categoryTitle: row.categoryLabel,
    budgetedAmount: row.revisedBudgetCents,
    actualAmount: row.billsCents,
    variationAmount: row.variationsCents,
    forecastAmount: forecast,
    variance,
    variancePercent: row.revisedBudgetCents > 0 ? Math.round((variance / row.revisedBudgetCents) * 100) : 0,
    profitAmount: variance,
    sortOrder,
  };
}

const sameStored = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  ["costCodeId", "costCodeTitle", "categoryTitle", "budgetedAmount", "actualAmount", "variationAmount", "forecastAmount", "variance", "sortOrder"]
    .every((k) => (a[k] ?? null) === (b[k] ?? null));

/**
 * Save the snapshot. Runs in one transaction holding a per-project lock, so two
 * saves at once cannot interleave and duplicate rows. Writes nothing when the
 * stored snapshot already matches (`onlyIfChanged`), which makes it cheap to
 * call from a page load.
 */
export async function saveProjectCostSnapshot(
  cost: LoadedProjectCost,
  opts: { exec?: Exec; onlyIfChanged?: boolean } = {},
): Promise<schema.Budget> {
  const run = async (tx: Exec): Promise<schema.Budget> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(43, hashtext(${cost.projectId}))`);
    const t = cost.totals;
    const header = {
      baselineAmount: t.originalBudgetCents,
      revisedAmount: t.revisedBudgetCents,
      actualAmount: t.spentCents,
      forecastAmount: Math.max(t.revisedBudgetCents, t.spentCents),
      varianceAmount: t.revisedBudgetCents - Math.max(t.revisedBudgetCents, t.spentCents),
    };

    let [budget] = await tx.select().from(schema.budgets).where(eq(schema.budgets.projectId, cost.projectId)).limit(1);
    if (!budget) {
      [budget] = await tx.insert(schema.budgets).values({ projectId: cost.projectId, name: "Project Budget", ...header }).returning();
    }

    const wanted = cost.rows.map((r, i) => storedLineValues(budget.id, r, i));
    if (opts.onlyIfChanged) {
      const headerSame = (Object.keys(header) as (keyof typeof header)[]).every((k) => budget[k] === header[k]);
      if (headerSame) {
        const stored = await tx.select().from(schema.budgetLineItems)
          .where(eq(schema.budgetLineItems.budgetId, budget.id))
          .orderBy(schema.budgetLineItems.sortOrder);
        if (stored.length === wanted.length && stored.every((s: any, i: number) => sameStored(s, wanted[i]))) {
          return budget;
        }
      }
    }

    [budget] = await tx.update(schema.budgets)
      .set({ ...header, updatedAt: new Date() })
      .where(eq(schema.budgets.id, budget.id))
      .returning();
    await tx.delete(schema.budgetLineItems).where(eq(schema.budgetLineItems.budgetId, budget.id));
    if (wanted.length > 0) await tx.insert(schema.budgetLineItems).values(wanted);
    return budget;
  };
  return opts.exec ? run(opts.exec) : db.transaction(run);
}

// ── Forecast tab ─────────────────────────────────────────────────────────────

export interface ForecastReviewView {
  reviewedAt: string;
  reviewedByName: string | null;
  contractCents: number;
  forecastCostCents: number;
  forecastMarginCents: number;
  note: string | null;
}

export interface PossibleDoubleCount {
  billId: string;
  billNumber: string;
  billTotalIncCents: number;
  poId: string;
  poLabel: string;
}

/**
 * The revised contract price, ex GST cents — the same figure the
 * contract-metrics endpoint serves (frozen contract + approved variations).
 */
export async function loadRevisedContractExCents(projectId: string): Promise<number | null> {
  const { storage } = await import("../storage");
  const { computeContractMetrics, frozenContractTotalFrom } = await import("@shared/projectMetrics");
  const project: any = await storage.getProject(projectId);
  if (!project) return null;
  const [items, variations, estimate] = await Promise.all([
    project.selectedEstimateId ? storage.getEstimateItems(project.selectedEstimateId) : Promise.resolve([]),
    storage.getVariations(projectId),
    project.selectedEstimateId ? storage.getEstimate(project.selectedEstimateId) : Promise.resolve(null),
  ]);
  const metrics = computeContractMetrics(
    (items as any[]).map((i) => ({
      priceIncTax: i.priceIncTax, taxAmount: i.taxAmount, unitCostExTax: i.unitCostExTax,
      quantity: i.quantity, markupPercent: i.markupPercent,
    })),
    (variations as any[]).map((v) => ({
      status: v.status ?? null, subtotal: v.subtotal ?? null, totalAmount: v.totalAmount ?? v.totalIncTax ?? null,
    })),
    (estimate as any)?.projectMarkupPercent ?? 0,
    (estimate as any)?.taxRate ?? 10,
    frozenContractTotalFrom(project),
  );
  return metrics.revisedContractPriceExGstCents;
}

/**
 * Everything the Forecast tab needs beyond the cost rows: the complete
 * ticks (already applied to the rows), the latest review stamp, and bills
 * that look like the same cost as an open PO.
 *
 * "Possible double count": a bill on this project that is NOT matched to any
 * PO, whose inc-GST total equals (±$1) what an open PO still has unbilled.
 * The bill counts as spent and the PO as committed, so the forecast holds the
 * same money twice until someone matches them. (22 Boanyo: BILL-1966 and
 * PO-2026-102, both $2,112.50.)
 */
export async function loadForecastMeta(cost: LoadedProjectCost): Promise<{
  completeKeys: string[];
  lastReview: ForecastReviewView | null;
  possibleDoubleCounts: PossibleDoubleCount[];
}> {
  const [reviews, unmatchedBills] = await Promise.all([
    db
      .select({
        reviewedAt: schema.projectForecastReviews.reviewedAt,
        contractCents: schema.projectForecastReviews.contractCents,
        forecastCostCents: schema.projectForecastReviews.forecastCostCents,
        forecastMarginCents: schema.projectForecastReviews.forecastMarginCents,
        note: schema.projectForecastReviews.note,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.projectForecastReviews)
      .leftJoin(schema.users, eq(schema.projectForecastReviews.reviewedById, schema.users.id))
      .where(eq(schema.projectForecastReviews.projectId, cost.projectId))
      .orderBy(sql`${schema.projectForecastReviews.reviewedAt} DESC`)
      .limit(1),
    cost.committedPos.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: schema.bills.id, billNumber: schema.bills.billNumber, total: schema.bills.total, billType: schema.bills.billType })
          .from(schema.bills)
          .where(and(eq(schema.bills.projectId, cost.projectId), sql`${schema.bills.matchedSitePOId} IS NULL`)),
  ]);

  const possibleDoubleCounts: PossibleDoubleCount[] = [];
  const usedPos = new Set<string>();
  for (const b of unmatchedBills as { id: string; billNumber: string; total: number; billType: string | null }[]) {
    if (b.billType === "credit" || !b.total) continue;
    const po = cost.committedPos.find((p) => !usedPos.has(p.id) && Math.abs(p.unbilledIncCents - b.total) <= 100);
    if (!po) continue;
    usedPos.add(po.id);
    possibleDoubleCounts.push({ billId: b.id, billNumber: b.billNumber, billTotalIncCents: b.total, poId: po.id, poLabel: po.label });
  }

  const r = (reviews as any[])[0];
  return {
    completeKeys: cost.rows.filter((row) => row.complete).map((row) => row.key),
    lastReview: r
      ? {
          reviewedAt: new Date(r.reviewedAt).toISOString(),
          reviewedByName: [r.firstName, r.lastName].filter(Boolean).join(" ") || null,
          contractCents: r.contractCents,
          forecastCostCents: r.forecastCostCents,
          forecastMarginCents: r.forecastMarginCents,
          note: r.note ?? null,
        }
      : null,
    possibleDoubleCounts,
  };
}

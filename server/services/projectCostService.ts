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
import * as schema from "@shared/schema";
import {
  allocateLabourCents,
  computeProjectCost,
  type ProjectCost,
  type ProjectCostRow,
} from "@shared/projectCost";

type Exec = typeof db | any;

export interface LoadedProjectCost extends ProjectCost {
  projectId: string;
  companyId: string;
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

  const [costCodes, categories, estimateItems, variationItems, bills, billLines, timesheets, splits, committed] =
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
      opts.includeCommitted ? loadCommitted(companyId, projectId) : Promise.resolve([]),
    ]);

  // Timesheets logged against an estimate line, with no cost code of their own.
  const workItemIds = Array.from(new Set(
    (timesheets as { costCodeId: string | null; workItemId: string | null }[])
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
  });
  return { ...cost, projectId, companyId };
}

/** Open PO value not yet billed, plus subbie hours awaiting a PO — per cost code. */
async function loadCommitted(companyId: string, projectId: string): Promise<{ costCodeId: string | null; cents: number }[]> {
  const { loadJobCostInputs } = await import("./cashflowService");
  const data = (await loadJobCostInputs(companyId, projectId)).get(projectId);
  if (!data) return [];
  const toCode = (key: string) => (key.startsWith("other:") ? null : key);
  const out: { costCodeId: string | null; cents: number }[] = [];
  for (const po of data.committedPos) for (const k of po.byKey) out.push({ costCodeId: toCode(k.key), cents: k.exCents });
  for (const [key, cents] of Object.entries(data.awaitingPoLabourExByKey)) out.push({ costCodeId: toCode(key), cents });
  return out;
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

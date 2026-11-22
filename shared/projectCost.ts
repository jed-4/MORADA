/**
 * Project cost — the ONE calculation behind the Budget page.
 *
 * Every cost figure on the page (the header, the cost-code table, the drill
 * downs, the dashboard widget) is built from the rows this returns, and the
 * header is the SUM of the rows. So the header and the table cannot disagree.
 *
 * All money is integer CENTS, EX GST, COST ONLY (no markup, no margin).
 *
 * Per cost-code row:
 *   original budget  = contract estimate lines (builder cost: qty × unit cost, wastage in)
 *   variations       = approved variation lines on that code (builder cost: qty × unit cost)
 *   revised budget   = original + variations
 *   bills            = bill lines on that code, GST stripped; credits negative
 *   labour           = approved timesheets on that code (staff only in practice —
 *                      subcontractor timesheets are forced to $0 when written, and
 *                      their cost arrives through their bill)
 *   spent            = bills + labour
 *   committed        = open PO value not yet billed + subbie hours awaiting a PO
 *   remaining        = revised − spent − committed
 *   forecast final   = the larger of revised, and spent + committed
 *
 * Things that do NOT have a cost code land in fixed rows:
 *   "cat:<id>"         estimate lines coded to a category only
 *   "variations"       variation lines with no (or an unrecognised) cost code
 *   "uncategorised"    estimate lines, bill lines, labour and committed with no code,
 *                      plus bills with no line items at all (at their ex-GST subtotal)
 *
 * Vehicles and plant (asset recharges) are deliberately NOT part of project cost.
 */
import { estimateItemBuilderCostExTax, type EstimateItemSummaryInput } from "./pricing";
import { billLineExGstCents } from "./billTotals";

export const UNCATEGORISED_KEY = "uncategorised";
export const VARIATIONS_KEY = "variations";
export const categoryKey = (categoryId: string) => `cat:${categoryId}`;

export type ProjectCostRowKind = "costCode" | "category" | "variations" | "uncategorised";

export interface ProjectCostRow {
  /** Stable key: a cost code id, "cat:<categoryId>", "variations" or "uncategorised". */
  key: string;
  kind: ProjectCostRowKind;
  costCodeId: string | null;
  /** "300 - Carpentry". Always built here, never on the client. */
  label: string;
  categoryId: string | null;
  /** "3 - Structure", or "" when the row has no category. */
  categoryLabel: string;
  originalBudgetCents: number;
  variationsCents: number;
  revisedBudgetCents: number;
  billsCents: number;
  labourCents: number;
  spentCents: number;
  committedCents: number;
  remainingCents: number;
  /**
   * What this row is expected to cost in the end. Not complete: the larger of
   * its budget and spent + committed (work still to come is assumed to use the
   * budget). Complete: spent + committed — what it actually cost, so an
   * underspend on a finished code counts as a saving.
   */
  forecastFinalCents: number;
  /** Ticked Complete on the Forecast tab. */
  complete: boolean;
}

export interface ProjectCostTotals {
  originalBudgetCents: number;
  variationsCents: number;
  revisedBudgetCents: number;
  billsCents: number;
  labourCents: number;
  spentCents: number;
  committedCents: number;
  remainingCents: number;
  forecastFinalCents: number;
}

export interface ProjectCost {
  rows: ProjectCostRow[];
  totals: ProjectCostTotals;
  /** Bills counted at their header subtotal because they have no line items yet. */
  billsWithoutLines: { billId: string; cents: number }[];
}

export interface ProjectCostInputs {
  costCodes: { id: string; code: string; title: string; categoryId: string | null }[];
  categories: { id: string; code: string; title: string }[];
  /** Lines of the project's Contract estimate. `costCode` holds a cost code ID. */
  estimateItems: (EstimateItemSummaryInput & { costCode?: string | null; costCategoryId?: string | null })[];
  /** Lines of APPROVED variations. `costCode` holds a cost code ID (older rows may hold the code text, e.g. "300"). */
  variationItems: { costCode: string | null; unitCostExTax: number | null; quantity: number | null }[];
  bills: { id: string; billType: string | null; taxMode: string | null; subtotal: number | null }[];
  billLines: { billId: string; costCodeId: string | null; total: number | null; tax: string | null }[];
  /** Labour cents per cost code (null = no code). */
  labour: { costCodeId: string | null; cents: number }[];
  /** Committed cents per cost code (null = no code). */
  committed: { costCodeId: string | null; cents: number }[];
  /** Row keys ticked Complete on the Forecast tab. */
  completeKeys?: Iterable<string>;
}

const ZERO_TOTALS = (): ProjectCostTotals => ({
  originalBudgetCents: 0,
  variationsCents: 0,
  revisedBudgetCents: 0,
  billsCents: 0,
  labourCents: 0,
  spentCents: 0,
  committedCents: 0,
  remainingCents: 0,
  forecastFinalCents: 0,
});

/** Builder cost of one variation line in cents. A blank quantity means 1. */
export function variationLineCostCents(item: { unitCostExTax: number | null; quantity: number | null }): number {
  const unitCost = Number(item.unitCostExTax) || 0;
  const qty = item.quantity == null ? 1 : Number(item.quantity) || 0;
  return Math.round(unitCost * qty * 100);
}

/**
 * Which row a variation line belongs to: its cost code's id, or VARIATIONS_KEY.
 * Variation lines store a cost code ID; older ones stored the code TEXT ("300"),
 * which is matched only when it identifies exactly one code. Shared by the cost
 * calculation and the Variations drill-down so the two always agree.
 */
export function variationRowKeyResolver(costCodes: { id: string; code: string }[]): (costCode: string | null | undefined) => string {
  const ids = new Set(costCodes.map((c) => c.id));
  const codeIdByText = new Map<string, string | null>();
  for (const c of costCodes) {
    const t = c.code.trim().toLowerCase();
    codeIdByText.set(t, codeIdByText.has(t) ? null : c.id);
  }
  return (costCode) => {
    const raw = costCode?.trim() || "";
    if (!raw) return VARIATIONS_KEY;
    if (ids.has(raw)) return raw;
    return codeIdByText.get(raw.toLowerCase()) ?? VARIATIONS_KEY;
  };
}

export function computeProjectCost(input: ProjectCostInputs): ProjectCost {
  const codeById = new Map(input.costCodes.map((c) => [c.id, c]));
  const variationKey = variationRowKeyResolver(input.costCodes);
  const catById = new Map(input.categories.map((c) => [c.id, c]));
  const catLabel = (id: string | null | undefined) => {
    const cat = id ? catById.get(id) : undefined;
    return cat ? `${cat.code} - ${cat.title}` : "";
  };

  type Acc = Omit<ProjectCostRow, "revisedBudgetCents" | "spentCents" | "remainingCents" | "forecastFinalCents" | "complete">;
  const rows = new Map<string, Acc>();

  const blank = (key: string, kind: ProjectCostRowKind, costCodeId: string | null, label: string, categoryId: string | null): Acc => ({
    key, kind, costCodeId, label, categoryId, categoryLabel: catLabel(categoryId),
    originalBudgetCents: 0, variationsCents: 0, billsCents: 0, labourCents: 0, committedCents: 0,
  });

  const codeRow = (costCodeId: string): Acc => {
    let r = rows.get(costCodeId);
    if (!r) {
      const cc = codeById.get(costCodeId);
      r = blank(costCodeId, "costCode", costCodeId, cc ? `${cc.code} - ${cc.title}` : "Unknown cost code", cc?.categoryId ?? null);
      rows.set(costCodeId, r);
    }
    return r;
  };
  const fixedRow = (key: string, kind: ProjectCostRowKind, label: string, categoryId: string | null = null): Acc => {
    let r = rows.get(key);
    if (!r) {
      r = blank(key, kind, null, label, categoryId);
      rows.set(key, r);
    }
    return r;
  };
  // Spelled as the rest of the app spells it.
  const uncategorised = () => fixedRow(UNCATEGORISED_KEY, "uncategorised", "Uncategorized");
  /** A cost-code id → its row; no id → Uncategorised. Unknown ids keep their own row. */
  const rowFor = (costCodeId: string | null | undefined) => (costCodeId ? codeRow(costCodeId) : uncategorised());

  // Original budget — the Contract estimate.
  for (const item of input.estimateItems) {
    const cents = Math.round(estimateItemBuilderCostExTax(item) * 100);
    if (item.costCode) codeRow(item.costCode).originalBudgetCents += cents;
    else if (item.costCategoryId) {
      fixedRow(categoryKey(item.costCategoryId), "category", catLabel(item.costCategoryId) || "Unknown category", item.costCategoryId)
        .originalBudgetCents += cents;
    } else uncategorised().originalBudgetCents += cents;
  }

  // Approved variations, on their own cost code where we can tell which.
  for (const item of input.variationItems) {
    const cents = variationLineCostCents(item);
    const key = variationKey(item.costCode);
    if (key !== VARIATIONS_KEY) codeRow(key).variationsCents += cents;
    else fixedRow(VARIATIONS_KEY, "variations", "Variations (no cost code)").variationsCents += cents;
  }

  // Bills — line items, GST stripped, credits negative.
  const billById = new Map(input.bills.map((b) => [b.id, b]));
  const billsWithLines = new Set<string>();
  for (const line of input.billLines) {
    const bill = billById.get(line.billId);
    if (!bill) continue;
    billsWithLines.add(line.billId);
    const sign = bill.billType === "credit" ? -1 : 1;
    rowFor(line.costCodeId).billsCents += billLineExGstCents(line.total || 0, line.tax, bill.taxMode) * sign;
  }
  // A bill with no lines yet (e.g. still in review) still costs money.
  const billsWithoutLines: { billId: string; cents: number }[] = [];
  for (const bill of input.bills) {
    if (billsWithLines.has(bill.id)) continue;
    const cents = (Number(bill.subtotal) || 0) * (bill.billType === "credit" ? -1 : 1);
    if (cents === 0) continue;
    billsWithoutLines.push({ billId: bill.id, cents });
    uncategorised().billsCents += cents;
  }

  for (const l of input.labour) rowFor(l.costCodeId).labourCents += l.cents;
  for (const c of input.committed) rowFor(c.costCodeId).committedCents += c.cents;

  const complete = new Set(input.completeKeys ?? []);
  const totals = ZERO_TOTALS();
  const out: ProjectCostRow[] = [];
  for (const r of Array.from(rows.values())) {
    const revisedBudgetCents = r.originalBudgetCents + r.variationsCents;
    const spentCents = r.billsCents + r.labourCents;
    const isComplete = complete.has(r.key);
    const row: ProjectCostRow = {
      ...r,
      revisedBudgetCents,
      spentCents,
      remainingCents: revisedBudgetCents - spentCents - r.committedCents,
      forecastFinalCents: isComplete
        ? spentCents + r.committedCents
        : Math.max(revisedBudgetCents, spentCents + r.committedCents),
      complete: isComplete,
    };
    // Drop rows with nothing in them at all.
    if (
      row.originalBudgetCents === 0 && row.variationsCents === 0 && row.billsCents === 0 &&
      row.labourCents === 0 && row.committedCents === 0
    ) continue;
    out.push(row);
    for (const k of Object.keys(totals) as (keyof ProjectCostTotals)[]) totals[k] += row[k];
  }

  // Cost codes in code order; category rows, variations and uncategorised last.
  const order: Record<ProjectCostRowKind, number> = { costCode: 0, category: 1, variations: 2, uncategorised: 3 };
  out.sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label, undefined, { numeric: true }));

  return { rows: out, totals, billsWithoutLines };
}

/**
 * Split each approved timesheet's cost across its cost codes.
 *
 * The timesheet header total is the source of truth. With cost-code splits it is
 * shared out in proportion to each split's dollar total (then hours, then evenly),
 * the remainder going to the last split so the parts add up exactly. Without
 * splits, the timesheet's own cost code is used, then the cost code of the
 * estimate line it was logged against.
 *
 * Subcontractor timesheets are costed through their PO and bill, never here.
 * They are recognised by `poStatus` (awaiting_po / on_po / paid), which is
 * stamped when the timesheet is created — not by today's subcontractor flag,
 * which would wrongly drop a person's past staff timesheets. They used to be
 * assumed to be stored at $0, but older/mobile ones carry a rate (e.g. 8h ×
 * $60), which double-counted against the subbie's bill.
 */
export function isPoCostedTimesheet(ts: { poStatus?: string | null }): boolean {
  return ts.poStatus != null && ts.poStatus !== "";
}

export function allocateLabourCents(input: {
  timesheets: { id: string; total: string | number | null; costCodeId: string | null; workItemId: string | null; poStatus?: string | null }[];
  splits: { timesheetId: string; costCodeId: string; total: string | number | null; duration: string | number | null }[];
  workItemCostCode: Map<string, string>;
}): { timesheetId: string; costCodeId: string | null; cents: number }[] {
  const splitsByTs = new Map<string, typeof input.splits>();
  for (const s of input.splits) {
    const arr = splitsByTs.get(s.timesheetId) || [];
    arr.push(s);
    splitsByTs.set(s.timesheetId, arr);
  }
  const out: { timesheetId: string; costCodeId: string | null; cents: number }[] = [];
  for (const ts of input.timesheets) {
    if (isPoCostedTimesheet(ts)) continue;
    const tsCents = Math.round((Number(ts.total) || 0) * 100);
    if (tsCents === 0) continue;
    const tsSplits = splitsByTs.get(ts.id) || [];
    if (tsSplits.length === 0) {
      const code = ts.costCodeId || (ts.workItemId ? input.workItemCostCode.get(ts.workItemId) : undefined) || null;
      out.push({ timesheetId: ts.id, costCodeId: code, cents: tsCents });
      continue;
    }
    let weights = tsSplits.map((s) => Number(s.total) || 0);
    let weightSum = weights.reduce((a, b) => a + b, 0);
    if (weightSum <= 0) {
      weights = tsSplits.map((s) => Number(s.duration) || 0);
      weightSum = weights.reduce((a, b) => a + b, 0);
    }
    if (weightSum <= 0) {
      weights = tsSplits.map(() => 1);
      weightSum = tsSplits.length;
    }
    let allocated = 0;
    tsSplits.forEach((s, idx) => {
      const cents = idx === tsSplits.length - 1 ? tsCents - allocated : Math.floor((tsCents * weights[idx]) / weightSum);
      allocated += cents;
      out.push({ timesheetId: ts.id, costCodeId: s.costCodeId, cents });
    });
  }
  return out;
}

// ── Summary only ────────────────────────────────────────────────────────────
// What a role with the Budget permission's "Summary Only" tick (and no View
// tick — View wins) may see: how far
// through its budget each category is, and a status. No dollar figures, no
// margin, no line-level rows, no drill-downs. Built on the server so the
// dollar figures never leave it.

/**
 * How much of a budget is used, banded:
 *   <95% under · 95–99% near · 100–105% at limit · >105% over.
 * Spend against no budget is "unbudgeted", not "over".
 */
export type BudgetTone = "under" | "near" | "at" | "over" | "unbudgeted" | "neutral";

export function budgetTone(budgetedCents: number, usedCents: number): BudgetTone {
  if (budgetedCents <= 0) return usedCents > 0 ? "unbudgeted" : "neutral";
  const percent = (usedCents / budgetedCents) * 100;
  if (percent < 95) return "under";
  if (percent < 100) return "near";
  if (percent <= 105) return "at";
  return "over";
}

export interface ProjectCostSummaryLine {
  /** Category id, or "other" for rows with no category. */
  key: string;
  label: string;
  /** (spent + committed) ÷ revised budget, whole percent; null with no budget. */
  usedPct: number | null;
  tone: BudgetTone;
}

export interface ProjectCostSummaryOnly {
  access: "summary";
  categories: ProjectCostSummaryLine[];
  total: { usedPct: number | null; tone: BudgetTone };
}

export const SUMMARY_OTHER_KEY = "other";

function usedPct(budgetedCents: number, usedCents: number): number | null {
  return budgetedCents > 0 ? Math.round((usedCents / budgetedCents) * 100) : null;
}

/** Reduce the full cost to the Summary Only view. Categories keep the row order; "Other" is last. */
export function summariseProjectCost(cost: Pick<ProjectCost, "rows" | "totals">): ProjectCostSummaryOnly {
  const groups = new Map<string, { label: string; revised: number; used: number }>();
  for (const r of cost.rows) {
    const key = r.categoryId ?? SUMMARY_OTHER_KEY;
    const label = r.categoryId ? (r.categoryLabel || "Unknown category") : "Other";
    const g = groups.get(key) ?? { label, revised: 0, used: 0 };
    g.revised += r.revisedBudgetCents;
    // Cost to date: spent only. Purchase orders (committed) belong to the
    // Forecast tab, not the simple budget.
    g.used += r.spentCents;
    groups.set(key, g);
  }
  const keys = Array.from(groups.keys()).filter((k) => k !== SUMMARY_OTHER_KEY);
  if (groups.has(SUMMARY_OTHER_KEY)) keys.push(SUMMARY_OTHER_KEY);
  const totalUsed = cost.totals.spentCents;
  return {
    access: "summary",
    categories: keys.map((key) => {
      const g = groups.get(key)!;
      return { key, label: g.label, usedPct: usedPct(g.revised, g.used), tone: budgetTone(g.revised, g.used) };
    }),
    total: {
      usedPct: usedPct(cost.totals.revisedBudgetCents, totalUsed),
      tone: budgetTone(cost.totals.revisedBudgetCents, totalUsed),
    },
  };
}

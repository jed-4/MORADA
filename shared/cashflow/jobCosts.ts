// A job's costs still to come, and WHEN they're paid.
//
// Pure. The server loads the budget, bills, labour, open POs and schedule;
// this decides the dated cash out. Everything is per cost code ("key"):
//
//   still to spend  = budget − billed − labour − committed POs   (never < 0)
//   committed PO    = PO value − its non-credit bills             (never < 0)
//
// matching the Budget page's forecast (actual + what's left of budget) and the
// committed-cost rules in COMMITTED_COST_PLAN.md.
//
// Timing:
//   - committed POs are paid on their required-by date + supplier days;
//   - what's still to spend on a code is spread over the schedule items
//     carrying that code, by how long each runs, then paid supplier days
//     after each month's work;
//   - a code with no schedule items is spread evenly over the job;
//   - subbie hours still waiting for a PO are paid supplier days from today.

import { addDays, daysBetween, maxKey, monthEnd, minKey, toDateKey, type DateKey } from "./dates";
import { gstOfInc } from "./gst";
import { dollarsToCents, incGstFromEx } from "../money";
import { monthlyClaimDates, splitEvenly } from "./spread";

export interface CostBudgetLine {
  key: string;
  label: string;
  budgetedExCents: number;
  billedExCents: number;
}

export interface CommittedPo {
  id: string;
  label: string;
  requiredBy: DateKey | null;
  unbilledIncCents: number;
  unbilledExCents: number;
  /** The unbilled ex-GST value split across cost codes, pro rata by item value. */
  byKey: { key: string; exCents: number }[];
}

export interface CostScheduleItem {
  key: string;
  start: DateKey;
  end: DateKey;
}

export interface JobCostInput {
  today: DateKey;
  supplierPayDays: number;
  jobName: string;
  budgetLines: CostBudgetLine[];
  /** Employee labour already done, ex GST, by cost code. */
  labourExByKey: Record<string, number>;
  committedPos: CommittedPo[];
  /** Subbie hours approved but not on a PO yet, ex GST. */
  awaitingPoLabourExCents: number;
  scheduleItems: CostScheduleItem[];
  /** The job's months, for codes with no schedule items. */
  window: { from: DateKey; to: DateKey };
}

/** A dated payment out (negative), before any win-% weighting. */
export interface CostChunk {
  date: DateKey;
  amountCents: number;
  gstCents: number;
  label: string;
}

export interface JobCostLine {
  key: string;
  label: string;
  budgetedExCents: number;
  spentExCents: number;
  committedExCents: number;
  remainingExCents: number;
}

export interface JobCostPlan {
  chunks: CostChunk[];
  lines: JobCostLine[];
  committedIncCents: number;
  /** Everything still to go out for the job, inc GST. */
  totalIncCents: number;
}

/** Split `total` across weights, largest remainders first, so it sums exactly. */
function splitByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

export function planJobCosts(input: JobCostInput): JobCostPlan {
  const { today, supplierPayDays } = input;
  const pay = (d: DateKey) => addDays(maxKey(d, today), supplierPayDays);
  const chunks: CostChunk[] = [];

  // Committed per code.
  const committedByKey = new Map<string, number>();
  for (const po of input.committedPos) {
    for (const k of po.byKey) committedByKey.set(k.key, (committedByKey.get(k.key) ?? 0) + k.exCents);
  }

  // What's still to spend per code.
  const keys = new Set<string>([...input.budgetLines.map((l) => l.key), ...Array.from(committedByKey.keys())]);
  const lines: JobCostLine[] = [];
  for (const key of Array.from(keys)) {
    const b = input.budgetLines.find((l) => l.key === key);
    const budgeted = b?.budgetedExCents ?? 0;
    const spent = (b?.billedExCents ?? 0) + (input.labourExByKey[key] ?? 0);
    const committed = committedByKey.get(key) ?? 0;
    lines.push({
      key,
      label: b?.label ?? key,
      budgetedExCents: budgeted,
      spentExCents: spent,
      committedExCents: committed,
      remainingExCents: Math.max(0, budgeted - spent - committed),
    });
  }

  // Subbie hours waiting on a PO were budgeted somewhere: take them off what's
  // left, spread across the codes in proportion, so they aren't counted twice.
  const awaiting = Math.min(input.awaitingPoLabourExCents, lines.reduce((s, l) => s + l.remainingExCents, 0));
  if (awaiting > 0) {
    const cuts = splitByWeight(awaiting, lines.map((l) => l.remainingExCents));
    lines.forEach((l, i) => (l.remainingExCents -= cuts[i]));
    chunks.push({ date: pay(today), amountCents: -awaiting, gstCents: 0, label: `${input.jobName} — subbie hours awaiting a PO` });
  }

  // Committed POs: paid on the required-by date (or when their codes' work
  // finishes) plus supplier days.
  let committedInc = 0;
  for (const po of input.committedPos) {
    if (po.unbilledIncCents <= 0) continue;
    committedInc += po.unbilledIncCents;
    const codeEnds = input.scheduleItems.filter((it) => po.byKey.some((k) => k.key === it.key)).map((it) => it.end);
    const due = po.requiredBy ?? (codeEnds.length ? codeEnds.sort().at(-1)! : today);
    chunks.push({
      date: pay(due),
      amountCents: -po.unbilledIncCents,
      gstCents: -(po.unbilledIncCents - po.unbilledExCents),
      label: po.label,
    });
  }

  // What's still to spend, by code, over the schedule.
  const evenDates = monthlyClaimDates(input.window.from, input.window.to);
  for (const line of lines) {
    if (line.remainingExCents <= 0) continue;
    // Builder costs are taxable supplies: GST on top of the ex-GST budget.
    const inc = incGstFromEx(line.remainingExCents);
    const label = `${input.jobName} — ${line.label}`;
    const items = input.scheduleItems
      .filter((it) => it.key === line.key)
      .map((it) => {
        const start = maxKey(it.start, today);
        return { start, end: maxKey(it.end, start) };
      });

    if (items.length === 0) {
      if (evenDates.length === 0) continue;
      splitEvenly(-inc, evenDates.length).forEach((amt, i) => {
        if (amt) chunks.push({ date: pay(evenDates[i]), amountCents: amt, gstCents: gstOfInc(amt), label });
      });
      continue;
    }

    const perItem = splitByWeight(inc, items.map((it) => daysBetween(it.start, it.end) + 1));
    items.forEach((it, i) => {
      const dates = monthlyClaimDates(it.start, it.end).map((d) => minKey(monthEnd(d), it.end));
      splitEvenly(-perItem[i], dates.length).forEach((amt, j) => {
        if (amt) chunks.push({ date: pay(dates[j]), amountCents: amt, gstCents: gstOfInc(amt), label });
      });
    });
  }

  return {
    chunks,
    lines,
    committedIncCents: committedInc,
    totalIncCents: -chunks.reduce((s, c) => s + c.amountCents, 0),
  };
}

/**
 * What's still to bill on a PO, ex GST and inc GST: its value less every
 * linked bill except vendor credits (a credit doesn't mean work was billed),
 * never below zero. Mirrors poStatusFromBills.
 */
export function poUnbilled(
  po: { total: number; gstAmount: number },
  linkedBills: { total: number; tax: number; billType: string | null }[],
): { incCents: number; exCents: number } {
  let billedInc = 0;
  let billedEx = 0;
  for (const b of linkedBills) {
    if (b.billType === "credit") continue;
    billedInc += b.total || 0;
    billedEx += (b.total || 0) - (b.tax || 0);
  }
  const poEx = (po.total || 0) - (po.gstAmount || 0);
  return {
    incCents: Math.max(0, (po.total || 0) - billedInc),
    exCents: Math.max(0, poEx - billedEx),
  };
}

// ─── From database rows to planJobCosts input ────────────────────────────────

/** Budget rows without a cost code (Variations, Uncategorized, a category) key by title. */
export const costKey = (costCodeId: string | null, title?: string | null) => costCodeId ?? `other:${title ?? "Uncategorized"}`;

export interface JobCostData {
  budgetLines: CostBudgetLine[];
  labourExByKey: Record<string, number>;
  committedPos: CommittedPo[];
  awaitingPoLabourExCents: number;
  scheduleItems: CostScheduleItem[];
}

/** The raw, company-scoped rows the server loads (see loadJobCostInputs). */
export interface JobCostRows {
  lineRows: { projectId: string; costCodeId: string | null; title: string | null; budgeted: number; actual: number }[];
  poRows: {
    id: string;
    projectId: string;
    poNumber: string;
    supplierName: string | null;
    requiredByDate: Date | string | null;
    total: number;
    gstAmount: number;
  }[];
  poItemRows: { purchaseOrderId: string; costCodeId: string | null; total: number; gstAmount: number; gstMode: string }[];
  linkedBillRows: { poId: string | null; total: number; tax: number; billType: string | null }[];
  /** Employee timesheets (approved, not subbie). `total` is dollars ex GST as numeric text. */
  labourRows: { id: string; projectId: string | null; costCodeId: string | null; total: string | number }[];
  splitRows: { timesheetId: string; costCodeId: string; total: string | number }[];
  /** Subbie hours approved but not on a PO: hours and the subbie's profile rate (dollars). */
  awaitingRows: { projectId: string | null; duration: string | number; rate: string | number | null }[];
  itemRows: { projectId: string; costCodeId: string | null; startDate: Date | string; endDate: Date | string; status: string }[];
}

export function assembleJobCostInputs(rows: JobCostRows): Map<string, JobCostData> {
  const { lineRows, poRows, poItemRows, linkedBillRows, labourRows, splitRows, awaitingRows, itemRows } = rows;
  const out = new Map<string, JobCostData>();
  const get = (projectId: string) => {
    let d = out.get(projectId);
    if (!d) {
      d = { budgetLines: [], labourExByKey: {}, committedPos: [], awaitingPoLabourExCents: 0, scheduleItems: [] };
      out.set(projectId, d);
    }
    return d;
  };

  for (const r of lineRows) {
    get(r.projectId).budgetLines.push({
      key: costKey(r.costCodeId, r.title),
      label: r.title ?? "Uncategorized",
      budgetedExCents: r.budgeted || 0,
      billedExCents: r.actual || 0,
    });
  }

  // Labour by code: a timesheet's cost-code splits when it has them, else its own code.
  const splitTimesheets = new Set(splitRows.map((r) => r.timesheetId));
  const projectOfTimesheet = new Map(labourRows.map((r) => [r.id, r.projectId!]));
  const addLabour = (projectId: string, key: string, cents: number) => {
    const d = get(projectId);
    d.labourExByKey[key] = (d.labourExByKey[key] ?? 0) + cents;
  };
  for (const r of splitRows) {
    const projectId = projectOfTimesheet.get(r.timesheetId);
    if (projectId) addLabour(projectId, costKey(r.costCodeId), dollarsToCents(r.total));
  }
  for (const r of labourRows) {
    if (!splitTimesheets.has(r.id)) addLabour(r.projectId!, costKey(r.costCodeId), dollarsToCents(r.total));
  }

  for (const r of awaitingRows) {
    get(r.projectId!).awaitingPoLabourExCents += Math.round(Number(r.duration || 0) * dollarsToCents(r.rate));
  }

  // Committed POs, split across codes pro rata by each item's ex-GST value.
  const billsByPo = new Map<string, { total: number; tax: number; billType: string | null }[]>();
  for (const b of linkedBillRows) {
    const list = billsByPo.get(b.poId!) ?? [];
    list.push({ total: b.total, tax: b.tax, billType: b.billType });
    billsByPo.set(b.poId!, list);
  }
  const itemsByPo = new Map<string, { key: string; exCents: number }[]>();
  for (const it of poItemRows) {
    // Item totals are inc GST only on an inclusive PO (COMMITTED_COST_PLAN.md §5a).
    const ex = it.gstMode === "inclusive" ? (it.total || 0) - (it.gstAmount || 0) : it.total || 0;
    const list = itemsByPo.get(it.purchaseOrderId) ?? [];
    list.push({ key: costKey(it.costCodeId), exCents: ex });
    itemsByPo.set(it.purchaseOrderId, list);
  }
  for (const po of poRows) {
    const unbilled = poUnbilled(po, billsByPo.get(po.id) ?? []);
    if (unbilled.incCents <= 0) continue;
    const items = itemsByPo.get(po.id) ?? [];
    const itemsEx = items.reduce((s, i) => s + i.exCents, 0);
    const byKey = new Map<string, number>();
    if (itemsEx > 0) {
      let assigned = 0;
      items.forEach((i, idx) => {
        const share = idx === items.length - 1 ? unbilled.exCents - assigned : Math.round((unbilled.exCents * i.exCents) / itemsEx);
        assigned += share;
        byKey.set(i.key, (byKey.get(i.key) ?? 0) + share);
      });
    } else {
      byKey.set(costKey(null), unbilled.exCents);
    }
    get(po.projectId).committedPos.push({
      id: po.id,
      label: `${po.supplierName ?? "Supplier"} — ${po.poNumber}`,
      requiredBy: toDateKey(po.requiredByDate),
      unbilledIncCents: unbilled.incCents,
      unbilledExCents: unbilled.exCents,
      byKey: Array.from(byKey.entries()).map(([key, exCents]) => ({ key, exCents })),
    });
  }

  for (const it of itemRows) {
    if (it.status === "completed" || it.status === "cancelled") continue;
    const start = toDateKey(it.startDate);
    const end = toDateKey(it.endDate);
    if (!start || !end) continue;
    get(it.projectId).scheduleItems.push({ key: costKey(it.costCodeId), start, end });
  }

  return out;
}

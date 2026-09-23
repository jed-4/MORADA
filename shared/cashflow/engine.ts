// The cashflow forecast engine.
//
// Pure: everything it needs arrives in a ForecastInput, so it runs the same on
// the server and (from PR 3) in the browser, and the tests need no database.
//
// Two steps:
//   1. buildEvents — every source becomes dated cash events.
//   2. buildForecast — events are bucketed into months or fortnights and
//      rolled forward from the opening balance.

import {
  addDays,
  addMonths,
  dayLabel,
  daysBetween,
  maxKey,
  monthEnd,
  monthLabel,
  monthStart,
  type DateKey,
} from "./dates";
import { basPeriodFor, gstOfInc } from "./gst";
import { occurrences } from "./recurrence";
import { monthlyClaimDates, splitEvenly } from "./spread";
import type {
  CashEvent,
  ForecastInput,
  ForecastLine,
  ForecastPeriod,
  ForecastResult,
  ForecastWarning,
  JobInput,
  PeriodGranularity,
} from "./types";

/** Fortnights fall back to counting from a Monday when no anchor is set. */
const DEFAULT_FORTNIGHT_ANCHOR: DateKey = "2024-01-01";

/** A job with no end date is spread over this many months. */
const MONTHS_WHEN_NO_END_DATE = 6;

export const LINE_JOB_COSTS = "job_costs";
export const LINE_BUSINESS_EXPENSES = "business_expenses";
export const LINE_GST = "gst";

export function jobLineId(projectId: string): string {
  return `job:${projectId}`;
}

export function buildPeriods(
  today: DateKey,
  granularity: PeriodGranularity,
  count: number,
  fortnightAnchor: DateKey | null,
): ForecastPeriod[] {
  const periods: ForecastPeriod[] = [];
  if (granularity === "month") {
    const first = monthStart(today);
    for (let i = 0; i < count; i++) {
      const start = addMonths(first, i, 1);
      periods.push({ key: start.slice(0, 7), start, end: monthEnd(start), label: monthLabel(start) });
    }
    return periods;
  }
  const anchor = fortnightAnchor ?? DEFAULT_FORTNIGHT_ANCHOR;
  const first = addDays(anchor, Math.floor(daysBetween(anchor, today) / 14) * 14);
  for (let i = 0; i < count; i++) {
    const start = addDays(first, i * 14);
    periods.push({ key: start, start, end: addDays(start, 13), label: dayLabel(start) });
  }
  return periods;
}

/** Money due before today is shown landing today — it's owed, not lost. */
function landing(date: DateKey, today: DateKey): { date: DateKey; overdue: boolean } {
  return date < today ? { date: today, overdue: true } : { date, overdue: false };
}

function jobWindow(job: JobInput, today: DateKey, warnings: ForecastWarning[]): { from: DateKey; to: DateKey } {
  const from = maxKey(today, job.startDate ?? today);
  if (!job.endDate) {
    warnings.push({
      code: job.startDate ? "job_no_end_date" : "job_no_dates",
      projectId: job.projectId,
      message: `${job.name} has no end date, so it's spread over ${MONTHS_WHEN_NO_END_DATE} months.`,
    });
    return { from, to: monthEnd(addMonths(monthStart(from), MONTHS_WHEN_NO_END_DATE - 1, 1)) };
  }
  if (job.endDate < from) {
    warnings.push({
      code: "job_past_end_date",
      projectId: job.projectId,
      message: `${job.name} is past its end date, so what's left is spread over this month and next.`,
    });
    return { from, to: monthEnd(addMonths(monthStart(today), 1, 1)) };
  }
  return { from, to: job.endDate };
}

export function whatIfLineId(id: string): string {
  return `whatif:${id}`;
}

export function buildEvents(
  input: ForecastInput,
  horizonEnd: DateKey,
  warnings: ForecastWarning[],
  includeWhatIfs = true,
): CashEvent[] {
  const { today, settings } = input;
  const events: CashEvent[] = [];

  // Invoices already issued: the balance lands on the due date.
  for (const inv of input.invoices) {
    if (!inv.balanceCents) continue;
    const { date, overdue } = landing(inv.dueDate ?? addDays(inv.invoiceDate, settings.clientPayDays), today);
    events.push({
      date,
      overdue,
      amountCents: inv.balanceCents,
      gstCents: Math.round(inv.balanceCents * inv.gstRatio),
      category: "job_income",
      source: "invoice",
      lineId: jobLineId(inv.projectId),
      label: inv.label,
      projectId: inv.projectId,
      sourceId: inv.id,
    });
  }

  // Bills: owed to suppliers goes out; a credit (negative balance) comes back.
  for (const bill of input.bills) {
    if (!bill.balanceCents) continue;
    const { date, overdue } = landing(bill.dueDate ?? addDays(bill.billDate, settings.supplierPayDays), today);
    const amount = -bill.balanceCents;
    events.push({
      date,
      overdue,
      amountCents: amount,
      gstCents: Math.round(amount * bill.gstRatio),
      category: bill.projectId ? "job_cost" : "business_expense",
      source: "bill",
      lineId: bill.projectId ? LINE_JOB_COSTS : LINE_BUSINESS_EXPENSES,
      label: bill.label,
      projectId: bill.projectId ?? undefined,
      sourceId: bill.id,
    });
  }

  // Jobs: what's left to claim and to spend, spread month by month.
  for (const job of input.jobs) {
    const weight = Math.max(0, Math.min(100, job.winPercent)) / 100;
    const { from, to } = jobWindow(job, today, warnings);
    const claimDates = monthlyClaimDates(from, to);
    if (claimDates.length === 0) continue;

    if (job.costBasis === "margin" && job.remainingCostCents > 0) {
      warnings.push({
        code: "job_cost_from_margin",
        projectId: job.projectId,
        message: `${job.name} has no budget, so its costs are estimated from a ${settings.defaultMarginPercent}% margin.`,
      });
    }

    if (job.mode === "manual") {
      for (const m of job.manualAmounts ?? []) {
        const amount = Math.round(m.amountCents * weight);
        if (!amount) continue;
        events.push({
          date: addDays(monthEnd(m.month), job.clientPayDays),
          amountCents: amount,
          gstCents: gstOfInc(amount),
          category: "job_income",
          source: "claim",
          lineId: jobLineId(job.projectId),
          label: `${job.name} — claim (manual)`,
          projectId: job.projectId,
        });
      }
    } else {
      const parts = splitEvenly(Math.round(job.remainingToClaimCents * weight), claimDates.length);
      claimDates.forEach((claimDate, i) => {
        if (!parts[i]) return;
        events.push({
          date: addDays(claimDate, job.clientPayDays),
          amountCents: parts[i],
          gstCents: gstOfInc(parts[i]),
          category: "job_income",
          source: "claim",
          lineId: jobLineId(job.projectId),
          label: `${job.name} — claim`,
          projectId: job.projectId,
        });
      });
    }

    const costParts = splitEvenly(-Math.round(job.remainingCostCents * weight), claimDates.length);
    claimDates.forEach((claimDate, i) => {
      if (!costParts[i]) return;
      events.push({
        date: addDays(claimDate, settings.supplierPayDays),
        amountCents: costParts[i],
        gstCents: gstOfInc(costParts[i]),
        category: "job_cost",
        source: "job_cost",
        lineId: LINE_JOB_COSTS,
        label: `${job.name} — costs to come`,
        projectId: job.projectId,
      });
    });
  }

  // Business expenses repeat from their next date.
  for (const exp of input.expenses) {
    for (const date of occurrences(exp.nextDate, exp.frequency, exp.endDate, today, horizonEnd)) {
      events.push({
        date,
        amountCents: -exp.amountCents,
        gstCents: exp.hasGst ? gstOfInc(-exp.amountCents) : 0,
        category: "business_expense",
        source: "expense",
        lineId: LINE_BUSINESS_EXPENSES,
        label: exp.name,
        sourceId: exp.id,
      });
    }
  }

  // What-ifs that are switched on.
  if (includeWhatIfs) {
    for (const w of input.whatIfs ?? []) {
      if (!w.enabled) continue;
      for (const s of w.streams) {
        for (const date of occurrences(s.startDate, s.frequency, s.endDate, today, horizonEnd)) {
          events.push({
            date,
            amountCents: s.amountCents,
            gstCents: s.gstCents,
            category: "what_if",
            source: "what_if",
            lineId: whatIfLineId(w.id),
            label: s.name,
            sourceId: w.id,
          });
        }
      }
    }
  }

  const inWindow = events.filter((e) => e.date >= today && e.date <= horizonEnd);
  return [...inWindow, ...basEvents(input, inWindow, horizonEnd)];
}

/**
 * One BAS payment (or refund) per period due inside the forecast: the GST
 * collected minus the GST paid, both from events in that period plus
 * whatever already moved in it before today.
 */
function basEvents(input: ForecastInput, events: CashEvent[], horizonEnd: DateKey): CashEvent[] {
  const { basFrequency, basViaAgent } = input.settings;
  const periods = new Map<string, { due: DateKey; start: DateKey; net: number }>();

  const add = (date: DateKey, gst: number) => {
    const p = basPeriodFor(date, basFrequency, basViaAgent);
    const row = periods.get(p.key) ?? { due: p.due, start: p.start, net: 0 };
    row.net += gst;
    periods.set(p.key, row);
  };

  for (const [key, gst] of Object.entries(input.openPeriodGstCents)) add(`${key}-01`, gst);
  for (const e of events) if (e.gstCents) add(e.date, e.gstCents);

  const out: CashEvent[] = [];
  for (const [key, p] of Array.from(periods.entries())) {
    if (!p.net || p.due < input.today || p.due > horizonEnd) continue;
    out.push({
      date: p.due,
      amountCents: -p.net,
      gstCents: 0,
      category: "gst",
      source: "bas",
      lineId: LINE_GST,
      label: `BAS for the period starting ${monthLabel(p.start)}`,
      sourceId: key,
    });
  }
  return out;
}

function lowestOf(closing: number[]): { cents: number; periodIndex: number } {
  let i = 0;
  closing.forEach((c, j) => {
    if (c < closing[i]) i = j;
  });
  return { cents: closing[i], periodIndex: i };
}

function rollForward(opening: number, net: number[]): { openingCents: number[]; closingCents: number[] } {
  const openingCents: number[] = [];
  const closingCents: number[] = [];
  let running = opening;
  for (const n of net) {
    openingCents.push(running);
    running += n;
    closingCents.push(running);
  }
  return { openingCents, closingCents };
}

export function buildForecast(input: ForecastInput): ForecastResult {
  const warnings: ForecastWarning[] = [];
  const periods = buildPeriods(input.today, input.granularity, input.periodCount, input.settings.fortnightAnchor);
  const horizonEnd = periods[periods.length - 1].end;
  const events = buildEvents(input, horizonEnd, warnings).sort((a, b) =>
    a.date === b.date ? a.label.localeCompare(b.label) : a.date < b.date ? -1 : 1,
  );

  const periodIndex = (date: DateKey): number => {
    if (input.granularity === "month") return periods.findIndex((p) => p.key === date.slice(0, 7));
    return Math.floor(daysBetween(periods[0].start, date) / 14);
  };

  // Lines: one per job with money in, the fixed money-out lines, one per what-if.
  const lines = new Map<string, ForecastLine>();
  const jobNames = new Map<string, string>();
  for (const job of input.jobs) jobNames.set(job.projectId, job.name);
  for (const inv of input.invoices) if (!jobNames.has(inv.projectId)) jobNames.set(inv.projectId, inv.projectName);
  const whatIfNames = new Map((input.whatIfs ?? []).map((w) => [w.id, w.name]));
  const blank = () => periods.map(() => 0);

  const newLine = (e: CashEvent): ForecastLine => {
    if (e.lineId.startsWith("job:")) {
      return { id: e.lineId, label: jobNames.get(e.projectId!) ?? "Job", section: "in", projectId: e.projectId, values: blank(), totalCents: 0 };
    }
    if (e.lineId.startsWith("whatif:")) {
      return { id: e.lineId, label: whatIfNames.get(e.sourceId!) ?? "What-if", section: "whatif", values: blank(), totalCents: 0 };
    }
    return { id: e.lineId, label: OUT_LINE_LABELS[e.lineId] ?? e.lineId, section: "out", values: blank(), totalCents: 0 };
  };

  for (const e of events) {
    const i = periodIndex(e.date);
    if (i < 0 || i >= periods.length) continue;
    let line = lines.get(e.lineId);
    if (!line) {
      line = newLine(e);
      lines.set(e.lineId, line);
    }
    line.values[i] += e.amountCents;
    line.totalCents += e.amountCents;
  }

  const bySection = (section: ForecastLine["section"]) =>
    Array.from(lines.values())
      .filter((l) => l.section === section)
      .sort((a, b) => a.label.localeCompare(b.label));
  const inLines = bySection("in");
  const whatIfLines = bySection("whatif");
  const outLines = [LINE_JOB_COSTS, LINE_BUSINESS_EXPENSES, LINE_GST].map(
    (id) => lines.get(id) ?? { id, label: OUT_LINE_LABELS[id], section: "out" as const, values: blank(), totalCents: 0 },
  );

  const sumBy = (ls: ForecastLine[]) => periods.map((_, i) => ls.reduce((s, l) => s + l.values[i], 0));
  const inCents = sumBy(inLines);
  const outCents = sumBy(outLines);
  const whatIfCents = sumBy(whatIfLines);
  const netCents = periods.map((_, i) => inCents[i] + outCents[i] + whatIfCents[i]);

  if (input.openingBalanceCents == null) {
    warnings.push({ code: "no_opening_balance", message: "No bank balance — connect Xero or enter one in settings. Starting from $0." });
  }
  const opening = input.openingBalanceCents ?? 0;
  const { openingCents, closingCents } = rollForward(opening, netCents);

  // The baseline: the same forecast with no what-ifs, GST included — a
  // what-if's GST changes the BAS, so its effect isn't just its own line.
  const baselineNet = blank();
  for (const e of buildEvents(input, horizonEnd, [], false)) {
    const i = periodIndex(e.date);
    if (i >= 0 && i < periods.length) baselineNet[i] += e.amountCents;
  }
  const baselineClosingCents = rollForward(opening, baselineNet).closingCents;

  const below = closingCents.findIndex((c) => c < input.settings.bufferCents);

  return {
    today: input.today,
    granularity: input.granularity,
    periods,
    openingBalanceCents: opening,
    lines: [...inLines, ...outLines, ...whatIfLines],
    inCents,
    outCents,
    whatIfCents,
    netCents,
    openingCents,
    closingCents,
    bufferCents: input.settings.bufferCents,
    lowest: lowestOf(closingCents),
    baselineClosingCents,
    baselineLowest: lowestOf(baselineClosingCents),
    firstBelowBufferIndex: below === -1 ? null : below,
    events,
    warnings,
  };
}

const OUT_LINE_LABELS: Record<string, string> = {
  [LINE_JOB_COSTS]: "Project costs",
  [LINE_BUSINESS_EXPENSES]: "Business expenses",
  [LINE_GST]: "GST / BAS",
};

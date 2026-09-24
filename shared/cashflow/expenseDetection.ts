// Finding regular business payments in a year of Xero spend.
//
// Pure. The server turns Xero bills and bank transactions into SpendRecords;
// this groups them by supplier and decides which look like a repeating
// business expense, how often, how much and when the next one falls. The AI
// step only names and explains what these rules already found — it never
// invents a pattern.

import { addDays, daysBetween, type DateKey } from "./dates";
import { occurrences, type Frequency } from "./recurrence";

export interface SpendRecord {
  /** Xero ContactID, or `name:<lowercased name>` when there's no contact. */
  contactKey: string;
  contactId: string | null;
  contactName: string;
  date: DateKey;
  /** Money out, inc GST, positive. */
  amountCents: number;
  gstCents: number;
  accountNames: string[];
  description: string;
  /** Coded to one of the company's jobs (Xero tracking option of a project). */
  jobTracked: boolean;
}

export interface DetectedPattern {
  contactKey: string;
  contactId: string | null;
  contactName: string;
  frequency: Frequency;
  /** Typical payment (median), inc GST. */
  amountCents: number;
  hasGst: boolean;
  count: number;
  firstDate: DateKey;
  lastDate: DateKey;
  nextDate: DateKey;
  confidence: "high" | "medium" | "low";
  /** Share of this supplier's spend coded to jobs, 0–1. */
  jobShare: number;
  /** Payments seem to have stopped (none for two periods). */
  lapsed: boolean;
  accounts: string[];
  samples: string[];
  amounts: number[];
}

export interface SkippedSupplier {
  contactName: string;
  reason: "ato" | "job_cost" | "irregular" | "one_off";
  totalCents: number;
}

/** Suppliers mostly coded to jobs are job costs, not business expenses. */
export const JOB_SHARE_LIMIT = 0.6;
/** A single payment this big might be a yearly bill (insurance, registration). */
const YEARLY_SINGLE_MIN_CENTS = 50_000;

const ATO = /australian taxation office|\bato\b|tax office/i;

const PERIOD_DAYS: Record<Exclude<Frequency, "once">, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30.44,
  quarterly: 91.3,
  yearly: 365.25,
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function frequencyFor(days: number): Exclude<Frequency, "once"> | null {
  if (days <= 10) return "weekly";
  if (days <= 20) return "fortnightly";
  if (days <= 45) return "monthly";
  if (days <= 120) return "quarterly";
  if (days >= 300 && days <= 430) return "yearly";
  return null;
}

export function detectRecurring(
  records: SpendRecord[],
  today: DateKey,
): { patterns: DetectedPattern[]; skipped: SkippedSupplier[] } {
  const bySupplier = new Map<string, SpendRecord[]>();
  for (const r of records) {
    if (r.amountCents <= 0) continue;
    const list = bySupplier.get(r.contactKey) ?? [];
    list.push(r);
    bySupplier.set(r.contactKey, list);
  }

  const patterns: DetectedPattern[] = [];
  const skipped: SkippedSupplier[] = [];

  for (const list of Array.from(bySupplier.values())) {
    const name = list[0].contactName;
    const total = list.reduce((s, r) => s + r.amountCents, 0);

    // GST and tax go through BAS, which the forecast already works out.
    if (ATO.test(name)) {
      skipped.push({ contactName: name, reason: "ato", totalCents: total });
      continue;
    }
    const jobShare = list.filter((r) => r.jobTracked).reduce((s, r) => s + r.amountCents, 0) / total;
    if (jobShare >= JOB_SHARE_LIMIT) {
      skipped.push({ contactName: name, reason: "job_cost", totalCents: total });
      continue;
    }

    // One payment per day: two lines paid together are one payment.
    const byDay = new Map<DateKey, number>();
    for (const r of list) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.amountCents);
    const days = Array.from(byDay.keys()).sort();
    const amounts = days.map((d) => byDay.get(d)!);

    let frequency: Exclude<Frequency, "once"> | null;
    let regularity = 0;
    if (days.length === 1) {
      if (amounts[0] < YEARLY_SINGLE_MIN_CENTS) {
        skipped.push({ contactName: name, reason: "one_off", totalCents: total });
        continue;
      }
      frequency = "yearly";
    } else {
      const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d));
      frequency = frequencyFor(median(gaps));
      if (frequency) {
        const period = PERIOD_DAYS[frequency];
        regularity = gaps.filter((g) => Math.abs(g - period) <= period * 0.4).length / gaps.length;
      }
      if (!frequency || (gaps.length >= 2 && regularity < 0.34)) {
        skipped.push({ contactName: name, reason: "irregular", totalCents: total });
        continue;
      }
    }

    const typical = median(amounts);
    const spread = typical > 0 ? (Math.max(...amounts) - Math.min(...amounts)) / typical : 0;
    const confidence: DetectedPattern["confidence"] =
      days.length >= 4 && regularity >= 0.75 && spread <= 0.25 ? "high" : days.length >= 3 && regularity >= 0.5 ? "medium" : "low";

    const lastDate = days[days.length - 1];
    const period = PERIOD_DAYS[frequency];
    const lapsed = frequency !== "yearly" && daysBetween(lastDate, today) > period * 2;
    const nextDate =
      occurrences(lastDate, frequency, null, addDays(today, 1), addDays(today, 800))[0] ?? addDays(today, Math.round(period));

    patterns.push({
      contactKey: list[0].contactKey,
      contactId: list[0].contactId,
      contactName: name,
      frequency,
      amountCents: typical,
      hasGst: list.filter((r) => r.gstCents > 0).length * 2 >= list.length,
      count: days.length,
      firstDate: days[0],
      lastDate,
      nextDate,
      confidence,
      jobShare: Math.round(jobShare * 100) / 100,
      lapsed,
      accounts: Array.from(new Set(list.flatMap((r) => r.accountNames))).slice(0, 5),
      samples: Array.from(new Set(list.map((r) => r.description).filter(Boolean))).slice(0, 3),
      amounts,
    });
  }

  // Biggest yearly cost first — that's what matters most to the forecast.
  const perYear = (p: DetectedPattern) =>
    p.amountCents * ({ weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1, once: 0 } as const)[p.frequency];
  patterns.sort((a, b) => perYear(b) - perYear(a));
  return { patterns, skipped };
}

// ─── From Xero JSON ──────────────────────────────────────────────────────────

/** Xero sends dates as "2026-09-01T00:00:00" (…String fields) or "/Date(1756684800000+0000)/". */
export function xeroDateKey(value: unknown): DateKey | null {
  if (typeof value !== "string" || !value) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (iso) return iso[1];
  const ms = /\/Date\((-?\d+)/.exec(value);
  // Xero's /Date()/ values are UTC midnight of the calendar day, so the UTC
  // date IS the day (no zone conversion — that would move it).
  return ms ? new Date(Number(ms[1])).toISOString().slice(0, 10) : null;
}

const toCents = (v: unknown) => Math.round((Number(v) || 0) * 100);

/**
 * Bills (ACCPAY invoices) and SPEND bank transactions → one SpendRecord each.
 * A record is job-coded when any line carries a tracking option belonging to
 * one of the company's projects.
 */
export function spendRecordsFromXero(input: {
  bills: any[];
  bankTransactions: any[];
  accountNames: Map<string, string>;
  jobTrackingOptionIds: Set<string>;
}): SpendRecord[] {
  const out: SpendRecord[] = [];
  const add = (doc: any, dateValue: unknown) => {
    const date = xeroDateKey(dateValue);
    const amountCents = toCents(doc.Total);
    if (!date || amountCents <= 0) return;
    const contactName = String(doc.Contact?.Name ?? "").trim() || "Unknown supplier";
    const contactId = doc.Contact?.ContactID ?? null;
    const lines: any[] = Array.isArray(doc.LineItems) ? doc.LineItems : [];
    out.push({
      contactKey: contactId ?? `name:${contactName.toLowerCase()}`,
      contactId,
      contactName,
      date,
      amountCents,
      gstCents: toCents(doc.TotalTax),
      accountNames: Array.from(new Set(lines.map((l) => input.accountNames.get(String(l.AccountCode)) ?? l.AccountCode).filter(Boolean))),
      description: String(lines[0]?.Description ?? doc.Reference ?? "").slice(0, 80),
      jobTracked: lines.some((l) =>
        (Array.isArray(l.Tracking) ? l.Tracking : []).some((t: any) => input.jobTrackingOptionIds.has(t.TrackingOptionID)),
      ),
    });
  };
  for (const b of input.bills) add(b, b.DateString ?? b.Date);
  for (const t of input.bankTransactions) add(t, t.DateString ?? t.Date);
  return out;
}

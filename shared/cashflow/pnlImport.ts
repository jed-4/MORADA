// Business expenses from the Xero P&L — pure, so it's tested without Xero.
//
// A P&L says what an account COST each month (ex GST, accrual); the cashflow
// needs what LEAVES THE BANK and when. So each overhead account becomes one
// register line whose timing is read off last year's monthly pattern (even →
// monthly; one big month → yearly in that month; four lumps → quarterly),
// with GST added back where the account's tax type says it's paid. Accounts
// that aren't cash, or are already forecast elsewhere, are left out and say why.

import { incGstFromEx, exGstFromInc } from "../money";
import { addMonths, type DateKey } from "./dates";
import { TIMES_PER_YEAR, type Frequency } from "./recurrence";

/** One P&L account with its last 12 months, oldest first (cents, ex GST). */
export interface PnlAccount {
  code: string;
  name: string;
  /** Xero Account Type: EXPENSE, OVERHEADS, DIRECTCOSTS, DEPRECIATN, … */
  type: string | null;
  /** Xero TaxType: INPUT (GST on expenses), EXEMPTEXPENSES, BASEXCLUDED, … */
  taxType: string | null;
  /** 'YYYY-MM' for each entry of `monthlyExCents`, oldest first. */
  months: string[];
  monthlyExCents: number[];
}

export interface PnlProposal {
  accountCode: string;
  accountName: string;
  name: string;
  category: string;
  frequency: Frequency;
  /** Each payment, inc GST when hasGst. */
  amountCents: number;
  hasGst: boolean;
  nextDate: DateKey;
  /** Last 12 months, ex GST — what the "accounted for" check compares against. */
  yearExCents: number;
  /** Plain words: "Every month", "Once a year, in July", "Averaged — spend was irregular". */
  pattern: string;
}

export interface PnlExclusion {
  accountCode: string;
  accountName: string;
  yearExCents: number;
  reason: string;
}

/** Accounts that aren't business overheads paid in cash, and why. */
export function exclusionReason(a: Pick<PnlAccount, "type" | "name">): string | null {
  const type = (a.type ?? "").toUpperCase();
  const name = a.name.toLowerCase();
  if (["REVENUE", "SALES", "OTHERINCOME"].includes(type)) return "Income";
  if (type === "DIRECTCOSTS") return "Job cost — already forecast from budgets, bills and POs";
  if (type === "DEPRECIATN" || /depreciation|amorti[sz]ation/.test(name)) return "Not cash";
  if (/income tax|company tax/.test(name)) return "Tax — not an overhead";
  if (/\bgst\b/.test(name)) return "GST — already forecast with BAS";
  if (/payg/.test(name)) return "PAYG — paid with BAS";
  return null;
}

/** GST is paid on top only where the account's tax type claims GST on expenses. */
export function gstApplies(taxType: string | null): boolean {
  const t = (taxType ?? "").toUpperCase();
  return t === "INPUT" || t === "CAPEXINPUT" || t.startsWith("INPUT");
}

const GROUP_RULES: [RegExp, string][] = [
  [/wage|salar|super|payroll|workcover|workers comp|staff|employee|contractor|allowance/, "People"],
  [/rent|lease|light|power|electric|water|rates|cleaning|premises|yard|office rent|repairs/, "Premises"],
  [/vehicle|motor|fuel|petrol|diesel|rego|registration|toll|parking|truck|car /, "Vehicles"],
  [/insurance/, "Insurance"],
  [/software|subscription|computer|it |internet|phone|telephone|mobile|website|hosting/, "Software"],
  [/interest|bank|merchant|finance|loan|borrowing/, "Finance"],
  [/advertis|marketing|promotion|sponsor/, "Marketing"],
  [/accounting|legal|consult|audit|office|postage|printing|stationery|licen|membership|training|general/, "Admin"],
];

/** A starter group from the account name — the register's groups. */
export function groupFor(accountName: string): string {
  const n = ` ${accountName.toLowerCase()} `;
  for (const [re, group] of GROUP_RULES) if (re.test(n)) return group;
  return "Other";
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAY_DAY = 15; // P&L months carry no day; mid-month, editable

/** The first 'YYYY-MM-15' on or after today, for a month-of-year (1–12), stepping `stepMonths`. */
function nextOccurrence(lastMonth: string, stepMonths: number, today: DateKey): DateKey {
  let d = `${lastMonth}-${String(PAY_DAY).padStart(2, "0")}` as DateKey;
  for (let i = 0; i < 40 && d < today; i++) d = addMonths(d, stepMonths);
  return d;
}

/** How the money goes out, read from 12 monthly amounts (ex GST, oldest first). */
export function readTiming(
  months: string[],
  monthlyExCents: number[],
  today: DateKey,
): { frequency: Frequency; paymentExCents: number; nextDate: DateKey; pattern: string } | null {
  const total = monthlyExCents.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const n = monthlyExCents.length || 12;
  const paid = monthlyExCents.map((v, i) => ({ v, i })).filter((x) => x.v > total * 0.02);
  const top = paid.reduce((m, x) => (x.v > m.v ? x : m), { v: 0, i: 0 });
  const thisMonth = today.slice(0, 7);

  // One month carries most of the year: an annual bill.
  if (top.v >= total * 0.7) {
    const month = months[top.i];
    return {
      frequency: "yearly",
      paymentExCents: total,
      nextDate: nextOccurrence(month, 12, today),
      pattern: `Once a year, in ${MONTH_NAMES[Number(month.slice(5, 7)) - 1]}`,
    };
  }
  // Three to five lumps about three months apart: quarterly.
  if (paid.length >= 3 && paid.length <= 5) {
    const gaps = paid.slice(1).map((x, k) => x.i - paid[k].i);
    if (gaps.every((g) => g >= 2 && g <= 4)) {
      return {
        frequency: "quarterly",
        paymentExCents: Math.round(total / 4),
        nextDate: nextOccurrence(months[paid[paid.length - 1].i], 3, today),
        pattern: "Every quarter",
      };
    }
  }
  // Most months: monthly. Otherwise irregular — averaged, so the total is right.
  const nextMonthly = nextOccurrence(thisMonth, 1, today);
  return {
    frequency: "monthly",
    paymentExCents: Math.round(total / n),
    nextDate: nextMonthly,
    pattern: paid.length >= 9 ? "Every month" : "Averaged — spend was irregular",
  };
}

/** Proposed register lines (and exclusions) from the P&L's accounts. */
export function proposeFromPnl(accounts: PnlAccount[], today: DateKey): { proposals: PnlProposal[]; excluded: PnlExclusion[] } {
  const proposals: PnlProposal[] = [];
  const excluded: PnlExclusion[] = [];
  for (const a of accounts) {
    const yearExCents = a.monthlyExCents.reduce((s, v) => s + v, 0);
    const reason = exclusionReason(a);
    if (reason) {
      if (yearExCents !== 0) excluded.push({ accountCode: a.code, accountName: a.name, yearExCents, reason });
      continue;
    }
    const timing = readTiming(a.months, a.monthlyExCents, today);
    if (!timing) continue; // nothing spent in the year
    const hasGst = gstApplies(a.taxType);
    proposals.push({
      accountCode: a.code,
      accountName: a.name,
      name: a.name,
      category: groupFor(a.name),
      frequency: timing.frequency,
      amountCents: hasGst ? incGstFromEx(timing.paymentExCents) : timing.paymentExCents,
      hasGst,
      nextDate: timing.nextDate,
      yearExCents,
      pattern: timing.pattern,
    });
  }
  proposals.sort((x, y) => x.category.localeCompare(y.category) || y.yearExCents - x.yearExCents);
  excluded.sort((x, y) => y.yearExCents - x.yearExCents);
  return { proposals, excluded };
}

/** A register line as the coverage check sees it. */
export interface CoverageLine {
  xeroAccountCode: string | null;
  amountCents: number;
  hasGst: boolean;
  frequency: Frequency;
  isActive: boolean;
}

/** A year of a line's payments, ex GST — same basis as the P&L. */
export function yearExOf(l: CoverageLine): number {
  if (!l.isActive || l.frequency === "once") return 0;
  const per = l.hasGst ? exGstFromInc(l.amountCents) : l.amountCents;
  return Math.round(per * TIMES_PER_YEAR[l.frequency]);
}

export interface AccountCoverage {
  accountCode: string;
  accountName: string;
  pnlYearExCents: number;
  registerYearExCents: number;
  /** P&L minus register; positive = not accounted for yet. */
  gapYearExCents: number;
}

/**
 * How much of each overhead account the register accounts for. Within $10 a
 * month counts as covered — the P&L's rounding and a mid-year price change
 * shouldn't nag.
 */
export function coverage(
  proposals: Pick<PnlProposal, "accountCode" | "accountName" | "yearExCents">[],
  lines: CoverageLine[],
): { accounts: AccountCoverage[]; pnlYearExCents: number; coveredYearExCents: number; percent: number } {
  const byCode = new Map<string, number>();
  for (const l of lines) {
    if (!l.xeroAccountCode) continue;
    byCode.set(l.xeroAccountCode, (byCode.get(l.xeroAccountCode) ?? 0) + yearExOf(l));
  }
  const TOLERANCE = 12_000; // $10 a month
  const accounts = proposals.map((p) => {
    const registerYearExCents = byCode.get(p.accountCode) ?? 0;
    const raw = p.yearExCents - registerYearExCents;
    return {
      accountCode: p.accountCode,
      accountName: p.accountName,
      pnlYearExCents: p.yearExCents,
      registerYearExCents,
      gapYearExCents: Math.abs(raw) < TOLERANCE ? 0 : raw,
    };
  });
  const pnlYearExCents = accounts.reduce((s, a) => s + a.pnlYearExCents, 0);
  const coveredYearExCents = accounts.reduce((s, a) => s + a.pnlYearExCents - Math.max(0, a.gapYearExCents), 0);
  const percent = pnlYearExCents > 0 ? Math.round((coveredYearExCents / pnlYearExCents) * 100) : 100;
  return { accounts, pnlYearExCents, coveredYearExCents, percent };
}

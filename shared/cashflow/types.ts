// Shapes shared by the cashflow engine, the server loader and the client.
//
// Money: integer CENTS, inc GST, signed (+ money in, − money out).
// Dates: DateKey 'YYYY-MM-DD' calendar days (see ./dates).

import type { DateKey } from "./dates";
import type { BasFrequency } from "./gst";
import type { Frequency } from "./recurrence";
import type { WhatIfInput } from "./whatifs";

export type PeriodGranularity = "month" | "fortnight";

export const JOB_MODES = ["even", "manual", "claims"] as const;
export type JobMode = (typeof JOB_MODES)[number];

export type JobPhase = "lead" | "pre_construction" | "construction";

export interface CashflowSettingsInput {
  bufferCents: number;
  clientPayDays: number;
  supplierPayDays: number;
  /** Margin used to estimate a job's remaining cost when it has no budget. */
  defaultMarginPercent: number;
  basFrequency: BasFrequency;
  basViaAgent: boolean;
  /** Fortnights are counted from this day (the pay-cycle start). */
  fortnightAnchor: DateKey | null;
}

/** A job the forecast spreads future claims and costs for. */
export interface JobInput {
  projectId: string;
  name: string;
  phase: JobPhase;
  mode: JobMode;
  /** 0–100. Signed jobs are 100; prospective jobs are weighted by it. */
  winPercent: number;
  clientPayDays: number;
  /** Revised contract (inc GST) minus everything already invoiced. */
  remainingToClaimCents: number;
  /** What's still to spend (inc GST), not counting bills already received. */
  remainingCostCents: number;
  costBasis: "budget" | "margin";
  startDate: DateKey | null;
  endDate: DateKey | null;
  /** Manual mode only: expected claim per month, keyed by the month's first day. */
  manualAmounts?: { month: DateKey; amountCents: number }[];
  /**
   * Claims mode only: the claim stages not yet claimed, before win %. A stage
   * with a date lands on it (its linked schedule item's finish, or a planned
   * date); a stage with no date is spread evenly over the job.
   */
  claimStages?: ClaimStageInput[];
  /**
   * Dated costs from the job's budget, POs and schedule (planJobCosts). When
   * present they replace the even spread of remainingCostCents.
   */
  costChunks?: { date: DateKey; amountCents: number; gstCents: number; label: string }[];
}

export interface ClaimStageInput {
  id: string;
  name: string;
  amountCents: number;
  date: DateKey | null;
}

/** An issued client invoice that still has money owing. */
export interface InvoiceInput {
  id: string;
  projectId: string;
  projectName: string;
  label: string;
  balanceCents: number;
  /** gstAmount / totalAmount, so a GST-free invoice carries no GST. */
  gstRatio: number;
  dueDate: DateKey | null;
  invoiceDate: DateKey;
}

/** A supplier bill (or credit) with money still to move. */
export interface BillInput {
  id: string;
  projectId: string | null;
  label: string;
  /** Owed to the supplier. Credits are NEGATIVE (the supplier owes us). */
  balanceCents: number;
  gstRatio: number;
  dueDate: DateKey | null;
  billDate: DateKey;
}

export interface ExpenseInput {
  id: string;
  name: string;
  amountCents: number;
  hasGst: boolean;
  frequency: Frequency;
  nextDate: DateKey;
  endDate: DateKey | null;
}

export interface ForecastInput {
  today: DateKey;
  granularity: PeriodGranularity;
  periodCount: number;
  settings: CashflowSettingsInput;
  /** Bank balance today; null when Xero isn't connected and none was entered. */
  openingBalanceCents: number | null;
  jobs: JobInput[];
  invoices: InvoiceInput[];
  bills: BillInput[];
  expenses: ExpenseInput[];
  /**
   * GST already moved in BAS periods that are not yet paid, keyed by
   * BasPeriod.key (signed: + collected, − paid). Money received before today
   * still has to go to the ATO on the next BAS.
   */
  openPeriodGstCents: Record<string, number>;
  /** Every what-if; only the enabled ones count in the main forecast. */
  whatIfs?: WhatIfInput[];
}

export type EventCategory = "job_income" | "job_cost" | "business_expense" | "gst" | "what_if";

export type EventSource = "invoice" | "claim" | "job_cost" | "bill" | "expense" | "bas" | "what_if";

export interface CashEvent {
  date: DateKey;
  amountCents: number;
  /** GST inside amountCents, same sign. Zero for GST-free money and BAS itself. */
  gstCents: number;
  category: EventCategory;
  source: EventSource;
  /** Which forecast line it adds to (see ForecastLine.id). */
  lineId: string;
  label: string;
  projectId?: string;
  sourceId?: string;
  /** The money was due before today, so it's shown landing today. */
  overdue?: boolean;
}

export interface ForecastPeriod {
  key: string;
  start: DateKey;
  end: DateKey;
  label: string;
}

export interface ForecastLine {
  /** 'job:<projectId>' · 'job_costs' · 'business_expenses' · 'gst' · 'whatif:<id>' */
  id: string;
  label: string;
  section: "in" | "out" | "whatif";
  projectId?: string;
  /** Signed cents per period, aligned with ForecastResult.periods. */
  values: number[];
  totalCents: number;
}

export interface ForecastWarning {
  code:
    | "no_opening_balance"
    | "job_no_end_date"
    | "job_past_end_date"
    | "job_no_dates"
    | "job_cost_from_margin"
    | "job_unlinked_claims";
  projectId?: string;
  message: string;
}

export interface ForecastResult {
  today: DateKey;
  granularity: PeriodGranularity;
  periods: ForecastPeriod[];
  openingBalanceCents: number;
  lines: ForecastLine[];
  /** Per period. In and out exclude what-ifs; net includes them. */
  inCents: number[];
  outCents: number[];
  whatIfCents: number[];
  netCents: number[];
  openingCents: number[];
  closingCents: number[];
  bufferCents: number;
  lowest: { cents: number; periodIndex: number };
  /** The same forecast with every what-if left out. */
  baselineClosingCents: number[];
  baselineLowest: { cents: number; periodIndex: number };
  /** First period whose closing balance is under the buffer, or null. */
  firstBelowBufferIndex: number | null;
  events: CashEvent[];
  warnings: ForecastWarning[];
}

// ── API responses (/api/cashflow/*) ─────────────────────────────────────────

export interface OpeningBalance {
  cents: number | null;
  source: "xero" | "manual" | null;
  accounts: { id: string; name: string; balanceCents: number; included: boolean }[];
  /** Set when Xero is connected but the balance couldn't be read. */
  error?: string;
}

/** One row of the Projects tab — also what the engine's JobInput is built from. */
export interface CashflowJobRow {
  projectId: string;
  name: string;
  jobNumber: string | null;
  phase: JobPhase;
  included: boolean;
  /** true when someone has changed this job's settings (a row exists). */
  customised: boolean;
  mode: JobMode;
  winPercent: number;
  clientPayDays: number;
  clientPayDaysOverride: number | null;
  contractCents: number;
  invoicedCents: number;
  remainingToClaimCents: number;
  remainingCostCents: number;
  /** Open POs not billed yet, inc GST (part of remainingCostCents). */
  committedCents: number;
  costBasis: "budget" | "margin";
  startDate: DateKey | null;
  endDate: DateKey | null;
  /** Where the value and dates came from — the drawer says so, and only offers to edit what isn't fixed. */
  valueSource: "contract" | "forecast" | "budget" | "none";
  dateSource: "forecast" | "schedule" | "project" | "none";
  /** The builder's own figures (project_cashflow_settings), as saved. */
  forecastValueCents: number | null;
  forecastStart: DateKey | null;
  forecastEnd: DateKey | null;
  /** Manual mode: expected claim per month ('YYYY-MM-01'), before win %. */
  manualAmounts: { month: DateKey; amountCents: number }[];
  /** Claim stages set up for the job, and how many aren't linked to a date. */
  claimStageCount: number;
  unlinkedClaimStageCount: number;
}

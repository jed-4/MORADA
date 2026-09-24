// What-ifs: decisions tried on the forecast before they're made.
//
// A what-if is a template plus its inputs (params) plus any extra lines the
// user adds. Templates are NOT stored as lines: they expand here every time
// the forecast runs, so a change to a rate (super, WorkCover) reaches every
// scenario, and the editor can preview a change before it's saved.
//
// Each template expands to payment STREAMS — a signed amount and its GST
// repeating on a frequency — which the engine turns into dated events the
// same way it does business expenses.

import { addDays, addMonths, monthEnd, type DateKey } from "./dates";
import { gstOfInc } from "./gst";
import type { Frequency } from "./recurrence";

export const WHAT_IF_TEMPLATES = ["employee", "vehicle", "win_job", "one_off", "custom"] as const;
export type WhatIfTemplate = (typeof WHAT_IF_TEMPLATES)[number];

export type PayCycle = "weekly" | "fortnightly" | "monthly";
const PAYS_PER_YEAR: Record<PayCycle, number> = { weekly: 52, fortnightly: 26, monthly: 12 };

export interface EmployeeParams {
  role: string;
  payType: "salary" | "hourly";
  /** Salary: gross per year. */
  annualSalaryCents: number;
  /** Hourly: rate × hours × 52 weeks. */
  hourlyRateCents: number;
  hoursPerWeek: number;
  payCycle: PayCycle;
  startDate: DateKey;
  endDate: DateKey | null;
  /** Paid with every pay (Payday Super, from 1 July 2026). */
  superPercent: number;
  workcoverPercent: number;
  payrollTaxPercent: number;
}

export interface VehicleParams {
  /** Inc GST. */
  priceCents: number;
  purchaseDate: DateKey;
  payWith: "cash" | "finance";
  depositCents: number;
  termMonths: number;
  /** Yearly interest rate, e.g. 7.9. */
  ratePercent: number;
  balloonCents: number;
  /** Rego + insurance, paid once a year. */
  regoInsuranceYearlyCents: number;
  /** Fuel, tyres, servicing — inc GST. */
  runningMonthlyCents: number;
  /** What it saves you (e.g. hire you stop paying) — inc GST. */
  savingsMonthlyCents: number;
}

export interface WinJobParams {
  /** Contract value inc GST. */
  valueCents: number;
  startDate: DateKey;
  months: number;
  winPercent: number;
  marginPercent: number;
}

export interface OneOffParams {
  amountCents: number;
  date: DateKey;
  hasGst: boolean;
  direction: "in" | "out";
}

export type WhatIfParams = EmployeeParams | VehicleParams | WinJobParams | OneOffParams | Record<string, never>;

/** A line the user added by hand, on any template. */
export interface WhatIfLine {
  name: string;
  direction: "in" | "out";
  /** Each payment, positive, inc GST. */
  amountCents: number;
  hasGst: boolean;
  frequency: Frequency;
  startDate: DateKey;
  endDate: DateKey | null;
}

export interface WhatIfDefinition {
  id: string;
  name: string;
  template: WhatIfTemplate;
  isEnabled: boolean;
  params: WhatIfParams;
  lines: WhatIfLine[];
}

/** A repeating payment, signed (+ in, − out), with its GST share. */
export interface WhatIfStream {
  name: string;
  amountCents: number;
  gstCents: number;
  frequency: Frequency;
  startDate: DateKey;
  endDate: DateKey | null;
}

/** What the engine needs about one what-if. */
export interface WhatIfInput {
  id: string;
  name: string;
  enabled: boolean;
  streams: WhatIfStream[];
}

export interface WhatIfContext {
  clientPayDays: number;
  supplierPayDays: number;
}

// ─── Defaults for a new what-if ──────────────────────────────────────────────

export function defaultParams(template: WhatIfTemplate, today: DateKey): WhatIfParams {
  const nextMonth = addMonths(today, 1, 1);
  switch (template) {
    case "employee":
      return {
        role: "",
        payType: "salary",
        annualSalaryCents: 0,
        hourlyRateCents: 0,
        hoursPerWeek: 38,
        payCycle: "fortnightly",
        startDate: nextMonth,
        endDate: null,
        superPercent: 12,
        workcoverPercent: 2.8,
        payrollTaxPercent: 0,
      };
    case "vehicle":
      return {
        priceCents: 0,
        purchaseDate: nextMonth,
        payWith: "finance",
        depositCents: 0,
        termMonths: 60,
        ratePercent: 7.9,
        balloonCents: 0,
        regoInsuranceYearlyCents: 0,
        runningMonthlyCents: 0,
        savingsMonthlyCents: 0,
      };
    case "win_job":
      return { valueCents: 0, startDate: nextMonth, months: 6, winPercent: 100, marginPercent: 20 };
    case "one_off":
      return { amountCents: 0, date: nextMonth, hasGst: true, direction: "out" };
    default:
      return {};
  }
}

// ─── Maths ───────────────────────────────────────────────────────────────────

/**
 * Monthly repayment on a loan, with an optional balloon left owing at the end.
 * Standard amortisation: pmt = (P − B·(1+r)^−n) · r / (1 − (1+r)^−n).
 */
export function loanRepaymentCents(principalCents: number, ratePercent: number, months: number, balloonCents = 0): number {
  if (months <= 0 || principalCents <= 0) return 0;
  const r = ratePercent / 100 / 12;
  if (r === 0) return Math.round((principalCents - balloonCents) / months);
  const disc = Math.pow(1 + r, -months);
  return Math.round(((principalCents - balloonCents * disc) * r) / (1 - disc));
}

export function employeeAnnualGrossCents(p: EmployeeParams): number {
  return p.payType === "hourly" ? Math.round(p.hourlyRateCents * p.hoursPerWeek * 52) : p.annualSalaryCents;
}

export interface EmployeeCost {
  grossPerYearCents: number;
  wagesPerPayCents: number;
  superPerPayCents: number;
  workcoverPerYearCents: number;
  payrollTaxPerYearCents: number;
  totalPerYearCents: number;
  totalPerMonthCents: number;
}

export function employeeCost(p: EmployeeParams): EmployeeCost {
  const gross = employeeAnnualGrossCents(p);
  const pays = PAYS_PER_YEAR[p.payCycle];
  const wagesPerPay = Math.round(gross / pays);
  const superPerPay = Math.round((wagesPerPay * p.superPercent) / 100);
  const workcover = Math.round((gross * p.workcoverPercent) / 100);
  const payrollTax = Math.round((gross * p.payrollTaxPercent) / 100);
  const total = (wagesPerPay + superPerPay) * pays + workcover + payrollTax;
  return {
    grossPerYearCents: gross,
    wagesPerPayCents: wagesPerPay,
    superPerPayCents: superPerPay,
    workcoverPerYearCents: workcover,
    payrollTaxPerYearCents: payrollTax,
    totalPerYearCents: total,
    totalPerMonthCents: Math.round(total / 12),
  };
}

// ─── Expansion ───────────────────────────────────────────────────────────────

const out = (name: string, amountCents: number, hasGst: boolean, frequency: Frequency, startDate: DateKey, endDate: DateKey | null): WhatIfStream => ({
  name,
  amountCents: -amountCents,
  gstCents: hasGst ? gstOfInc(-amountCents) : 0,
  frequency,
  startDate,
  endDate,
});

function employeeStreams(p: EmployeeParams): WhatIfStream[] {
  const c = employeeCost(p);
  if (c.grossPerYearCents <= 0) return [];
  const label = p.role || "Employee";
  // Wages and super carry no GST; the first pay lands one pay cycle after they start.
  const firstPay = p.payCycle === "monthly" ? monthEnd(p.startDate) : addDays(p.startDate, p.payCycle === "weekly" ? 6 : 13);
  const streams = [
    out(`${label} — wages`, c.wagesPerPayCents, false, p.payCycle, firstPay, p.endDate),
    out(`${label} — super`, c.superPerPayCents, false, p.payCycle, firstPay, p.endDate),
  ];
  if (c.workcoverPerYearCents > 0) {
    streams.push(out(`${label} — WorkCover`, Math.round(c.workcoverPerYearCents / 12), false, "monthly", monthEnd(p.startDate), p.endDate));
  }
  if (c.payrollTaxPerYearCents > 0) {
    streams.push(out(`${label} — payroll tax`, Math.round(c.payrollTaxPerYearCents / 12), false, "monthly", addDays(monthEnd(p.startDate), 7), p.endDate));
  }
  return streams.filter((s) => s.amountCents !== 0);
}

function vehicleStreams(p: VehicleParams, name: string): WhatIfStream[] {
  const streams: WhatIfStream[] = [];
  if (p.priceCents <= 0) return streams;
  // The whole GST on the price comes back at the next BAS either way: buying
  // outright, or on a chattel mortgage (the business owns it from day one).
  const gstOnPrice = gstOfInc(-p.priceCents);

  if (p.payWith === "cash") {
    streams.push({ name: `${name} — purchase`, amountCents: -p.priceCents, gstCents: gstOnPrice, frequency: "once", startDate: p.purchaseDate, endDate: null });
  } else {
    const deposit = Math.min(p.depositCents, p.priceCents);
    const principal = p.priceCents - deposit;
    const repayment = loanRepaymentCents(principal, p.ratePercent, p.termMonths, p.balloonCents);
    streams.push({ name: `${name} — deposit`, amountCents: -deposit, gstCents: gstOnPrice, frequency: "once", startDate: p.purchaseDate, endDate: null });
    if (repayment > 0) {
      const first = addMonths(p.purchaseDate, 1);
      streams.push({
        name: `${name} — finance repayments`,
        amountCents: -repayment,
        gstCents: 0,
        frequency: "monthly",
        startDate: first,
        endDate: addMonths(p.purchaseDate, p.termMonths),
      });
    }
    if (p.balloonCents > 0) {
      streams.push({ name: `${name} — balloon`, amountCents: -p.balloonCents, gstCents: 0, frequency: "once", startDate: addMonths(p.purchaseDate, p.termMonths), endDate: null });
    }
  }
  if (p.regoInsuranceYearlyCents > 0) {
    // Rego is GST-free and insurance isn't; counted with no GST to stay cautious.
    streams.push(out(`${name} — rego & insurance`, p.regoInsuranceYearlyCents, false, "yearly", p.purchaseDate, null));
  }
  if (p.runningMonthlyCents > 0) {
    streams.push(out(`${name} — running costs`, p.runningMonthlyCents, true, "monthly", monthEnd(p.purchaseDate), null));
  }
  if (p.savingsMonthlyCents > 0) {
    streams.push({
      name: `${name} — savings`,
      amountCents: p.savingsMonthlyCents,
      gstCents: gstOfInc(p.savingsMonthlyCents),
      frequency: "monthly",
      startDate: monthEnd(p.purchaseDate),
      endDate: null,
    });
  }
  return streams.filter((s) => s.amountCents !== 0 || s.gstCents !== 0);
}

function winJobStreams(p: WinJobParams, name: string, ctx: WhatIfContext): WhatIfStream[] {
  if (p.valueCents <= 0 || p.months <= 0) return [];
  const weighted = (p.valueCents * Math.max(0, Math.min(100, p.winPercent))) / 100;
  const claim = Math.round(weighted / p.months);
  const cost = Math.round((weighted * (1 - p.marginPercent / 100)) / p.months);
  // A claim at each month end, paid after the client's days; costs after the supplier's.
  const firstClaim = addDays(monthEnd(p.startDate), ctx.clientPayDays);
  const firstCost = addDays(monthEnd(p.startDate), ctx.supplierPayDays);
  const claims: WhatIfStream = {
    name: `${name} — claims`,
    amountCents: claim,
    gstCents: gstOfInc(claim),
    frequency: "monthly",
    startDate: firstClaim,
    endDate: addMonths(firstClaim, p.months - 1),
  };
  return [claims, out(`${name} — job costs`, cost, true, "monthly", firstCost, addMonths(firstCost, p.months - 1))].filter(
    (s) => s.amountCents !== 0,
  );
}

function lineStream(l: WhatIfLine): WhatIfStream {
  const amount = l.direction === "in" ? l.amountCents : -l.amountCents;
  return { name: l.name, amountCents: amount, gstCents: l.hasGst ? gstOfInc(amount) : 0, frequency: l.frequency, startDate: l.startDate, endDate: l.endDate };
}

export function expandWhatIf(def: WhatIfDefinition, ctx: WhatIfContext): WhatIfInput {
  let streams: WhatIfStream[] = [];
  switch (def.template) {
    case "employee":
      streams = employeeStreams(def.params as EmployeeParams);
      break;
    case "vehicle":
      streams = vehicleStreams(def.params as VehicleParams, def.name);
      break;
    case "win_job":
      streams = winJobStreams(def.params as WinJobParams, def.name, ctx);
      break;
    case "one_off": {
      const p = def.params as OneOffParams;
      if (p.amountCents > 0) {
        streams = [lineStream({ name: def.name, direction: p.direction, amountCents: p.amountCents, hasGst: p.hasGst, frequency: "once", startDate: p.date, endDate: null })];
      }
      break;
    }
  }
  return {
    id: def.id,
    name: def.name,
    enabled: def.isEnabled,
    streams: [...streams, ...def.lines.filter((l) => l.amountCents > 0).map(lineStream)],
  };
}

/** Average cash per month over a year of the streams (signed). */
export function averageMonthlyCents(streams: WhatIfStream[], from: DateKey): number {
  let total = 0;
  const to = addMonths(from, 12);
  for (const s of streams) {
    if (s.frequency === "once") {
      if (s.startDate >= from && s.startDate < to) total += s.amountCents;
      continue;
    }
    const perYear = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1 }[s.frequency];
    total += s.amountCents * perYear;
  }
  return Math.round(total / 12);
}

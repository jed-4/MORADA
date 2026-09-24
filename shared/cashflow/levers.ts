// "Ways to make it work" — when a what-if takes the forecast below the
// safety buffer, try concrete changes and report the ones that help, with
// numbers. Pure: every option is a real engine run on a modified input, so a
// suggestion is only shown if the forecast says it works.

import { addMonths, monthLabel, type DateKey } from "./dates";
import { buildForecast } from "./engine";
import type { ForecastInput, ForecastResult } from "./types";
import {
  expandWhatIf,
  type EmployeeParams,
  type OneOffParams,
  type VehicleParams,
  type WhatIfContext,
  type WhatIfDefinition,
  type WinJobParams,
} from "./whatifs";

export interface Lever {
  id: string;
  label: string;
  lowestCents: number;
  lowestLabel: string;
  staysAboveBuffer: boolean;
}

/** Only worth showing if it lifts the lowest point by at least this much. */
const MIN_GAIN_CENTS = 100_000;
const MAX_LEVERS = 4;

const shiftKey = (d: DateKey | null, months: number) => (d ? addMonths(d, months) : d);

/** The same what-if, starting `months` later (every date moves together). */
export function shiftWhatIf(def: WhatIfDefinition, months: number): WhatIfDefinition {
  const p = def.params as any;
  let params = def.params;
  switch (def.template) {
    case "employee":
      params = { ...(p as EmployeeParams), startDate: shiftKey(p.startDate, months)!, endDate: shiftKey(p.endDate, months) };
      break;
    case "vehicle":
      params = { ...(p as VehicleParams), purchaseDate: shiftKey(p.purchaseDate, months)! };
      break;
    case "win_job":
      params = { ...(p as WinJobParams), startDate: shiftKey(p.startDate, months)! };
      break;
    case "one_off":
      params = { ...(p as OneOffParams), date: shiftKey(p.date, months)! };
      break;
  }
  return {
    ...def,
    params,
    lines: def.lines.map((l) => ({ ...l, startDate: shiftKey(l.startDate, months)!, endDate: shiftKey(l.endDate, months) })),
  };
}

/** The date the what-if starts, for "start it in May 27". */
function startOf(def: WhatIfDefinition): DateKey | null {
  const p = def.params as any;
  return p.startDate ?? p.purchaseDate ?? p.date ?? def.lines[0]?.startDate ?? null;
}

export function findLevers(
  input: ForecastInput,
  draft: WhatIfDefinition,
  others: WhatIfDefinition[],
  ctx: WhatIfContext,
): Lever[] {
  const run = (defs: WhatIfDefinition[], base: ForecastInput = input): ForecastResult =>
    buildForecast({ ...base, whatIfs: defs.map((d) => expandWhatIf({ ...d, isEnabled: true }, ctx)) });
  const now = run([...others, draft]);
  const buffer = input.settings.bufferCents;
  if (now.lowest.cents >= buffer) return [];

  const levers: Lever[] = [];
  const consider = (id: string, label: string, r: ForecastResult) => {
    if (r.lowest.cents - now.lowest.cents < MIN_GAIN_CENTS) return;
    levers.push({
      id,
      label,
      lowestCents: r.lowest.cents,
      lowestLabel: r.periods[r.lowest.periodIndex].label,
      staysAboveBuffer: r.firstBelowBufferIndex == null,
    });
  };

  // 1. Start it later: the first month that keeps the buffer, else the best
  // within six. The later start must still leave three months of forecast
  // after it — pushing it past the end only hides it.
  const start = startOf(draft);
  if (start) {
    const latestStart = now.periods[Math.max(0, now.periods.length - 3)].start;
    let best: { k: number; r: ForecastResult } | null = null;
    for (let k = 1; k <= 12 && addMonths(start, k) <= latestStart; k++) {
      const r = run([...others, shiftWhatIf(draft, k)]);
      if (r.firstBelowBufferIndex == null) {
        best = { k, r };
        break;
      }
      if (k <= 6 && (!best || r.lowest.cents > best.r.lowest.cents)) best = { k, r };
    }
    if (best) consider("delay", `Start it in ${monthLabel(addMonths(start, best.k))} instead`, best.r);
  }

  // 2. Win the prospective jobs already on the forecast.
  const prospective = input.jobs.filter((j) => j.winPercent < 100);
  if (prospective.length > 0) {
    const won = { ...input, jobs: input.jobs.map((j) => ({ ...j, winPercent: 100 })) };
    const names = prospective.map((j) => j.name);
    const label = names.length === 1 ? `If you win ${names[0]}` : `If you win ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    consider("win", label, run([...others, draft], won));
  }

  // 3. Vehicles: finance rather than cash, or a smaller deposit.
  if (draft.template === "vehicle") {
    const p = draft.params as VehicleParams;
    if (p.payWith === "cash" && p.priceCents > 0) {
      const financed = { ...draft, params: { ...p, payWith: "finance" as const, depositCents: Math.round(p.priceCents * 0.2), termMonths: 60, ratePercent: p.ratePercent || 7.9 } };
      consider("finance", "Finance it: 20% down over 5 years", run([...others, financed]));
    } else if (p.payWith === "finance" && p.depositCents > p.priceCents * 0.1) {
      const smaller = { ...draft, params: { ...p, depositCents: Math.round(p.priceCents * 0.1) } };
      consider("deposit", "Put 10% down instead", run([...others, smaller]));
    }
  }

  // 4. Leave out one of the other what-ifs.
  for (const o of others) {
    consider(`without:${o.id}`, `Without ${o.name}`, run([...others.filter((x) => x.id !== o.id), draft]));
  }

  return levers
    .sort((a, b) => Number(b.staysAboveBuffer) - Number(a.staysAboveBuffer) || b.lowestCents - a.lowestCents)
    .slice(0, MAX_LEVERS);
}

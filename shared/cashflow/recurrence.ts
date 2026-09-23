// Repeating payments — business expenses now, what-if lines in PR 3.

import { addDays, addMonths, parseKey, type DateKey } from "./dates";

export const FREQUENCIES = ["once", "weekly", "fortnightly", "monthly", "quarterly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** How many times a year a frequency falls — used for "per month" averages. */
export const TIMES_PER_YEAR: Record<Frequency, number> = {
  once: 0,
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/**
 * Every date a payment falls on inside [windowStart, windowEnd], starting from
 * `firstDate` and stopping after `endDate` (inclusive) when there is one.
 *
 * Monthly-type frequencies keep the first date's day of month, so a rent due
 * on the 31st lands on the 30th in September and back on the 31st in October
 * rather than drifting to the 30th for ever.
 */
export function occurrences(
  firstDate: DateKey,
  frequency: Frequency,
  endDate: DateKey | null,
  windowStart: DateKey,
  windowEnd: DateKey,
): DateKey[] {
  const out: DateKey[] = [];
  const stop = endDate && endDate < windowEnd ? endDate : windowEnd;
  if (firstDate > stop) return out;

  if (frequency === "once") {
    if (firstDate >= windowStart) out.push(firstDate);
    return out;
  }

  const anchorDay = parseKey(firstDate).day;
  const stepMonths = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : frequency === "yearly" ? 12 : 0;
  const stepDays = frequency === "weekly" ? 7 : frequency === "fortnightly" ? 14 : 0;

  // 600 steps covers weekly for over a decade — a guard, not a real limit.
  for (let i = 0; i < 600; i++) {
    const date = stepMonths ? addMonths(firstDate, i * stepMonths, anchorDay) : addDays(firstDate, i * stepDays);
    if (date > stop) break;
    if (date >= windowStart) out.push(date);
  }
  return out;
}

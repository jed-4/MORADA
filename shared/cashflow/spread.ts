import { addMonths, monthEnd, monthStart, type DateKey } from "./dates";

/**
 * Split `total` cents into `parts` whole-cent pieces that add back to exactly
 * `total`. The leftover cents go to the earliest pieces, so the split never
 * loses or invents money.
 */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(total));
  const base = Math.floor(abs / parts);
  let remainder = abs - base * parts;
  const out: number[] = [];
  for (let i = 0; i < parts; i++) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    out.push(sign * (base + extra));
  }
  return out;
}

/**
 * One date per calendar month that overlaps [from, to]: the month's last day,
 * except the final month, which ends on `to` itself.
 *
 * This is where an evenly spread job claims each month — a progress claim at
 * the end of the month for the work done in it.
 */
export function monthlyClaimDates(from: DateKey, to: DateKey): DateKey[] {
  if (to < from) return [];
  const dates: DateKey[] = [];
  let cursor = monthStart(from);
  for (let i = 0; i < 240 && cursor <= to; i++) {
    const end = monthEnd(cursor);
    dates.push(end < to ? end : to);
    cursor = addMonths(cursor, 1, 1);
  }
  return dates;
}

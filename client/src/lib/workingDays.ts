import { addDays, format } from "date-fns";

/**
 * Canonical working-day date math for schedules (Gantt, Schedule table,
 * cascade). A "working day" is any day that is not excluded by the schedule's
 * includeSaturday / includeSunday flags or (optionally) a holiday list.
 *
 * IMPORTANT: none of these functions normalise the time-of-day of their
 * inputs (except countWorkingDays in inclusive mode — see below). Callers
 * that feed results into .toISOString() rely on the time component being
 * preserved, so do not add setHours(0,0,0,0) here.
 */

/** Predicate: true when the given date is NOT a working day. */
export type IsNonWorkingDay = (date: Date) => boolean;

/** Weekend flags + optional holiday list describing a schedule's calendar. */
export interface WorkingDayCalendar {
  includeSaturday?: boolean | null;
  includeSunday?: boolean | null;
  /** Company holidays / schedule-specific non-working dates. Only `date` is read. */
  holidays?: ReadonlyArray<{ date: string | Date }>;
}

/**
 * True when `date` falls on an excluded weekend day or (if `calendar.holidays`
 * is provided) on a listed holiday. Holiday comparison is done on the local
 * `yyyy-MM-dd` representation of both dates.
 */
export function isNonWorkingDay(date: Date, calendar: WorkingDayCalendar): boolean {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0 && !calendar.includeSunday) return true;
  if (day === 6 && !calendar.includeSaturday) return true;
  const holidays = calendar.holidays;
  if (holidays && holidays.length > 0) {
    const dateStr = format(date, "yyyy-MM-dd");
    if (holidays.some(h => format(new Date(h.date as any), "yyyy-MM-dd") === dateStr)) {
      return true;
    }
  }
  return false;
}

/**
 * Move `date` day-by-day in `direction` until it lands on a working day.
 * Returns the date unchanged if it is already a working day. `maxIterations`
 * bounds the search (guards against calendars with no working days).
 */
export function snapToWorkingDay(
  date: Date,
  direction: "forward" | "backward",
  isNonWorking: IsNonWorkingDay,
  maxIterations: number = 14,
): Date {
  let d = new Date(date);
  const step = direction === "forward" ? 1 : -1;
  let remaining = maxIterations;
  while (isNonWorking(d) && remaining > 0) {
    d = addDays(d, step);
    remaining--;
  }
  return d;
}

/**
 * Count working days between two dates.
 *
 * Default mode (end-exclusive): counts working days in [start, end) when
 * start <= end, or in [end, start) when start > end (still returns a positive
 * count). Time-of-day is respected in the comparison, matching the historical
 * Gantt implementation. A task's working DURATION in this mode is
 * countWorkingDays(start, end) + 1 style arithmetic handled by callers.
 *
 * Inclusive mode ({ inclusive: true }): normalises both dates to local
 * midnight, counts working days in [start, end] (both ends counted, so
 * D0 -> D0 = 1) and returns 0 when start > end. This matches the historical
 * Schedule-page implementation, where the result is used directly as a
 * task duration in days.
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  isNonWorking: IsNonWorkingDay,
  opts?: { inclusive?: boolean },
): number {
  let count = 0;
  if (opts?.inclusive) {
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    const e = new Date(end);
    e.setHours(0, 0, 0, 0);
    if (s <= e) {
      let current = new Date(s);
      while (current <= e) {
        if (!isNonWorking(current)) count++;
        current = addDays(current, 1);
      }
    }
    return count;
  }
  const s = new Date(start);
  const e = new Date(end);
  const forward = s <= e;
  let current = new Date(s);
  if (forward) {
    while (current < e) {
      if (!isNonWorking(current)) count++;
      current = addDays(current, 1);
    }
  } else {
    while (current > e) {
      current = addDays(current, -1);
      if (!isNonWorking(current)) count++;
    }
  }
  return count;
}

/**
 * Return the date `days` working days after (or before, when negative) `date`,
 * skipping non-working days. The starting date itself is never counted:
 * addWorkingDays(Fri, 1) with weekends excluded = Mon. addWorkingDays(x, 0) = x.
 */
export function addWorkingDays(date: Date, days: number, isNonWorking: IsNonWorkingDay): Date {
  let d = new Date(date);
  let remaining = Math.abs(days);
  const step = days >= 0 ? 1 : -1;
  while (remaining > 0) {
    d = addDays(d, step);
    if (!isNonWorking(d)) remaining--;
  }
  return d;
}

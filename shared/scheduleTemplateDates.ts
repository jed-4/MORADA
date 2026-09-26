/**
 * Working-day placement for copying a schedule onto another calendar.
 *
 * A schedule template is a real schedule whose dates sit against a fixed
 * anchor Monday (TEMPLATE_ANCHOR_DAY). Its dates mean nothing on their own;
 * what a template carries is each item's OFFSET in working days from day 0,
 * and its DURATION in working days. Applying a template, or saving a project
 * schedule as one, re-places every item on the target calendar by those two
 * numbers — so a 5-day task stays 5 working days even when the target skips
 * a public holiday the source didn't.
 *
 * Everything here works on 'yyyy-MM-dd' calendar days in UTC, the convention
 * shared/scheduleDates.ts sets for schedule dates. Nothing reads local time,
 * so the result is the same on a Mac in AEST and a server in UTC.
 */

import { scheduleDayString } from "./scheduleDates";

/**
 * Day 0 of every template. A Monday, so a template with the default Mon–Fri
 * week starts its Day 1 on a working day. Only template schedules use it, and
 * template schedules never read holidays, so the date itself never matters.
 */
export const TEMPLATE_ANCHOR_DAY = "2024-01-01";

export interface DayCalendar {
  includeSaturday?: boolean | null;
  includeSunday?: boolean | null;
  /** 'yyyy-MM-dd' days that are not worked. Templates pass none. */
  holidays?: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

/**
 * The day a STORED schedule date means. Item dates are written as UTC midnight
 * (shared/scheduleDates.ts), so a Date is read in UTC — reading its local
 * fields would give the previous day on any server west of Greenwich.
 */
export function storedDay(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return scheduleDayString(value);
}

function toUTC(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}
function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addCalendarDays(day: string, n: number): string {
  return fromUTC(toUTC(day) + n * DAY_MS);
}

export function isWorkingDay(day: string, cal: DayCalendar): boolean {
  const dow = new Date(toUTC(day)).getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 0 && !cal.includeSunday) return false;
  if (dow === 6 && !cal.includeSaturday) return false;
  return !cal.holidays?.has(day);
}

/** `day` if it is worked, else the next day that is. */
export function snapForward(day: string, cal: DayCalendar): string {
  let d = day;
  // A calendar with no working days at all would loop forever; 366 is a year.
  for (let i = 0; i < 366 && !isWorkingDay(d, cal); i++) d = addCalendarDays(d, 1);
  return d;
}

/** Move `n` working days forward from `day` (snapped forward first). */
export function addWorkingDays(day: string, n: number, cal: DayCalendar): string {
  let d = snapForward(day, cal);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d = addCalendarDays(d, 1);
    if (isWorkingDay(d, cal)) left--;
  }
  return d;
}

/**
 * Working days from `day0` to `day`: 0 when `day` is day 0 itself, 1 for the
 * next working day, and so on. A `day` that isn't worked counts as the next
 * working day. Negative when `day` is before `day0`.
 */
export function workingOffset(day0: string, day: string, cal: DayCalendar): number {
  const from = snapForward(day0, cal);
  const to = snapForward(day, cal);
  if (to === from) return 0;
  const forward = to > from;
  let d = from;
  let n = 0;
  // Bounded walk: a schedule spans years at most.
  for (let i = 0; i < 20_000 && d !== to; i++) {
    d = addCalendarDays(d, forward ? 1 : -1);
    if (isWorkingDay(d, cal)) n++;
  }
  return forward ? n : -n;
}

export interface PlaceableItem {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  /** Per-item "work weekends too" override. */
  useWorkingDaysOverride?: boolean | null;
}

export interface Placement {
  start: string;
  end: string;
  duration: number;
}

/**
 * Re-place items from one calendar onto another.
 *
 *   offset   = working days from `sourceDay0` to the item's start (source calendar)
 *   duration = working days start..end inclusive (source calendar)
 *   start'   = `targetDay0` + offset working days (target calendar)
 *   end'     = start' + duration - 1 working days (target calendar)
 *
 * An item with useWorkingDaysOverride counts every day, on both sides, which is
 * what that flag means on a project schedule.
 */
export function placeItems(
  items: PlaceableItem[],
  source: { day0: string; calendar: DayCalendar },
  target: { day0: string; calendar: DayCalendar },
): Map<string, Placement> {
  const everyDay: DayCalendar = { includeSaturday: true, includeSunday: true };
  const out = new Map<string, Placement>();
  for (const item of items) {
    const s = storedDay(item.startDate);
    const e = storedDay(item.endDate);
    const srcCal = item.useWorkingDaysOverride ? everyDay : source.calendar;
    const tgtCal = item.useWorkingDaysOverride ? everyDay : target.calendar;
    // Offsets are always measured on the schedule's own week, so an override
    // item keeps its place in the sequence and only its length is every-day.
    const offset = Math.max(0, workingOffset(source.day0, s, source.calendar));
    const duration = e < s ? 1 : workingOffset(s, e, srcCal) + 1;
    const start = addWorkingDays(target.day0, offset, target.calendar);
    const end = addWorkingDays(start, Math.max(1, duration) - 1, tgtCal);
    out.set(item.id, { start, end, duration: Math.max(1, duration) });
  }
  return out;
}

/** "Day N" label for a date on a template schedule (Day 1 = the anchor). */
export function templateDayNumber(day: Date | string, cal: DayCalendar): number {
  return workingOffset(TEMPLATE_ANCHOR_DAY, storedDay(day), { ...cal, holidays: undefined }) + 1;
}

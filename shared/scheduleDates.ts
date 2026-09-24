/**
 * Schedule dates are DAYS, not instants.
 *
 * `schedule_items.start_date` / `end_date` are `timestamp` columns, but nothing
 * in a construction programme happens at a time of day: a bar covers Monday to
 * Friday. The convention every read path assumes — the Gantt takes
 * `iso.substring(0, 10)` — is therefore:
 *
 *     the calendar day, stored as UTC midnight.
 *
 * The trap this file exists to close: date arithmetic written with
 * `setHours(0, 0, 0, 0)` produces LOCAL midnight. On a server east of UTC that
 * is the previous day's afternoon in UTC — 2026-11-09 local becomes
 * 2026-11-08T13:00:00Z — so the Gantt, reading the UTC day, drew the bar a day
 * early. It looked like the dependency cascade had slipped; it was the write.
 *
 * Anything writing a schedule date goes through here.
 */

/** 'yyyy-MM-dd' exactly — a date with no time to lose in a conversion. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar day of `value`, as UTC midnight.
 *
 * A Date is read in LOCAL time, because a Date that came out of day arithmetic
 * (`setHours(0,0,0,0)`, `setDate(d + 1)`) carries the intended day in its local
 * fields. A 'yyyy-MM-dd' string is taken at face value.
 */
export function scheduleDayUTC(value: Date | string): Date {
  if (typeof value === "string") {
    if (DATE_ONLY.test(value)) return new Date(`${value}T00:00:00.000Z`);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return parsed;
    // An ISO instant: its UTC day is what every reader already believes.
    return new Date(`${parsed.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }
  if (Number.isNaN(value.getTime())) return value;
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

/** The same day as 'yyyy-MM-dd', for JSON payloads and comparisons. */
export function scheduleDayString(value: Date | string): string {
  return scheduleDayUTC(value).toISOString().slice(0, 10);
}

/** True when a stored value is already the day-at-UTC-midnight this file wants. */
export function isScheduleDayUTC(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

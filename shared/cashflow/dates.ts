// Calendar-date arithmetic for the cashflow forecast.
//
// Every date in the forecast is a plain calendar day, carried as a
// 'YYYY-MM-DD' string (a DateKey). Strings compare correctly with < and >,
// never shift with the server's time zone, and serialise as-is to the client.
//
// Timestamps from the database (bills.due_date, client_invoices.due_date …)
// are converted with toDateKey(), which reads the calendar day in the
// company's zone. Going through toISOString() instead gives the UTC day, which
// for anything picked at local midnight in AEST is the day BEFORE — the bug
// the HBCF work hit with week keys.

export type DateKey = string;

export const DEFAULT_TIME_ZONE = "Australia/Sydney";

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function makeKey(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseKey(key: DateKey): { year: number; month: number; day: number } {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Not a date key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/**
 * The calendar day a stored value means.
 *
 * - A 'YYYY-MM-DD…' string (the text date columns on projects) is taken
 *   literally — it already IS a calendar day.
 * - A Date (timestamp columns) is read in `timeZone`.
 */
export function toDateKey(value: Date | string | null | undefined, timeZone: string = DEFAULT_TIME_ZONE): DateKey | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const m = KEY_RE.exec(value);
    if (m && value.length === 10) return makeKey(Number(m[1]), Number(m[2]), Number(m[3]));
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return m ? makeKey(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    return toDateKey(d, timeZone);
  }
  if (Number.isNaN(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return makeKey(get("year"), get("month"), get("day"));
}

// Day arithmetic runs on UTC midnights so daylight saving never adds or loses
// a day.
function toUtc(key: DateKey): number {
  const { year, month, day } = parseKey(key);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(ms: number): DateKey {
  const d = new Date(ms);
  return makeKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromUtc(toUtc(key) + days * 86_400_000);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthStart(key: DateKey): DateKey {
  const { year, month } = parseKey(key);
  return makeKey(year, month, 1);
}

export function monthEnd(key: DateKey): DateKey {
  const { year, month } = parseKey(key);
  return makeKey(year, month, daysInMonth(year, month));
}

/**
 * Same day-of-month `months` later, clamped to the month's length
 * (31 Jan + 1 month = 28/29 Feb).
 */
export function addMonths(key: DateKey, months: number, anchorDay?: number): DateKey {
  const { year, month, day } = parseKey(key);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return makeKey(y, m, Math.min(anchorDay ?? day, daysInMonth(y, m)));
}

export function minKey(a: DateKey, b: DateKey): DateKey {
  return a < b ? a : b;
}

export function maxKey(a: DateKey, b: DateKey): DateKey {
  return a > b ? a : b;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 26" */
export function monthLabel(key: DateKey): string {
  const { year, month } = parseKey(key);
  return `${MONTH_LABELS[month - 1]} ${String(year % 100).padStart(2, "0")}`;
}

/** "6 Oct" */
export function dayLabel(key: DateKey): string {
  const { month, day } = parseKey(key);
  return `${day} ${MONTH_LABELS[month - 1]}`;
}

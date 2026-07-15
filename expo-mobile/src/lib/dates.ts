// Shared date-only helpers.
//
// Convention: a "date string" is a LOCAL calendar day formatted YYYY-MM-DD.
// Never derive a calendar day via toISOString()/split('T') — that yields the
// UTC day, which in Australia (UTC+10/+11) is yesterday for any local time
// before 10-11am.

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of a Date as YYYY-MM-DD. */
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Local calendar day of an API date value as YYYY-MM-DD.
 * Date-only strings ("2026-07-15") are returned as-is — parsing them would
 * interpret them as UTC midnight and can shift the day. Timestamps are
 * converted to the device's local day.
 */
export function dateStrOf(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return toLocalDateStr(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return toLocalDateStr(d);
}

/** Parse a YYYY-MM-DD string as LOCAL midnight (new Date('YYYY-MM-DD') is UTC). */
export function fromLocalDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** ISO timestamp whose calendar-day component is the LOCAL day (for date-only storage). */
export function localDayISOString(d: Date = new Date()): string {
  return `${toLocalDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function isToday(value: string | Date): boolean {
  return dateStrOf(value) === toLocalDateStr(new Date());
}

export function isOverdue(value: string | Date): boolean {
  const s = dateStrOf(value);
  return !!s && s < toLocalDateStr(new Date());
}

/** Relative day label: Today / Tomorrow / Yesterday / "15 Jul". */
export function relativeDay(value: string | Date): string {
  const s = dateStrOf(value);
  if (!s) return '';
  const today = new Date();
  const target = fromLocalDateStr(s);
  const diffDays = Math.round(
    (target.getTime() - fromLocalDateStr(toLocalDateStr(today)).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return target.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

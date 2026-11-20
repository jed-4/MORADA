/**
 * One rate per timesheet.
 *
 * A timesheet owns the only hourly rate. A cost-code split is just a cost code
 * and some hours: its rate is always the timesheet's rate and its dollars are
 * always split hours × that rate. Splits used to carry their own typed rate,
 * which drifted from the timesheet (a 0.5h × $50 entry carried a $7,550 split
 * rate and showed $3,775 in the Timesheets list while the dialog said $25).
 *
 * A single split row is a legacy "mirror" of the timesheet (old saves, and the
 * mobile apps, wrote one on every entry). It is not a real split, so it also
 * takes the timesheet's hours.
 *
 * Timesheet money is numeric(10,2) dollars, returned by Drizzle as strings.
 */

export interface SplitHeader {
  duration: string | number | null | undefined;
  hourlyRate: string | number | null | undefined;
}

export interface SplitRow {
  duration: string | number | null | undefined;
  hourlyRate: string | number | null | undefined;
  total: string | number | null | undefined;
}

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/** The rate/hours/total a split row SHOULD hold, given its timesheet. */
export function normalisedSplit(
  header: SplitHeader,
  split: SplitRow,
  splitCount: number,
): { duration: string; hourlyRate: string; total: string } {
  const rate = num(header.hourlyRate);
  const hours = splitCount === 1 ? num(header.duration) : num(split.duration);
  return {
    duration: money(hours),
    hourlyRate: money(rate),
    total: money(hours * rate),
  };
}

/** True when a stored split row disagrees with what it should hold. */
export function splitNeedsNormalising(header: SplitHeader, split: SplitRow, splitCount: number): boolean {
  const want = normalisedSplit(header, split, splitCount);
  return (
    money(num(split.duration)) !== want.duration ||
    money(num(split.hourlyRate)) !== want.hourlyRate ||
    money(num(split.total)) !== want.total
  );
}

/** Only two or more rows is a real split; one row is the legacy mirror. */
export function isRealSplit(splits: readonly unknown[] | null | undefined): boolean {
  return (splits?.length ?? 0) > 1;
}

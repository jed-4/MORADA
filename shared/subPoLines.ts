/**
 * Subcontractor PO lines for one timesheet.
 *
 * A timesheet split across cost codes becomes one PO line per split, so the
 * PO (and the bill raised from it) carries the same cost-code breakdown as the
 * timesheet. This matches how labour hours are attributed everywhere else
 * (shared/labourHoursEntries): a real split's rows are the allocation and the
 * timesheet's own code is ignored.
 *
 * Hours come from the split rows, not their dollars: subcontractor timesheets
 * are deliberately $0, and the price is the subbie's profile cost rate. The
 * Timesheet dialog won't save a split whose hours don't add up to the total,
 * so the lines sum to the timesheet's hours.
 *
 * Every line keeps the timesheet's id, so a timesheet can own several lines.
 */
import { isRealSplit } from "./timesheetSplits";

export interface SubPoTimesheet {
  id: string;
  duration: string | number | null | undefined;
  costCodeId: string | null | undefined;
}

export interface SubPoSplit {
  costCodeId: string;
  duration: string | number | null | undefined;
}

export interface SubPoLinePart {
  hours: number;
  costCodeId: string | null;
  /** 1-based position and count when the timesheet is split, else null. */
  splitOf: { index: number; count: number } | null;
}

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

export function subPoLineParts(ts: SubPoTimesheet, splits: readonly SubPoSplit[]): SubPoLinePart[] {
  if (!isRealSplit(splits)) {
    return [{ hours: num(ts.duration), costCodeId: ts.costCodeId || null, splitOf: null }];
  }
  return splits.map((s, i) => ({
    hours: num(s.duration),
    costCodeId: s.costCodeId,
    splitOf: { index: i + 1, count: splits.length },
  }));
}

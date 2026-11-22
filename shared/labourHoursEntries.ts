/**
 * Labour Hours drill-down attribution (pure). MUST match
 * storage.recalculateLabourHoursBudget so the list adds up to the clicked
 * figure: splits → their own cost code; otherwise the timesheet's cost code,
 * else its work item's; pending = "submitted"; subcontractor hours count.
 */
export type LabourHoursStatus = "submitted" | "approved";

export interface LabourHoursEntry {
  timesheetId: string;
  userId: string;
  workerName: string;
  isSubcontractor: boolean;
  date: string | null;
  hours: number;
  status: string;
  poStatus: string | null;
  description: string | null;
  /** True when this is one split of a timesheet spread over several codes. */
  isSplit: boolean;
}

type TsRow = {
  id: string;
  userId: string;
  date: Date | string | null;
  duration: string | null;
  status: string;
  poStatus: string | null;
  description: string | null;
  costCodeId: string | null;
  workItemId: string | null;
};
type SplitRow = { timesheetId: string; costCodeId: string | null; duration: string | null };

/** Pure attribution — exported for tests. */
export function pickLabourHoursEntries(input: {
  timesheets: TsRow[];
  splits: SplitRow[];
  workItemCostCode: Map<string, string>;
  costCodeId: string;
  status: LabourHoursStatus;
}): Array<Omit<LabourHoursEntry, "workerName" | "isSubcontractor">> {
  const splitsByTs = new Map<string, SplitRow[]>();
  for (const s of input.splits) {
    const arr = splitsByTs.get(s.timesheetId) || [];
    arr.push(s);
    splitsByTs.set(s.timesheetId, arr);
  }
  const out: Array<Omit<LabourHoursEntry, "workerName" | "isSubcontractor">> = [];
  for (const ts of input.timesheets) {
    if (ts.status !== input.status) continue;
    const base = {
      timesheetId: ts.id,
      userId: ts.userId,
      date: ts.date ? new Date(ts.date).toISOString() : null,
      status: ts.status,
      poStatus: ts.poStatus,
      description: ts.description,
    };
    const tsSplits = splitsByTs.get(ts.id);
    if (tsSplits && tsSplits.length > 0) {
      const hours = tsSplits
        .filter((s) => s.costCodeId === input.costCodeId)
        .reduce((sum, s) => sum + (parseFloat(s.duration || "0") || 0), 0);
      if (hours > 0) out.push({ ...base, hours, isSplit: tsSplits.length > 1 });
      continue;
    }
    const hours = parseFloat(ts.duration || "0") || 0;
    if (hours <= 0) continue;
    const code = ts.costCodeId || (ts.workItemId ? input.workItemCostCode.get(ts.workItemId) : undefined) || null;
    if (code === input.costCodeId) out.push({ ...base, hours, isSplit: false });
  }
  out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return out;
}

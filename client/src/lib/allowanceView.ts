// The Allowances page's view of a project, shared so every allowance picker
// shows exactly the same rows in the same order.
//
// The Allowances page lists the PC/PS lines of ONE estimate — the one picked
// in its estimate dropdown, remembered per project, defaulting to the working
// estimate. /api/projects/:id/allowances returns the lines of EVERY estimate,
// so a picker that doesn't scope shows each allowance once per revision.

export const ALLOWANCES_GROUP_ITEMS_KEY = "allowances-group-items";

export function selectedEstimateStorageKey(projectId: string): string {
  return `allowances-selected-estimate-${projectId}`;
}

/** The estimate the Allowances page is showing for this project. */
export function resolveAllowanceEstimateId(
  projectId: string | null | undefined,
  estimates: Array<{ id: string; status?: string | null }>,
): string | null {
  if (!projectId || estimates.length === 0) return null;
  try {
    const stored = localStorage.getItem(selectedEstimateStorageKey(projectId));
    if (stored && estimates.some((e) => e.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return (estimates.find((e) => e.status === "working") ?? estimates[0]).id;
}

export function readGroupItemsPreference(): boolean {
  try {
    return localStorage.getItem(ALLOWANCES_GROUP_ITEMS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeGroupItemsPreference(v: boolean): void {
  try {
    localStorage.setItem(ALLOWANCES_GROUP_ITEMS_KEY, String(v));
  } catch {
    /* ignore */
  }
}

type GroupedRow = { item: { name: string; groupName?: string | null; groupOrder?: number | null } };

/** The estimate group a row sits in, as the Allowances page names it. */
export function allowanceGroupKey(a: GroupedRow): string {
  return a.item.groupName?.trim() || "Ungrouped";
}

const byName = (x: GroupedRow, y: GroupedRow) =>
  x.item.name.localeCompare(y.item.name, undefined, { numeric: true, sensitivity: "base" });

/**
 * Rows as [groupName, rows][]: estimate groups in estimate order (Ungrouped
 * last) when grouped, else one unnamed group sorted A–Z. Rows inside a group
 * are A–Z too.
 */
export function groupAllowanceRows<T extends GroupedRow>(rows: T[], grouped: boolean): Array<[string, T[]]> {
  if (!grouped) return [["", [...rows].sort(byName)]];
  const groups = new Map<string, T[]>();
  const order = new Map<string, number>();
  for (const r of rows) {
    const k = allowanceGroupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
    const o = r.item.groupOrder;
    if (typeof o === "number" && (!order.has(k) || o < order.get(k)!)) order.set(k, o);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "Ungrouped") return 1;
      if (b === "Ungrouped") return -1;
      const oa = order.get(a);
      const ob = order.get(b);
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      if (oa != null && ob == null) return -1;
      if (oa == null && ob != null) return 1;
      return a.localeCompare(b);
    })
    .map(([k, list]) => [k, list.sort(byName)]);
}

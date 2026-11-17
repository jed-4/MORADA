export type TimesheetViewScope = { viewScope: string; viewableRoleIds: string[] };

export type TimesheetScopeRow = {
  key: string;
  allowedActions: unknown;
  viewScope: string | null;
  viewableRoleIds: unknown;
};

/**
 * Combine a role's timesheet permission rows into one view scope.
 * Rows that don't grant "view" are ignored. "all" beats "selected_roles",
 * which beats "own"; selected role ids are unioned across rows.
 */
export function resolveTimesheetViewScope(rows: TimesheetScopeRow[]): TimesheetViewScope {
  let best: "own" | "selected_roles" | "all" = "own";
  const roleIds = new Set<string>();

  for (const row of rows) {
    const actions = Array.isArray(row.allowedActions) ? row.allowedActions : [];
    if (!actions.includes("view")) continue;

    if (row.viewScope === "all") {
      best = "all";
    } else if (row.viewScope === "selected_roles") {
      if (best === "own") best = "selected_roles";
      if (Array.isArray(row.viewableRoleIds)) {
        for (const id of row.viewableRoleIds) if (typeof id === "string") roleIds.add(id);
      }
    }
  }

  if (best === "all") return { viewScope: "all", viewableRoleIds: [] };
  if (best === "selected_roles") return { viewScope: "selected_roles", viewableRoleIds: Array.from(roleIds) };
  return { viewScope: "own", viewableRoleIds: [] };
}

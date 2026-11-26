/**
 * Which labour hours a role may see — by COST CATEGORY.
 *
 * "Labour Hours Budget" (`financial.budget_labour`) used to be all-or-nothing:
 * a role saw every cost code's hours or none. A company groups its cost codes
 * into categories (e.g. "Labour management", "Labour on-site",
 * "Subcontractors"), and a foreman should track the on-site hours without
 * seeing the management ones.
 *
 * Stored on the role's `financial.budget_labour` row, reusing the view-scope
 * columns every permission row already has (no migration):
 *   view_scope        = "cost_categories"
 *   viewable_role_ids = the cost CATEGORY ids (the column name is historical —
 *                       on this one key it holds categories, not roles)
 * Any other view_scope on that row ("own", "all", null — older rows were saved
 * "own") means every cost code, exactly as before.
 *
 * A role limited this way only ever sees hours, never money: it does not
 * count as "financial" access (dashboard money widgets) and it cannot manage
 * allowances, both of which a full Labour Hours grant still unlocks.
 */

export const LABOUR_HOURS_PERMISSION_KEY = "financial.budget_labour";
export const COST_CATEGORY_SCOPE = "cost_categories";

export interface LabourHoursScopeRow {
  key: string;
  allowedActions: unknown;
  viewScope?: string | null;
  viewableRoleIds?: unknown;
}

/**
 * The cost categories a role is limited to, or null when it isn't limited
 * (sees every cost code — or has no grant at all, which the permission check
 * handles separately).
 */
export function labourHoursCategoryScope(rows: LabourHoursScopeRow[]): string[] | null {
  const row = rows.find((r) => r.key === LABOUR_HOURS_PERMISSION_KEY);
  if (!row) return null;
  const actions = Array.isArray(row.allowedActions) ? row.allowedActions : [];
  if (!actions.includes("view")) return null;
  if (row.viewScope !== COST_CATEGORY_SCOPE) return null;
  const ids = Array.isArray(row.viewableRoleIds) ? row.viewableRoleIds : [];
  return ids.filter((id): id is string => typeof id === "string");
}

/**
 * Keep only the hours rows whose cost code sits in an allowed category. A cost
 * code with no category, or one that no longer exists, is hidden from a
 * limited role — it can't be shown to be in scope.
 */
export function filterLabourHoursRows<T extends { costCodeId?: string | null }>(
  rows: T[],
  categoryIds: string[] | null,
  categoryOfCostCode: Map<string, string | null>,
): T[] {
  if (categoryIds === null) return rows;
  const allowed = new Set(categoryIds);
  return rows.filter((r) => {
    const cat = r.costCodeId ? categoryOfCostCode.get(r.costCodeId) : null;
    return !!cat && allowed.has(cat);
  });
}

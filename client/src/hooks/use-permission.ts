import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";

export type PermissionAction = "view" | "add" | "edit" | "delete" | "approve" | "send" | "close";

interface AuthUserWithPerms {
  roleId?: string | null;
  roleName?: string | null;
  userCategory?: string | null;
  isAdminLike?: boolean;
  effectivePermissions?: Record<string, string[]>;
  /** Labour hours limited to these cost categories; null/absent = all. */
  labourHoursCostCategoryIds?: string[] | null;
}

/**
 * usePermission(key, action='view') — returns true if the current user has the
 * given permission key/action. Admin / Owner / General Manager built-in roles
 * always pass via the server-supplied `isAdminLike` flag (mirrors the
 * `requirePermission` middleware bypass).
 *
 * Effective permissions are read from the `effectivePermissions` map on the
 * authenticated user (populated by GET /api/auth/user).
 */
export function usePermission(
  key: string,
  action: PermissionAction = "view",
): boolean {
  const { user } = useAuth();
  return useMemo(() => {
    const u = user as AuthUserWithPerms | null;
    if (!u) return false;
    if (u.isAdminLike) return true;
    const allowed = u.effectivePermissions?.[key];
    return Array.isArray(allowed) && allowed.includes(action);
  }, [user, key, action]);
}

/**
 * useFinancialPermission() — convenience helper returning true if the user
 * can view ANY financial-category permission (budget, bills, or invoices).
 */
export function useFinancialPermission(): boolean {
  const { user } = useAuth();
  return useMemo(() => {
    const u = user as AuthUserWithPerms | null;
    if (!u) return false;
    if (u.isAdminLike) return true;
    const perms = u.effectivePermissions ?? {};
    // Labour hours limited to some cost categories is hours only — it doesn't
    // open the money widgets (shared/labourHoursScope.ts).
    const labourLimited = Array.isArray(u.labourHoursCostCategoryIds);
    const keys = [
      ...(labourLimited ? [] : ["financial.budget_labour"]),
      "financial.budget_actuals",
      "financial.bills",
      "dashboard.financial",
    ];
    return keys.some((k) => Array.isArray(perms[k]) && perms[k].includes("view"));
  }, [user]);
}

/**
 * The cost categories the user's labour hours are limited to, or null when
 * they see every cost code. The server filters the hours itself; this is for
 * saying so on screen.
 */
export function useLabourHoursCategoryScope(): string[] | null {
  const { user } = useAuth();
  const ids = (user as AuthUserWithPerms | null)?.labourHoursCostCategoryIds;
  return Array.isArray(ids) ? ids : null;
}

/**
 * useBudgetAccess() — how much of the cost budget (financial.budget_actuals)
 * the user may see, by the same rule as getBudgetAccess on the server:
 *   full    — admin-like, or View ticked
 *   summary — Summary Only ticked without View
 *   none    — neither
 * View wins when both are ticked (the default roles carry both).
 * Only a hint for what to fetch; the server enforces it, and the Budget page
 * follows the `access` field on cost-summary.
 */
export function useBudgetAccess(): "full" | "summary" | "none" {
  const { user } = useAuth();
  return useMemo(() => {
    const u = user as AuthUserWithPerms | null;
    if (!u) return "none";
    if (u.isAdminLike) return "full";
    const allowed = u.effectivePermissions?.["financial.budget_actuals"] ?? [];
    if (allowed.includes("view")) return "full";
    if (allowed.includes("summary_only")) return "summary";
    return "none";
  }, [user]);
}

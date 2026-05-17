import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";

export type PermissionAction = "view" | "add" | "edit" | "delete" | "approve";

interface AuthUserWithPerms {
  roleId?: string | null;
  roleName?: string | null;
  userCategory?: string | null;
  isAdminLike?: boolean;
  effectivePermissions?: Record<string, string[]>;
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
    const keys = [
      "financial.budget_labour",
      "financial.budget_actuals",
      "financial.bills",
      "financial.invoices",
    ];
    return keys.some((k) => Array.isArray(perms[k]) && perms[k].includes("view"));
  }, [user]);
}

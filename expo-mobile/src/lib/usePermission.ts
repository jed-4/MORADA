import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete' | 'approve';

/**
 * Native counterpart to the web client's usePermission. Reads the
 * effectivePermissions map returned by GET /api/auth/user, with the same
 * admin bypass the requirePermission middleware applies server-side.
 *
 * This gates what the UI offers, not what the API allows — every endpoint
 * behind it still enforces its own permission check.
 */
export function usePermission(key: string, action: PermissionAction = 'view'): boolean {
  const { user } = useAuth();
  return useMemo(() => {
    if (!user) return false;
    if (user.isAdminLike) return true;
    const allowed = user.effectivePermissions?.[key];
    return Array.isArray(allowed) && allowed.includes(action);
  }, [user, key, action]);
}

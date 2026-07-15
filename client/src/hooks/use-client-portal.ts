import { useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  canClientSeeSidebarItem,
  canClientSeeTab,
  clientLandingTab,
} from "@/lib/clientSections";

interface AuthUserWithPerms {
  userCategory?: string | null;
  isAdminLike?: boolean;
  effectivePermissions?: Record<string, string[]>;
}

/**
 * Client-portal view helpers.
 *
 * `isClient` is what every client-only UI branch keys off, so team members'
 * rendering path is untouched. The section checks resolve against the same
 * effectivePermissions map usePermission() uses, so what a client sees follows
 * the ticks in Roles & Permissions.
 *
 * Presentation only — the server's clientAccessGate is the real enforcement.
 */
export function useClientPortal() {
  const { user } = useAuth();
  const u = user as AuthUserWithPerms | null;
  const isClient = u?.userCategory === "client";

  const hasPermission = useCallback(
    (key: string, action = "view") => {
      if (!u) return false;
      if (u.isAdminLike) return true;
      const allowed = u.effectivePermissions?.[key];
      return Array.isArray(allowed) && allowed.includes(action);
    },
    [u],
  );

  return useMemo(
    () => ({
      isClient,
      hasPermission,
      /** Should this project tab render for the current user? */
      canSeeTab: (tabId: string) => (isClient ? canClientSeeTab(tabId, hasPermission) : true),
      /** Should this sidebar item render for the current user? */
      canSeeSidebarItem: (title: string) =>
        isClient ? canClientSeeSidebarItem(title, hasPermission) : true,
      /** First tab a client should land on inside their project. */
      landingTab: () => clientLandingTab(hasPermission),
    }),
    [isClient, hasPermission],
  );
}

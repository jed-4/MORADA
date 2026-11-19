import { useQuery } from "@tanstack/react-query";
import { usePermission } from "@/hooks/use-permission";
import type { ProjectLocationView } from "@shared/defects";

/** The caller's projects.defects actions. The server re-checks every one. */
export function useDefectPermissions() {
  return {
    view: usePermission("projects.defects", "view"),
    add: usePermission("projects.defects", "add"),
    edit: usePermission("projects.defects", "edit"),
    close: usePermission("projects.defects", "close"),
    delete: usePermission("projects.defects", "delete"),
  };
}

export interface TeamUserOption {
  id: string;
  name: string;
}

/** Team users of this company, for owner and @mention pickers. */
export function useTeamUsers(): TeamUserOption[] {
  const { data = [] } = useQuery<any[]>({ queryKey: ["/api/users/assignable"] });
  return data
    .filter((u) => !u.userCategory || u.userCategory === "team")
    .map((u) => ({
      id: u.id,
      name: u.displayName || [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useProjectLocations(projectId: string | undefined) {
  return useQuery<ProjectLocationView[]>({
    queryKey: ["/api/projects", projectId, "locations"],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/locations`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!projectId,
  });
}

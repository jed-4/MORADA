import { useProject } from "@/contexts/ProjectContext";
import { Users } from "lucide-react";

export function ProjectTeamTab() {
  const { currentProject } = useProject();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <Users className="w-12 h-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold mb-2">Team</h2>
      <p className="text-sm text-muted-foreground">
        Manage team members for {currentProject?.name}
      </p>
      <p className="text-xs text-muted-foreground mt-4">
        Coming soon...
      </p>
    </div>
  );
}

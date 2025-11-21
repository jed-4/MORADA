import { useProject } from "@/contexts/ProjectContext";
import { DollarSign } from "lucide-react";

export function ProjectBillsTab() {
  const { currentProject } = useProject();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <DollarSign className="w-12 h-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold mb-2">Bills</h2>
      <p className="text-sm text-muted-foreground">
        Track bills and invoices for {currentProject?.name}
      </p>
      <p className="text-xs text-muted-foreground mt-4">
        Coming soon...
      </p>
    </div>
  );
}

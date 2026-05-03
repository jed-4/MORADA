import { useState } from "react";
import { useParams } from "wouter";
import type { TakeoffPlan } from "@shared/schema";
import TakeoffPlansTab from "@/components/takeoff/TakeoffPlansTab";
import TakeoffMeasurementsTab from "@/components/takeoff/TakeoffMeasurementsTab";
import TakeoffPlanViewer from "@/components/takeoff/TakeoffPlanViewer";

export default function Takeoff() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [activeTab, setActiveTab] = useState<"plans" | "measurements">("plans");
  const [viewingPlan, setViewingPlan] = useState<{ plan: TakeoffPlan; page: number } | null>(null);

  if (!projectId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Open Take-off from inside a project.
      </div>
    );
  }

  if (viewingPlan) {
    return (
      <TakeoffPlanViewer
        plan={viewingPlan.plan}
        initialPage={viewingPlan.page}
        projectId={projectId}
        onClose={() => setViewingPlan(null)}
      />
    );
  }

  const tabs: Array<{ id: "plans" | "measurements"; label: string }> = [
    { id: "plans", label: "Plans" },
    { id: "measurements", label: "Measurements" },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-background px-4 flex gap-1 pt-2">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-takeoff-${tab.id}`}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === "plans" ? (
          <TakeoffPlansTab
            projectId={projectId}
            onOpenPlan={(plan, page) => setViewingPlan({ plan, page })}
          />
        ) : (
          <TakeoffMeasurementsTab projectId={projectId} />
        )}
      </div>
    </div>
  );
}

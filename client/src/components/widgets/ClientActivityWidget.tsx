import { useQuery } from "@tanstack/react-query";
import { DollarSign, FileText, MailCheck } from "lucide-react";
import type { Activity } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatRelativeDistance } from "@/lib/formatters";

const CLIENT_TYPES = new Set(["invoice", "proposal", "estimate", "variation"]);
const CLIENT_ACTIONS = new Set([
  "sent",
  "submitted",
  "accepted",
  "approved",
  "paid",
  "rejected",
]);

function iconFor(type: string) {
  if (type === "invoice") return DollarSign;
  if (type === "proposal" || type === "estimate") return FileText;
  return MailCheck;
}

export default function ClientActivityWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const limit = (widget.config?.maxItems as number) || 6;

  const { data, isLoading, isError, refetch } = useQuery<Activity[]>({
    queryKey: ["/api/activities", currentProject?.id, "client", limit],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const r = await fetch(
        `/api/activities?projectId=${currentProject.id}&limit=50`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id,
  });

  if (!currentProject) return <WidgetEmpty message="Select a project to view client activity" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;

  const activities = (data || [])
    .filter((a) => CLIENT_TYPES.has(a.activityType) && CLIENT_ACTIONS.has(a.action))
    .slice(0, limit);

  if (activities.length === 0) {
    return <WidgetEmpty message="No client portal activity yet" />;
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-3 space-y-3" data-testid="widget-client-activity">
      {activities.map((a) => {
        const Icon = iconFor(a.activityType);
        return (
          <div key={a.id} className="flex gap-3" data-testid={`client-activity-${a.id}`}>
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-bp-purple/10 text-bp-purple flex items-center justify-center">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">
                <span className="font-medium capitalize">{a.activityType}</span>{" "}
                <span className="text-muted-foreground">
                  {a.action} {a.entityName ? `· ${a.entityName}` : ""}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatRelativeDistance(a.createdAt as any)}
                {a.userName ? ` · ${a.userName}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

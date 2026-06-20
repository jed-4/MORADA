import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  DollarSign,
  Receipt,
  GitBranch,
  FileCheck,
  Clock,
  Calendar,
  Briefcase,
  BookOpen,
} from "lucide-react";
import type { Activity } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatRelativeDistance, stripActivityActor } from "@/lib/formatters";

function iconFor(type: string) {
  switch (type) {
    case "task":
      return FileCheck;
    case "estimate":
      return FileText;
    case "bill":
      return Receipt;
    case "variation":
      return GitBranch;
    case "invoice":
      return DollarSign;
    case "project":
      return Briefcase;
    case "schedule":
      return Calendar;
    case "site_diary":
      return BookOpen;
    default:
      return Clock;
  }
}

function toneFor(type: string): string {
  switch (type) {
    case "task":
      return "text-bp-teal bg-bp-teal/10";
    case "estimate":
      return "text-bp-green bg-bp-green/10";
    case "bill":
      return "text-bp-amber bg-bp-amber/10";
    case "variation":
      return "text-bp-purple bg-bp-purple/10";
    case "invoice":
      return "text-bp-green bg-bp-green/10";
    case "schedule":
      return "text-bp-teal bg-bp-teal/10";
    case "site_diary":
      return "text-bp-amber bg-bp-amber/10";
    default:
      return "text-muted-foreground bg-muted";
  }
}

export default function RecentActivityFeedWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const limit = (widget.config?.maxItems as number) || 8;

  const { data, isLoading, isError, refetch } = useQuery<Activity[]>({
    queryKey: ["/api/activities", currentProject?.id, limit],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const r = await fetch(
        `/api/activities?projectId=${currentProject.id}&limit=${limit}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id,
  });

  if (!currentProject) return <WidgetEmpty message="Select a project to see activity" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;

  const activities = data || [];
  if (activities.length === 0) {
    return <WidgetEmpty message="No recent activity on this project" />;
  }

  return (
    <div className="flex-1 overflow-auto px-4 py-3 space-y-3" data-testid="widget-recent-activity">
      {activities.map((a) => {
        const Icon = iconFor(a.activityType);
        return (
          <div key={a.id} className="flex gap-3" data-testid={`activity-${a.id}`}>
            <div
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${toneFor(a.activityType)}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">
                <span className="font-medium">{a.userName || "Someone"}</span>{" "}
                <span className="text-muted-foreground">{stripActivityActor(a.description, a.userName)}</span>
              </p>
              {a.entityName && (
                <p className="text-xs text-muted-foreground truncate">{a.entityName}</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatRelativeDistance(a.createdAt as any)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Calendar, Flag, CheckCircle2, Circle } from "lucide-react";
import type { Schedule, ScheduleItem } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatDate, getRelativeDate } from "@/lib/formatters";

export default function ProgrammeScheduleWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();
  const projectId = currentProject?.id;

  const scheduleQ = useQuery<Schedule | null>({
    queryKey: ["/api/projects", projectId, "schedule"],
    queryFn: async () => {
      if (!projectId) return null;
      const r = await fetch(`/api/projects/${projectId}/schedule?category=construction`, {
        credentials: "include",
      });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
  });

  const itemsQ = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedules", scheduleQ.data?.id, "items"],
    queryFn: async () => {
      if (!scheduleQ.data?.id) return [];
      const r = await fetch(`/api/schedules/${scheduleQ.data.id}/items`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!scheduleQ.data?.id,
  });

  const days = (widget.config?.lookaheadDays as number) || 7;

  const upcoming = useMemo(() => {
    const items = itemsQ.data || [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + days);

    return items
      .filter((it) => {
        if (!it.startDate) return false;
        const s = new Date(it.startDate as any);
        const e = it.endDate ? new Date(it.endDate as any) : s;
        return e >= now && s <= horizon;
      })
      .sort((a, b) => new Date(a.startDate as any).getTime() - new Date(b.startDate as any).getTime())
      .slice(0, 8);
  }, [itemsQ.data, days]);

  if (!currentProject) return <WidgetEmpty message="Select a project to view its programme" />;
  if (scheduleQ.isLoading || itemsQ.isLoading) return <WidgetSkeleton />;
  if (scheduleQ.isError || itemsQ.isError) {
    return (
      <WidgetError
        onRetry={() => {
          scheduleQ.refetch();
          itemsQ.refetch();
        }}
      />
    );
  }
  if (!scheduleQ.data) {
    return (
      <WidgetEmpty
        message="No schedule for this project yet"
        action={{ label: "Open Schedule", onClick: () => setLocation(`/schedule?projectId=${projectId}`) }}
      />
    );
  }
  if (upcoming.length === 0) {
    return <WidgetEmpty message={`Nothing scheduled in the next ${days} days`} />;
  }

  return (
    <div className="flex flex-col h-full" data-testid="widget-programme">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-xs text-muted-foreground">Next {days} days</span>
        <span className="text-xs font-medium">{upcoming.length} item{upcoming.length === 1 ? "" : "s"}</span>
      </div>
      <div className="flex-1 overflow-auto px-2 pb-3 space-y-1">
        {upcoming.map((it) => {
          const rel = getRelativeDate(it.startDate as any);
          const isMilestone = it.type === "milestone";
          const isDone = it.status === "completed";
          const Icon = isMilestone ? Flag : isDone ? CheckCircle2 : Circle;
          const tone = isMilestone
            ? "text-bp-amber"
            : isDone
              ? "text-bp-green"
              : rel.bucket === "today" || rel.bucket === "overdue"
                ? "text-bp-coral"
                : "text-bp-teal";
          return (
            <div
              key={it.id}
              className="flex items-start gap-3 px-2 py-2 rounded-md hover-elevate"
              data-testid={`schedule-item-${it.id}`}
            >
              <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${tone}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{it.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {rel.label} · {formatDate(it.endDate as any)}
                  {it.assignedToName && ` · ${it.assignedToName}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

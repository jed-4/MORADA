import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { format, isAfter, isBefore, startOfDay } from "date-fns";
import { CalendarDays, Flag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ClientEmpty, ClientLoading, ClientPage, ClientRow, ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * The client's view of the programme.
 *
 * Read-only by construction: there is no Gantt, no drag, no add. A client
 * wants "what's happening, and when" — so this is a dated list, grouped by
 * phase, with today's work called out. Whether they see every item or only
 * the top-level phases is decided server-side by the role's
 * portal.schedule.all_items tick, so this component renders whatever arrives.
 */

interface ScheduleItem {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  status?: string | null;
  startDate: string;
  endDate: string;
  progressPercent?: number | null;
  parentItemId?: string | null;
  groupName?: string | null;
  sortOrder?: number | null;
  order?: number | null;
}

interface Schedule {
  id: string;
  name?: string | null;
  status?: string | null;
}

const statusLabel = (item: ScheduleItem): { label: string; tone: ClientTone } => {
  const today = startOfDay(new Date());
  const start = new Date(item.startDate);
  const end = new Date(item.endDate);
  if (item.status === "completed") return { label: "Done", tone: "done" };
  if (item.status === "on_hold") return { label: "On hold", tone: "attention" };
  if (item.status === "in_progress") return { label: "In progress", tone: "info" };
  if (isBefore(end, today)) return { label: "Due", tone: "waiting" };
  if (!isAfter(start, today)) return { label: "In progress", tone: "info" };
  return { label: "Upcoming", tone: "neutral" };
};

const dateRange = (item: ScheduleItem) => {
  const start = new Date(item.startDate);
  const end = new Date(item.endDate);
  const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  return sameDay ? format(start, "EEE d MMM yyyy") : `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
};

export default function ClientSchedule() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: [`/api/projects/${projectId}/schedules`],
    enabled: !!projectId,
  });

  // The builder may keep several; the client is shown the live one.
  const schedule = schedules.find((s) => s.status === "online" || s.status === "locked") ?? schedules[0];

  const { data: items = [], isLoading: itemsLoading } = useQuery<ScheduleItem[]>({
    queryKey: [`/api/projects/${projectId}/schedule-items`],
    enabled: !!projectId,
  });

  const groups = useMemo(() => {
    const visible = [...items].sort((a, b) => {
      const byDate = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      if (byDate !== 0) return byDate;
      return (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0);
    });
    const byGroup = new Map<string, ScheduleItem[]>();
    for (const item of visible) {
      const key = item.groupName || "Programme";
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    return Array.from(byGroup.entries());
  }, [items]);

  const dates = items.flatMap((i) => [new Date(i.startDate), new Date(i.endDate)]).filter((d) => !Number.isNaN(d.getTime()));
  const span = dates.length
    ? `${format(new Date(Math.min(...dates.map(Number))), "MMM yyyy")} – ${format(new Date(Math.max(...dates.map(Number))), "MMM yyyy")}`
    : undefined;

  if (schedulesLoading || itemsLoading) {
    return (
      <ClientPage title="Schedule">
        <ClientLoading label="Loading the schedule…" />
      </ClientPage>
    );
  }

  if (!schedule || items.length === 0) {
    return (
      <ClientPage title="Schedule" description="The programme of works for your project.">
        <ClientEmpty
          icon={CalendarDays}
          title="No schedule to show yet"
          description="Your builder hasn't published a schedule for this project. It'll appear here once they do."
        />
      </ClientPage>
    );
  }

  return (
    <ClientPage
      title="Schedule"
      description="The programme of works for your project. Dates can move as the job progresses."
      aside={span ? <div className="text-sm text-muted-foreground">{span}</div> : undefined}
    >
      <div className="space-y-4">
        {groups.map(([groupName, groupItems]) => (
          <Card key={groupName} data-testid={`client-schedule-group-${groupName.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b bg-muted/40 font-medium text-sm">{groupName}</div>
              {groupItems.map((item) => {
                const { label, tone } = statusLabel(item);
                const progress = item.progressPercent ?? 0;
                return (
                  <ClientRow
                    key={item.id}
                    title={
                      <span className="flex items-center gap-2">
                        {item.type === "milestone" && <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        {item.name}
                      </span>
                    }
                    meta={dateRange(item)}
                    status={<ClientStatus label={label} tone={tone} />}
                  >
                    {progress > 0 && progress < 100 && (
                      <div className="flex items-center gap-2 mt-2 max-w-xs">
                        <Progress value={progress} className="h-1.5" />
                        <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
                      </div>
                    )}
                  </ClientRow>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </ClientPage>
  );
}

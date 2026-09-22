import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { format, isAfter, isBefore, startOfDay } from "date-fns";
import { CalendarDays, Check, Flag } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ClientEmpty, ClientLoading, ClientPage, ClientStatus } from "@/components/client/ClientPage";

/**
 * The client's view of the programme.
 *
 * Read-only by construction: no Gantt, no drag, no add. It answers "what is
 * happening and when", grouped by phase, with today's work called out.
 *
 * DONE OR NOT — nothing else. The builder's statuses (not started, in
 * progress, on hold, delayed) are how a builder runs a job, and a client
 * reading "On hold" against their kitchen has no way to tell whether that is
 * routine sequencing or a problem. Jed's call: a client sees complete or not
 * complete, and the dates say the rest.
 *
 * Whether they see every item or only the top-level phases is decided
 * server-side by the role's portal.schedule.all_items tick, so this renders
 * whatever arrives.
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

const isDone = (item: ScheduleItem) =>
  item.status === "completed" || (item.progressPercent ?? 0) >= 100;

/** Underway = started, not finished. Said with dates, not a builder status. */
const isUnderway = (item: ScheduleItem) => {
  if (isDone(item)) return false;
  const today = startOfDay(new Date());
  return !isAfter(new Date(item.startDate), today) && !isBefore(new Date(item.endDate), today);
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

  const schedule = schedules.find((s) => s.status === "online" || s.status === "locked") ?? schedules[0];

  const { data: items = [], isLoading: itemsLoading } = useQuery<ScheduleItem[]>({
    queryKey: [`/api/projects/${projectId}/schedule-items`],
    enabled: !!projectId,
  });

  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const byDate = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      if (byDate !== 0) return byDate;
      return (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0);
    });
    const byGroup = new Map<string, ScheduleItem[]>();
    for (const item of sorted) {
      const key = item.groupName || "Programme";
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    return Array.from(byGroup.entries());
  }, [items]);

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

  const done = items.filter(isDone).length;
  const percent = Math.round((done / items.length) * 100);
  const dates = items.flatMap((i) => [new Date(i.startDate), new Date(i.endDate)]).filter((d) => !Number.isNaN(d.getTime()));
  const span = dates.length
    ? `${format(new Date(Math.min(...dates.map(Number))), "MMM yyyy")} – ${format(new Date(Math.max(...dates.map(Number))), "MMM yyyy")}`
    : undefined;

  return (
    <ClientPage
      title="Schedule"
      description="The programme of works for your project. Dates can move as the job progresses."
      aside={
        <div className="w-44">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">{span}</span>
            <span className="tabular-nums font-medium">{percent}%</span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </div>
      }
    >
      <div className="space-y-4">
        {groups.map(([groupName, groupItems]) => {
          const groupDone = groupItems.filter(isDone).length;
          return (
            <section key={groupName} className="surface-panel overflow-hidden" data-testid={`client-schedule-group-${groupName.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                <h2 className="text-sm font-semibold">{groupName}</h2>
                <span className="text-data text-muted-foreground uppercase tracking-wide">
                  {groupDone} of {groupItems.length} done
                </span>
              </div>

              {groupItems.map((item) => {
                const complete = isDone(item);
                const underway = isUnderway(item);
                const progress = item.progressPercent ?? 0;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b last:border-b-0",
                      item.parentItemId && "pl-10",
                    )}
                    data-testid={`client-schedule-item-${item.id}`}
                  >
                    {/* One dot, two states. Complete or not — see the file note. */}
                    <div
                      className={cn(
                        "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 border",
                        complete
                          ? "bg-[hsl(var(--sage-light))] border-[hsl(var(--sage))]"
                          : "bg-muted border-border",
                      )}
                      aria-hidden
                    >
                      {complete && <Check className="h-3 w-3 text-[hsl(147_39%_35%)]" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className={cn("flex items-center gap-2 font-medium", complete && "text-muted-foreground")}>
                        {item.type === "milestone" && <Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <span className="truncate">{item.name}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">{dateRange(item)}</div>
                      {!complete && progress > 0 && (
                        <div className="flex items-center gap-2 mt-2 max-w-xs">
                          <Progress value={progress} className="h-1.5" />
                          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
                        </div>
                      )}
                    </div>

                    {complete ? (
                      <ClientStatus label="Done" tone="done" />
                    ) : underway ? (
                      <ClientStatus label="Underway" tone="info" />
                    ) : null}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </ClientPage>
  );
}

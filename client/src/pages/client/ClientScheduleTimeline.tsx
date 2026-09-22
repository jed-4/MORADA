import { useMemo } from "react";
import { differenceInCalendarDays, eachMonthOfInterval, endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * A read-only timeline of the programme — the client's version of the Gantt.
 *
 * Purpose-built rather than the builder's Gantt: that one is an editor (drag,
 * resize, dependencies, baselines, assignees) whose data comes from a dozen
 * endpoints a client is refused, so it would render a wall of failures. This
 * draws the same information a client needs from the schedule items they are
 * already sent: what runs when, what's done, and where today sits.
 *
 * No statuses, same as the list: a bar is done or it isn't (Jed's call).
 */

export interface TimelineItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type?: string | null;
  parentItemId?: string | null;
  groupName?: string | null;
  progressPercent?: number | null;
  status?: string | null;
}

const isDone = (item: TimelineItem) =>
  item.status === "completed" || (item.progressPercent ?? 0) >= 100;

export function ClientScheduleTimeline({ items }: { items: TimelineItem[] }) {
  const model = useMemo(() => {
    const dates = items.flatMap((i) => [new Date(i.startDate), new Date(i.endDate)]).filter((d) => !Number.isNaN(d.getTime()));
    if (dates.length === 0) return null;

    const start = startOfMonth(new Date(Math.min(...dates.map(Number))));
    const end = endOfMonth(new Date(Math.max(...dates.map(Number))));
    const totalDays = Math.max(differenceInCalendarDays(end, start), 1);
    const months = eachMonthOfInterval({ start, end });

    const offset = (date: Date) => (differenceInCalendarDays(date, start) / totalDays) * 100;

    const groups = new Map<string, TimelineItem[]>();
    for (const item of [...items].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())) {
      const key = item.groupName || "Programme";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    const today = startOfDay(new Date());
    const todayOffset = today >= start && today <= end ? offset(today) : null;

    return { start, end, months, offset, groups: Array.from(groups.entries()), todayOffset, totalDays };
  }, [items]);

  if (!model) return null;

  return (
    <div className="p-4 overflow-x-auto" data-testid="client-schedule-timeline">
      <div className="min-w-[640px]">
        {/* Month scale */}
        <div className="flex border-b pb-1 mb-2">
          <div className="w-48 shrink-0 text-data uppercase tracking-wide text-muted-foreground">Works</div>
          <div className="relative flex-1 h-4">
            {model.months.map((month) => (
              <div
                key={month.toISOString()}
                className="absolute top-0 text-data uppercase tracking-wide text-muted-foreground"
                style={{ left: `${model.offset(month)}%` }}
              >
                {format(month, "MMM yy")}
              </div>
            ))}
          </div>
        </div>

        {model.groups.map(([groupName, groupItems]) => (
          <div key={groupName} className="mb-3">
            <div className="text-xs font-semibold mb-1">{groupName}</div>
            {groupItems.map((item) => {
              const start = new Date(item.startDate);
              const end = new Date(item.endDate);
              const left = model.offset(start);
              // A one-day task still needs to be visible, hence the minimum.
              const width = Math.max(model.offset(end) - left, 0.8);
              const done = isDone(item);
              const progress = item.progressPercent ?? 0;
              const milestone = item.type === "milestone";
              return (
                <div key={item.id} className="flex items-center h-7" data-testid={`client-timeline-${item.id}`}>
                  <div
                    className={cn(
                      "w-48 shrink-0 pr-3 text-sm truncate",
                      item.parentItemId && "pl-4",
                      done && "text-muted-foreground",
                    )}
                    title={item.name}
                  >
                    {item.name}
                  </div>
                  <div className="relative flex-1 h-full">
                    {/* Today */}
                    {model.todayOffset != null && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-[hsl(var(--coral))]"
                        style={{ left: `${model.todayOffset}%` }}
                        aria-hidden
                      />
                    )}
                    {milestone ? (
                      <div
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 h-2.5 w-2.5 rotate-45",
                          done ? "bg-[hsl(var(--sage))]" : "bg-primary",
                        )}
                        style={{ left: `${left}%` }}
                        title={`${item.name} · ${format(start, "d MMM yyyy")}`}
                      />
                    ) : (
                      // The track needs to read on its own: at bg-primary-light
                      // an unstarted bar (0% fill) was invisible on white, so a
                      // stage with no progress looked like missing data.
                      <div
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 h-3 rounded-full overflow-hidden border",
                          done
                            ? "bg-[hsl(var(--sage-light))] border-[hsl(var(--sage))]"
                            : "bg-primary/15 border-primary/40",
                        )}
                        style={{ left: `${left}%`, width: `${width}%`, minWidth: 6 }}
                        title={`${item.name} · ${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`}
                      >
                        <div
                          className={cn("h-full", done ? "bg-[hsl(var(--sage))]" : "bg-primary")}
                          style={{ width: done ? "100%" : `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-full bg-[hsl(var(--sage))]" /> Done
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-full bg-primary" /> Progress
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-[hsl(var(--coral))]" /> Today
          </span>
        </div>
      </div>
    </div>
  );
}

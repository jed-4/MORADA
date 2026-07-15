import type { ReactNode } from "react";
import { eachDayOfInterval, format, isToday } from "date-fns";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { MoradaCalendarEvent, MoradaCalendarView } from "./types";
import { bucketEventsByDay, dayKey, formatChipTime, isTimed, resolveEventColor } from "./utils";
import { EventHoverDetails } from "./EventChip";

interface AgendaViewProps {
  rangeStart: Date;
  rangeEnd: Date;
  events: MoradaCalendarEvent[];
  onEventClick?: (event: MoradaCalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  renderEvent?: (event: MoradaCalendarEvent, ctx: { view: MoradaCalendarView }) => ReactNode;
}

export function AgendaView({
  rangeStart,
  rangeEnd,
  events,
  onEventClick,
  onDateClick,
  renderEvent,
}: AgendaViewProps) {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const buckets = bucketEventsByDay(events, rangeStart, rangeEnd);
  const daysWithEvents = days.filter((day) => (buckets.get(dayKey(day)) ?? []).length > 0);

  if (daysWithEvents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
        No events in this period
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="agenda-view">
      {daysWithEvents.map((day) => {
        const key = dayKey(day);
        const dayEvents = buckets.get(key) ?? [];
        const today = isToday(day);

        return (
          <div key={key} data-testid={`agenda-day-${key}`} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => onDateClick?.(day)}
              className="flex w-full items-center gap-2 px-3 pb-1 pt-2.5 text-left"
            >
              <span
                className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-medium tabular-nums",
                  today ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              <span className="text-data font-medium uppercase tracking-wide text-muted-foreground">
                {format(day, "EEEE, MMMM yyyy")}
              </span>
            </button>

            <div className="pb-1.5">
              {dayEvents.map((event) => {
                const colors = resolveEventColor(event.color);
                const timed = isTimed(event);
                return (
                  <HoverCard key={event.id} openDelay={400} closeDelay={80}>
                    <HoverCardTrigger asChild>
                      <div
                        role="button"
                        tabIndex={0}
                        data-testid={`calendar-event-${event.id}`}
                        onClick={() => onEventClick?.(event)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onEventClick?.(event);
                          }
                        }}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-1 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {timed ? formatChipTime(event.start) : "All day"}
                        </span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: colors.solid }}
                        />
                        {renderEvent ? (
                          <div className="min-w-0 flex-1">{renderEvent(event, { view: "agenda" })}</div>
                        ) : (
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-xs font-medium",
                              event.done && "line-through opacity-60",
                            )}
                          >
                            {event.title}
                          </span>
                        )}
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-64 p-3" side="top" align="start">
                      <EventHoverDetails event={event} />
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

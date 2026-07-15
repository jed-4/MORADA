import { useEffect, useRef, useState, type ReactNode } from "react";
import { eachDayOfInterval, format, isToday, setHours, setMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import type { MoradaCalendarEvent, MoradaCalendarView } from "./types";
import { HOUR_HEIGHT, bucketEventsByDay, dayKey, isTimed, layoutTimedEvents } from "./utils";
import { EventChip } from "./EventChip";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SCROLL_TO_HOUR = 7;
const MAX_ALL_DAY = 3;

interface WeekViewProps {
  rangeStart: Date;
  rangeEnd: Date;
  events: MoradaCalendarEvent[];
  onEventClick?: (event: MoradaCalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  renderEvent?: (event: MoradaCalendarEvent, ctx: { view: MoradaCalendarView }) => ReactNode;
}

export function WeekView({
  rangeStart,
  rangeEnd,
  events,
  onEventClick,
  onDateClick,
  renderEvent,
}: WeekViewProps) {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const buckets = bucketEventsByDay(events, rangeStart, rangeEnd);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Current-time indicator, refreshed each minute.
  const [nowMinutes, setNowMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT;
  }, []);

  const handleGridClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    if (!onDateClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = Math.max(0, Math.min(24 * 60 - 15, ((e.clientY - rect.top) / HOUR_HEIGHT) * 60));
    const snapped = Math.round(minutes / 15) * 15;
    onDateClick(setMinutes(setHours(day, Math.floor(snapped / 60)), snapped % 60));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers */}
      <div className="flex shrink-0 border-b border-border">
        <div className="w-14 shrink-0" />
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div key={dayKey(day)} className="flex-1 py-1.5 text-center">
              <div className="text-data font-medium uppercase tracking-wide text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div className="mt-0.5">
                <span
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-medium tabular-nums",
                    today ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day lane */}
      <div className="flex shrink-0 border-b border-border">
        <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1 text-label uppercase tracking-wide text-muted-foreground">
          all-day
        </div>
        {days.map((day) => {
          const key = dayKey(day);
          const allDayEvents = (buckets.get(key) ?? []).filter((e) => !isTimed(e));
          const hidden = allDayEvents.length - MAX_ALL_DAY;
          return (
            <div
              key={key}
              data-testid={`all-day-column-${key}`}
              onClick={() => onDateClick?.(day)}
              className="min-h-7 flex-1 space-y-0.5 border-l border-border p-0.5 first-of-type:border-l-0"
            >
              {allDayEvents.slice(0, MAX_ALL_DAY).map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  view="week"
                  variant="row"
                  onEventClick={onEventClick}
                  renderEvent={renderEvent}
                />
              ))}
              {hidden > 0 && (
                <div className="px-1.5 text-data font-medium text-muted-foreground">
                  +{hidden} more
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Hour gutter */}
          <div className="relative w-14 shrink-0">
            {HOURS.filter((h) => h > 0).map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-data uppercase text-muted-foreground"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {format(setHours(new Date(), hour), "haaa")}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const key = dayKey(day);
            const timedEvents = (buckets.get(key) ?? []).filter(isTimed);
            const positioned = layoutTimedEvents(timedEvents);
            const today = isToday(day);

            return (
              <div
                key={key}
                data-testid={`day-column-${key}`}
                onClick={(e) => handleGridClick(day, e)}
                className={cn(
                  "relative flex-1 border-l border-border first-of-type:border-l-0",
                  today && "bg-primary/[0.04]",
                )}
              >
                {/* Hour hairlines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}

                {/* Timed events */}
                {positioned.map(({ event, top, height, left, width }) => (
                  <div
                    key={event.id}
                    className="absolute z-10 pr-0.5"
                    style={{ top, height, left: `${left}%`, width: `${width}%` }}
                  >
                    <EventChip
                      event={event}
                      view="week"
                      variant="block"
                      onEventClick={onEventClick}
                      renderEvent={renderEvent}
                    />
                  </div>
                ))}

                {/* Current time indicator */}
                {today && (
                  <div
                    data-testid="current-time-indicator"
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <div
                      className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full"
                      style={{ backgroundColor: "hsl(var(--coral))" }}
                    />
                    <div className="h-px w-full" style={{ backgroundColor: "hsl(var(--coral))" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { eachDayOfInterval, format, isSameMonth, isToday } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MoradaCalendarEvent, MoradaCalendarView } from "./types";
import { bucketEventsByDay, dayKey } from "./utils";
import { EventChip } from "./EventChip";

const MAX_VISIBLE_EVENTS = 3;

interface MonthViewProps {
  date: Date;
  rangeStart: Date;
  rangeEnd: Date;
  events: MoradaCalendarEvent[];
  onEventClick?: (event: MoradaCalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  renderEvent?: (event: MoradaCalendarEvent, ctx: { view: MoradaCalendarView }) => ReactNode;
  cellContent?: (date: Date, events: MoradaCalendarEvent[]) => ReactNode;
}

export function MonthView({
  date,
  rangeStart,
  rangeEnd,
  events,
  onEventClick,
  onDateClick,
  renderEvent,
  cellContent,
}: MonthViewProps) {
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const buckets = bucketEventsByDay(events, rangeStart, rangeEnd);
  const weekdayLabels = days.slice(0, 7).map((d) => format(d, "EEE"));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Weekday header — small, muted, uppercase */}
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="py-1.5 text-center text-data font-medium uppercase tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
        {days.map((day) => {
          const key = dayKey(day);
          const dayEvents = buckets.get(key) ?? [];
          const inMonth = isSameMonth(day, date);
          const today = isToday(day);
          const hidden = dayEvents.length - MAX_VISIBLE_EVENTS;

          return (
            <div
              key={key}
              data-testid={`day-cell-${key}`}
              onClick={() => onDateClick?.(day)}
              className={cn(
                "flex min-h-[104px] cursor-pointer flex-col gap-0.5 border-b border-r border-border p-1 transition-colors hover:bg-muted/40 [&:nth-child(7n)]:border-r-0",
              )}
            >
              <div className="px-0.5 pb-0.5">
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums",
                    today
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              {cellContent ? (
                <div className="min-h-0 flex-1">{cellContent(day, dayEvents)}</div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => (
                    <EventChip
                      key={event.id}
                      event={event}
                      view="month"
                      variant="row"
                      onEventClick={onEventClick}
                      renderEvent={renderEvent}
                    />
                  ))}
                  {hidden > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          data-testid={`button-more-${key}`}
                          onClick={(e) => e.stopPropagation()}
                          className="w-fit rounded px-1.5 text-data font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          +{hidden} more
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-64 p-2"
                        align="start"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mb-1.5 px-1 text-data font-medium uppercase tracking-wide text-muted-foreground">
                          {format(day, "EEEE d MMMM")}
                        </div>
                        <div className="max-h-64 space-y-0.5 overflow-y-auto">
                          {dayEvents.map((event) => (
                            <EventChip
                              key={`overflow-${event.id}`}
                              event={event}
                              view="month"
                              variant="row"
                              onEventClick={onEventClick}
                              renderEvent={renderEvent}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

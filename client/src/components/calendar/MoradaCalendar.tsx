import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import type { MoradaCalendarProps, MoradaCalendarView } from "./types";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { AgendaView } from "./AgendaView";

export type {
  MoradaCalendarEvent,
  MoradaCalendarProps,
  MoradaCalendarRange,
  MoradaCalendarView,
} from "./types";
export { resolveEventColor } from "./utils";

const VIEW_OPTIONS: Array<{ value: MoradaCalendarView; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "agenda", label: "Agenda" },
];

export function MoradaCalendar({
  events,
  view: controlledView,
  defaultView = "month",
  onViewChange,
  date: controlledDate,
  defaultDate,
  onDateChange,
  onEventClick,
  onDateClick,
  onRangeChange,
  renderEvent,
  cellContent,
  hideHeader = false,
  className,
}: MoradaCalendarProps) {
  const isMobile = useIsMobile();
  const weekStartsOn = useWeekStartDay();

  const [internalView, setInternalView] = useState<MoradaCalendarView>(defaultView);
  const [internalDate, setInternalDate] = useState<Date>(defaultDate ?? new Date());

  const view = controlledView ?? internalView;
  const date = controlledDate ?? internalDate;

  // Agenda is the automatic mobile fallback below md.
  const effectiveView: MoradaCalendarView = isMobile ? "agenda" : view;

  const setView = useCallback(
    (next: MoradaCalendarView) => {
      if (controlledView === undefined) setInternalView(next);
      onViewChange?.(next);
    },
    [controlledView, onViewChange],
  );

  const setDate = useCallback(
    (next: Date) => {
      if (controlledDate === undefined) setInternalDate(next);
      onDateChange?.(next);
    },
    [controlledDate, onDateChange],
  );

  const range = useMemo(() => {
    if (effectiveView === "week") {
      return { start: startOfWeek(date, { weekStartsOn }), end: endOfWeek(date, { weekStartsOn }) };
    }
    if (effectiveView === "agenda") {
      return { start: startOfMonth(date), end: endOfMonth(date) };
    }
    return {
      start: startOfWeek(startOfMonth(date), { weekStartsOn }),
      end: endOfWeek(endOfMonth(date), { weekStartsOn }),
    };
  }, [date, effectiveView, weekStartsOn]);

  useEffect(() => {
    onRangeChange?.({ start: range.start, end: range.end, view: effectiveView });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.getTime(), range.end.getTime(), effectiveView]);

  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (effectiveView === "week") {
        setDate(direction === 1 ? addWeeks(date, 1) : subWeeks(date, 1));
      } else {
        setDate(direction === 1 ? addMonths(date, 1) : subMonths(date, 1));
      }
    },
    [date, effectiveView, setDate],
  );

  const title = useMemo(() => {
    if (effectiveView === "week") {
      if (isSameMonth(range.start, range.end)) return format(range.start, "MMMM yyyy");
      return `${format(range.start, "MMM")} – ${format(range.end, "MMM yyyy")}`;
    }
    return format(date, "MMMM yyyy");
  }, [date, effectiveView, range.start, range.end]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)} data-testid="morada-calendar">
      {!hideHeader && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="min-w-0 truncate text-sm font-semibold" data-testid="text-calendar-title">
            {title}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              data-testid="button-calendar-today"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs font-medium"
              onClick={() => setDate(new Date())}
            >
              Today
            </Button>
            <Button
              data-testid="button-calendar-prev"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              data-testid="button-calendar-next"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isMobile && (
              <div className="ml-2 flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                {VIEW_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    data-testid={`button-view-${option.value}`}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-6 px-2.5 text-xs font-medium",
                      view === option.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-transparent hover:text-foreground",
                    )}
                    onClick={() => setView(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {effectiveView === "month" && (
        <MonthView
          date={date}
          rangeStart={range.start}
          rangeEnd={range.end}
          events={events}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
          renderEvent={renderEvent}
          cellContent={cellContent}
        />
      )}
      {effectiveView === "week" && (
        <WeekView
          rangeStart={range.start}
          rangeEnd={range.end}
          events={events}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
          renderEvent={renderEvent}
        />
      )}
      {effectiveView === "agenda" && (
        <AgendaView
          rangeStart={range.start}
          rangeEnd={range.end}
          events={events}
          onEventClick={onEventClick}
          onDateClick={onDateClick}
          renderEvent={renderEvent}
        />
      )}
    </div>
  );
}

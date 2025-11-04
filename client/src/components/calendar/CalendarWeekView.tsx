import { useMemo } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import CalendarDayColumn, { CalendarEvent } from "./CalendarDayColumn";

interface CalendarWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventComplete?: (eventId: string, completed: boolean) => void;
  onEventReschedule?: (eventId: string, newDate: Date, eventType: CalendarEvent["type"], newTime?: string) => void;
  onEventResize?: (eventId: string, startTime: string, endTime: string, eventType: CalendarEvent["type"]) => void;
  onAddFollowUp?: (afterEventId: string, time: string) => void;
  onDateChange?: (date: Date) => void;
  showCompletionCheckbox?: boolean;
  showNightHours?: boolean;
}

export default function CalendarWeekView({
  currentDate,
  events,
  onEventClick,
  onEventComplete,
  onEventReschedule,
  onEventResize,
  onAddFollowUp,
  onDateChange,
  showCompletionCheckbox = false,
  showNightHours = false,
}: CalendarWeekViewProps) {
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekEnd = useMemo(() => endOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const handlePrevWeek = () => {
    onDateChange?.(subWeeks(currentDate, 1));
  };

  const handleNextWeek = () => {
    onDateChange?.(addWeeks(currentDate, 1));
  };

  const handleToday = () => {
    onDateChange?.(new Date());
  };

  // Filter events by day
  const getEventsForDay = (day: Date) => {
    return events.filter(event => {
      const eventDate = new Date(event.startDate);
      return (
        eventDate.getFullYear() === day.getFullYear() &&
        eventDate.getMonth() === day.getMonth() &&
        eventDate.getDate() === day.getDate()
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevWeek}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            data-testid="button-today"
          >
            Today
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextWeek}
            data-testid="button-next-week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <h2 className="text-lg font-semibold font-['Clash_Grotesk']">
          {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
        </h2>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {weekDays.map((day, index) => (
          <div
            key={index}
            className={cn(
              "px-2 py-2 text-center border-r last:border-r-0",
              isToday(day) && "bg-casva-50"
            )}
          >
            <div className="text-xs font-medium text-muted-foreground font-['Clash_Grotesk']">
              {format(day, "EEE")}
            </div>
            <div className={cn(
              "text-lg font-semibold mt-0.5 font-['Clash_Grotesk']",
              isToday(day) && "text-casva-700"
            )}>
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Week grid with CalendarDayColumn for each day */}
      <div className="flex-1 grid grid-cols-7 overflow-hidden">
        {weekDays.map((day, index) => {
          const dayEvents = getEventsForDay(day);
          
          return (
            <div
              key={index}
              className={cn(
                "border-r last:border-r-0 overflow-hidden",
                isToday(day) && "bg-casva-50/20"
              )}
              data-testid={`day-column-${format(day, "yyyy-MM-dd")}`}
            >
              <CalendarDayColumn
                date={day}
                events={dayEvents}
                onEventClick={onEventClick}
                onEventComplete={onEventComplete}
                onEventReschedule={onEventReschedule}
                onEventResize={onEventResize}
                onAddFollowUp={onAddFollowUp}
                showCompletionCheckbox={showCompletionCheckbox}
                showNightHours={showNightHours}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

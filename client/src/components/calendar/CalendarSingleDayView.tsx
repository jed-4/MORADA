import { useMemo } from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CalendarDayColumn, { CalendarEvent } from "./CalendarDayColumn";

interface CalendarSingleDayViewProps {
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

export default function CalendarSingleDayView({
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
}: CalendarSingleDayViewProps) {
  const handlePrevDay = () => {
    onDateChange?.(subDays(currentDate, 1));
  };

  const handleNextDay = () => {
    onDateChange?.(addDays(currentDate, 1));
  };

  const handleToday = () => {
    onDateChange?.(new Date());
  };

  // Filter events for current day
  const dayEvents = useMemo(() => {
    return events.filter(event => {
      const eventDate = new Date(event.startDate);
      return (
        eventDate.getFullYear() === currentDate.getFullYear() &&
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getDate() === currentDate.getDate()
      );
    });
  }, [events, currentDate]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevDay}
            data-testid="button-prev-day"
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
            onClick={handleNextDay}
            data-testid="button-next-day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <h2 className="text-lg font-semibold font-['Clash_Grotesk']">
          {format(currentDate, "EEEE, MMMM d, yyyy")}
          {isToday(currentDate) && (
            <span className="ml-2 text-sm text-casva-700 font-normal">Today</span>
          )}
        </h2>
      </div>

      {/* Single day column */}
      <div className="flex-1 overflow-hidden">
        <CalendarDayColumn
          date={currentDate}
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
    </div>
  );
}

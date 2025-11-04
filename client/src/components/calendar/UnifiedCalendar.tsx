import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Grid3x3, Columns, Square } from "lucide-react";
import { CalendarEvent } from "./CalendarDayColumn";
import CalendarSingleDayView from "./CalendarSingleDayView";
import CalendarWeekView from "./CalendarWeekView";
import { EnhancedCalendar } from "@/components/EnhancedCalendar";

type CalendarView = "month" | "week" | "day";

interface UnifiedCalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventComplete?: (eventId: string, completed: boolean) => void;
  onEventReschedule?: (eventId: string, newDate: Date, eventType: CalendarEvent["type"], newTime?: string) => void;
  onEventResize?: (eventId: string, startTime: string, endTime: string, eventType: CalendarEvent["type"]) => void;
  onAddFollowUp?: (afterEventId: string, time: string) => void;
  onDateClick?: (date: Date) => void;
  showCompletionCheckbox?: boolean;
  initialView?: CalendarView;
  title?: string;
}

export default function UnifiedCalendar({
  events,
  onEventClick,
  onEventComplete,
  onEventReschedule,
  onEventResize,
  onAddFollowUp,
  onDateClick,
  showCompletionCheckbox = false,
  initialView = "week",
  title = "Calendar",
}: UnifiedCalendarProps) {
  const [view, setView] = useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showNightHours, setShowNightHours] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* View Toggle */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-casva-700" />
          <h3 className="font-semibold font-['Clash_Grotesk'] text-sm">{title}</h3>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant={view === "month" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("month")}
            className="h-8 px-2 casva-ripple"
            data-testid="button-view-month"
          >
            <Grid3x3 className="h-4 w-4 mr-1" />
            Month
          </Button>
          
          <Button
            variant={view === "week" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("week")}
            className="h-8 px-2 casva-ripple"
            data-testid="button-view-week"
          >
            <Columns className="h-4 w-4 mr-1" />
            Week
          </Button>
          
          <Button
            variant={view === "day" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("day")}
            className="h-8 px-2 casva-ripple"
            data-testid="button-view-day"
          >
            <Square className="h-4 w-4 mr-1" />
            Day
          </Button>
        </div>
      </div>

      {/* Calendar View */}
      <div className="flex-1 overflow-hidden">
        {view === "month" && (
          <EnhancedCalendar
            events={events}
            onEventClick={onEventClick}
            onEventComplete={onEventComplete}
            onEventReschedule={onEventReschedule}
            onEventResize={onEventResize}
            onDateClick={onDateClick}
            showCompletionCheckbox={showCompletionCheckbox}
            initialView="month"
          />
        )}
        
        {view === "week" && (
          <CalendarWeekView
            currentDate={currentDate}
            events={events}
            onEventClick={onEventClick}
            onEventComplete={onEventComplete}
            onEventReschedule={onEventReschedule}
            onEventResize={onEventResize}
            onAddFollowUp={onAddFollowUp}
            onDateChange={setCurrentDate}
            showCompletionCheckbox={showCompletionCheckbox}
            showNightHours={showNightHours}
          />
        )}
        
        {view === "day" && (
          <CalendarSingleDayView
            currentDate={currentDate}
            events={events}
            onEventClick={onEventClick}
            onEventComplete={onEventComplete}
            onEventReschedule={onEventReschedule}
            onEventResize={onEventResize}
            onAddFollowUp={onAddFollowUp}
            onDateChange={setCurrentDate}
            showCompletionCheckbox={showCompletionCheckbox}
            showNightHours={showNightHours}
          />
        )}
      </div>
    </div>
  );
}

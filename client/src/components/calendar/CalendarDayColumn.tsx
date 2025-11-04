import { useState, useMemo, useRef, useEffect } from "react";
import { format, isSameDay, parse, differenceInMinutes, addMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  startTime?: string | null;
  endTime?: string | null;
  color?: string | null;
  projectId?: string | null;
  projectColor?: string | null;
  type: "task" | "schedule" | "meeting" | "google-calendar";
  status?: string;
  isCompleted?: boolean;
  description?: string | null;
  location?: string | null;
  templateId?: string | null;
  tagIds?: string[] | null;
}

interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
}

interface PositionedEvent extends CalendarEvent {
  column: number;
  totalColumns: number;
  top: number;
  height: number;
  hasGapAfter?: boolean;
  gapHeight?: number;
}

interface CalendarDayColumnProps {
  date: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventComplete?: (eventId: string, completed: boolean) => void;
  onEventReschedule?: (eventId: string, newDate: Date, eventType: CalendarEvent["type"], newTime?: string) => void;
  onEventResize?: (eventId: string, startTime: string, endTime: string, eventType: CalendarEvent["type"]) => void;
  onAddFollowUp?: (afterEventId: string, time: string) => void;
  showCompletionCheckbox?: boolean;
  showNightHours?: boolean;
}

// Hour slots from 6 AM to 11:45 PM (or midnight to 11:45 PM if showNightHours)
const generateTimeSlots = (showNightHours: boolean): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const startHour = showNightHours ? 0 : 6;
  
  for (let hour = startHour; hour < 24; hour++) {
    for (let minute of [0, 15, 30, 45]) {
      const time = new Date(2000, 0, 1, hour, minute);
      slots.push({
        hour,
        minute,
        label: format(time, "h:mm a"),
      });
    }
  }
  
  return slots;
};

// Calculate overlapping events and position them side-by-side using interval-graph column reuse
function calculateEventPositions(events: CalendarEvent[], date: Date): PositionedEvent[] {
  // Filter events for this day - include events that intersect with the date
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  
  const dayEvents = events
    .filter(e => {
      const eventStart = new Date(e.startDate);
      const eventEnd = new Date(e.endDate);
      // Include if event's [start, end) range intersects with this day
      return eventStart <= dayEnd && eventEnd >= dayStart;
    })
    .map(event => {
      // If event is all-day (no start/end time), skip it (handled by all-day bar)
      if (!event.startTime || !event.endTime) {
        return null;
      }
      
      const startTime = event.startTime;
      const endTime = event.endTime;
      
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      return {
        ...event,
        startMinutes,
        endMinutes,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (dayEvents.length === 0) return [];

  // Sweep-line algorithm to assign columns with reuse
  const positioned: PositionedEvent[] = [];
  const columns: { event: typeof dayEvents[0]; endMinutes: number }[][] = [];

  dayEvents.forEach(event => {
    // Find first column where this event doesn't overlap
    let columnIndex = -1;
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      // Remove events from column that have ended before this event starts
      while (column.length > 0 && column[column.length - 1].endMinutes <= event.startMinutes) {
        column.pop();
      }
      
      // Check if this column is now free
      if (column.length === 0 || column[column.length - 1].endMinutes <= event.startMinutes) {
        columnIndex = i;
        break;
      }
    }

    // If no free column found, create a new one
    if (columnIndex === -1) {
      columnIndex = columns.length;
      columns.push([]);
    }

    // Add event to column
    columns[columnIndex].push({ event, endMinutes: event.endMinutes });

    // Calculate max concurrent events at this event's time
    const concurrentCount = columns.filter(col => 
      col.some(e => e.event.startMinutes < event.endMinutes && event.startMinutes < e.endMinutes)
    ).length;

    const ROW_HEIGHT = 40; // 40px rows (Casva standard)
    const MINUTES_PER_ROW = 15; // Each row is 15 minutes
    
    const top = (event.startMinutes / MINUTES_PER_ROW) * ROW_HEIGHT;
    const duration = event.endMinutes - event.startMinutes;
    const height = Math.max((duration / MINUTES_PER_ROW) * ROW_HEIGHT, ROW_HEIGHT);
    
    // Check if there's a gap after this event (within same column)
    const laterEventsInColumn = dayEvents.filter(e => 
      e.startMinutes >= event.endMinutes && 
      positioned.filter(p => p.column === columnIndex).some(p => p.id === e.id) === false
    );
    const nextInColumn = laterEventsInColumn.length > 0 ? laterEventsInColumn[0] : null;
    const hasGapAfter = nextInColumn && nextInColumn.startMinutes > event.endMinutes;
    const gapHeight = hasGapAfter 
      ? ((nextInColumn!.startMinutes - event.endMinutes) / MINUTES_PER_ROW) * ROW_HEIGHT 
      : 0;

    positioned.push({
      ...event,
      column: columnIndex,
      totalColumns: concurrentCount,
      top,
      height,
      hasGapAfter,
      gapHeight,
    });
  });

  return positioned;
}

function DraggableEventCard({ 
  event, 
  onEventClick, 
  onToggleComplete,
  showCompletionCheckbox,
  onAddFollowUp 
}: {
  event: PositionedEvent;
  onEventClick?: (event: CalendarEvent) => void;
  onToggleComplete?: (e: React.MouseEvent, event: CalendarEvent) => void;
  showCompletionCheckbox: boolean;
  onAddFollowUp?: (eventId: string) => void;
}) {
  const [showGapAction, setShowGapAction] = useState(false);
  const isGoogleCalendarEvent = event.type === "google-calendar";
  const isCompleted = event.status === "done" || event.status === "completed" || event.isCompleted;
  const isRecurring = !!event.templateId;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { event, type: 'move' },
    disabled: isGoogleCalendarEvent,
  });

  const eventColor = isRecurring 
    ? "#bba7db" // Casva lilac for recurring
    : (event.projectColor || event.color || "#bba7db");

  const width = `calc(${100 / event.totalColumns}% - 4px)`;
  const left = `calc(${(event.column / event.totalColumns) * 100}% + 2px)`;

  return (
    <>
      <div
        ref={setNodeRef}
        {...(!isGoogleCalendarEvent ? attributes : {})}
        {...(!isGoogleCalendarEvent ? listeners : {})}
        onClick={() => onEventClick?.(event)}
        className={cn(
          "absolute group casva-hover-lift casva-ripple rounded-md px-2 py-1.5 text-white text-xs transition-all",
          !isGoogleCalendarEvent && "touch-none cursor-move",
          isGoogleCalendarEvent && "cursor-pointer",
          isCompleted && "opacity-50",
          isDragging && "opacity-40 scale-95"
        )}
        style={{
          top: `${event.top}px`,
          height: `${event.height}px`,
          width,
          left,
          backgroundColor: eventColor,
          borderLeft: `3px solid ${eventColor}`,
          zIndex: isDragging ? 50 : 10,
        }}
        data-testid={`event-${event.type}-${event.id}`}
      >
        <div className="flex items-start gap-1.5 h-full">
          {showCompletionCheckbox && event.type === "task" && (
            <button
              data-testid={`checkbox-complete-${event.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleComplete?.(e, event);
              }}
              className={cn(
                "flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center mt-0.5",
                isCompleted 
                  ? "bg-white border-white text-casva-700" 
                  : "border-white/70 hover:border-white hover:bg-white/20"
              )}
            >
              {isCompleted && <Check className="w-2 h-2" />}
            </button>
          )}
          
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className={cn(
              "font-medium truncate text-white",
              isCompleted && "line-through opacity-70"
            )}>
              {event.title}
            </div>
            
            {event.startTime && (
              <div className="text-[10px] text-white/80 mt-0.5">
                {event.startTime}
                {event.endTime && ` - ${event.endTime}`}
              </div>
            )}

            {isRecurring && (
              <Badge 
                variant="secondary" 
                className="text-[9px] px-1 py-0 h-4 mt-1 bg-white/20 text-white border-0"
              >
                Recurring
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Bubble Gap with hover action */}
      {event.hasGapAfter && event.gapHeight && event.gapHeight > 20 && (
        <div
          className="absolute left-0 right-0 group/gap"
          style={{
            top: `${event.top + event.height}px`,
            height: `${event.gapHeight}px`,
          }}
          onMouseEnter={() => setShowGapAction(true)}
          onMouseLeave={() => setShowGapAction(false)}
        >
          {/* Dashed line */}
          <div 
            className="absolute left-1/2 top-0 bottom-0 w-px border-l-2 border-dashed border-muted-foreground/20"
            style={{ transform: 'translateX(-50%)' }}
          />
          
          {/* Hover action */}
          {showGapAction && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Button
                size="sm"
                variant="secondary"
                className="h-6 text-xs gap-1 shadow-md casva-ripple"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFollowUp?.(event.id);
                }}
                data-testid={`button-add-followup-${event.id}`}
              >
                <Plus className="h-3 w-3" />
                Add follow-up
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function CalendarDayColumn({
  date,
  events,
  onEventClick,
  onEventComplete,
  onEventReschedule,
  onEventResize,
  onAddFollowUp,
  showCompletionCheckbox = false,
  showNightHours: initialShowNightHours = false,
}: CalendarDayColumnProps) {
  const [showNightHours, setShowNightHours] = useState(initialShowNightHours);
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const columnRef = useRef<HTMLDivElement>(null);

  const timeSlots = useMemo(() => generateTimeSlots(showNightHours), [showNightHours]);
  
  // Separate all-day events from timed events
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CalendarEvent[] = [];
    const timed: CalendarEvent[] = [];
    
    events.forEach(event => {
      if (!event.startTime || !event.endTime) {
        allDay.push(event);
      } else {
        timed.push(event);
      }
    });
    
    return { allDayEvents: allDay, timedEvents: timed };
  }, [events]);

  const positionedEvents = useMemo(
    () => calculateEventPositions(timedEvents, date),
    [timedEvents, date]
  );

  // Auto-scroll to 6 AM on mount
  useEffect(() => {
    if (!columnRef.current || showNightHours) return;
    
    const sixAMSlot = columnRef.current.querySelector('[data-hour="6"]');
    if (sixAMSlot) {
      setTimeout(() => {
        sixAMSlot.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showNightHours]);

  const handleToggleComplete = (e: React.MouseEvent, event: CalendarEvent) => {
    e.stopPropagation();
    const newCompleted = !(event.isCompleted || event.status === "done" || event.status === "completed");
    onEventComplete?.(event.id, newCompleted);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* All-Day Events Bar */}
      {allDayEvents.length > 0 && (
        <div 
          className={cn(
            "border-b bg-muted/30 transition-all overflow-hidden",
            allDayExpanded ? "min-h-[80px]" : "h-[15px]"
          )}
        >
          <button
            onClick={() => setAllDayExpanded(!allDayExpanded)}
            className="w-full h-[15px] flex items-center justify-center hover:bg-muted/50 transition-colors"
            data-testid="button-toggle-allday"
          >
            {allDayExpanded ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
          
          {allDayExpanded && (
            <div className="px-2 pb-2 space-y-1">
              {allDayEvents.map(event => (
                <div
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className="px-2 py-1 rounded text-xs text-white cursor-pointer hover:opacity-90 casva-ripple"
                  style={{ backgroundColor: event.projectColor || event.color || "#bba7db" }}
                  data-testid={`allday-event-${event.id}`}
                >
                  {event.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Time Grid */}
      <div 
        ref={columnRef}
        className="flex-1 overflow-y-auto relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* Night hours toggle */}
        {!showNightHours && (
          <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-2 py-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNightHours(true)}
              className="h-6 text-xs text-muted-foreground"
              data-testid="button-show-night"
            >
              Show 12am–6am
            </Button>
          </div>
        )}

        <div className="relative" style={{ minHeight: `${timeSlots.length * 40}px` }}>
          {/* Time slots */}
          {timeSlots.map((slot, index) => (
            <div
              key={`${slot.hour}-${slot.minute}`}
              data-hour={slot.hour}
              className={cn(
                "h-10 border-b border-border/50 flex items-center relative",
                slot.minute === 0 && "border-border"
              )}
              style={{ height: '40px' }}
            >
              {slot.minute === 0 && (
                <div className="absolute left-0 -top-2 px-2 text-xs font-medium text-muted-foreground bg-background font-['Clash_Grotesk']">
                  {format(new Date(2000, 0, 1, slot.hour, 0), "h a")}
                </div>
              )}
            </div>
          ))}

          {/* Positioned events */}
          <div className="absolute inset-0 px-1">
            {positionedEvents.map(event => (
              <DraggableEventCard
                key={event.id}
                event={event}
                onEventClick={onEventClick}
                onToggleComplete={handleToggleComplete}
                showCompletionCheckbox={showCompletionCheckbox}
                onAddFollowUp={(eventId) => {
                  const endTime = event.endTime || "12:00";
                  onAddFollowUp?.(eventId, endTime);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

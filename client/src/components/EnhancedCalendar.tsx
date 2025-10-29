import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, isToday, isPast, isSameMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";

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
}

interface EnhancedCalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventComplete?: (eventId: string, completed: boolean) => void;
  onEventReschedule?: (eventId: string, newDate: Date, eventType: CalendarEvent["type"], newTime?: string) => void;
  onDateClick?: (date: Date) => void;
  showCompletionCheckbox?: boolean;
  initialView?: "month" | "week" | "day";
}

interface DraggableEventProps {
  event: CalendarEvent;
  index: number;
  onEventClick?: (event: CalendarEvent) => void;
  onToggleComplete?: (e: React.MouseEvent, event: CalendarEvent) => void;
  showCompletionCheckbox: boolean;
}

function DraggableEvent({ event, index, onEventClick, onToggleComplete, showCompletionCheckbox }: DraggableEventProps) {
  const isGoogleCalendarEvent = event.type === "google-calendar";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { event },
    disabled: isGoogleCalendarEvent, // Disable dragging for Google Calendar events
  });

  const isCompleted = event.status === "done" || event.status === "completed" || event.isCompleted;
  const eventColor = event.projectColor || event.color || "hsl(215 35% 45%)";
  const showTime = event.startTime || event.endTime;

  return (
    <div
      ref={setNodeRef}
      {...(!isGoogleCalendarEvent ? attributes : {})}
      {...(!isGoogleCalendarEvent ? listeners : {})}
      key={`${event.id}-${index}`}
      data-testid={`event-${event.type}-${event.id}`}
      onClick={() => onEventClick?.(event)}
      className={cn(
        "group flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] mb-1 hover-elevate active-elevate-2",
        !isGoogleCalendarEvent && "cursor-move touch-none",
        isGoogleCalendarEvent && "cursor-pointer",
        isCompleted && "opacity-60",
        isDragging && "opacity-50"
      )}
      style={{
        backgroundColor: `${eventColor}15`,
        borderLeft: `3px solid ${eventColor}`,
      }}
    >
      {showCompletionCheckbox && event.type === "task" && (
        <button
          data-testid={`checkbox-complete-${event.id}`}
          onClick={(e) => onToggleComplete?.(e, event)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors hover-elevate",
            isCompleted 
              ? "bg-primary border-primary text-primary-foreground" 
              : "border-muted-foreground/40 hover:border-primary"
          )}
        >
          {isCompleted && <Check className="w-2.5 h-2.5" />}
        </button>
      )}
      <div className="flex-1 min-w-0 overflow-hidden flex items-center gap-1">
        <div className={cn(
          "font-medium truncate flex-1",
          isCompleted && "line-through"
        )}>
          {event.title}
        </div>
        {isGoogleCalendarEvent && (
          <Badge 
            variant="outline" 
            className="flex-shrink-0 text-[9px] px-1 py-0 h-3.5"
            style={{ borderColor: '#4285f4', color: '#4285f4' }}
            data-testid={`google-badge-${event.id}`}
          >
            G
          </Badge>
        )}
      </div>
    </div>
  );
}

interface DroppableDateCellProps {
  date: Date;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

function DroppableDateCell({ date, children, className, onClick }: DroppableDateCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: format(date, "yyyy-MM-dd"),
    data: { date },
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        className,
        isOver && "ring-2 ring-primary ring-inset"
      )}
    >
      {children}
    </div>
  );
}

interface DroppableTimeSlotProps {
  date: Date;
  hour: number;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

function DroppableTimeSlot({ date, hour, children, className, onClick }: DroppableTimeSlotProps) {
  const slotId = `${format(date, "yyyy-MM-dd")}-${hour}`;
  const { setNodeRef, isOver } = useDroppable({
    id: slotId,
    data: { date, hour },
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        className,
        isOver && "ring-2 ring-primary ring-inset"
      )}
    >
      {children}
    </div>
  );
}

export function EnhancedCalendar({ 
  events, 
  onEventClick, 
  onEventComplete,
  onEventReschedule,
  onDateClick,
  showCompletionCheckbox = true,
  initialView = "month"
}: EnhancedCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">(initialView);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Setup drag sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 10,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Calculate visible date range based on view
  const dateRange = useMemo(() => {
    if (view === "month") {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      const weekStart = startOfWeek(start, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(end, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    } else if (view === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    } else {
      return [currentDate];
    }
  }, [currentDate, view]);

  // Navigate calendar
  const navigate = useCallback((direction: "prev" | "next") => {
    if (view === "month") {
      setCurrentDate(direction === "next" ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else if (view === "week") {
      setCurrentDate(direction === "next" ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else {
      setCurrentDate(direction === "next" ? addDays(currentDate, 1) : subDays(currentDate, 1));
    }
  }, [currentDate, view]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  // Auto-scroll to 5am when calendar loads in week/day view
  useEffect(() => {
    if ((view === "week" || view === "day") && scrollContainerRef.current) {
      const HOUR_HEIGHT = 40;
      const scrollTo5am = 5 * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTop = scrollTo5am;
    }
  }, [view]);

  // Get events for a specific date
  const getEventsForDate = useCallback((date: Date): CalendarEvent[] => {
    // Normalize date to start of day for comparison
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    return events.filter(event => {
      const eventStart = new Date(event.startDate);
      eventStart.setHours(0, 0, 0, 0);
      
      const eventEnd = new Date(event.endDate);
      eventEnd.setHours(0, 0, 0, 0);
      
      return targetDate >= eventStart && targetDate <= eventEnd;
    }).sort((a, b) => {
      // Sort by time if available, otherwise by title
      if (a.startTime && b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      return a.title.localeCompare(b.title);
    });
  }, [events]);

  // Handle event completion toggle
  const handleToggleComplete = useCallback((e: React.MouseEvent, event: CalendarEvent) => {
    e.stopPropagation();
    if (onEventComplete) {
      const isCompleted = event.status === "done" || event.status === "completed" || event.isCompleted;
      onEventComplete(event.id, !isCompleted);
    }
  }, [onEventComplete]);

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const draggedEvent = event.active.data.current?.event as CalendarEvent;
    setActiveEvent(draggedEvent);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id && onEventReschedule) {
      const draggedEvent = active.data.current?.event as CalendarEvent;
      const targetDate = over.data.current?.date as Date;
      const targetHour = over.data.current?.hour as number | undefined;
      
      if (draggedEvent && targetDate) {
        // If dropped on a specific time slot, format the time
        const newTime = targetHour !== undefined ? `${targetHour.toString().padStart(2, '0')}:00` : undefined;
        onEventReschedule(draggedEvent.id, targetDate, draggedEvent.type, newTime);
      }
    }
    
    setActiveEvent(null);
  };

  // Render month view
  const renderMonthView = () => {
    const weeks: Date[][] = [];
    for (let i = 0; i < dateRange.length; i += 7) {
      weeks.push(dateRange.slice(i, i + 7));
    }

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b sticky top-0 bg-background z-10">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div
              key={day}
              className="p-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {dateRange.map((date, idx) => {
            const dayEvents = getEventsForDate(date);
            const isCurrentMonth = isSameMonth(date, currentDate);
            
            return (
              <DroppableDateCell
                key={idx}
                date={date}
                onClick={() => onDateClick?.(date)}
                className={cn(
                  "min-h-[120px] p-2 border-r border-b last:border-r-0 hover-elevate cursor-pointer",
                  !isCurrentMonth && "bg-muted/20 text-muted-foreground",
                  isToday(date) && "bg-primary/5"
                )}
              >
                <div
                  data-testid={`day-cell-${format(date, "yyyy-MM-dd")}`}
                  className="h-full"
                >
                  <div className={cn(
                    "text-sm font-medium mb-1",
                    isToday(date) && "text-primary"
                  )}>
                    {format(date, "d")}
                  </div>
                  <div className="space-y-1 overflow-y-auto max-h-[80px]">
                    {dayEvents.slice(0, 3).map((event, i) => (
                      <DraggableEvent
                        key={`${event.id}-${i}`}
                        event={event}
                        index={i}
                        onEventClick={onEventClick}
                        onToggleComplete={handleToggleComplete}
                        showCompletionCheckbox={showCompletionCheckbox}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-muted-foreground px-2">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              </DroppableDateCell>
            );
          })}
        </div>
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const HOUR_HEIGHT = 40; // Reduced from 64px to 40px
    
    return (
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        <div className="grid grid-cols-8 border-b sticky top-0 bg-background z-10">
          <div className="p-2 border-r w-16"></div>
          {dateRange.map((date, idx) => (
            <div
              key={idx}
              className={cn(
                "p-2 text-center border-r last:border-r-0",
                isToday(date) && "bg-primary/5"
              )}
            >
              <div className="text-xs text-muted-foreground">
                {format(date, "EEE")}
              </div>
              <div className={cn(
                "text-lg font-semibold",
                isToday(date) && "text-primary"
              )}>
                {format(date, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* All-Day Events Section */}
        <div className="grid grid-cols-8 border-b bg-background sticky top-[73px] z-10">
          <div className="p-2 border-r w-16 text-[10px] text-muted-foreground flex items-center justify-center">
            All Day
          </div>
          {dateRange.map((date, dayIdx) => {
            const dayEvents = getEventsForDate(date);
            const allDayEvents = dayEvents.filter(event => !event.startTime && !event.endTime);
            
            return (
              <div 
                key={dayIdx} 
                className={cn(
                  "border-r last:border-r-0 p-1 min-h-[36px]",
                  isToday(date) && "bg-primary/5"
                )}
                data-testid={`all-day-column-${format(date, "yyyy-MM-dd")}`}
              >
                {allDayEvents.map((event, idx) => (
                  <DraggableEvent
                    key={`${event.id}-${idx}`}
                    event={event}
                    index={idx}
                    onEventClick={onEventClick}
                    onToggleComplete={handleToggleComplete}
                    showCompletionCheckbox={showCompletionCheckbox}
                  />
                ))}
              </div>
            );
          })}
        </div>
        
        <div className="grid grid-cols-8">
          <div className="border-r w-16">
            {hours.map((hour) => (
              <div key={hour} className="h-10 p-1 text-[10px] text-muted-foreground border-b text-center">
                {format(new Date().setHours(hour, 0), "ha")}
              </div>
            ))}
          </div>
          
          {dateRange.map((date, dayIdx) => {
            const dayEvents = getEventsForDate(date);
            const timedEvents = dayEvents.filter(event => event.startTime || event.endTime);
            
            return (
              <div
                key={dayIdx}
                className="border-r last:border-r-0 relative"
              >
                <div data-testid={`day-column-${format(date, "yyyy-MM-dd")}`}>
                  {hours.map((hour) => (
                    <DroppableTimeSlot
                      key={hour}
                      date={date}
                      hour={hour}
                      className="h-10 border-b hover:bg-muted/20 cursor-pointer"
                      onClick={() => onDateClick?.(date)}
                    />
                  ))}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="relative h-full">
                      {timedEvents.map((event, idx) => {
                        const startHour = event.startTime 
                          ? parseInt(event.startTime.split(":")[0]) 
                          : 0;
                        const top = startHour * HOUR_HEIGHT;
                        
                        return (
                          <div
                            key={`${event.id}-${idx}`}
                            className="absolute left-1 right-1 pointer-events-auto"
                            style={{ top: `${top}px` }}
                          >
                            <DraggableEvent
                              event={event}
                              index={idx}
                              onEventClick={onEventClick}
                              onToggleComplete={handleToggleComplete}
                              showCompletionCheckbox={showCompletionCheckbox}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div className="flex items-center gap-2">
            <Button
              data-testid="button-calendar-today"
              variant="outline"
              size="sm"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button
              data-testid="button-calendar-prev"
              variant="ghost"
              size="icon"
              onClick={() => navigate("prev")}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              data-testid="button-calendar-next"
              variant="ghost"
              size="icon"
              onClick={() => navigate("next")}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <h2 className="text-lg font-semibold min-w-[200px]">
              {view === "month" && format(currentDate, "MMMM yyyy")}
              {view === "week" && `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d, yyyy")}`}
              {view === "day" && format(currentDate, "EEEE, MMMM d, yyyy")}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                data-testid="button-view-month"
                variant={view === "month" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("month")}
              >
                Month
              </Button>
              <Button
                data-testid="button-view-week"
                variant={view === "week" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("week")}
              >
                Week
              </Button>
              <Button
                data-testid="button-view-day"
                variant={view === "day" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setView("day")}
              >
                Day
              </Button>
            </div>
          </div>
        </div>

        {/* Calendar content */}
        {view === "month" && renderMonthView()}
        {view === "week" && renderWeekView()}
        {view === "day" && renderWeekView()}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeEvent ? (
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] cursor-move opacity-90 shadow-lg"
            style={{
              backgroundColor: `${activeEvent.projectColor || activeEvent.color || "hsl(215 35% 45%)"}25`,
              borderLeft: `3px solid ${activeEvent.projectColor || activeEvent.color || "hsl(215 35% 45%)"}`,
            }}
          >
            <div className="font-medium">
              {activeEvent.title}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, isToday, isPast, isSameMonth, getDay } from "date-fns";
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
  onEventResize?: (eventId: string, startTime: string, endTime: string, eventType: CalendarEvent["type"]) => void;
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
  showResizeHandles?: boolean;
}

function DraggableEvent({ event, index, onEventClick, onToggleComplete, showCompletionCheckbox, showResizeHandles = false }: DraggableEventProps) {
  const isGoogleCalendarEvent = event.type === "google-calendar";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { event, type: 'move' },
    disabled: isGoogleCalendarEvent, // Disable dragging for Google Calendar events
  });

  // Separate draggable hooks for resize handles
  const { attributes: topAttrs, listeners: topListeners, setNodeRef: setTopRef } = useDraggable({
    id: `${event.id}:resize-start`,
    data: { event, type: 'resize-start' },
    disabled: isGoogleCalendarEvent || !showResizeHandles,
  });

  const { attributes: bottomAttrs, listeners: bottomListeners, setNodeRef: setBottomRef } = useDraggable({
    id: `${event.id}:resize-end`,
    data: { event, type: 'resize-end' },
    disabled: isGoogleCalendarEvent || !showResizeHandles,
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
        "group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] mb-1 hover-elevate active-elevate-2",
        !isGoogleCalendarEvent && "touch-none",
        !isGoogleCalendarEvent && !showResizeHandles && "cursor-move",
        showResizeHandles && !isGoogleCalendarEvent && "cursor-pointer",
        isGoogleCalendarEvent && "cursor-pointer",
        isCompleted && "opacity-60",
        isDragging && "opacity-50"
      )}
      style={{
        backgroundColor: `${eventColor}15`,
        borderLeft: `3px solid ${eventColor}`,
      }}
    >
      {/* Top resize handle */}
      {showResizeHandles && !isGoogleCalendarEvent && (
        <div
          ref={setTopRef}
          {...topAttrs}
          {...topListeners}
          className="absolute -top-1 left-0 right-0 h-3 cursor-ns-resize z-10 flex items-center justify-center"
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`resize-handle-top-${event.id}`}
        >
          <div className="h-1 bg-primary/40 group-hover:bg-primary w-12 rounded-full transition-colors" />
        </div>
      )}

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

      {/* Bottom resize handle */}
      {showResizeHandles && !isGoogleCalendarEvent && (
        <div
          ref={setBottomRef}
          {...bottomAttrs}
          {...bottomListeners}
          className="absolute -bottom-1 left-0 right-0 h-3 cursor-ns-resize z-10 flex items-center justify-center"
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`resize-handle-bottom-${event.id}`}
        >
          <div className="h-1 bg-primary/40 group-hover:bg-primary w-12 rounded-full transition-colors" />
        </div>
      )}
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
  quarter: number; // 0, 15, 30, or 45
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

function DroppableTimeSlot({ date, hour, quarter, children, className, onClick }: DroppableTimeSlotProps) {
  const slotId = `${format(date, "yyyy-MM-dd")}-${hour}:${quarter.toString().padStart(2, '0')}`;
  const { setNodeRef, isOver } = useDroppable({
    id: slotId,
    data: { date, hour, quarter },
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
  onEventResize,
  onDateClick,
  showCompletionCheckbox = true,
  initialView = "month"
}: EnhancedCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">(initialView);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const allDayScrollRef = useRef<HTMLDivElement>(null);
  const timeGridScrollRef = useRef<HTMLDivElement>(null);
  
  // For infinite scrolling - track expanded date range
  const [weekRangeStart, setWeekRangeStart] = useState(() => startOfWeek(subWeeks(new Date(), 4), { weekStartsOn: 1 }));
  const [weekRangeEnd, setWeekRangeEnd] = useState(() => endOfWeek(addWeeks(new Date(), 4), { weekStartsOn: 1 }));
  const [monthRangeStart, setMonthRangeStart] = useState(() => startOfMonth(subMonths(new Date(), 2)));
  const [monthRangeEnd, setMonthRangeEnd] = useState(() => endOfMonth(addMonths(new Date(), 2)));

  // Setup drag sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 3,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100,
      tolerance: 3,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Calculate visible date range based on view
  const dateRange = useMemo(() => {
    if (view === "month") {
      // Infinite scrolling - use expanded range with week alignment
      const weekStart = startOfWeek(monthRangeStart, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(monthRangeEnd, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    } else if (view === "week") {
      // Infinite scrolling - use expanded range
      return eachDayOfInterval({ start: weekRangeStart, end: weekRangeEnd });
    } else {
      return [currentDate];
    }
  }, [currentDate, view, weekRangeStart, weekRangeEnd, monthRangeStart, monthRangeEnd]);

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

  // Refs for vertical scroll synchronization
  const hourLabelsRef = useRef<HTMLDivElement>(null);

  // Expand date range when scrolling near edges for infinite scroll
  const expandWeekRange = useCallback((direction: 'start' | 'end') => {
    if (direction === 'start') {
      setWeekRangeStart(prev => startOfWeek(subWeeks(prev, 2), { weekStartsOn: 1 }));
    } else {
      setWeekRangeEnd(prev => endOfWeek(addWeeks(prev, 2), { weekStartsOn: 1 }));
    }
  }, []);

  const expandMonthRange = useCallback((direction: 'start' | 'end') => {
    if (direction === 'start') {
      setMonthRangeStart(prev => startOfMonth(subMonths(prev, 1)));
    } else {
      setMonthRangeEnd(prev => endOfMonth(addMonths(prev, 1)));
    }
  }, []);

  // Synchronize horizontal scroll across date header, all-day, and time grid
  const handleHorizontalScroll = useCallback((source: 'header' | 'allDay' | 'timeGrid') => {
    return (e: React.UIEvent<HTMLDivElement>) => {
      const element = e.currentTarget;
      const scrollLeft = element.scrollLeft;
      const scrollWidth = element.scrollWidth;
      const clientWidth = element.clientWidth;
      
      // Sync scroll position
      if (source !== 'header' && scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollLeft;
      }
      if (source !== 'allDay' && allDayScrollRef.current) {
        allDayScrollRef.current.scrollLeft = scrollLeft;
      }
      if (source !== 'timeGrid' && timeGridScrollRef.current) {
        timeGridScrollRef.current.scrollLeft = scrollLeft;
      }

      // Check for infinite scroll expansion (week view only)
      if (view === 'week') {
        const EDGE_THRESHOLD = 200; // pixels from edge
        
        // Near left edge - expand to earlier dates
        if (scrollLeft < EDGE_THRESHOLD) {
          expandWeekRange('start');
        }
        
        // Near right edge - expand to later dates
        if (scrollLeft + clientWidth > scrollWidth - EDGE_THRESHOLD) {
          expandWeekRange('end');
        }
      }
    };
  }, [view, expandWeekRange]);

  // Synchronize vertical scroll between time grid and hour labels
  const handleTimeGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const scrollTop = e.currentTarget.scrollTop;
    
    // Sync horizontal
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollLeft;
    }
    if (allDayScrollRef.current) {
      allDayScrollRef.current.scrollLeft = scrollLeft;
    }
    
    // Sync vertical with hour labels
    if (hourLabelsRef.current) {
      hourLabelsRef.current.scrollTop = scrollTop;
    }
  }, []);

  // Synchronize hour labels scroll back to time grid
  const handleHourLabelsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    
    if (timeGridScrollRef.current) {
      timeGridScrollRef.current.scrollTop = scrollTop;
    }
  }, []);

  // Auto-scroll to 5am and current week when calendar loads in week/day view
  useEffect(() => {
    if (view === "week" || view === "day") {
      // Vertical scroll to 5am for time grid and hour labels
      const HOUR_HEIGHT = 40;
      const scrollTo5am = 5 * HOUR_HEIGHT;
      
      if (timeGridScrollRef.current) {
        timeGridScrollRef.current.scrollTop = scrollTo5am;
      }
      if (hourLabelsRef.current) {
        hourLabelsRef.current.scrollTop = scrollTo5am;
      }
      
      // For week view, scroll horizontally to show selected week
      if (view === "week" && scrollContainerRef.current) {
        const DAY_WIDTH = 140;
        const selectedIndex = dateRange.findIndex(date => isSameDay(date, currentDate));
        if (selectedIndex >= 0) {
          const scrollLeft = Math.max(0, (selectedIndex - 3) * DAY_WIDTH);
          scrollContainerRef.current.scrollLeft = scrollLeft;
          if (allDayScrollRef.current) {
            allDayScrollRef.current.scrollLeft = scrollLeft;
          }
          if (timeGridScrollRef.current) {
            timeGridScrollRef.current.scrollLeft = scrollLeft;
          }
        }
      }
    }
  }, [view, dateRange, currentDate]);

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
    
    setActiveEvent(null);
    
    if (!over) {
      return;
    }

    const dragType = active.data.current?.type;
    const draggedEvent = active.data.current?.event as CalendarEvent;
    
    if (!draggedEvent) {
      return;
    }
    
    // Handle resize operations
    if ((dragType === 'resize-start' || dragType === 'resize-end') && onEventResize) {
      const targetHour = over.data.current?.hour as number | undefined;
      const targetQuarter = over.data.current?.quarter as number | undefined;
      
      if (targetHour !== undefined && targetQuarter !== undefined) {
        // Create time string from the drop zone
        const newTime = `${targetHour.toString().padStart(2, '0')}:${targetQuarter.toString().padStart(2, '0')}`;
        
        // Get current start and end times
        const currentStart = draggedEvent.startTime || '09:00';
        const currentEnd = draggedEvent.endTime || '10:00';
        
        // Ensure start is before end (with minimum 15 minute duration)
        if (dragType === 'resize-start') {
          // Resizing from top - update start time
          const [newH, newM] = newTime.split(':').map(Number);
          const [endH, endM] = currentEnd.split(':').map(Number);
          // Allow exactly 15 minutes minimum duration
          if (newH * 60 + newM <= endH * 60 + endM - 15) {
            onEventResize(draggedEvent.id, newTime, currentEnd, draggedEvent.type);
          }
        } else {
          // Resizing from bottom - update end time
          const [startH, startM] = currentStart.split(':').map(Number);
          const [newH, newM] = newTime.split(':').map(Number);
          // Allow exactly 15 minutes minimum duration
          if (newH * 60 + newM >= startH * 60 + startM + 15) {
            onEventResize(draggedEvent.id, currentStart, newTime, draggedEvent.type);
          }
        }
      }
      return; // Exit early for resize operations
    }
    
    // Handle move operations (default when not resizing)
    if (active.id !== over.id && onEventReschedule) {
      const targetDate = over.data.current?.date as Date;
      const targetHour = over.data.current?.hour as number | undefined;
      const targetQuarter = over.data.current?.quarter as number | undefined;
      
      if (targetDate) {
        // If dropped on a specific time slot, use the quarter-hour slot
        if (targetHour !== undefined && targetQuarter !== undefined) {
          const newTime = `${targetHour.toString().padStart(2, '0')}:${targetQuarter.toString().padStart(2, '0')}`;
          onEventReschedule(draggedEvent.id, targetDate, draggedEvent.type, newTime);
        } else {
          onEventReschedule(draggedEvent.id, targetDate, draggedEvent.type, undefined);
        }
      }
    }
  };

  // Render month view
  const renderMonthView = () => {
    // Group dates into weeks for each month
    const monthGroups: { month: Date; weeks: Date[][] }[] = [];
    
    // Split dateRange into weeks
    const weeks: Date[][] = [];
    for (let i = 0; i < dateRange.length; i += 7) {
      weeks.push(dateRange.slice(i, i + 7));
    }
    
    // Group weeks by month (based on the majority of days in the week)
    let currentMonthWeeks: Date[][] = [];
    let currentMonthDate: Date | null = null;

    weeks.forEach((week) => {
      // Determine the month for this week (use the first in-month date)
      const monthDate = week.find(d => isSameMonth(d, week[3])) || week[3];
      const monthKey = format(monthDate, "yyyy-MM");
      
      if (!currentMonthDate || format(currentMonthDate, "yyyy-MM") !== monthKey) {
        if (currentMonthWeeks.length > 0 && currentMonthDate) {
          monthGroups.push({ month: currentMonthDate, weeks: currentMonthWeeks });
        }
        currentMonthDate = monthDate;
        currentMonthWeeks = [week];
      } else {
        currentMonthWeeks.push(week);
      }
    });
    if (currentMonthWeeks.length > 0 && currentMonthDate) {
      monthGroups.push({ month: currentMonthDate, weeks: currentMonthWeeks });
    }

    const handleMonthScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const element = e.currentTarget;
      const scrollTop = element.scrollTop;
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;
      const EDGE_THRESHOLD = 300; // pixels from edge
      
      // Near top edge - expand to earlier months
      if (scrollTop < EDGE_THRESHOLD) {
        expandMonthRange('start');
      }
      
      // Near bottom edge - expand to later months
      if (scrollTop + clientHeight > scrollHeight - EDGE_THRESHOLD) {
        expandMonthRange('end');
      }
    };

    return (
      <div className="flex-1 overflow-auto hide-scrollbar" onScroll={handleMonthScroll}>
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
        {monthGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {/* Month header */}
            <div className="bg-muted/30 border-b-2 border-primary/20 px-4 py-2">
              <h3 className="text-lg font-semibold">{format(group.month, "MMMM yyyy")}</h3>
            </div>
            {/* Month grid - organized by weeks */}
            <div className="grid grid-cols-7">
              {group.weeks.flatMap((week) => 
                week.map((date, idx) => {
                  const dayEvents = getEventsForDate(date);
                  const isCurrentMonth = isSameMonth(date, group.month);
                  
                  return (
                    <DroppableDateCell
                      key={`${format(date, "yyyy-MM-dd")}`}
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
                })
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const HOUR_HEIGHT = 40; // Reduced from 64px to 40px
    const DAY_WIDTH = view === "day" ? undefined : 140; // Full width for day view, fixed width for week view
    
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Date header row - separate time column from scrollable days */}
        <div className="flex border-b">
          <div className="p-2 border-r w-16 flex-shrink-0 bg-background"></div>
          <div 
            className={cn("flex overflow-x-auto hide-scrollbar", view === "day" && "flex-1")} 
            ref={scrollContainerRef}
            onScroll={handleHorizontalScroll('header')}
          >
            {dateRange.map((date, idx) => {
              const dayOfWeek = getDay(date);
              const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // Mon-Fri are 1-5
              
              return (
                <div
                  key={idx}
                  className={cn(
                    "p-2 text-center border-r flex-shrink-0",
                    isToday(date) ? "bg-primary/5" : !isWeekday && "bg-muted/50",
                    view === "day" && "flex-1"
                  )}
                  style={DAY_WIDTH ? { minWidth: `${DAY_WIDTH}px`, width: `${DAY_WIDTH}px` } : undefined}
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
              );
            })}
          </div>
        </div>

        {/* All-Day Events Section - separate time column from scrollable days */}
        <div className="flex border-b">
          <div className="p-2 border-r w-16 flex-shrink-0 text-[10px] text-muted-foreground flex items-center justify-center bg-background">
            All Day
          </div>
          <div 
            className={cn("flex overflow-x-auto hide-scrollbar", view === "day" && "flex-1")}
            ref={allDayScrollRef}
            onScroll={handleHorizontalScroll('allDay')}
          >
            {dateRange.map((date, dayIdx) => {
              const dayEvents = getEventsForDate(date);
              const allDayEvents = dayEvents.filter(event => !event.startTime && !event.endTime);
              const MAX_ALL_DAY_EVENTS = 2;
              const visibleEvents = allDayEvents.slice(0, MAX_ALL_DAY_EVENTS);
              const hiddenCount = Math.max(0, allDayEvents.length - MAX_ALL_DAY_EVENTS);
              const dayOfWeek = getDay(date);
              const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // 0 = Sunday, 6 = Saturday
              
              return (
                <div 
                  key={dayIdx} 
                  className={cn(
                    "border-r p-1 min-h-[36px] max-h-[80px] overflow-hidden flex-shrink-0",
                    isToday(date) ? "bg-primary/5" : !isWeekday && "bg-muted/50",
                    view === "day" && "flex-1"
                  )}
                  style={DAY_WIDTH ? { minWidth: `${DAY_WIDTH}px`, width: `${DAY_WIDTH}px` } : undefined}
                  data-testid={`all-day-column-${format(date, "yyyy-MM-dd")}`}
                >
                  {visibleEvents.map((event, idx) => (
                    <DraggableEvent
                      key={`${event.id}-${idx}`}
                      event={event}
                      index={idx}
                      onEventClick={onEventClick}
                      onToggleComplete={handleToggleComplete}
                      showCompletionCheckbox={showCompletionCheckbox}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <div className="text-[10px] text-muted-foreground px-2 py-0.5">
                      +{hiddenCount} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Time grid - separate time column from scrollable days */}
        <div className="flex flex-1 overflow-hidden">
          <div 
            className="border-r w-16 flex-shrink-0 bg-background overflow-y-auto hide-scrollbar" 
            ref={hourLabelsRef}
            onScroll={handleHourLabelsScroll}
          >
            {hours.map((hour) => (
              <div key={hour} className="h-10 p-1 text-[10px] text-muted-foreground border-b border-border text-center">
                {format(new Date().setHours(hour, 0), "ha")}
              </div>
            ))}
          </div>
          <div 
            className={cn("flex overflow-auto hide-scrollbar h-full", view === "day" && "flex-1")}
            ref={timeGridScrollRef}
            onScroll={handleTimeGridScroll}
          >
            {dateRange.map((date, dayIdx) => {
              const dayEvents = getEventsForDate(date);
              const timedEvents = dayEvents.filter(event => event.startTime || event.endTime);
              const dayOfWeek = getDay(date);
              const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // 0 = Sunday, 6 = Saturday
              
              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "relative flex-shrink-0",
                    view === "day" && "flex-1"
                  )}
                  style={DAY_WIDTH ? { minWidth: `${DAY_WIDTH}px`, width: `${DAY_WIDTH}px` } : undefined}
                >
                  
                  <div 
                    data-testid={`day-column-${format(date, "yyyy-MM-dd")}`}
                    className={cn(
                      "border-r",
                      isToday(date) ? "bg-primary/5" : !isWeekday && "bg-muted/50"
                    )}
                  >
                    {hours.map((hour) => (
                      <div key={hour} className="relative h-10 border-b border-border">
                        {[0, 15, 30, 45].map((quarter) => (
                          <DroppableTimeSlot
                            key={`${hour}-${quarter}`}
                            date={date}
                            hour={hour}
                            quarter={quarter}
                            className="h-2.5 hover:bg-muted/20 cursor-pointer"
                            onClick={() => onDateClick?.(date)}
                          />
                        ))}
                      </div>
                    ))}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="relative h-full">
                        {(() => {
                          // Calculate overlaps and position events
                          const eventsWithPosition = timedEvents.map((event) => {
                            // Parse start time
                            const [startH, startM] = (event.startTime || '09:00').split(':').map(Number);
                            const startMinutes = startH * 60 + startM;
                            
                            // Parse end time - default to 1 hour if not specified
                            const [endH, endM] = (event.endTime || `${startH + 1}:00`).split(':').map(Number);
                            const endMinutes = endH * 60 + endM;
                            
                            // Calculate position and height
                            const top = (startMinutes / 60) * HOUR_HEIGHT;
                            const durationMinutes = endMinutes - startMinutes;
                            const height = (durationMinutes / 60) * HOUR_HEIGHT;
                            
                            return {
                              event,
                              startMinutes,
                              endMinutes,
                              top,
                              height: Math.max(height, 15), // Minimum 15px height
                            };
                          });

                          // Detect overlaps and assign columns
                          type EventPosition = {
                            event: CalendarEvent;
                            startMinutes: number;
                            endMinutes: number;
                            top: number;
                            height: number;
                          };
                          const columns: EventPosition[][] = [];
                          eventsWithPosition.forEach((eventPos) => {
                            // Find first column where this event doesn't overlap
                            let placed = false;
                            for (const column of columns) {
                              const hasOverlap = column.some((existing) => {
                                return !(
                                  eventPos.endMinutes <= existing.startMinutes ||
                                  eventPos.startMinutes >= existing.endMinutes
                                );
                              });
                              if (!hasOverlap) {
                                column.push(eventPos);
                                placed = true;
                                break;
                              }
                            }
                            if (!placed) {
                              columns.push([eventPos]);
                            }
                          });

                          // Flatten and assign width/left based on column count
                          return columns.flatMap((column, colIdx) => {
                            const totalColumns = columns.length;
                            return column.map((eventPos, idx) => {
                              const widthPercent = 100 / totalColumns;
                              const leftPercent = (colIdx * 100) / totalColumns;
                              
                              return (
                                <div
                                  key={`${eventPos.event.id}-${idx}`}
                                  className="absolute pointer-events-auto"
                                  style={{ 
                                    top: `${eventPos.top}px`,
                                    height: `${eventPos.height}px`,
                                    left: `${leftPercent}%`,
                                    width: `${widthPercent - 2}%`, // Subtract 2% for visual gap
                                  }}
                                >
                                  <DraggableEvent
                                    event={eventPos.event}
                                    index={idx}
                                    onEventClick={onEventClick}
                                    onToggleComplete={handleToggleComplete}
                                    showCompletionCheckbox={showCompletionCheckbox}
                                    showResizeHandles={true}
                                  />
                                </div>
                              );
                            });
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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

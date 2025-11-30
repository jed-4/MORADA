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
  templateId?: string | null;
  tagIds?: string[] | null;
}

interface EnhancedCalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventComplete?: (eventId: string, completed: boolean) => void;
  onEventReschedule?: (eventId: string, newDate: Date, eventType: CalendarEvent["type"], newTime?: string) => void;
  onEventResize?: (eventId: string, startTime: string, endTime: string, eventType: CalendarEvent["type"]) => void;
  onDateClick?: (date: Date) => void;
  showCompletionCheckbox?: boolean;
  initialView?: "month" | "week" | "day" | "roster";
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  view?: "month" | "week" | "day" | "roster";
  onViewChange?: (view: "month" | "week" | "day" | "roster") => void;
  hideInternalHeader?: boolean;
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
  const isRecurring = !!event.templateId;
  const eventColor = isRecurring 
    ? "hsl(270 50% 60%)" // Light purple for recurring tasks
    : (event.projectColor || event.color || "hsl(215 35% 45%)");
  const showTime = event.startTime || event.endTime;

  // Convert color to proper format with 87% opacity
  const backgroundColor = (() => {
    const color = eventColor.trim();
    
    // Handle HSL
    if (color.startsWith('hsl(') && !color.startsWith('hsla(')) {
      const values = color.slice(4, -1).trim();
      // Remove any trailing slash-alpha (hsl(... / 0.5) → hsl(...))
      const cleaned = values.split('/')[0].trim();
      // Normalize to commas
      const normalized = cleaned.includes(',') ? cleaned : cleaned.replace(/\s+/g, ', ');
      return `hsla(${normalized}, 0.87)`;
    }
    
    // Handle HSLA - normalize alpha to 0.87
    if (color.startsWith('hsla(')) {
      const values = color.slice(5, -1).trim();
      // Split on slash first to remove alpha
      const baseValues = values.split('/')[0].trim();
      // Then split on commas or spaces to get components
      const parts = baseValues.split(/[\s,]+/).filter(p => p);
      if (parts.length >= 3) {
        return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.87)`;
      }
      return color;
    }
    
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        const r = hex[0] + hex[0];
        const g = hex[1] + hex[1];
        const b = hex[2] + hex[2];
        return `#${r}${g}${b}dd`;
      } else if (hex.length === 6) {
        return `${color}dd`;
      } else if (hex.length === 4 || hex.length === 8) {
        // Has alpha - replace it
        const base = hex.length === 4 
          ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
          : hex.slice(0, 6);
        return `#${base}dd`;
      }
      return color;
    }
    
    // Handle RGB
    if (color.startsWith('rgb(') && !color.startsWith('rgba(')) {
      const values = color.slice(4, -1).trim();
      const cleaned = values.split('/')[0].trim();
      const normalized = cleaned.includes(',') ? cleaned : cleaned.replace(/\s+/g, ', ');
      return `rgba(${normalized}, 0.87)`;
    }
    
    // Handle RGBA - normalize alpha to 0.87
    if (color.startsWith('rgba(')) {
      const values = color.slice(5, -1).trim();
      // Split on slash first to remove alpha
      const baseValues = values.split('/')[0].trim();
      // Then split on commas or spaces to get components
      const parts = baseValues.split(/[\s,]+/).filter(p => p);
      if (parts.length >= 3) {
        return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, 0.87)`;
      }
      return color;
    }
    
    // Handle CSS variables
    if (color.startsWith('var(')) {
      return `color-mix(in srgb, ${color} 87%, transparent)`;
    }
    
    // Fallback: return as-is (named colors, etc.)
    return color;
  })();

  return (
    <div
      ref={setNodeRef}
      {...(!isGoogleCalendarEvent ? attributes : {})}
      {...(!isGoogleCalendarEvent ? listeners : {})}
      key={`${event.id}-${index}`}
      data-testid={`event-${event.type}-${event.id}`}
      onClick={() => onEventClick?.(event)}
      className={cn(
        "group relative flex items-start gap-1.5 px-1.5 py-1 rounded text-[11px] mb-0.5 transition-all",
        showResizeHandles && "h-full",
        !isGoogleCalendarEvent && "touch-none",
        !isGoogleCalendarEvent && !showResizeHandles && "cursor-move hover:shadow-sm",
        showResizeHandles && !isGoogleCalendarEvent && "cursor-pointer",
        isGoogleCalendarEvent && "cursor-pointer",
        isCompleted && "opacity-50",
        isDragging && "opacity-40 scale-[0.98]"
      )}
      style={{
        backgroundColor,
        borderLeft: `2px solid ${eventColor}`,
      }}
    >
      {/* Top resize handle - Notion style */}
      {showResizeHandles && !isGoogleCalendarEvent && (
        <div
          ref={setTopRef}
          {...topAttrs}
          {...topListeners}
          className="absolute -top-0.5 left-0 right-0 h-2 cursor-ns-resize z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`resize-handle-top-${event.id}`}
        >
          <div className="h-0.5 bg-muted-foreground w-8 rounded-full" />
        </div>
      )}

      {showCompletionCheckbox && event.type === "task" && (
        <button
          data-testid={`checkbox-complete-${event.id}`}
          onClick={(e) => onToggleComplete?.(e, event)}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center transition-all",
            isCompleted 
              ? "bg-foreground border-foreground text-background" 
              : "border-border hover:border-foreground/70 hover:bg-accent"
          )}
        >
          {isCompleted && <Check className="w-2 h-2" />}
        </button>
      )}
      <div className="flex-1 min-w-0 overflow-hidden flex items-start flex-col">
        <div className="flex items-center gap-1 w-full">
          <div className={cn(
            "font-medium truncate flex-1 text-white text-[10.5px]",
            isCompleted && "line-through opacity-60"
          )}>
            {event.title}
          </div>
          {isRecurring && (
            <Badge 
              variant="outline" 
              className="flex-shrink-0 text-[8px] px-1 py-0 h-3 bg-green-500 border-none text-white font-bold"
              title="Recurring template task"
              data-testid={`recurring-badge-${event.id}`}
            >
              R
            </Badge>
          )}
        </div>
        {showTime && (
          <div className="text-[9px] text-white/70 font-normal">
            {event.startTime}{event.endTime && ` - ${event.endTime}`}
          </div>
        )}
        {isGoogleCalendarEvent && (
          <Badge 
            variant="outline" 
            className="flex-shrink-0 text-[8px] px-1 py-0 h-3 bg-white/95 border-none font-medium mt-0.5"
            style={{ color: '#4285f4' }}
            data-testid={`google-badge-${event.id}`}
          >
            Google
          </Badge>
        )}
      </div>

      {/* Bottom resize handle - Notion style */}
      {showResizeHandles && !isGoogleCalendarEvent && (
        <div
          ref={setBottomRef}
          {...bottomAttrs}
          {...bottomListeners}
          className="absolute -bottom-0.5 left-0 right-0 h-2 cursor-ns-resize z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`resize-handle-bottom-${event.id}`}
        >
          <div className="h-0.5 bg-muted-foreground w-8 rounded-full" />
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
  initialView = "month",
  currentDate: externalCurrentDate,
  onCurrentDateChange,
  view: externalView,
  onViewChange,
  hideInternalHeader = false
}: EnhancedCalendarProps) {
  const [internalCurrentDate, setInternalCurrentDate] = useState(new Date());
  const [internalView, setInternalView] = useState<"month" | "week" | "day" | "roster">(initialView);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  
  // Use controlled currentDate if provided, otherwise use internal state
  const isDateControlled = externalCurrentDate !== undefined;
  const currentDate = isDateControlled ? externalCurrentDate : internalCurrentDate;
  const setCurrentDate = isDateControlled 
    ? (date: Date | ((prev: Date) => Date)) => {
        const newDate = typeof date === 'function' ? date(currentDate) : date;
        onCurrentDateChange?.(newDate);
      }
    : setInternalCurrentDate;
    
  // Use controlled view if provided, otherwise use internal state
  const isViewControlled = externalView !== undefined;
  const view = isViewControlled ? externalView : internalView;
  const setView = isViewControlled
    ? (newView: "month" | "week" | "day" | "roster") => {
        onViewChange?.(newView);
      }
    : setInternalView;
  
  // Filter toggle states
  const [showTasks, setShowTasks] = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [showGoogleCalendar, setShowGoogleCalendar] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const allDayScrollRef = useRef<HTMLDivElement>(null);
  const timeGridScrollRef = useRef<HTMLDivElement>(null);
  
  // For infinite scrolling - track expanded date range
  const [weekRangeStart, setWeekRangeStart] = useState(() => startOfWeek(subWeeks(new Date(), 4), { weekStartsOn: 1 }));
  const [weekRangeEnd, setWeekRangeEnd] = useState(() => endOfWeek(addWeeks(new Date(), 4), { weekStartsOn: 1 }));
  const [monthRangeStart, setMonthRangeStart] = useState(() => startOfMonth(subMonths(new Date(), 2)));
  const [monthRangeEnd, setMonthRangeEnd] = useState(() => endOfMonth(addMonths(new Date(), 2)));

  // Sync range buffers when controlled currentDate changes
  useEffect(() => {
    if (isDateControlled && externalCurrentDate) {
      // Check if date is outside week range and recenter if needed
      const weekStart = startOfWeek(externalCurrentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(externalCurrentDate, { weekStartsOn: 1 });
      if (weekStart < weekRangeStart || weekEnd > weekRangeEnd) {
        setWeekRangeStart(startOfWeek(subWeeks(externalCurrentDate, 4), { weekStartsOn: 1 }));
        setWeekRangeEnd(endOfWeek(addWeeks(externalCurrentDate, 4), { weekStartsOn: 1 }));
      }
      
      // Check if date is outside month range and recenter if needed
      const monthStart = startOfMonth(externalCurrentDate);
      const monthEnd = endOfMonth(externalCurrentDate);
      if (monthStart < monthRangeStart || monthEnd > monthRangeEnd) {
        setMonthRangeStart(startOfMonth(subMonths(externalCurrentDate, 2)));
        setMonthRangeEnd(endOfMonth(addMonths(externalCurrentDate, 2)));
      }
    }
  }, [isDateControlled, externalCurrentDate, weekRangeStart, weekRangeEnd, monthRangeStart, monthRangeEnd]);

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

  // Get events for a specific date with filter toggles applied
  const getEventsForDate = useCallback((date: Date): CalendarEvent[] => {
    // Normalize date to start of day for comparison
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    return events.filter(event => {
      // Date range filter
      const eventStart = new Date(event.startDate);
      eventStart.setHours(0, 0, 0, 0);
      
      const eventEnd = new Date(event.endDate);
      eventEnd.setHours(0, 0, 0, 0);
      
      const isInDateRange = targetDate >= eventStart && targetDate <= eventEnd;
      if (!isInDateRange) return false;
      
      // Event type filter toggles
      if (event.type === "task" && !showTasks) return false;
      if (event.type === "schedule" && !showSchedule) return false;
      if (event.type === "meeting" && !showMeetings) return false;
      if (event.type === "google-calendar" && !showGoogleCalendar) return false;
      
      return true;
    }).sort((a, b) => {
      // Sort by time if available, otherwise by title
      if (a.startTime && b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      return a.title.localeCompare(b.title);
    });
  }, [events, showTasks, showSchedule, showMeetings, showGoogleCalendar]);

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
        <div className="grid grid-cols-7 border-b border-border sticky top-0 bg-background z-10">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div
              key={day}
              className="py-2 px-1 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-r border-border/50 last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        {monthGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {/* Month header - Notion style */}
            <div className="bg-muted/50 border-b border-border px-3 py-1.5">
              <h3 className="text-xs font-semibold text-foreground">{format(group.month, "MMMM yyyy")}</h3>
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
                        "min-h-[110px] p-1.5 border-r border-b border-border/50 last:border-r-0 hover:bg-muted/30 cursor-pointer transition-colors",
                        !isCurrentMonth && "bg-muted/30 text-muted-foreground",
                        isToday(date) && "bg-primary/10"
                      )}
                    >
                      <div
                        data-testid={`day-cell-${format(date, "yyyy-MM-dd")}`}
                        className="h-full"
                      >
                        <div className={cn(
                          "text-[11px] font-medium mb-0.5 px-0.5",
                          isToday(date) && "inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px]",
                          !isToday(date) && "text-foreground"
                        )}>
                          {format(date, "d")}
                        </div>
                        <div className="space-y-0.5 overflow-y-auto max-h-[75px]">
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
                            <div className="text-[9px] text-muted-foreground px-1 py-0.5">
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
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Date header row - Notion style */}
        <div className="flex border-b border-border">
          <div className="py-2 px-2 border-r border-border/50 w-16 flex-shrink-0 bg-background"></div>
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
                    "py-2 px-1 text-center border-r border-border/50 flex-shrink-0",
                    isToday(date) ? "bg-primary/10" : !isWeekday && "bg-muted/50",
                    view === "day" && "flex-1"
                  )}
                  style={DAY_WIDTH ? { minWidth: `${DAY_WIDTH}px`, width: `${DAY_WIDTH}px` } : undefined}
                >
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                    {format(date, "EEE")}
                  </div>
                  <div className={cn(
                    "text-sm font-semibold mt-0.5",
                    isToday(date) && "inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs"
                  )}>
                    {format(date, "d")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* All-Day Events Section - Notion style */}
        <div className="flex border-b border-border">
          <div className="py-1.5 px-2 border-r border-border/50 w-16 flex-shrink-0 text-[9px] text-muted-foreground flex items-center justify-center bg-background uppercase font-semibold">
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
                    "border-r border-border/50 p-1 min-h-[36px] max-h-[80px] overflow-hidden flex-shrink-0",
                    isToday(date) ? "bg-primary/10" : !isWeekday && "bg-muted/50",
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
                    <div className="text-[9px] text-muted-foreground px-1 py-0.5">
                      +{hiddenCount} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Time grid - Notion style */}
        <div className="flex flex-1 overflow-hidden">
          <div 
            className="border-r border-border/50 w-16 flex-shrink-0 bg-background overflow-y-auto hide-scrollbar" 
            ref={hourLabelsRef}
            onScroll={handleHourLabelsScroll}
          >
            {hours.map((hour) => (
              <div key={hour} className="h-10 p-1 text-[9px] text-muted-foreground border-b border-border/50 text-center uppercase">
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
                      "border-r border-border/50",
                      isToday(date) ? "bg-primary/5" : !isWeekday && "bg-muted/50"
                    )}
                  >
                    {hours.map((hour) => (
                      <div key={hour} className="relative h-10 border-b border-border/50">
                        {[0, 15, 30, 45].map((quarter) => (
                          <DroppableTimeSlot
                            key={`${hour}-${quarter}`}
                            date={date}
                            hour={hour}
                            quarter={quarter}
                            className="h-2.5 hover:bg-primary/10 cursor-pointer transition-colors"
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
                            
                            // Calculate position and height with fixed gap for visual separation
                            const top = (startMinutes / 60) * HOUR_HEIGHT;
                            const durationMinutes = endMinutes - startMinutes;
                            const fullHeight = (durationMinutes / 60) * HOUR_HEIGHT;
                            const gap = HOUR_HEIGHT * 0.05; // Fixed gap (5% of one hour)
                            const height = fullHeight - gap;
                            
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
      <div className="flex flex-col h-full bg-background">
        {/* Header - Notion minimal style */}
        {!hideInternalHeader && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-3 border-b">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <Button
              data-testid="button-calendar-today"
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs font-medium"
              onClick={goToToday}
            >
              Today
            </Button>
            <div className="flex items-center gap-1">
              <Button
                data-testid="button-calendar-prev"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => navigate("prev")}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                data-testid="button-calendar-next"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => navigate("next")}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <h2 className="text-sm font-semibold min-w-[140px] sm:min-w-[180px]">
              {view === "month" && format(currentDate, "MMMM yyyy")}
              {view === "week" && `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d")}`}
              {view === "day" && format(currentDate, "MMMM d, yyyy")}
              {view === "roster" && `Roster - Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d")}`}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
              <Button
                data-testid="button-view-month"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium",
                  view === "month" 
                    ? "bg-background shadow-sm text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
                onClick={() => setView("month")}
              >
                Month
              </Button>
              <Button
                data-testid="button-view-week"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium",
                  view === "week" 
                    ? "bg-background shadow-sm text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
                onClick={() => setView("week")}
              >
                Week
              </Button>
              <Button
                data-testid="button-view-day"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium",
                  view === "day" 
                    ? "bg-background shadow-sm text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
                onClick={() => setView("day")}
              >
                Day
              </Button>
              <Button
                data-testid="button-view-roster"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium",
                  view === "roster" 
                    ? "bg-background shadow-sm text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
                onClick={() => setView("roster")}
              >
                Roster
              </Button>
            </div>
            
            {/* Quick filter toggles */}
            <div className="flex items-center gap-1.5 ml-4">
              <Button
                data-testid="button-filter-tasks"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium rounded-full transition-all",
                  showTasks 
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                onClick={() => setShowTasks(!showTasks)}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", showTasks ? "bg-amber-500" : "bg-muted-foreground/30")} />
                Tasks
              </Button>
              <Button
                data-testid="button-filter-schedule"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium rounded-full transition-all",
                  showSchedule 
                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                onClick={() => setShowSchedule(!showSchedule)}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", showSchedule ? "bg-blue-500" : "bg-muted-foreground/30")} />
                Schedule
              </Button>
              <Button
                data-testid="button-filter-meetings"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium rounded-full transition-all",
                  showMeetings 
                    ? "bg-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/30" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                onClick={() => setShowMeetings(!showMeetings)}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", showMeetings ? "bg-purple-500" : "bg-muted-foreground/30")} />
                Meetings
              </Button>
              <Button
                data-testid="button-filter-google"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 px-2.5 text-xs font-medium rounded-full transition-all",
                  showGoogleCalendar 
                    ? "bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                onClick={() => setShowGoogleCalendar(!showGoogleCalendar)}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", showGoogleCalendar ? "bg-green-500" : "bg-muted-foreground/30")} />
                Google
              </Button>
            </div>
          </div>
        </div>
        )}

        {/* Calendar content */}
        {view === "month" && renderMonthView()}
        {view === "week" && renderWeekView()}
        {view === "day" && renderWeekView()}
        {view === "roster" && renderWeekView()}
      </div>

      {/* Drag overlay - Notion style with ghost effect */}
      <DragOverlay>
        {activeEvent ? (
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10.5px] cursor-move shadow-xl ring-1 ring-black/10"
            style={{
              backgroundColor: `${activeEvent.projectColor || activeEvent.color || "hsl(215 35% 45%)"}`,
              borderLeft: `2px solid ${activeEvent.projectColor || activeEvent.color || "hsl(215 35% 45%)"}`,
              opacity: 0.9,
            }}
          >
            <div className="font-medium text-white">
              {activeEvent.title}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

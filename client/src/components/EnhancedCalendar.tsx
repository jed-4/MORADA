import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, addMonths, subMonths, isSameDay, isToday, isPast, isSameMonth, getDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateNotionColors } from "@/lib/taskColors";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragMoveEvent,
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
  isModified?: boolean; // True if task has been moved/rescheduled from original template time
  resource?: any; // Original task/event data for click handlers
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
  const showTime = event.startTime || event.endTime;

  // Generate Notion-style colors from project color (or fallback)
  const baseColor = isRecurring ? "#a855f7" : (event.projectColor || event.color || "#6366f1");
  const notionColors = generateNotionColors(baseColor);

  return (
    <div
      ref={setNodeRef}
      {...(!isGoogleCalendarEvent ? attributes : {})}
      {...(!isGoogleCalendarEvent ? listeners : {})}
      key={`${event.id}-${index}`}
      data-testid={`event-${event.type}-${event.id}`}
      onClick={() => onEventClick?.(event)}
      className={cn(
        "group relative flex items-start gap-1.5 px-1.5 pt-0.5 pb-0.5 rounded text-[11px] mb-0.5 transition-all overflow-hidden shadow-sm",
        showResizeHandles && "h-full",
        !isGoogleCalendarEvent && "touch-none",
        !isGoogleCalendarEvent && !showResizeHandles && "cursor-move hover:shadow-md",
        showResizeHandles && !isGoogleCalendarEvent && "cursor-move hover:shadow-md",
        isGoogleCalendarEvent && "cursor-pointer hover:shadow-md",
        isCompleted && "opacity-60",
        isDragging && "opacity-50 scale-[0.98] shadow-lg"
      )}
      style={{
        backgroundColor: notionColors.pastelBg,
        borderLeft: `3px solid ${notionColors.originalHex}`,
        border: `1px solid rgba(0,0,0,0.08)`,
        borderLeftWidth: '3px',
        borderLeftColor: notionColors.originalHex,
      }}
    >
      {/* Top resize handle - Notion style, only interactive on hover */}
      {showResizeHandles && !isGoogleCalendarEvent && (
        <div
          ref={setTopRef}
          {...topAttrs}
          {...topListeners}
          className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`resize-handle-top-${event.id}`}
        >
          <div className="h-0.5 bg-muted-foreground/60 w-6 rounded-full" />
        </div>
      )}

      {showCompletionCheckbox && event.type === "task" && (
        <button
          data-testid={`checkbox-complete-${event.id}`}
          onClick={(e) => onToggleComplete?.(e, event)}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 w-3 h-3 rounded-sm border flex items-center justify-center transition-all"
          style={{
            borderColor: notionColors.darkText,
            backgroundColor: isCompleted ? notionColors.darkText : 'transparent',
            color: isCompleted ? notionColors.pastelBg : notionColors.darkText,
          }}
        >
          {isCompleted && <Check className="w-2 h-2" />}
        </button>
      )}
      <div className="flex-1 min-w-0 overflow-hidden flex items-start flex-col">
        <div className="flex items-center gap-1 w-full">
          <div 
            className={cn(
              "font-semibold truncate flex-1 text-[10.5px] leading-tight",
              isCompleted && "line-through opacity-60"
            )}
            style={{ color: notionColors.darkText }}
          >
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
          {event.isModified && (
            <Badge 
              variant="outline" 
              className="flex-shrink-0 text-[8px] px-1 py-0 h-3 bg-amber-500 border-none text-white font-bold"
              title="Task has been rescheduled"
              data-testid={`moved-badge-${event.id}`}
            >
              M
            </Badge>
          )}
        </div>
        {showTime && (
          <div 
            className="text-[9px] font-normal opacity-80 leading-tight"
            style={{ color: notionColors.darkText }}
          >
            {event.startTime}{event.endTime && ` - ${event.endTime}`}
          </div>
        )}
      </div>

      {/* Bottom resize handle - Notion style, only interactive on hover */}
      {showResizeHandles && !isGoogleCalendarEvent && (
        <div
          ref={setBottomRef}
          {...bottomAttrs}
          {...bottomListeners}
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
          data-testid={`resize-handle-bottom-${event.id}`}
        >
          <div className="h-0.5 bg-muted-foreground/60 w-6 rounded-full" />
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
  const { setNodeRef } = useDroppable({
    id: slotId,
    data: { date, hour, quarter },
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={className}
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
  // Track resize preview state for real-time visual feedback
  const [resizePreview, setResizePreview] = useState<{
    eventId: string;
    type: 'resize-start' | 'resize-end';
    previewStartTime: string;
    previewEndTime: string;
  } | null>(null);
  
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
  
  // Track pending moves/resizes for instant visual feedback
  const [pendingMoves, setPendingMoves] = useState<Map<string, { 
    newDate?: Date; 
    newStartTime?: string; 
    newEndTime?: string;
  }>>(new Map());
  
  // Clear pending moves when events prop changes (data was updated from server)
  const eventsRef = useRef(events);
  useEffect(() => {
    if (events !== eventsRef.current) {
      eventsRef.current = events;
      setPendingMoves(new Map());
    }
  }, [events]);
  
  // Apply pending moves to events for instant visual feedback
  const displayEvents = useMemo(() => {
    if (pendingMoves.size === 0) return events;
    
    return events.map(event => {
      const pending = pendingMoves.get(event.id);
      if (!pending) return event;
      
      return {
        ...event,
        ...(pending.newDate && { 
          startDate: pending.newDate,
          endDate: pending.newDate,
        }),
        ...(pending.newStartTime && { startTime: pending.newStartTime }),
        ...(pending.newEndTime && { endTime: pending.newEndTime }),
      };
    });
  }, [events, pendingMoves]);
  
  // Current time state for time indicator - updates every minute
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);
  
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
      // Show exactly 1 week (Mon-Sun) for better column visibility
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    } else if (view === "roster") {
      // Roster view uses infinite scrolling range
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

      // Check for infinite scroll expansion (roster view only - week view now shows fixed 1 week)
      if (view === 'roster') {
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
    
    return displayEvents.filter(event => {
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
  }, [displayEvents, showTasks, showSchedule, showMeetings, showGoogleCalendar]);

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
    const dragType = event.active.data.current?.type as string;
    setActiveEvent(draggedEvent);
    
    // Initialize resize preview if this is a resize operation
    if ((dragType === 'resize-start' || dragType === 'resize-end') && draggedEvent) {
      setResizePreview({
        eventId: draggedEvent.id,
        type: dragType,
        previewStartTime: draggedEvent.startTime || '09:00',
        previewEndTime: draggedEvent.endTime || '10:00',
      });
    }
  };

  // Handle drag move - update resize preview for real-time feedback
  const handleDragMove = (event: DragMoveEvent) => {
    const dragType = event.active.data.current?.type as string;
    const draggedEvent = event.active.data.current?.event as CalendarEvent;
    
    // Update resize preview in real-time
    if ((dragType === 'resize-start' || dragType === 'resize-end') && draggedEvent && event.over) {
      const targetHour = event.over.data.current?.hour as number | undefined;
      const targetQuarter = event.over.data.current?.quarter as number | undefined;
      
      if (targetHour !== undefined && targetQuarter !== undefined) {
        const newTime = `${targetHour.toString().padStart(2, '0')}:${targetQuarter.toString().padStart(2, '0')}`;
        const currentStart = draggedEvent.startTime || '09:00';
        const currentEnd = draggedEvent.endTime || '10:00';
        
        if (dragType === 'resize-start') {
          // Resizing from top - update start time preview
          const [newH, newM] = newTime.split(':').map(Number);
          const [endH, endM] = currentEnd.split(':').map(Number);
          if (newH * 60 + newM <= endH * 60 + endM - 15) {
            setResizePreview({
              eventId: draggedEvent.id,
              type: dragType,
              previewStartTime: newTime,
              previewEndTime: currentEnd,
            });
          }
        } else {
          // Resizing from bottom - update end time preview
          const [startH, startM] = currentStart.split(':').map(Number);
          const [newH, newM] = newTime.split(':').map(Number);
          if (newH * 60 + newM >= startH * 60 + startM + 15) {
            setResizePreview({
              eventId: draggedEvent.id,
              type: dragType,
              previewStartTime: currentStart,
              previewEndTime: newTime,
            });
          }
        }
      }
    }
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveEvent(null);
    setResizePreview(null);
    
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
            // Set pending move for instant visual feedback
            setPendingMoves(prev => new Map(prev).set(draggedEvent.id, {
              newStartTime: newTime,
              newEndTime: currentEnd,
            }));
            onEventResize(draggedEvent.id, newTime, currentEnd, draggedEvent.type);
          }
        } else {
          // Resizing from bottom - update end time
          const [startH, startM] = currentStart.split(':').map(Number);
          const [newH, newM] = newTime.split(':').map(Number);
          // Allow exactly 15 minutes minimum duration
          if (newH * 60 + newM >= startH * 60 + startM + 15) {
            // Set pending move for instant visual feedback
            setPendingMoves(prev => new Map(prev).set(draggedEvent.id, {
              newStartTime: currentStart,
              newEndTime: newTime,
            }));
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
          // Set pending move for instant visual feedback
          setPendingMoves(prev => new Map(prev).set(draggedEvent.id, {
            newDate: targetDate,
            newStartTime: newTime,
          }));
          onEventReschedule(draggedEvent.id, targetDate, draggedEvent.type, newTime);
        } else {
          // Set pending move for instant visual feedback (date change only)
          setPendingMoves(prev => new Map(prev).set(draggedEvent.id, {
            newDate: targetDate,
          }));
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
    // Day view: full width. Week view: expand to fill (handled by flex-1 on columns)
    // Roster view: use fixed 140px width for horizontal scroll
    const DAY_WIDTH = (view === "day" || view === "week") ? undefined : 140;
    
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Date header row - Notion style */}
        <div className="flex border-b border-border">
          <div className="py-2 px-2 border-r border-border/50 w-16 flex-shrink-0 bg-background"></div>
          <div 
            className={cn("flex overflow-x-auto hide-scrollbar", (view === "day" || view === "week") && "flex-1")} 
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
                    (view === "day" || view === "week") && "flex-1"
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
            className={cn("flex overflow-x-auto hide-scrollbar", (view === "day" || view === "week") && "flex-1")}
            ref={allDayScrollRef}
            onScroll={handleHorizontalScroll('allDay')}
          >
            {dateRange.map((date, dayIdx) => {
              const dayEvents = getEventsForDate(date);
              const allDayEvents = dayEvents.filter(event => !event.startTime && !event.endTime);
              const MAX_ALL_DAY_EVENTS = 5;
              const visibleEvents = allDayEvents.slice(0, MAX_ALL_DAY_EVENTS);
              const hiddenEvents = allDayEvents.slice(MAX_ALL_DAY_EVENTS);
              const hiddenCount = hiddenEvents.length;
              const dayOfWeek = getDay(date);
              const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // 0 = Sunday, 6 = Saturday
              
              return (
                <div 
                  key={dayIdx} 
                  className={cn(
                    "border-r border-border/50 p-1 min-h-[36px] max-h-[140px] overflow-hidden flex-shrink-0",
                    isToday(date) ? "bg-primary/10" : !isWeekday && "bg-muted/50",
                    (view === "day" || view === "week") && "flex-1"
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="text-[9px] text-muted-foreground px-1 py-0.5 cursor-pointer hover:text-foreground hover:bg-muted/50 rounded transition-colors">
                          +{hiddenCount} more
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2 max-h-60 overflow-y-auto" align="start">
                        <div className="text-xs font-semibold mb-2">All Events ({allDayEvents.length})</div>
                        <div className="space-y-1">
                          {allDayEvents.map((event, idx) => {
                            const popColors = generateNotionColors(event.projectColor || event.color);
                            return (
                              <div
                                key={`popover-${event.id}-${idx}`}
                                className="text-xs p-1.5 rounded cursor-pointer hover:opacity-80 transition-colors flex items-center gap-2 font-semibold"
                                style={{ 
                                  backgroundColor: popColors.pastelBg,
                                  color: popColors.darkText,
                                  borderLeft: `3px solid ${popColors.originalHex}`,
                                }}
                                onClick={() => onEventClick?.(event)}
                              >
                                <span className="truncate">{event.title}</span>
                              </div>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
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
            className={cn("flex overflow-auto hide-scrollbar h-full", (view === "day" || view === "week") && "flex-1")}
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
                    (view === "day" || view === "week") && "flex-1"
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
                            // Check if this event is being resized - use preview times if so
                            const isResizing = resizePreview?.eventId === event.id;
                            const displayStartTime = isResizing ? resizePreview.previewStartTime : (event.startTime || '09:00');
                            const displayEndTime = isResizing ? resizePreview.previewEndTime : (event.endTime || `${(event.startTime || '09:00').split(':').map(Number)[0] + 1}:00`);
                            
                            // Parse start time
                            const [startH, startM] = displayStartTime.split(':').map(Number);
                            const startMinutes = startH * 60 + startM;
                            
                            // Parse end time
                            const [endH, endM] = displayEndTime.split(':').map(Number);
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
                              isResizing,
                            };
                          });

                          // Google Calendar style: Stacked offset positioning with lane reuse
                          // Overlapping events stack with offset, later events appear on top
                          type EventPosition = {
                            event: CalendarEvent;
                            startMinutes: number;
                            endMinutes: number;
                            top: number;
                            height: number;
                            lane?: number;
                          };
                          
                          // Helper to check if two events overlap
                          const eventsOverlap = (a: EventPosition, b: EventPosition) => {
                            return !(a.endMinutes <= b.startMinutes || a.startMinutes >= b.endMinutes);
                          };
                          
                          // Sort events by start time, then by duration (longer first)
                          const sortedEvents = [...eventsWithPosition].sort((a, b) => {
                            if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
                            return (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes);
                          });
                          
                          // Assign lanes - find the smallest available lane for each event
                          // This allows lane reuse when previous events have ended
                          const lanes: EventPosition[][] = [];
                          sortedEvents.forEach((eventPos) => {
                            // Find first lane where this event doesn't overlap with any existing event
                            let assignedLane = -1;
                            for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
                              const hasOverlap = lanes[laneIdx].some(e => eventsOverlap(e, eventPos));
                              if (!hasOverlap) {
                                lanes[laneIdx].push(eventPos);
                                assignedLane = laneIdx;
                                break;
                              }
                            }
                            if (assignedLane === -1) {
                              assignedLane = lanes.length;
                              lanes.push([eventPos]);
                            }
                            eventPos.lane = assignedLane;
                          });
                          
                          // Stacking constants - Google Calendar style offset
                          const OFFSET_PER_LANE = 12; // 12% offset per lane
                          const RIGHT_MARGIN = 8; // Right margin percentage
                          const MAX_OFFSET = 36; // Max offset (capped at 3 lanes worth)
                          
                          // Render events with stacked positions
                          return sortedEvents.map((eventPos, idx) => {
                            const lane = eventPos.lane ?? 0;
                            // Calculate left offset (capped to keep events in bounds)
                            const leftPercent = Math.min(lane * OFFSET_PER_LANE, MAX_OFFSET);
                            // Width fills remaining space minus right margin
                            const widthPercent = 100 - leftPercent - RIGHT_MARGIN;
                            
                            return (
                              <div
                                key={`${eventPos.event.id}-${idx}`}
                                className="absolute pointer-events-auto"
                                style={{ 
                                  top: `${eventPos.top}px`,
                                  height: `${eventPos.height}px`,
                                  left: `${leftPercent}%`,
                                  width: `calc(${widthPercent}% - 4px)`,
                                  zIndex: lane + 1,
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
                        })()}
                        
                        {/* Current time indicator - red line for today */}
                        {isToday(date) && (
                          <div
                            className="absolute left-0 right-0 z-30 pointer-events-none"
                            style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px` }}
                            data-testid="current-time-indicator"
                          >
                            <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                            <div className="h-0.5 bg-red-500 w-full" />
                          </div>
                        )}
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
      onDragMove={handleDragMove}
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

    </DndContext>
  );
}

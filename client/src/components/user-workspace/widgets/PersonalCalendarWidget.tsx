import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, ChevronLeft, ChevronRight, List, CalendarDays, CheckSquare, Timer, Bell } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, isToday, isTomorrow, addDays, subDays, startOfWeek, endOfWeek, isSameDay, eachDayOfInterval, isBefore } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateNotionColors } from "@/lib/taskColors";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import type { Task } from "@shared/schema";
import { useTimezone, formatInTimezone, isTodayInTimezone, getCurrentTimeInTimezone as getTimeInTimezone } from "@/hooks/useTimezone";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";

type ViewMode = "list" | "day" | "week";

const HOUR_HEIGHT = 36;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const typeHexColors: Record<string, string> = {
  task: "#3b82f6",
  schedule: "#10b981",
  timesheet: "#f59e0b",
  reminder: "#a855f7",
};

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  type?: string;
  projectId?: string;
  projectColor?: string;
}

function TimelineEvent({ event, compact, onClick }: { event: CalendarEvent; compact?: boolean; onClick?: () => void }) {
  const startHour = event.startTime ? parseTimeString(event.startTime) : parseTimeFromDate(event.start);
  const endHour = event.endTime ? parseTimeString(event.endTime) : (startHour !== null ? startHour + 1 : null);
  
  if (startHour === null) return null;
  
  const duration = endHour !== null ? Math.max(endHour - startHour, 0.5) : 1;
  const top = startHour * HOUR_HEIGHT;
  const height = Math.max(duration * HOUR_HEIGHT, 18);
  
  const now = new Date();
  const eventDate = new Date(event.start);
  const isPast = isBefore(eventDate, now) && !isToday(eventDate);
  
  const baseColor = event.projectColor || typeHexColors[event.type || 'task'] || "#3b82f6";
  const notionColors = generateNotionColors(baseColor);
  
  return (
    <div
      className={`absolute left-10 right-1 rounded-md text-[10px] px-1.5 py-0.5 overflow-hidden cursor-pointer hover-elevate ${
        isPast ? 'opacity-50' : ''
      }`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: notionColors.pastelBg,
        border: `1px solid rgba(0,0,0,0.08)`,
        borderLeftWidth: '3px',
        borderLeftColor: notionColors.originalHex,
      }}
      title={event.title}
      onClick={onClick}
    >
      <p 
        className="font-semibold truncate leading-tight"
        style={{ color: notionColors.darkText }}
      >
        {event.title}
      </p>
    </div>
  );
}

function parseTimeString(timeStr: string): number | null {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + (minutes || 0) / 60;
}

function parseTimeFromDate(dateStr: string): number | null {
  try {
    const date = new Date(dateStr);
    return date.getHours() + date.getMinutes() / 60;
  } catch {
    return 9; // Default to 9am
  }
}

export default function PersonalCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const weekStartDay = useWeekStartDay();
  const maxEvents = widget.config?.maxEvents || 8;
  const daysAhead = widget.config?.daysAhead || 7;
  const defaultViewMode = (widget.config?.viewMode as ViewMode) || "day";
  const { effectiveTimezone } = useTimezone();
  
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxEvents, setConfigMaxEvents] = useState(maxEvents);
  const [configDaysAhead, setConfigDaysAhead] = useState(daysAhead);
  const [configViewMode, setConfigViewMode] = useState(defaultViewMode);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxEvents(widget.config?.maxEvents || 8);
    setConfigDaysAhead(widget.config?.daysAhead || 7);
    setConfigViewMode((widget.config?.viewMode as ViewMode) || "day");
    setViewMode((widget.config?.viewMode as ViewMode) || "day");
  }, [widget.title, widget.config]);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const projectColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((project: any) => {
      if (project.color) {
        map[String(project.id)] = project.color;
      }
    });
    return map;
  }, [projects]);

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const endDate = addDays(startDate, daysAhead);

  const allEvents: CalendarEvent[] = tasks
    .filter(task => {
      if (!task.dueDate) return false;
      if (task.status === 'done' || task.status === 'complete') return false;
      const dueDate = new Date(task.dueDate);
      return dueDate >= startDate && dueDate <= endDate;
    })
    .map(task => ({
      id: task.id,
      title: task.title,
      start: task.dueDate,
      startTime: task.startTime,
      endTime: task.endTime,
      type: 'task',
      projectId: task.projectId,
      projectColor: task.projectId ? projectColorMap[String(task.projectId)] : undefined,
    }));

  // Scroll to 6 AM or earliest event on mount
  useEffect(() => {
    if (scrollRef.current && (viewMode === "day" || viewMode === "week")) {
      const DEFAULT_START_HOUR = 6; // Default to 6 AM
      
      // Find earliest event time
      let earliestHour = DEFAULT_START_HOUR;
      allEvents.forEach(event => {
        if (event.startTime) {
          const startHour = parseTimeString(event.startTime);
          if (startHour !== null && startHour < earliestHour) {
            earliestHour = startHour;
          }
        }
      });
      
      const scrollPosition = Math.max(0, earliestHour * HOUR_HEIGHT);
      scrollRef.current.scrollTop = scrollPosition;
    }
  }, [viewMode, allEvents]);

  const isLoading = tasksLoading || projectsLoading;

  const sortedEvents = [...allEvents].sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const getDayLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return formatInTimezone(date, effectiveTimezone, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getTimeLabel = (event: CalendarEvent) => {
    if (event.allDay) return 'All day';
    if (event.startTime) return event.startTime;
    return formatInTimezone(new Date(event.start), effectiveTimezone, { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const goToToday = () => setSelectedDate(new Date());
  const goToPrev = () => setSelectedDate(prev => viewMode === "week" ? subDays(prev, 7) : subDays(prev, 1));
  const goToNext = () => setSelectedDate(prev => viewMode === "week" ? addDays(prev, 7) : addDays(prev, 1));

  // Get events for selected date(s)
  const getEventsForDate = (date: Date) => {
    return allEvents.filter(event => isSameDay(new Date(event.start), date));
  };

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: weekStartDay });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: weekStartDay });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { 
            ...widget.config, 
            maxEvents: configMaxEvents, 
            daysAhead: configDaysAhead,
            viewMode: configViewMode 
          }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxEvents(widget.config?.maxEvents || 8);
      setConfigDaysAhead(widget.config?.daysAhead || 7);
      setConfigViewMode((widget.config?.viewMode as ViewMode) || "day");
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Calendar</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Default View</Label>
          <Select value={configViewMode} onValueChange={(v: ViewMode) => setConfigViewMode(v)}>
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="list">List</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Days Ahead (for list)</Label>
          <Input 
            type="number"
            min={1}
            max={30}
            value={configDaysAhead}
            onChange={(e) => setConfigDaysAhead(parseInt(e.target.value) || 7)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  // Render header with view mode toggle
  const renderHeader = () => (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1">
        {(viewMode === "day" || viewMode === "week") && (
          <>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={goToPrev}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px]" onClick={goToToday}>
              Today
            </Button>
            <Button size="icon" variant="ghost" className="h-5 w-5" onClick={goToNext}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </>
        )}
        <span className="text-xs font-medium ml-1">
          {viewMode === "week" 
            ? `${formatInTimezone(weekStart, effectiveTimezone, { month: 'short', day: 'numeric' })} - ${formatInTimezone(weekEnd, effectiveTimezone, { month: 'short', day: 'numeric' })}`
            : viewMode === "day"
              ? formatInTimezone(selectedDate, effectiveTimezone, { weekday: 'short', month: 'short', day: 'numeric' })
              : `${allEvents.length} upcoming`
          }
        </span>
      </div>
      <div className="flex items-center gap-0.5 border rounded-md p-0.5">
        <button 
          className={`p-1 rounded-sm ${viewMode === 'list' ? 'bg-muted' : ''}`}
          onClick={() => setViewMode('list')}
          title="List view"
        >
          <List className="h-3 w-3" />
        </button>
        <button 
          className={`p-1 rounded-sm ${viewMode === 'day' ? 'bg-muted' : ''}`}
          onClick={() => setViewMode('day')}
          title="Day view"
        >
          <Calendar className="h-3 w-3" />
        </button>
        <button 
          className={`p-1 rounded-sm ${viewMode === 'week' ? 'bg-muted' : ''}`}
          onClick={() => setViewMode('week')}
          title="Week view"
        >
          <CalendarDays className="h-3 w-3" />
        </button>
      </div>
    </div>
  );

  // Render List View
  const renderListView = () => {
    const displayEvents = sortedEvents.slice(0, maxEvents);
    
    if (displayEvents.length === 0) {
      return (
        <div className="text-center py-3 text-xs text-muted-foreground">
          No upcoming events
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {displayEvents.map((event) => {
          const eventDate = new Date(event.start);
          const isTodayEvent = isToday(eventDate);
          const baseColor = event.projectColor || typeHexColors[event.type || 'task'] || "#3b82f6";
          const notionColors = generateNotionColors(baseColor);
          return (
            <div 
              key={event.id}
              className="p-2 rounded-md hover-elevate cursor-pointer"
              style={{
                backgroundColor: notionColors.pastelBg,
                border: `1px solid rgba(0,0,0,0.08)`,
                borderLeftWidth: '3px',
                borderLeftColor: notionColors.originalHex,
              }}
              data-testid={`calendar-event-${event.id}`}
              onClick={() => event.type === 'task' && setSelectedTaskId(event.id)}
            >
              <div className="flex items-start gap-2">
                <CheckSquare 
                  className="h-3 w-3 mt-0.5 flex-shrink-0"
                  style={{ color: notionColors.originalHex }} 
                />
                <div className="flex-1 min-w-0">
                  <p 
                    className="text-xs font-semibold truncate leading-tight"
                    style={{ color: notionColors.darkText }}
                  >
                    {event.title}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge 
                      variant="outline" 
                      className="text-[10px] px-1 py-0 h-4"
                      style={{ 
                        backgroundColor: 'rgba(255,255,255,0.5)',
                        color: notionColors.darkText,
                        borderColor: 'rgba(0,0,0,0.1)'
                      }}
                    >
                      {getDayLabel(event.start)}
                    </Badge>
                    <span 
                      className="text-[10px] flex items-center gap-0.5"
                      style={{ color: notionColors.darkText, opacity: 0.7 }}
                    >
                      <Clock className="h-2 w-2" />
                      {getTimeLabel(event)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render Day View
  const renderDayView = () => {
    const dayEvents = getEventsForDate(selectedDate);
    const currentMinutes = getTimeInTimezone(effectiveTimezone).totalMinutes;
    const showCurrentTime = isTodayInTimezone(selectedDate, effectiveTimezone);

    return (
      <div 
        ref={scrollRef}
        className="relative overflow-auto flex-1"
      >
        <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Hour lines */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-border/30"
              style={{ top: `${hour * HOUR_HEIGHT}px` }}
            >
              <span className="absolute left-0 -top-2 text-[9px] text-muted-foreground w-9 text-right pr-1">
                {formatInTimezone(new Date(new Date().setHours(hour, 0)), effectiveTimezone, { hour: 'numeric', hour12: true })}
              </span>
            </div>
          ))}
          
          {/* Current time indicator */}
          {showCurrentTime && (
            <div
              className="absolute left-9 right-0 border-t-2 border-red-500 z-10"
              style={{ top: `${(currentMinutes / 60) * HOUR_HEIGHT}px` }}
            >
              <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
            </div>
          )}
          
          {/* Events */}
          {dayEvents.map((event) => (
            <TimelineEvent 
              key={event.id} 
              event={event} 
              onClick={() => event.type === 'task' && setSelectedTaskId(event.id)}
            />
          ))}
          
          {dayEvents.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">No events</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Week View with timeline and overlap handling (like EnhancedCalendar)
  const renderWeekView = () => {
    const currentMinutes = getTimeInTimezone(effectiveTimezone).totalMinutes;
    
    // Helper to check if two events overlap in time
    type EventPosition = {
      event: CalendarEvent;
      startMinutes: number;
      endMinutes: number;
      top: number;
      height: number;
      lane?: number;
    };
    
    const eventsOverlap = (a: EventPosition, b: EventPosition) => {
      return !(a.endMinutes <= b.startMinutes || a.startMinutes >= b.endMinutes);
    };
    
    // Process events for a day with overlap handling
    const processEventsForDay = (dayEvents: CalendarEvent[]): EventPosition[] => {
      // Calculate positions for each event
      const eventsWithPosition: EventPosition[] = dayEvents.map((event) => {
        const startHour = event.startTime ? parseTimeString(event.startTime) : parseTimeFromDate(event.start);
        const endHour = event.endTime ? parseTimeString(event.endTime) : (startHour !== null ? startHour + 1 : 9);
        
        const startMinutes = (startHour ?? 9) * 60;
        const endMinutes = (endHour ?? 10) * 60;
        
        const top = (startMinutes / 60) * HOUR_HEIGHT;
        const durationMinutes = endMinutes - startMinutes;
        const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT - 2, 14);
        
        return { event, startMinutes, endMinutes, top, height };
      });
      
      // Sort by start time, then by duration (longer first)
      const sortedEvents = [...eventsWithPosition].sort((a, b) => {
        if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
        return (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes);
      });
      
      // Assign lanes - find smallest available lane for each event
      const lanes: EventPosition[][] = [];
      sortedEvents.forEach((eventPos) => {
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
      
      return sortedEvents;
    };
    
    // Stacking constants - Google Calendar style offset (matches EnhancedCalendar)
    const OFFSET_PER_LANE = 12; // 12% offset per lane
    const RIGHT_MARGIN = 8; // Right margin percentage
    const MAX_OFFSET = 36; // Max offset (capped at 3 lanes worth)
    
    return (
      <div 
        ref={scrollRef}
        className="overflow-auto flex-1"
      >
        {/* Day headers - sticky */}
        <div className="grid grid-cols-7 gap-px border-b border-border sticky top-0 bg-background z-20">
          {weekDays.map((day) => (
            <div 
              key={day.toISOString()} 
              className={`text-center py-1 ${isToday(day) ? 'bg-[#bba7db]/10' : ''}`}
            >
              <div className="text-[9px] text-muted-foreground">{formatInTimezone(day, effectiveTimezone, { weekday: 'short' })}</div>
              <div className={`text-xs font-medium ${isToday(day) ? 'text-[#bba7db]' : ''}`}>
                {formatInTimezone(day, effectiveTimezone, { day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
        
        {/* Timeline grid with day columns */}
        <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Hour lines across all columns */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-border/20"
              style={{ top: `${hour * HOUR_HEIGHT}px` }}
            />
          ))}
          
          {/* Day columns */}
          <div className="grid grid-cols-7 h-full absolute inset-0">
            {weekDays.map((day) => {
              const dayEvents = getEventsForDate(day);
              const processedEvents = processEventsForDay(dayEvents);
              
              return (
                <div 
                  key={day.toISOString()} 
                  className={`relative border-r border-border/30 ${isToday(day) ? 'bg-[#bba7db]/5' : ''}`}
                >
                  {/* Events with overlap handling */}
                  {processedEvents.map((eventPos, idx) => {
                    const lane = eventPos.lane ?? 0;
                    const leftPercent = Math.min(lane * OFFSET_PER_LANE, MAX_OFFSET);
                    const widthPercent = 100 - leftPercent - RIGHT_MARGIN;
                    
                    const baseColor = eventPos.event.projectColor || typeHexColors[eventPos.event.type || 'task'] || "#3b82f6";
                    const notionColors = generateNotionColors(baseColor);
                    
                    return (
                      <div
                        key={`${eventPos.event.id}-${idx}`}
                        className="absolute rounded-sm text-[8px] px-0.5 overflow-hidden cursor-pointer hover-elevate"
                        style={{
                          top: `${eventPos.top}px`,
                          height: `${eventPos.height}px`,
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          zIndex: lane + 1,
                          backgroundColor: notionColors.pastelBg,
                          borderLeft: `2px solid ${notionColors.originalHex}`,
                        }}
                        title={eventPos.event.title}
                        onClick={() => eventPos.event.type === 'task' && setSelectedTaskId(eventPos.event.id)}
                      >
                        <p 
                          className="font-semibold truncate leading-tight"
                          style={{ color: notionColors.darkText }}
                        >
                          {eventPos.event.title}
                        </p>
                      </div>
                    );
                  })}
                  
                  {/* Current time indicator for today */}
                  {isTodayInTimezone(day, effectiveTimezone) && (
                    <div
                      className="absolute left-0 right-0 z-30 pointer-events-none"
                      style={{ top: `${(currentMinutes / 60) * HOUR_HEIGHT}px` }}
                    >
                      <div className="absolute -left-0.5 -top-1 w-2 h-2 rounded-full bg-red-500" />
                      <div className="h-0.5 bg-red-500 w-full" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const selectedTask = tasks.find(t => String(t.id) === String(selectedTaskId));

  return (
    <>
      <div className="h-full flex flex-col">
        {renderHeader()}
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-xs text-muted-foreground">Loading...</div>
          </div>
        ) : (
          <>
            {viewMode === "list" && renderListView()}
            {viewMode === "day" && renderDayView()}
            {viewMode === "week" && renderWeekView()}
          </>
        )}
      </div>
      
      <TaskDetailModal
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        onEdit={(task) => setEditingTask(task)}
      />
      
      <TaskEditModal
        task={editingTask || undefined}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
      />
    </>
  );
}

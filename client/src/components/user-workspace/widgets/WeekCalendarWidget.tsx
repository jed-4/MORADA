import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ChevronLeft, ChevronRight, CheckSquare, CalendarDays, Timer, Bell, Palette, LayoutList, Clock } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { usePersonalCalendarEvents, CalendarItem } from "./usePersonalCalendarEvents";
import { 
  format, 
  addWeeks, 
  subWeeks, 
  startOfWeek, 
  addDays, 
  isToday, 
  isSameDay,
  isBefore,
  startOfDay
} from "date-fns";
import { generateNotionColors } from "@/lib/taskColors";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import type { Task } from "@shared/schema";
import { useTimezone, formatInTimezone, isTodayInTimezone, getCurrentTimeInTimezone as getTimeInTimezone } from "@/hooks/useTimezone";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

type ColorMode = "type" | "project" | "priority";
type ViewMode = "timeline" | "stacked";
type TaskFilter = "all" | "my-tasks" | "tasks-only";

const HOUR_HEIGHT = 40;
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6am to 11pm

const typeColors: Record<string, string> = {
  task: "#3b82f6",
  schedule: "#10b981",
  timesheet: "#f59e0b",
  "google-calendar": "#ef4444",
  reminder: "#a855f7",
};

const priorityColors: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#3b82f6",
  none: "#6b7280",
};

const typeIcons: Record<string, React.ReactNode> = {
  task: <CheckSquare className="h-2 w-2" />,
  schedule: <CalendarDays className="h-2 w-2" />,
  timesheet: <Timer className="h-2 w-2" />,
  "google-calendar": <Calendar className="h-2 w-2" />,
  reminder: <Bell className="h-2 w-2" />,
};

function getEventColor(event: CalendarItem, colorMode: ColorMode): string {
  switch (colorMode) {
    case "type":
      return typeColors[event.type] || "#6b7280";
    case "project":
      return event.projectColor || "#6b7280";
    case "priority":
      if (event.type === "task" && event.priority) {
        return priorityColors[event.priority] || priorityColors.none;
      }
      return typeColors[event.type] || "#6b7280";
    default:
      return event.projectColor || typeColors[event.type] || "#6b7280";
  }
}

function parseTime(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours + (minutes || 0) / 60;
}

function TimelineEvent({ 
  event, 
  colorMode, 
  onClick,
  columnWidth 
}: { 
  event: CalendarItem; 
  colorMode: ColorMode; 
  onClick?: () => void;
  columnWidth?: number;
}) {
  const startHour = parseTime(event.startTime);
  const endHour = parseTime(event.endTime);
  
  if (startHour === null) return null;
  
  const duration = endHour !== null ? endHour - startHour : 1;
  const top = (startHour - 6) * HOUR_HEIGHT; // Offset by start hour (6am)
  const height = Math.max(duration * HOUR_HEIGHT, 18);
  
  const now = new Date();
  let isPast = false;
  
  if (endHour !== null && event.endTime) {
    const eventEndTime = new Date(event.startDate);
    const [hours, minutes] = event.endTime.split(':').map(Number);
    eventEndTime.setHours(hours || 0, minutes || 0, 0, 0);
    isPast = isBefore(eventEndTime, now);
  } else if (event.startTime) {
    const eventStartTime = new Date(event.startDate);
    const [hours, minutes] = event.startTime.split(':').map(Number);
    eventStartTime.setHours(hours || 0, minutes || 0, 0, 0);
    isPast = isBefore(eventStartTime, now);
  }
  
  const baseColor = getEventColor(event, colorMode);
  const notionColors = generateNotionColors(baseColor);
  
  return (
    <div
      className={`absolute left-0 right-1 rounded-sm px-1 py-0.5 overflow-hidden cursor-pointer hover-elevate text-[9px] ${
        isPast ? 'opacity-50' : ''
      }`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        backgroundColor: notionColors.pastelBg,
        border: `1px solid rgba(0,0,0,0.08)`,
        borderLeftWidth: '2px',
        borderLeftColor: notionColors.originalHex,
      }}
      title={`${event.title}${event.startTime ? ` at ${event.startTime}` : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-0.5">
        <div 
          className="flex-shrink-0 w-3 h-3 rounded-sm flex items-center justify-center"
          style={{ backgroundColor: notionColors.originalHex, color: notionColors.pastelBg }}
        >
          {typeIcons[event.type]}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p 
            className="font-semibold truncate leading-tight"
            style={{ color: notionColors.darkText }}
          >
            {event.title}
          </p>
          {height >= 30 && (
            <p 
              className="truncate opacity-70"
              style={{ color: notionColors.darkText }}
            >
              {event.startTime}{event.endTime && ` - ${event.endTime}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AllDayEventChip({ event, colorMode, onClick }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void }) {
  const baseColor = getEventColor(event, colorMode);
  const notionColors = generateNotionColors(baseColor);
  
  return (
    <div
      className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] cursor-pointer hover-elevate mb-0.5"
      style={{
        backgroundColor: notionColors.pastelBg,
        border: `1px solid rgba(0,0,0,0.08)`,
        borderLeftWidth: '2px',
        borderLeftColor: notionColors.originalHex,
      }}
      title={event.title}
      onClick={onClick}
    >
      <div 
        className="flex-shrink-0 w-2.5 h-2.5 rounded-sm flex items-center justify-center"
        style={{ backgroundColor: notionColors.originalHex, color: notionColors.pastelBg }}
      >
        {typeIcons[event.type]}
      </div>
      <span 
        className="truncate font-semibold"
        style={{ color: notionColors.darkText }}
      >
        {event.title}
      </span>
    </div>
  );
}

function StackedEventChip({ event, colorMode, onClick }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void }) {
  const baseColor = getEventColor(event, colorMode);
  const notionColors = generateNotionColors(baseColor);
  
  const now = new Date();
  let isPast = false;
  
  if (event.endTime) {
    const eventEndTime = new Date(event.startDate);
    const [hours, minutes] = event.endTime.split(':').map(Number);
    eventEndTime.setHours(hours || 0, minutes || 0, 0, 0);
    isPast = isBefore(eventEndTime, now);
  } else if (event.startTime) {
    const eventStartTime = new Date(event.startDate);
    const [hours, minutes] = event.startTime.split(':').map(Number);
    eventStartTime.setHours(hours || 0, minutes || 0, 0, 0);
    isPast = isBefore(eventStartTime, now);
  }
  
  return (
    <div
      className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] cursor-pointer hover-elevate ${isPast ? 'opacity-50' : ''}`}
      style={{
        backgroundColor: notionColors.pastelBg,
        border: `1px solid rgba(0,0,0,0.08)`,
        borderLeftWidth: '2px',
        borderLeftColor: notionColors.originalHex,
      }}
      title={`${event.title}${event.startTime ? ` at ${event.startTime}` : ''}`}
      onClick={onClick}
    >
      <div 
        className="flex-shrink-0 w-2.5 h-2.5 rounded-sm flex items-center justify-center"
        style={{ backgroundColor: notionColors.originalHex, color: notionColors.pastelBg }}
      >
        {typeIcons[event.type]}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-0.5">
        <span 
          className="truncate font-semibold"
          style={{ color: notionColors.darkText }}
        >
          {event.title}
        </span>
        {event.startTime && (
          <span 
            className="flex-shrink-0 text-[8px] opacity-70"
            style={{ color: notionColors.darkText }}
          >
            {event.startTime}
          </span>
        )}
      </div>
    </div>
  );
}

export default function WeekCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const weekStartDay = useWeekStartDay();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { effectiveTimezone } = useTimezone();

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTask(null);
    },
  });
  
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => getTimeInTimezone(effectiveTimezone).totalMinutes);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMinutes(getTimeInTimezone(effectiveTimezone).totalMinutes);
    }, 60000);
    return () => clearInterval(interval);
  }, [effectiveTimezone]);
  
  const config = widget.config || {};
  const [configState, setConfigState] = useState({
    includeTasks: config.includeTasks ?? true,
    includeSchedule: config.includeSchedule ?? true,
    includeTimesheets: config.includeTimesheets ?? true,
    includeGoogleCalendar: config.includeGoogleCalendar ?? true,
    includeReminders: config.includeReminders ?? true,
    colorMode: (config.colorMode as ColorMode) ?? "project",
    viewMode: (config.viewMode as ViewMode) ?? "timeline",
    taskFilter: (config.taskFilter as TaskFilter) ?? "all",
  });

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigState({
      includeTasks: widget.config?.includeTasks ?? true,
      includeSchedule: widget.config?.includeSchedule ?? true,
      includeTimesheets: widget.config?.includeTimesheets ?? true,
      includeGoogleCalendar: widget.config?.includeGoogleCalendar ?? true,
      includeReminders: widget.config?.includeReminders ?? true,
      colorMode: (widget.config?.colorMode as ColorMode) ?? "project",
      viewMode: (widget.config?.viewMode as ViewMode) ?? "timeline",
      taskFilter: (widget.config?.taskFilter as TaskFilter) ?? "all",
    });
  }, [widget.title, widget.config]);
  
  const colorMode = (widget.config?.colorMode as ColorMode) ?? "project";
  const viewMode = (widget.config?.viewMode as ViewMode) ?? "timeline";
  const taskFilter = (widget.config?.taskFilter as TaskFilter) ?? "all";

  const { events: rawEvents, allDayEvents: rawAllDayEvents, timedEvents: rawTimedEvents, isLoading } = usePersonalCalendarEvents({
    userId,
    date: weekStart,
    range: "week",
    weekStartDay,
    ...configState,
  });

  // Apply task filter
  const filterEvents = (eventList: CalendarItem[]) => {
    if (taskFilter === "tasks-only") {
      return eventList.filter(e => e.type === "task");
    }
    return eventList;
  };

  const events = useMemo(() => filterEvents(rawEvents), [rawEvents, taskFilter]);
  const allDayEvents = useMemo(() => filterEvents(rawAllDayEvents), [rawAllDayEvents, taskFilter]);
  const timedEvents = useMemo(() => filterEvents(rawTimedEvents), [rawTimedEvents, taskFilter]);

  const weekDays = useMemo(() => 
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Get events for a specific day
  const getEventsForDay = (date: Date, eventList: CalendarItem[]) => 
    eventList.filter(e => isSameDay(e.startDate, date));

  // Auto-scroll to current time on mount (only for timeline view)
  useEffect(() => {
    if (scrollRef.current && !isLoading && viewMode === "timeline") {
      // Get current time in user's timezone
      const { hours: currentHour, minutes: currentMinute } = getTimeInTimezone(effectiveTimezone);
      
      // Check if current week contains today
      const todayInWeek = weekDays.some(d => isTodayInTimezone(d, effectiveTimezone));
      
      if (todayInWeek && currentHour >= 6) {
        const containerHeight = scrollRef.current.clientHeight;
        const currentTimePosition = (currentHour - 6 + currentMinute / 60) * HOUR_HEIGHT;
        const targetScroll = Math.max(0, currentTimePosition - containerHeight / 3);
        scrollRef.current.scrollTop = targetScroll;
      } else {
        // Scroll to 8am by default
        scrollRef.current.scrollTop = (8 - 6) * HOUR_HEIGHT;
      }
    }
  }, [isLoading, weekDays, viewMode, effectiveTimezone]);

  if (isConfiguring) {
    const handleSaveConfig = () => {
      onUpdate?.({
        ...widget,
        title: editingTitle,
        config: { ...widget.config, ...configState }
      });
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Week Calendar</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Show Items</Label>
          <div className="space-y-1.5">
            {[
              { key: 'includeTasks', label: 'Tasks', icon: CheckSquare },
              { key: 'includeSchedule', label: 'Schedule Items', icon: CalendarDays },
              { key: 'includeTimesheets', label: 'Timesheets', icon: Timer },
              { key: 'includeGoogleCalendar', label: 'Google Calendar', icon: Calendar },
              { key: 'includeReminders', label: 'Reminders', icon: Bell },
            ].map(({ key, label, icon: Icon }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={configState[key as keyof typeof configState] as boolean}
                  onCheckedChange={(checked) => 
                    setConfigState(prev => ({ ...prev, [key]: !!checked }))
                  }
                />
                <Icon className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs">{label}</span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <LayoutList className="h-3 w-3" />
            View Mode
          </Label>
          <Select
            value={configState.viewMode}
            onValueChange={(value: ViewMode) => 
              setConfigState(prev => ({ ...prev, viewMode: value }))
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="timeline">Timeline (by hour)</SelectItem>
              <SelectItem value="stacked">Stacked (list)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {configState.viewMode === "timeline" && "Events positioned by time on hourly grid"}
            {configState.viewMode === "stacked" && "Events stacked as a list under each day"}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <CheckSquare className="h-3 w-3" />
            Task Filter
          </Label>
          <Select
            value={configState.taskFilter}
            onValueChange={(value: TaskFilter) => 
              setConfigState(prev => ({ ...prev, taskFilter: value }))
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Items</SelectItem>
              <SelectItem value="tasks-only">Tasks Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1.5">
            <Palette className="h-3 w-3" />
            Color By
          </Label>
          <Select
            value={configState.colorMode}
            onValueChange={(value: ColorMode) => 
              setConfigState(prev => ({ ...prev, colorMode: value }))
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project Color</SelectItem>
              <SelectItem value="type">Item Type</SelectItem>
              <SelectItem value="priority">Priority (Tasks)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {configState.colorMode === "project" && "Events colored by their project"}
            {configState.colorMode === "type" && "Events colored by type (task, schedule, etc.)"}
            {configState.colorMode === "priority" && "Tasks colored by priority; other items by type"}
          </p>
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onCloseConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  const goToThisWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  const goToPrev = () => setWeekStart(w => subWeeks(w, 1));
  const goToNext = () => setWeekStart(w => addWeeks(w, 1));

  const weekEnd = addDays(weekStart, 6);
  const weekLabel = formatInTimezone(weekStart, effectiveTimezone, { month: 'short', day: 'numeric' }) + " - " + formatInTimezone(weekEnd, effectiveTimezone, { month: 'short', day: 'numeric', year: 'numeric' });
  
  // Check if any day has all-day events
  const hasAllDayEvents = allDayEvents.length > 0;

  // Current time position for the indicator (relative to 6am start)
  const currentTimeTop = ((currentTimeMinutes / 60) - 6) * HOUR_HEIGHT;

  return (
    <div className="flex flex-col h-full -m-3 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToPrev} data-testid="week-prev-btn">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={goToThisWeek} data-testid="week-today-btn">
            This Week
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToNext} data-testid="week-next-btn">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-xs font-medium flex items-center gap-1.5">
          {weekLabel}
          {events.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">{events.length}</Badge>
          )}
        </div>
      </div>

      {/* Day headers - sticky */}
      <div className={`flex-shrink-0 grid border-b bg-background sticky top-0 z-10 ${viewMode === "timeline" ? "grid-cols-[40px_repeat(7,1fr)]" : "grid-cols-7"}`}>
        {viewMode === "timeline" && <div className="border-r border-border/30" />}
        {weekDays.map((day) => {
          const isCurrentDay = isTodayInTimezone(day, effectiveTimezone);
          const isPast = isBefore(day, startOfDay(new Date()));
          return (
            <div 
              key={day.toISOString()} 
              className={`text-center py-1.5 border-r last:border-r-0 ${isCurrentDay ? 'bg-[#bba7db]/10' : ''} ${isPast && !isCurrentDay ? 'opacity-50' : ''}`}
            >
              <div className="text-[10px] text-muted-foreground uppercase">
                {formatInTimezone(day, effectiveTimezone, { weekday: 'short' })}
              </div>
              <div className={`text-sm font-medium ${isCurrentDay ? 'text-[#bba7db]' : ''}`}>
                {formatInTimezone(day, effectiveTimezone, { day: 'numeric' })}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events bar */}
      {hasAllDayEvents && (
        <div className={`flex-shrink-0 grid border-b bg-muted/10 max-h-20 overflow-y-auto ${viewMode === "timeline" ? "grid-cols-[40px_repeat(7,1fr)]" : "grid-cols-7"}`}>
          {viewMode === "timeline" && (
            <div className="border-r border-border/30 flex items-start justify-center py-1">
              <span className="text-[9px] text-muted-foreground uppercase">All Day</span>
            </div>
          )}
          {weekDays.map((day) => {
            const dayAllDayEvents = getEventsForDay(day, allDayEvents);
            return (
              <div 
                key={day.toISOString()} 
                className="border-r last:border-r-0 p-0.5 min-h-[28px]"
              >
                {dayAllDayEvents.slice(0, 3).map(event => (
                  <AllDayEventChip
                    key={event.id}
                    event={event}
                    colorMode={colorMode}
                    onClick={() => event.type === 'task' && setSelectedTaskId(event.id)}
                  />
                ))}
                {dayAllDayEvents.length > 3 && (
                  <div className="text-[8px] text-muted-foreground text-center">
                    +{dayAllDayEvents.length - 3} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Content area - Timeline or Stacked view */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {isLoading ? (
          <div className="p-4 grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="animate-pulse h-24 bg-muted rounded-md" />
            ))}
          </div>
        ) : viewMode === "stacked" ? (
          /* Stacked view - events listed under each day */
          <div className="grid grid-cols-7 h-full">
            {weekDays.map((day) => {
              const isCurrentDay = isTodayInTimezone(day, effectiveTimezone);
              const isPast = isBefore(day, startOfDay(new Date()));
              const dayTimedEvents = getEventsForDay(day, timedEvents);
              
              return (
                <div 
                  key={day.toISOString()} 
                  className={`border-r last:border-r-0 p-1 ${isCurrentDay ? 'bg-[#bba7db]/5' : ''} ${isPast && !isCurrentDay ? 'opacity-50' : ''}`}
                >
                  <div className="space-y-0.5">
                    {dayTimedEvents.map(event => (
                      <StackedEventChip
                        key={event.id}
                        event={event}
                        colorMode={colorMode}
                        onClick={() => event.type === 'task' && setSelectedTaskId(event.id)}
                      />
                    ))}
                    {dayTimedEvents.length === 0 && (
                      <div className="text-[9px] text-muted-foreground/50 text-center py-2">
                        No events
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Timeline view - events positioned by time */
          <div className="grid grid-cols-[40px_repeat(7,1fr)] relative" style={{ minHeight: `${HOURS.length * HOUR_HEIGHT}px` }}>
            {/* Time labels column */}
            <div className="relative border-r border-border/30">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0"
                  style={{ top: `${(hour - 6) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="absolute left-1 top-1 text-[9px] text-muted-foreground">
                    {formatInTimezone(new Date(new Date().setHours(hour, 0)), effectiveTimezone, { hour: 'numeric', hour12: true })}
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day) => {
              const isCurrentDay = isTodayInTimezone(day, effectiveTimezone);
              const isPast = isBefore(day, startOfDay(new Date()));
              const dayTimedEvents = getEventsForDay(day, timedEvents);
              
              return (
                <div 
                  key={day.toISOString()} 
                  className={`relative border-r last:border-r-0 ${isCurrentDay ? 'bg-[#bba7db]/5' : ''} ${isPast && !isCurrentDay ? 'opacity-50' : ''}`}
                  style={{ minHeight: `${HOURS.length * HOUR_HEIGHT}px` }}
                >
                  {/* Hour gridlines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-border/30"
                      style={{ top: `${(hour - 6) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                    />
                  ))}
                  
                  {/* Current time indicator */}
                  {isCurrentDay && currentTimeMinutes >= 360 && currentTimeMinutes < 1380 && (
                    <div
                      className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                      style={{ top: `${currentTimeTop}px` }}
                    >
                      <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
                    </div>
                  )}
                  
                  {/* Timed events */}
                  <div className="absolute inset-0 px-0.5">
                    {dayTimedEvents.map(event => (
                      <TimelineEvent
                        key={event.id}
                        event={event}
                        colorMode={colorMode}
                        onClick={() => event.type === 'task' && setSelectedTaskId(event.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
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
        onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
      />
    </div>
  );
}

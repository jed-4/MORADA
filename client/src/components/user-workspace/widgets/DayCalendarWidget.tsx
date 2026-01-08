import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, ChevronLeft, ChevronRight, Clock, CheckSquare, CalendarDays, Timer, Bell, Palette } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WidgetProps } from "@/types/widgets";
import { usePersonalCalendarEvents, CalendarItem } from "./usePersonalCalendarEvents";
import { format, addDays, subDays, isToday, isBefore, startOfDay } from "date-fns";
import { generateNotionColors } from "@/lib/taskColors";
import TaskModalAsana from "@/components/TaskModalAsana";

const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type ColorMode = "type" | "project" | "priority";

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
  task: <CheckSquare className="h-2.5 w-2.5" />,
  schedule: <CalendarDays className="h-2.5 w-2.5" />,
  timesheet: <Timer className="h-2.5 w-2.5" />,
  "google-calendar": <Calendar className="h-2.5 w-2.5" />,
  reminder: <Bell className="h-2.5 w-2.5" />,
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
  return hours + minutes / 60;
}

function TimelineEvent({ event, colorMode, onClick }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void }) {
  const startHour = parseTime(event.startTime);
  const endHour = parseTime(event.endTime);
  
  if (startHour === null) return null;
  
  const duration = endHour !== null ? endHour - startHour : 1;
  const top = startHour * HOUR_HEIGHT;
  const height = Math.max(duration * HOUR_HEIGHT, 20);
  
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
      className={`absolute left-12 right-2 rounded-md px-2 py-1 overflow-hidden cursor-pointer hover-elevate ${
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
      title={`${event.title}${event.description ? `\n${event.description}` : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-1.5">
        <div 
          className="flex-shrink-0 w-4 h-4 rounded-sm flex items-center justify-center"
          style={{ backgroundColor: notionColors.originalHex, color: notionColors.pastelBg }}
        >
          {typeIcons[event.type]}
        </div>
        <div className="flex-1 min-w-0">
          <p 
            className="text-xs font-semibold truncate leading-tight"
            style={{ color: notionColors.darkText }}
          >
            {event.title}
          </p>
          {height >= 36 && (
            <p 
              className="text-[10px] truncate opacity-80"
              style={{ color: notionColors.darkText }}
            >
              {event.startTime} - {event.endTime || 'No end'}
              {event.projectName && ` | ${event.projectName}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AllDayEvent({ event, colorMode, onClick }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void }) {
  const baseColor = getEventColor(event, colorMode);
  const notionColors = generateNotionColors(baseColor);
  
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover-elevate"
      style={{
        backgroundColor: notionColors.pastelBg,
        border: `1px solid rgba(0,0,0,0.08)`,
        borderLeftWidth: '3px',
        borderLeftColor: notionColors.originalHex,
      }}
      title={event.title}
      onClick={onClick}
    >
      <div 
        className="flex-shrink-0 w-4 h-4 rounded-sm flex items-center justify-center"
        style={{ backgroundColor: notionColors.originalHex, color: notionColors.pastelBg }}
      >
        {typeIcons[event.type]}
      </div>
      <p 
        className="text-xs font-semibold truncate"
        style={{ color: notionColors.darkText }}
      >
        {event.title}
      </p>
    </div>
  );
}

export default function DayCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Current time state that updates every minute
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
  
  const config = widget.config || {};
  const [configState, setConfigState] = useState({
    includeTasks: config.includeTasks ?? true,
    includeSchedule: config.includeSchedule ?? true,
    includeTimesheets: config.includeTimesheets ?? true,
    includeGoogleCalendar: config.includeGoogleCalendar ?? true,
    includeReminders: config.includeReminders ?? true,
    colorMode: (config.colorMode as ColorMode) ?? "project",
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
    });
  }, [widget.title, widget.config]);
  
  const colorMode = (widget.config?.colorMode as ColorMode) ?? "project";

  const { events, allDayEvents, timedEvents, isLoading } = usePersonalCalendarEvents({
    userId,
    date: selectedDate,
    range: "day",
    ...configState,
  });

  useEffect(() => {
    if (scrollRef.current && !isLoading) {
      const DEFAULT_START_HOUR = 6; // Default to 6 AM
      
      // Find earliest event time
      let earliestHour = DEFAULT_START_HOUR;
      timedEvents.forEach(event => {
        const startHour = parseTime(event.startTime);
        if (startHour !== null && startHour < earliestHour) {
          earliestHour = startHour;
        }
      });
      
      const now = new Date();
      if (isToday(selectedDate)) {
        // For today, scroll to show current time near the top third of the visible area
        const containerHeight = scrollRef.current.clientHeight;
        const currentTimePosition = (now.getHours() + now.getMinutes() / 60) * HOUR_HEIGHT;
        // Position the current time about 1/3 from the top of the view
        const targetScroll = Math.max(0, currentTimePosition - containerHeight / 3);
        // But don't scroll past earliest event
        const earliestScroll = earliestHour * HOUR_HEIGHT;
        scrollRef.current.scrollTop = Math.min(targetScroll, earliestScroll);
      } else {
        // For other days, scroll to earliest event or 6am, whichever is earlier
        scrollRef.current.scrollTop = earliestHour * HOUR_HEIGHT;
      }
    }
  }, [selectedDate, isLoading, timedEvents]);

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
        <h4 className="text-sm font-medium">Configure Day Calendar</h4>
        
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

  const goToToday = () => setSelectedDate(new Date());
  const goToPrev = () => setSelectedDate(d => subDays(d, 1));
  const goToNext = () => setSelectedDate(d => addDays(d, 1));

  return (
    <div className="flex flex-col h-full -m-3 overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={goToToday}>
            Today
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-xs font-medium">
          {format(selectedDate, "EEEE, MMM d")}
          {isToday(selectedDate) && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Today</Badge>
          )}
        </div>
      </div>

      {allDayEvents.length > 0 && (
        <div className="flex-shrink-0 px-3 py-1.5 border-b space-y-1 bg-muted/10 max-h-24 overflow-y-auto">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide sticky top-0 bg-muted/10">All Day</div>
          <div className="flex flex-wrap gap-1">
            {allDayEvents.map(event => (
              <AllDayEvent 
                key={event.id} 
                event={event} 
                colorMode={colorMode}
                onClick={() => event.type === 'task' && setSelectedTaskId(event.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-12 bg-muted rounded-md" />
            ))}
          </div>
        ) : (
          <div className="relative" style={{ minHeight: `${24 * HOUR_HEIGHT}px`, height: `${24 * HOUR_HEIGHT}px` }}>
            {HOURS.map(hour => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-b border-border/50"
                style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
              >
                <span className="absolute left-2 top-1 text-[10px] text-muted-foreground">
                  {format(new Date().setHours(hour, 0), "h a")}
                </span>
              </div>
            ))}

            {isToday(selectedDate) && (
              <div
                className="absolute left-10 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px` }}
              >
                <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
              </div>
            )}

            {timedEvents.map(event => (
              <TimelineEvent 
                key={event.id} 
                event={event} 
                colorMode={colorMode}
                onClick={() => event.type === 'task' && setSelectedTaskId(event.id)}
              />
            ))}

            {events.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                No events for this day
              </div>
            )}
          </div>
        )}
      </div>
      
      <TaskModalAsana
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        taskId={selectedTaskId || undefined}
      />
    </div>
  );
}

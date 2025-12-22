import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ChevronLeft, ChevronRight, CheckSquare, CalendarDays, Timer, Bell, Palette } from "lucide-react";
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

function DayColumn({ 
  date, 
  events, 
  isCurrentDay,
  colorMode 
}: { 
  date: Date; 
  events: CalendarItem[];
  isCurrentDay: boolean;
  colorMode: ColorMode;
}) {
  const [showAll, setShowAll] = useState(false);
  const dayEvents = events.filter(e => isSameDay(e.startDate, date));
  const isPastDay = isBefore(date, startOfDay(new Date()));
  const visibleEvents = showAll ? dayEvents : dayEvents.slice(0, 4);
  const hasMore = dayEvents.length > 4;
  
  return (
    <div className={`flex flex-col h-full min-w-0 border-r last:border-r-0 ${isPastDay ? 'opacity-60' : ''}`}>
      <div className={`text-center py-1 border-b flex-shrink-0 ${isCurrentDay ? 'bg-[#bba7db]/10' : ''}`}>
        <div className="text-[10px] text-muted-foreground uppercase">
          {format(date, "EEE")}
        </div>
        <div className={`text-sm font-medium ${isCurrentDay ? 'text-[#bba7db]' : ''}`}>
          {format(date, "d")}
        </div>
      </div>
      
      <div className="flex-1 p-0.5 space-y-0.5 overflow-y-auto">
        {dayEvents.length === 0 ? (
          <div className="h-full min-h-8 flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground">-</span>
          </div>
        ) : (
          <>
            {visibleEvents.map(event => {
              const eventColor = getEventColor(event, colorMode);
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-0.5 px-1 py-0.5 rounded border text-[10px] cursor-pointer hover-elevate"
                  style={{
                    backgroundColor: `${eventColor}20`,
                    borderColor: eventColor,
                    borderLeftWidth: '2px',
                  }}
                  title={`${event.title}${event.startTime ? ` at ${event.startTime}` : ''}`}
                >
                  <div 
                    className="flex-shrink-0 w-3 h-3 rounded-sm flex items-center justify-center text-white"
                    style={{ backgroundColor: typeColors[event.type] }}
                  >
                    {typeIcons[event.type]}
                  </div>
                  <span className="truncate flex-1 min-w-0">{event.title}</span>
                </div>
              );
            })}
            {hasMore && !showAll && (
              <button 
                onClick={() => setShowAll(true)}
                className="w-full text-[9px] text-[#bba7db] hover:underline text-center py-0.5"
              >
                +{dayEvents.length - 4} more
              </button>
            )}
            {showAll && hasMore && (
              <button 
                onClick={() => setShowAll(false)}
                className="w-full text-[9px] text-muted-foreground hover:underline text-center py-0.5"
              >
                Show less
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function WeekCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editingTitle, setEditingTitle] = useState(widget.title);
  
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

  const { events, isLoading } = usePersonalCalendarEvents({
    userId,
    date: weekStart,
    range: "week",
    ...configState,
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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

  const goToThisWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const goToPrev = () => setWeekStart(w => subWeeks(w, 1));
  const goToNext = () => setWeekStart(w => addWeeks(w, 1));

  const weekEnd = addDays(weekStart, 6);
  const weekLabel = format(weekStart, "MMM d") + " - " + format(weekEnd, "MMM d, yyyy");

  const totalEvents = events.length;
  const legend = [
    { type: 'task', label: 'Tasks', count: events.filter(e => e.type === 'task').length },
    { type: 'schedule', label: 'Schedule', count: events.filter(e => e.type === 'schedule').length },
    { type: 'google-calendar', label: 'Calendar', count: events.filter(e => e.type === 'google-calendar').length },
  ].filter(l => l.count > 0);

  return (
    <div className="flex flex-col h-full -m-3 overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={goToThisWeek}>
            This Week
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-xs font-medium flex items-center gap-1.5">
          {weekLabel}
          {totalEvents > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">{totalEvents}</Badge>
          )}
        </div>
      </div>

      {legend.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1 border-b text-[10px]">
          {legend.map(l => (
            <div key={l.type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: typeColors[l.type] }} />
              <span className="text-muted-foreground">{l.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="animate-pulse h-24 bg-muted rounded-md" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 h-full">
            {weekDays.map(date => (
              <DayColumn
                key={date.toISOString()}
                date={date}
                events={events}
                isCurrentDay={isToday(date)}
                colorMode={colorMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

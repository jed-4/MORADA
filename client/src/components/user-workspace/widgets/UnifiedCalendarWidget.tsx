import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckSquare,
  CalendarDays,
  Timer,
  Bell,
  Palette,
  LayoutList,
  List,
  CalendarRange,
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { usePersonalCalendarEvents, CalendarItem } from "./usePersonalCalendarEvents";
import { SiGoogle } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  isToday,
  isTomorrow,
  isSameDay,
  isBefore,
  startOfDay,
} from "date-fns";
import { generateNotionColors } from "@/lib/taskColors";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { EventDetailModal } from "@/components/EventDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import type { Task } from "@shared/schema";
import { useTimezone, formatInTimezone, isTodayInTimezone, getCurrentTimeInTimezone as getTimeInTimezone } from "@/hooks/useTimezone";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CalendarViewMode = "list" | "day" | "week";
type ColorMode = "type" | "project" | "priority";
type WeekViewMode = "timeline" | "stacked";
type TaskFilter = "all" | "tasks-only";

const DAY_HOUR_HEIGHT = 48;
const DAY_HOURS = Array.from({ length: 24 }, (_, i) => i);

const WEEK_HOUR_HEIGHT = 40;
const WEEK_HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

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

const typeIconsSmall: Record<string, React.ReactNode> = {
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

interface LayoutedEvent {
  event: CalendarItem;
  column: number;
  totalColumns: number;
}

function layoutOverlappingEvents(events: CalendarItem[]): LayoutedEvent[] {
  if (events.length === 0) return [];

  const sorted = events
    .map(e => {
      const s = parseTime(e.startTime) ?? 0;
      return { event: e, start: s, end: parseTime(e.endTime) ?? s + 1 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const clusters: typeof sorted[] = [];
  let cluster = [sorted[0]];
  let clusterEnd = sorted[0].end;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < clusterEnd) {
      cluster.push(sorted[i]);
      clusterEnd = Math.max(clusterEnd, sorted[i].end);
    } else {
      clusters.push(cluster);
      cluster = [sorted[i]];
      clusterEnd = sorted[i].end;
    }
  }
  clusters.push(cluster);

  const result: LayoutedEvent[] = [];

  for (const cl of clusters) {
    const cols: number[] = [];
    const assignments: { event: CalendarItem; col: number }[] = [];

    for (const item of cl) {
      let col = 0;
      while (cols[col] !== undefined && item.start < cols[col]) {
        col++;
      }
      cols[col] = item.end;
      assignments.push({ event: item.event, col });
    }

    const totalColumns = Math.max(...assignments.map(a => a.col)) + 1;
    for (const a of assignments) {
      result.push({ event: a.event, column: a.col, totalColumns });
    }
  }

  return result;
}

function isEventPast(event: CalendarItem): boolean {
  const now = new Date();
  if (event.endTime) {
    const eventEndTime = new Date(event.startDate);
    const [hours, minutes] = event.endTime.split(':').map(Number);
    eventEndTime.setHours(hours || 0, minutes || 0, 0, 0);
    return isBefore(eventEndTime, now);
  } else if (event.startTime) {
    const eventStartTime = new Date(event.startDate);
    const [hours, minutes] = event.startTime.split(':').map(Number);
    eventStartTime.setHours(hours || 0, minutes || 0, 0, 0);
    return isBefore(eventStartTime, now);
  }
  return isBefore(event.startDate, startOfDay(now));
}

function DayTimelineEvent({ event, colorMode, onClick, column = 0, totalColumns = 1 }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void; column?: number; totalColumns?: number }) {
  const startHour = parseTime(event.startTime);
  const endHour = parseTime(event.endTime);

  if (startHour === null) return null;

  const duration = endHour !== null ? endHour - startHour : 1;
  const top = startHour * DAY_HOUR_HEIGHT;
  const height = Math.max(duration * DAY_HOUR_HEIGHT, 20);
  const isPast = isEventPast(event);
  const baseColor = getEventColor(event, colorMode);
  const notionColors = generateNotionColors(baseColor);

  const leftPx = 48;
  const rightPx = 8;
  const widthPercent = totalColumns > 1 ? `calc((100% - ${leftPx + rightPx}px) / ${totalColumns})` : `calc(100% - ${leftPx + rightPx}px)`;
  const leftOffset = totalColumns > 1 ? `calc(${leftPx}px + (100% - ${leftPx + rightPx}px) * ${column} / ${totalColumns})` : `${leftPx}px`;

  return (
    <div
      className={`absolute rounded-md px-2 py-1 overflow-hidden cursor-pointer hover-elevate ${isPast ? 'opacity-50' : ''}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: leftOffset,
        width: widthPercent,
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
          <p className="text-xs font-semibold truncate leading-tight" style={{ color: notionColors.darkText }}>
            {event.title}
          </p>
          {height >= 36 && (
            <p className="text-[10px] truncate opacity-80" style={{ color: notionColors.darkText }}>
              {event.startTime} - {event.endTime || 'No end'}
              {event.projectName && ` | ${event.projectName}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DayAllDayEvent({ event, colorMode, onClick }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void }) {
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
      <p className="text-xs font-semibold truncate" style={{ color: notionColors.darkText }}>
        {event.title}
      </p>
    </div>
  );
}

function WeekTimelineEvent({ event, colorMode, onClick, column = 0, totalColumns = 1 }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void; column?: number; totalColumns?: number }) {
  const startHour = parseTime(event.startTime);
  const endHour = parseTime(event.endTime);

  if (startHour === null) return null;

  const duration = endHour !== null ? endHour - startHour : 1;
  const top = (startHour - 6) * WEEK_HOUR_HEIGHT;
  const height = Math.max(duration * WEEK_HOUR_HEIGHT, 18);
  const isPast = isEventPast(event);
  const baseColor = getEventColor(event, colorMode);
  const notionColors = generateNotionColors(baseColor);

  const widthPercent = totalColumns > 1 ? `${(100 / totalColumns)}%` : 'calc(100% - 4px)';
  const leftPercent = totalColumns > 1 ? `${(column * 100 / totalColumns)}%` : '0';

  return (
    <div
      className={`absolute rounded-sm px-1 py-0.5 overflow-hidden cursor-pointer hover-elevate text-[9px] ${isPast ? 'opacity-50' : ''}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        left: leftPercent,
        width: widthPercent,
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
          {typeIconsSmall[event.type]}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="font-semibold truncate leading-tight" style={{ color: notionColors.darkText }}>
            {event.title}
          </p>
          {height >= 30 && (
            <p className="truncate opacity-70" style={{ color: notionColors.darkText }}>
              {event.startTime}{event.endTime && ` - ${event.endTime}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function WeekAllDayChip({ event, colorMode, onClick }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void }) {
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
        {typeIconsSmall[event.type]}
      </div>
      <span className="truncate font-semibold" style={{ color: notionColors.darkText }}>
        {event.title}
      </span>
    </div>
  );
}

function WeekStackedChip({ event, colorMode, onClick }: { event: CalendarItem; colorMode: ColorMode; onClick?: () => void }) {
  const baseColor = getEventColor(event, colorMode);
  const notionColors = generateNotionColors(baseColor);
  const isPast = isEventPast(event);

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
        {typeIconsSmall[event.type]}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-0.5">
        <span className="truncate font-semibold" style={{ color: notionColors.darkText }}>
          {event.title}
        </span>
        {event.startTime && (
          <span className="flex-shrink-0 text-[8px] opacity-70" style={{ color: notionColors.darkText }}>
            {event.startTime}
          </span>
        )}
      </div>
    </div>
  );
}

export default function UnifiedCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const weekStartDay = useWeekStartDay();
  const { effectiveTimezone } = useTimezone();
  const { toast } = useToast();

  const config = widget.config || {};
  const defaultViewMode = (config.defaultViewMode as CalendarViewMode) || (config.viewMode as CalendarViewMode) || "day";

  const [viewMode, setViewMode] = useState<CalendarViewMode>(defaultViewMode);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => getTimeInTimezone(effectiveTimezone).totalMinutes);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMinutes(getTimeInTimezone(effectiveTimezone).totalMinutes);
    }, 60000);
    return () => clearInterval(interval);
  }, [effectiveTimezone]);

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTask(null);
    },
  });

  const [configState, setConfigState] = useState({
    includeTasks: config.includeTasks ?? true,
    includeSchedule: config.includeSchedule ?? true,
    includeTimesheets: config.includeTimesheets ?? true,
    includeGoogleCalendar: config.includeGoogleCalendar ?? true,
    includeReminders: config.includeReminders ?? true,
    colorMode: (config.colorMode as ColorMode) ?? "project",
    weekViewMode: (config.weekViewMode as WeekViewMode) ?? "timeline",
    taskFilter: (config.taskFilter as TaskFilter) ?? "all",
    defaultViewMode: defaultViewMode,
    daysAhead: config.daysAhead ?? 7,
    maxEvents: config.maxEvents ?? 20,
  });

  useEffect(() => {
    setEditingTitle(widget.title);
    const c = widget.config || {};
    const dvm = (c.defaultViewMode as CalendarViewMode) || (c.viewMode as CalendarViewMode) || "day";
    setConfigState({
      includeTasks: c.includeTasks ?? true,
      includeSchedule: c.includeSchedule ?? true,
      includeTimesheets: c.includeTimesheets ?? true,
      includeGoogleCalendar: c.includeGoogleCalendar ?? true,
      includeReminders: c.includeReminders ?? true,
      colorMode: (c.colorMode as ColorMode) ?? "project",
      weekViewMode: (c.weekViewMode as WeekViewMode) ?? "timeline",
      taskFilter: (c.taskFilter as TaskFilter) ?? "all",
      defaultViewMode: dvm,
      daysAhead: c.daysAhead ?? 7,
      maxEvents: c.maxEvents ?? 20,
    });
    setViewMode(dvm);
  }, [widget.title, widget.config]);

  const colorMode = (config.colorMode as ColorMode) ?? "project";
  const weekViewMode = (config.weekViewMode as WeekViewMode) ?? "timeline";
  const taskFilter = (config.taskFilter as TaskFilter) ?? "all";
  const daysAhead = config.daysAhead ?? 7;
  const maxEvents = config.maxEvents ?? 20;

  const hookDate = viewMode === "week" ? weekStart : selectedDate;
  const hookRange = viewMode === "week" ? "week" as const : "day" as const;

  const { events: rawEvents, allDayEvents: rawAllDayEvents, timedEvents: rawTimedEvents, isLoading, isGoogleConnected } = usePersonalCalendarEvents({
    userId,
    date: hookDate,
    range: viewMode === "list" ? "week" : hookRange,
    weekStartDay,
    includeTasks: config.includeTasks ?? true,
    includeSchedule: config.includeSchedule ?? true,
    includeTimesheets: config.includeTimesheets ?? true,
    includeGoogleCalendar: config.includeGoogleCalendar ?? true,
    includeReminders: config.includeReminders ?? true,
  });

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

  const getEventsForDay = (date: Date, eventList: CalendarItem[]) =>
    eventList.filter(e => isSameDay(e.startDate, date));

  const handleEventClick = (event: CalendarItem) => {
    if (event.type === 'task') {
      setSelectedTaskId(event.id);
    } else {
      setSelectedEvent(event);
    }
  };

  useEffect(() => {
    if (!scrollRef.current || isLoading) return;

    if (viewMode === "day") {
      const DEFAULT_START_HOUR = 6;
      let earliestHour = DEFAULT_START_HOUR;
      timedEvents.forEach(event => {
        const startHour = parseTime(event.startTime);
        if (startHour !== null && startHour < earliestHour) {
          earliestHour = startHour;
        }
      });

      if (isTodayInTimezone(selectedDate, effectiveTimezone)) {
        const { hours: currentHour, minutes: currentMinute } = getTimeInTimezone(effectiveTimezone);
        const containerHeight = scrollRef.current.clientHeight;
        const currentTimePosition = (currentHour + currentMinute / 60) * DAY_HOUR_HEIGHT;
        const targetScroll = Math.max(0, currentTimePosition - containerHeight / 3);
        const earliestScroll = earliestHour * DAY_HOUR_HEIGHT;
        scrollRef.current.scrollTop = Math.min(targetScroll, earliestScroll);
      } else {
        scrollRef.current.scrollTop = earliestHour * DAY_HOUR_HEIGHT;
      }
    } else if (viewMode === "week" && weekViewMode === "timeline") {
      const { hours: currentHour, minutes: currentMinute } = getTimeInTimezone(effectiveTimezone);
      const todayInWeek = weekDays.some(d => isTodayInTimezone(d, effectiveTimezone));

      if (todayInWeek && currentHour >= 6) {
        const containerHeight = scrollRef.current.clientHeight;
        const currentTimePosition = (currentHour - 6 + currentMinute / 60) * WEEK_HOUR_HEIGHT;
        const targetScroll = Math.max(0, currentTimePosition - containerHeight / 3);
        scrollRef.current.scrollTop = targetScroll;
      } else {
        scrollRef.current.scrollTop = (8 - 6) * WEEK_HOUR_HEIGHT;
      }
    }
  }, [viewMode, selectedDate, weekStart, isLoading, timedEvents, effectiveTimezone, weekViewMode, weekDays]);

  const goToToday = () => {
    setSelectedDate(new Date());
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  };
  const goToPrev = () => {
    if (viewMode === "week") {
      setWeekStart(w => subWeeks(w, 1));
    } else {
      setSelectedDate(d => subDays(d, 1));
    }
  };
  const goToNext = () => {
    if (viewMode === "week") {
      setWeekStart(w => addWeeks(w, 1));
    } else {
      setSelectedDate(d => addDays(d, 1));
    }
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      onUpdate?.({
        ...widget,
        title: editingTitle,
        config: {
          ...widget.config,
          ...configState,
        }
      });
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
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Default View</Label>
          <Select
            value={configState.defaultViewMode}
            onValueChange={(v: CalendarViewMode) => setConfigState(prev => ({ ...prev, defaultViewMode: v }))}
          >
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">List</SelectItem>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
            </SelectContent>
          </Select>
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
            Week View Mode
          </Label>
          <Select
            value={configState.weekViewMode}
            onValueChange={(value: WeekViewMode) =>
              setConfigState(prev => ({ ...prev, weekViewMode: value }))
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
            {configState.weekViewMode === "timeline" && "Events positioned by time on hourly grid"}
            {configState.weekViewMode === "stacked" && "Events stacked as a list under each day"}
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

        <div className="space-y-2">
          <Label className="text-xs">Days Ahead (for list)</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={configState.daysAhead}
            onChange={(e) => setConfigState(prev => ({ ...prev, daysAhead: parseInt(e.target.value) || 7 }))}
            className="h-7 text-xs w-20"
          />
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

  const weekEnd = addDays(weekStart, 6);

  const getDateLabel = () => {
    if (viewMode === "week") {
      return `${formatInTimezone(weekStart, effectiveTimezone, { month: 'short', day: 'numeric' })} - ${formatInTimezone(weekEnd, effectiveTimezone, { month: 'short', day: 'numeric' })}`;
    }
    if (viewMode === "day") {
      return formatInTimezone(selectedDate, effectiveTimezone, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    return `${events.length} upcoming`;
  };

  const getDayLabel = (date: Date) => {
    if (isTodayInTimezone(date, effectiveTimezone)) return 'Today';
    const tomorrow = addDays(new Date(), 1);
    if (isSameDay(date, tomorrow)) return 'Tomorrow';
    return formatInTimezone(date, effectiveTimezone, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getTimeLabel = (event: CalendarItem) => {
    if (event.allDay) return 'All day';
    if (event.startTime) return event.startTime;
    return formatInTimezone(event.startDate, effectiveTimezone, { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const renderHeader = () => (
    <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
      <div className="flex items-center gap-1">
        {viewMode !== "list" && (
          <>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToPrev}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={goToToday}>
              {viewMode === "week" ? "This Week" : "Today"}
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToNext}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <span className="text-xs font-medium ml-1">
          {getDateLabel()}
          {viewMode === "day" && isTodayInTimezone(selectedDate, effectiveTimezone) && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Today</Badge>
          )}
          {viewMode !== "list" && events.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">{events.length}</Badge>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`relative p-1 rounded-sm flex items-center justify-center ${
                isGoogleConnected ? '' : 'hover-elevate active-elevate-2 cursor-pointer'
              } ${connectingGoogle ? 'opacity-50' : ''}`}
              disabled={connectingGoogle}
              onClick={async () => {
                if (isGoogleConnected || connectingGoogle) return;
                setConnectingGoogle(true);
                try {
                  const response = await fetch("/api/google-calendar/auth-url");
                  const data = await response.json();
                  if (data.authUrl) {
                    window.location.href = data.authUrl;
                  }
                } catch {
                  toast({ title: "Could not connect", description: "Failed to start Google Calendar connection. Please try again.", variant: "destructive" });
                } finally {
                  setConnectingGoogle(false);
                }
              }}
            >
              <SiGoogle className={`h-3 w-3 ${isGoogleConnected ? 'text-foreground' : 'text-muted-foreground/50'}`} />
              <span
                className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-background ${
                  isGoogleConnected ? 'bg-green-500' : 'bg-muted-foreground/40'
                }`}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isGoogleConnected ? "Google Calendar connected" : "Click to connect Google Calendar"}
          </TooltipContent>
        </Tooltip>
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
            <CalendarRange className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderListView = () => {
    const displayEvents = [...events]
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .slice(0, maxEvents);

    if (displayEvents.length === 0) {
      return (
        <div className="text-center py-6 text-xs text-muted-foreground">
          No upcoming events
        </div>
      );
    }

    return (
      <div className="space-y-1 p-2">
        {displayEvents.map((event) => {
          const baseColor = getEventColor(event, colorMode);
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
              onClick={() => handleEventClick(event)}
            >
              <div className="flex items-start gap-2">
                <div
                  className="flex-shrink-0 w-4 h-4 rounded-sm flex items-center justify-center mt-0.5"
                  style={{ backgroundColor: notionColors.originalHex, color: notionColors.pastelBg }}
                >
                  {typeIcons[event.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate leading-tight" style={{ color: notionColors.darkText }}>
                    {event.title}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 h-4"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.5)',
                        color: notionColors.darkText,
                        borderColor: 'rgba(0,0,0,0.1)'
                      }}
                    >
                      {getDayLabel(event.startDate)}
                    </Badge>
                    <span
                      className="text-[10px] flex items-center gap-0.5"
                      style={{ color: notionColors.darkText, opacity: 0.7 }}
                    >
                      <Clock className="h-2 w-2" />
                      {getTimeLabel(event)}
                    </span>
                    {event.projectName && (
                      <span className="text-[10px] opacity-60 truncate" style={{ color: notionColors.darkText }}>
                        {event.projectName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDayView = () => {
    const showCurrentTime = isTodayInTimezone(selectedDate, effectiveTimezone);

    return (
      <>
        {allDayEvents.length > 0 && (
          <div className="flex-shrink-0 px-3 py-1.5 border-b space-y-1 bg-muted/10 max-h-24 overflow-y-auto">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide sticky top-0 bg-muted/10">All Day</div>
            <div className="flex flex-wrap gap-1">
              {allDayEvents.map(event => (
                <DayAllDayEvent
                  key={event.id}
                  event={event}
                  colorMode={colorMode}
                  onClick={() => handleEventClick(event)}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="relative" style={{ minHeight: `${24 * DAY_HOUR_HEIGHT}px`, height: `${24 * DAY_HOUR_HEIGHT}px` }}>
            {DAY_HOURS.map(hour => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-b border-border/50"
                style={{ top: `${hour * DAY_HOUR_HEIGHT}px`, height: `${DAY_HOUR_HEIGHT}px` }}
              >
                <span className="absolute left-2 top-1 text-[10px] text-muted-foreground">
                  {formatInTimezone(new Date(new Date().setHours(hour, 0)), effectiveTimezone, { hour: 'numeric', hour12: true })}
                </span>
              </div>
            ))}

            {showCurrentTime && (
              <div
                className="absolute left-10 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                style={{ top: `${(currentTimeMinutes / 60) * DAY_HOUR_HEIGHT}px` }}
              >
                <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
              </div>
            )}

            {layoutOverlappingEvents(timedEvents).map(({ event, column, totalColumns }) => (
              <DayTimelineEvent
                key={event.id}
                event={event}
                colorMode={colorMode}
                column={column}
                totalColumns={totalColumns}
                onClick={() => handleEventClick(event)}
              />
            ))}

            {events.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                No events for this day
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  const renderWeekView = () => {
    const hasAllDay = allDayEvents.length > 0;
    const currentTimeTop = ((currentTimeMinutes / 60) - 6) * WEEK_HOUR_HEIGHT;
    const isTimeline = weekViewMode === "timeline";
    const gridCols = isTimeline ? "grid-cols-[40px_repeat(7,1fr)]" : "grid-cols-7";

    return (
      <>
        <div className={`flex-shrink-0 grid border-b bg-background sticky top-0 z-10 ${gridCols}`}>
          {isTimeline && <div className="border-r border-border/30" />}
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

        {hasAllDay && (
          <div className={`flex-shrink-0 grid border-b bg-muted/10 max-h-20 overflow-y-auto ${gridCols}`}>
            {isTimeline && (
              <div className="border-r border-border/30 flex items-start justify-center py-1">
                <span className="text-[9px] text-muted-foreground uppercase">All Day</span>
              </div>
            )}
            {weekDays.map((day) => {
              const dayAllDayEvents = getEventsForDay(day, allDayEvents);
              return (
                <div key={day.toISOString()} className="border-r last:border-r-0 p-0.5 min-h-[28px]">
                  {dayAllDayEvents.slice(0, 3).map(event => (
                    <WeekAllDayChip
                      key={event.id}
                      event={event}
                      colorMode={colorMode}
                      onClick={() => handleEventClick(event)}
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {isTimeline ? (
            <div className={`grid ${gridCols} relative`} style={{ minHeight: `${WEEK_HOURS.length * WEEK_HOUR_HEIGHT}px` }}>
              <div className="relative border-r border-border/30">
                {WEEK_HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0"
                    style={{ top: `${(hour - 6) * WEEK_HOUR_HEIGHT}px`, height: `${WEEK_HOUR_HEIGHT}px` }}
                  >
                    <span className="absolute left-1 top-1 text-[9px] text-muted-foreground">
                      {formatInTimezone(new Date(new Date().setHours(hour, 0)), effectiveTimezone, { hour: 'numeric', hour12: true })}
                    </span>
                  </div>
                ))}
              </div>

              {weekDays.map((day) => {
                const isCurrentDay = isTodayInTimezone(day, effectiveTimezone);
                const isPast = isBefore(day, startOfDay(new Date()));
                const dayTimedEvents = getEventsForDay(day, timedEvents);

                return (
                  <div
                    key={day.toISOString()}
                    className={`relative border-r last:border-r-0 ${isCurrentDay ? 'bg-[#bba7db]/5' : ''} ${isPast && !isCurrentDay ? 'opacity-50' : ''}`}
                    style={{ minHeight: `${WEEK_HOURS.length * WEEK_HOUR_HEIGHT}px` }}
                  >
                    {WEEK_HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="absolute left-0 right-0 border-t border-border/30"
                        style={{ top: `${(hour - 6) * WEEK_HOUR_HEIGHT}px`, height: `${WEEK_HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {isCurrentDay && currentTimeMinutes >= 360 && currentTimeMinutes < 1380 && (
                      <div
                        className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                        style={{ top: `${currentTimeTop}px` }}
                      >
                        <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-500" />
                      </div>
                    )}

                    <div className="absolute inset-0 px-0.5">
                      {layoutOverlappingEvents(dayTimedEvents).map(({ event, column, totalColumns }) => (
                        <WeekTimelineEvent
                          key={event.id}
                          event={event}
                          colorMode={colorMode}
                          column={column}
                          totalColumns={totalColumns}
                          onClick={() => handleEventClick(event)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
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
                        <WeekStackedChip
                          key={event.id}
                          event={event}
                          colorMode={colorMode}
                          onClick={() => handleEventClick(event)}
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
          )}
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col h-full -m-3 overflow-hidden">
      {renderHeader()}

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="p-4 space-y-2 w-full">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse h-12 bg-muted rounded-md" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {viewMode === "list" && renderListView()}
          {viewMode === "day" && renderDayView()}
          {viewMode === "week" && renderWeekView()}
        </>
      )}

      <TaskDetailModal
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        onEdit={(task) => setEditingTask(task)}
      />

      <EventDetailModal
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
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

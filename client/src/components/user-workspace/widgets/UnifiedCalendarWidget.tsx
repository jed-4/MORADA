import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar,
  CalendarRange,
  List,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  CalendarDays,
  Timer,
  Bell,
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { usePersonalCalendarEvents, CalendarItem } from "./usePersonalCalendarEvents";
import { SiGoogle } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { addDays, subDays, addWeeks, subWeeks, startOfWeek, endOfWeek } from "date-fns";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import { useTimezone, formatInTimezone, isTodayInTimezone } from "@/hooks/useTimezone";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import { EventDetailModal } from "@/components/EventDetailModal";
import { EnhancedCalendar, type CalendarEvent } from "@/components/EnhancedCalendar";
import type { Task } from "@shared/schema";

/**
 * The views this widget offers, a subset of `EnhancedCalendarView`. Month and
 * roster are deliberately left to the full calendar page — neither is readable
 * in a dashboard tile.
 */
type WidgetCalendarView = "day" | "week" | "agenda";

/**
 * The order the header button cycles through, and how each view presents
 * itself. One cycling control costs a single icon in the title row, where a
 * three-button switcher cost a whole strip of chrome; the config panel still
 * picks which view the widget *opens* on.
 */
const VIEW_CYCLE: WidgetCalendarView[] = ["day", "week", "agenda"];

const VIEW_META: Record<WidgetCalendarView, { label: string; icon: typeof Calendar }> = {
  day: { label: "Day", icon: Calendar },
  week: { label: "Week", icon: CalendarRange },
  agenda: { label: "Agenda", icon: List },
};

const VIEW_OPTIONS = VIEW_CYCLE.map(value => ({ value, label: VIEW_META[value].label }));

/** Layouts that earlier versions of this widget persisted. */
function normaliseView(value: unknown): WidgetCalendarView {
  if (value === "day" || value === "week" || value === "agenda") return value;
  if (value === "list") return "agenda"; // the hand-rolled list view became agenda
  return "day";
}

/**
 * `CalendarItem` is what this widget's data hook builds; `CalendarEvent` is what
 * every calendar surface in Morada renders. The shapes already agree on
 * everything but two points: ids are strings app-wide (the hook types
 * `projectId` as a number), and an all-day event is expressed by having no
 * `startTime` rather than by a flag.
 *
 * The original item rides along on `resource` so a click can be routed back to
 * the right detail modal.
 */
function toCalendarEvent(item: CalendarItem): CalendarEvent {
  return {
    id: item.id,
    title: item.title,
    startDate: item.startDate,
    endDate: item.endDate,
    startTime: item.allDay ? null : item.startTime,
    endTime: item.allDay ? null : item.endTime,
    projectId: item.projectId != null ? String(item.projectId) : null,
    projectName: item.projectName ?? null,
    projectColor: item.projectColor ?? null,
    type: item.type,
    status: item.status,
    description: item.description ?? null,
    location: item.location ?? null,
    resource: item,
  };
}

export default function UnifiedCalendarWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions, userId }: WidgetProps) {
  const weekStartDay = useWeekStartDay();
  const { effectiveTimezone } = useTimezone();
  const { toast } = useToast();

  const config = widget.config || {};
  const defaultView = normaliseView(config.defaultViewMode ?? config.viewMode);

  const [view, setView] = useState<WidgetCalendarView>(defaultView);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

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
    taskFilter: (config.taskFilter as string) ?? "all",
    defaultViewMode: defaultView,
  });

  useEffect(() => {
    setEditingTitle(widget.title);
    const c = widget.config || {};
    const dv = normaliseView(c.defaultViewMode ?? c.viewMode);
    setConfigState({
      includeTasks: c.includeTasks ?? true,
      includeSchedule: c.includeSchedule ?? true,
      includeTimesheets: c.includeTimesheets ?? true,
      includeGoogleCalendar: c.includeGoogleCalendar ?? true,
      includeReminders: c.includeReminders ?? true,
      taskFilter: (c.taskFilter as string) ?? "all",
      defaultViewMode: dv,
    });
    setView(dv);
  }, [widget.title, widget.config]);

  const taskFilter = (config.taskFilter as string) ?? "all";

  // Agenda spans the week it starts in, so both it and week view want the wider fetch.
  const { events: rawEvents, isLoading, isGoogleConnected } = usePersonalCalendarEvents({
    userId,
    date: currentDate,
    range: view === "day" ? "day" : "week",
    weekStartDay,
    includeTasks: config.includeTasks ?? true,
    includeSchedule: config.includeSchedule ?? true,
    includeTimesheets: config.includeTimesheets ?? true,
    includeGoogleCalendar: config.includeGoogleCalendar ?? true,
    includeReminders: config.includeReminders ?? true,
    timezone: effectiveTimezone,
  });

  const events = useMemo(() => {
    const filtered = taskFilter === "tasks-only" ? rawEvents.filter(e => e.type === "task") : rawEvents;
    return filtered.map(toCalendarEvent);
  }, [rawEvents, taskFilter]);

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === "task") {
      setSelectedTaskId(event.id);
      return;
    }
    const item = event.resource as CalendarItem | undefined;
    if (item) setSelectedEvent(item);
  };

  const goToPrev = () =>
    setCurrentDate(d => (view === "day" ? subDays(d, 1) : subWeeks(d, 1)));
  const goToNext = () =>
    setCurrentDate(d => (view === "day" ? addDays(d, 1) : addWeeks(d, 1)));
  const goToToday = () => setCurrentDate(new Date());

  const nextView = VIEW_CYCLE[(VIEW_CYCLE.indexOf(view) + 1) % VIEW_CYCLE.length];
  const cycleView = () => setView(nextView);

  const dateLabel = useMemo(() => {
    if (view === "day") {
      return formatInTimezone(currentDate, effectiveTimezone, { weekday: "short", month: "short", day: "numeric" });
    }
    const start = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const end = endOfWeek(currentDate, { weekStartsOn: weekStartDay });
    return `${formatInTimezone(start, effectiveTimezone, { month: "short", day: "numeric" })} - ${formatInTimezone(end, effectiveTimezone, { month: "short", day: "numeric" })}`;
  }, [view, currentDate, effectiveTimezone, weekStartDay]);

  // The nav lives in the widget card's title row rather than in a bar of its
  // own: a second strip of chrome inside a dashboard tile costs more height
  // than the content it labels. View switching moves to the config panel.
  useEffect(() => {
    onSetHeaderActions?.(
      <div className="flex items-center gap-0.5">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToPrev} aria-label="Previous">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[11px]" onClick={goToToday}>
          {view === "day" ? "Today" : "This week"}
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={goToNext} aria-label="Next">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <span className="ml-1 text-[11px] font-medium tabular-nums whitespace-nowrap">{dateLabel}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="ml-1 h-6 w-6"
              onClick={cycleView}
              aria-label={`${VIEW_META[view].label} view — switch to ${VIEW_META[nextView].label}`}
              data-testid="calendar-widget-cycle-view"
            >
              {(() => { const ViewIcon = VIEW_META[view].icon; return <ViewIcon className="h-3.5 w-3.5" />; })()}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {VIEW_META[view].label} view &middot; click for {VIEW_META[nextView].label}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`relative ml-1 p-1 rounded-sm flex items-center justify-center ${
                isGoogleConnected ? '' : 'hover-elevate active-elevate-2 cursor-pointer'
              } ${connectingGoogle ? 'opacity-50' : ''}`}
              disabled={connectingGoogle}
              onClick={async () => {
                if (isGoogleConnected || connectingGoogle) return;
                setConnectingGoogle(true);
                try {
                  const response = await fetch("/api/google-calendar/auth-url");
                  const data = await response.json();
                  if (data.authUrl) window.location.href = data.authUrl;
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
                  isGoogleConnected ? 'bg-bp-green' : 'bg-muted-foreground/40'
                }`}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isGoogleConnected ? "Google Calendar connected" : "Click to connect Google Calendar"}
          </TooltipContent>
        </Tooltip>
      </div>,
    );
    // Deliberately keyed on values, not identities: a new element every render
    // would re-fire this against the parent's state and loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, nextView, dateLabel, isGoogleConnected, connectingGoogle]);

  if (isConfiguring) {
    const handleSaveConfig = () => {
      onUpdate?.({
        ...widget,
        title: editingTitle,
        config: {
          ...widget.config,
          includeTasks: configState.includeTasks,
          includeSchedule: configState.includeSchedule,
          includeTimesheets: configState.includeTimesheets,
          includeGoogleCalendar: configState.includeGoogleCalendar,
          includeReminders: configState.includeReminders,
          taskFilter: configState.taskFilter,
          defaultViewMode: configState.defaultViewMode,
        },
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
            onValueChange={(v: WidgetCalendarView) => setConfigState(prev => ({ ...prev, defaultViewMode: v }))}
          >
            <SelectTrigger className="h-7 text-xs w-full">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              {VIEW_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
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
            <CheckSquare className="h-3 w-3" />
            Task Filter
          </Label>
          <Select
            value={configState.taskFilter}
            onValueChange={(value: string) => setConfigState(prev => ({ ...prev, taskFilter: value }))}
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

  return (
    <div className="flex flex-col h-full -mx-4 -mb-4 overflow-hidden">
      {isLoading ? (
        <div className="flex-1 px-4 pt-3">
          <WidgetSkeleton rows={4} />
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 min-w-0 overflow-hidden"
          // EnhancedCalendar paints its gutters, sticky headers and column
          // washes with `bg-background` — the page cream. That is right on the
          // full-page calendar, which sits flush on the page, but inside a white
          // widget card it reads as a dirty off-white panel. Remapping the token
          // for this subtree fixes every one of them at once, and leaves the
          // shared component (and the calendar page) alone.
          style={{ ["--background" as never]: "var(--card)" }}
        >
          {/* The same renderer the user calendar page uses, so the two surfaces
              match by construction rather than by imitation. Read-only: a stray
              drag in a dashboard tile should never move a real site booking. */}
          <EnhancedCalendar
            events={events}
            onEventClick={handleEventClick}
            view={view}
            onViewChange={(next) => setView(normaliseView(next))}
            currentDate={currentDate}
            onCurrentDateChange={setCurrentDate}
            hideInternalHeader
            readOnly
            mobileFallbackView="agenda"
          />
        </div>
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

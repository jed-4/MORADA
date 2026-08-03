import { useState, useEffect, useMemo, useRef } from "react";
import { useTimezone, isTodayInTimezone, getCurrentTimeInTimezone as getTimeInTimezone } from "@/hooks/useTimezone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  Plus,
  AlertTriangle,
  Flag,
  CheckCircle2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  format,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  isToday,
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
  getDay,
} from "date-fns";
import { generateNotionColors, TYPE_COLORS_HEX } from "@/lib/taskColors";
import { getPriorityStyle } from "@/lib/priorityConfig";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import TaskEditModal from "@/components/TaskEditModal";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "day" | "week" | "month";

const HOUR_HEIGHT = 40;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

type ItemType = "task" | "milestone" | "meeting" | "inspection" | "delivery";

interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: ItemType;
  status: "scheduled" | "overdue" | "completed" | "in_progress";
  priority?: "high" | "medium" | "low";
  assigneeName?: string;
  progress?: number;
}

// One colour system for the whole widget: canonical type hex → notion
// pastel/dark variants. Overdue always renders in the coral family.
function getTypeNotionColors(type: string) {
  return generateNotionColors(
    TYPE_COLORS_HEX[type as keyof typeof TYPE_COLORS_HEX] || TYPE_COLORS_HEX.task,
  );
}

const OVERDUE = {
  wash: "hsl(var(--coral-light))",
  solid: "hsl(var(--coral))",
  text: "hsl(11 52% 38%)",
};

function parseTime(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours)) return null;
  return hours + (minutes || 0) / 60;
}

// Small coloured dot for an item type (overdue overrides to coral)
function TypeDot({ type, overdue, className }: { type: string; overdue?: boolean; className?: string }) {
  return (
    <span
      className={cn("rounded-full flex-shrink-0", className || "w-1.5 h-1.5")}
      style={{ backgroundColor: overdue ? OVERDUE.solid : getTypeNotionColors(type).originalHex }}
    />
  );
}

export default function ScheduleWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions }: WidgetProps) {
  const { currentProject } = useProject();
  const { effectiveTimezone } = useTimezone();
  const weekStartDay = useWeekStartDay();
  const [, navigate] = useLocation();

  const viewMode = (widget.config?.viewMode as ViewMode) || "list";
  const maxItems = widget.config?.maxItems || 5;
  const showOverdue = widget.config?.showOverdue !== false;
  const showMilestones = widget.config?.showMilestones !== false;
  const showCompleted = widget.config?.showCompleted || false;
  const showTasks = widget.config?.showTasks !== false;
  const showMeetings = widget.config?.showMeetings !== false;
  const showInspections = widget.config?.showInspections !== false;
  const showDeliveries = widget.config?.showDeliveries !== false;
  const priorityFilter = widget.config?.priorityFilter || "all";
  const statusFilter = widget.config?.statusFilter || "all";
  const displayMode = (widget.config?.displayMode as "timeline" | "stacked") || "stacked";

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => getTimeInTimezone(effectiveTimezone).totalMinutes);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; config: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, config: {} });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  // Update current time every minute for timeline views
  useEffect(() => {
    if (viewMode !== "day" && viewMode !== "week") return;
    if (displayMode !== "timeline") return;

    const interval = setInterval(() => {
      setCurrentTimeMinutes(getTimeInTimezone(effectiveTimezone).totalMinutes);
    }, 60000);

    return () => clearInterval(interval);
  }, [viewMode, displayMode, effectiveTimezone]);

  // Timeline: start scrolled near now (or the working morning) instead of midnight
  useEffect(() => {
    if (displayMode !== "timeline" || (viewMode !== "day" && viewMode !== "week")) return;
    const el = timelineScrollRef.current;
    if (!el) return;
    const targetHour = isTodayInTimezone(currentDate, effectiveTimezone)
      ? Math.max(0, currentTimeMinutes / 60 - 1)
      : 6;
    el.scrollTop = targetHour * HOUR_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, displayMode, currentDate, isConfiguring]);

  // Header row: arrow through to the full schedule page
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => navigate(`/projects/${currentProject.id}/schedule`)}
              data-testid="schedule-widget-open-full"
              aria-label="Open full schedule"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Full schedule</TooltipContent>
        </Tooltip>
      ) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const { data: tasks = [], isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useQuery<any[]>({
    // Keyed to match TasksWidget and the Tasks page so mutations there
    // (which invalidate ["/api/tasks"]) refresh this widget too.
    queryKey: ["/api/tasks", currentProject?.id],
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/tasks?projectId=${currentProject.id}`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load tasks (${response.status})`);
      return response.json();
    },
    enabled: !!currentProject,
  });

  const needScheduleItems = showMilestones || showMeetings || showInspections || showDeliveries;

  // Milestones/meetings/inspections/deliveries are schedule items. Same key as
  // ProgrammeScheduleWidget to share cache.
  const { data: allScheduleItems = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<any[]>({
    queryKey: ["/api/projects", currentProject?.id, "schedule-items"],
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/projects/${currentProject.id}/schedule-items`, { credentials: "include" });
      if (!response.ok) throw new Error(`Failed to load schedule items (${response.status})`);
      return response.json();
    },
    enabled: !!currentProject && needScheduleItems,
  });

  const scheduleItems = useMemo(() => {
    const items: ScheduleItem[] = [];

    // Task statuses are stored as "todo" | "in-progress" | "done" keys.
    const isDone = (status: string | null | undefined) =>
      status === "done" || status === "complete" || status === "completed";
    const isInProgress = (status: string | null | undefined) =>
      status === "in-progress" || status === "in_progress";
    // Overdue means past the END of the due day, not past the stored timestamp.
    const now = new Date();
    const startOfTodayDate = new Date(now);
    startOfTodayDate.setHours(0, 0, 0, 0);
    const isPastDue = (d: Date) => {
      const day = new Date(d);
      day.setHours(0, 0, 0, 0);
      return day < startOfTodayDate;
    };

    const passesFilters = (opts: { overdue: boolean; done: boolean; inProgress: boolean; priority?: string }) => {
      if (!showCompleted && opts.done) return false;
      if (!showOverdue && opts.overdue) return false;
      if (priorityFilter !== "all" && opts.priority !== priorityFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "overdue" && !opts.overdue) return false;
        if (statusFilter === "in_progress" && !opts.inProgress) return false;
        if (statusFilter === "scheduled" && (opts.overdue || opts.done || opts.inProgress)) return false;
      }
      return true;
    };

    if (showTasks) {
      tasks.forEach((task: any) => {
        if (!task.dueDate) return;
        const dueDate = new Date(task.dueDate);
        const done = isDone(task.status);
        const overdue = !done && isPastDue(dueDate);
        if (!passesFilters({ overdue, done, inProgress: isInProgress(task.status), priority: task.priority })) return;

        items.push({
          id: task.id,
          title: task.title || task.name,
          date: task.dueDate,
          time: task.startTime || undefined,
          type: "task",
          status: overdue ? "overdue" : done ? "completed" : isInProgress(task.status) ? "in_progress" : "scheduled",
          priority: task.priority,
          assigneeName: task.assigneeName,
          progress: task.progress || 0,
        });
      });
    }

    const typeEnabled: Record<string, boolean> = {
      milestone: showMilestones,
      meeting: showMeetings,
      inspection: showInspections,
      delivery: showDeliveries,
    };

    allScheduleItems.forEach((si: any) => {
      if (si.type === "task" || !typeEnabled[si.type]) return;
      // Milestones land on their end date; events happen on their start date.
      const dateStr = si.type === "milestone" ? (si.endDate || si.startDate) : (si.startDate || si.endDate);
      if (!dateStr) return;
      const done = si.status === "completed";
      const inProgress = si.status === "in_progress";
      const overdue = !done && isPastDue(new Date(dateStr));
      // Schedule items don't carry a task priority; treat milestones as high.
      const priority = si.type === "milestone" ? "high" : undefined;
      if (!passesFilters({ overdue, done, inProgress, priority })) return;

      items.push({
        id: si.id,
        title: si.name,
        date: dateStr,
        time: si.startTime || undefined,
        type: si.type as ItemType,
        status: overdue ? "overdue" : done ? "completed" : inProgress ? "in_progress" : "scheduled",
        priority: priority as ScheduleItem["priority"],
        assigneeName: si.assignedToName || undefined,
        progress: si.progress || 0,
      });
    });

    return items.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [tasks, allScheduleItems, showTasks, showMilestones, showMeetings, showInspections, showDeliveries, showCompleted, showOverdue, priorityFilter, statusFilter]);

  // ------------------------------------------------------------------
  // Configuration panel (staged draft, Morada style)
  // ------------------------------------------------------------------
  if (isConfiguring && draft) {
    const cfg = { ...widget.config, ...draft.config } as Record<string, any>;
    const dViewMode = (cfg.viewMode as ViewMode) || "list";
    const dDisplayMode = (cfg.displayMode as string) || "stacked";
    const stage = (key: string, value: unknown) =>
      setDraft(prev => prev && { ...prev, config: { ...prev.config, [key]: value } });
    const cancelConfig = () => { setDraft(null); onCloseConfig?.(); };
    const saveConfig = () => {
      onUpdate?.({
        ...widget,
        title: draft.title.trim() || widget.title,
        config: { ...widget.config, ...draft.config },
      });
      setDraft(null);
      onCloseConfig?.();
    };
    const pill = (active: boolean) =>
      cn(
        "px-3 py-1.5 rounded-md border text-[11px] font-medium",
        active
          ? "bg-[hsl(var(--primary))] text-white border-transparent"
          : "border-border text-muted-foreground hover:border-[hsl(var(--primary))]",
      );
    const showToggles: Array<{ key: string; label: string; value: boolean }> = [
      { key: "showTasks", label: "Tasks", value: cfg.showTasks !== false },
      { key: "showMilestones", label: "Milestones", value: cfg.showMilestones !== false },
      { key: "showMeetings", label: "Meetings", value: cfg.showMeetings !== false },
      { key: "showInspections", label: "Inspections", value: cfg.showInspections !== false },
      { key: "showDeliveries", label: "Deliveries", value: cfg.showDeliveries !== false },
      { key: "showOverdue", label: "Overdue items", value: cfg.showOverdue !== false },
      { key: "showCompleted", label: "Completed items", value: cfg.showCompleted === true },
    ];

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="schedule-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={draft.title}
            onChange={e => setDraft(prev => prev && { ...prev, title: e.target.value })}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            View
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              { v: "list", l: "List" },
              { v: "day", l: "Day" },
              { v: "week", l: "Week" },
              { v: "month", l: "Month" },
            ] as const).map(({ v, l }) => (
              <button key={v} className={pill(dViewMode === v)} onClick={() => stage("viewMode", v)} data-testid={`config-view-${v}`}>
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Show
          </p>
          {showToggles.map(t => (
            <div key={t.key} className="flex items-center justify-between gap-2">
              <Label className="text-xs font-normal flex items-center gap-1.5">
                {["showTasks", "showMilestones", "showMeetings", "showInspections", "showDeliveries"].includes(t.key) && (
                  <TypeDot type={t.key.replace("show", "").toLowerCase().replace(/s$/, "")} className="w-2 h-2" />
                )}
                {t.label}
              </Label>
              <Switch checked={t.value} onCheckedChange={v => stage(t.key, v)} />
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Filters
          </p>
          <Select value={cfg.priorityFilter || "all"} onValueChange={v => stage("priorityFilter", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="high">High only</SelectItem>
              <SelectItem value="medium">Medium only</SelectItem>
              <SelectItem value="low">Low only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cfg.statusFilter || "all"} onValueChange={v => stage("statusFilter", v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </section>

        {dViewMode === "list" && (
          <section>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Max items
            </p>
            <Input
              type="number"
              value={cfg.maxItems || 5}
              min={1}
              max={20}
              onChange={e => {
                const n = parseInt(e.target.value);
                if (n >= 1 && n <= 20) stage("maxItems", n);
              }}
              className="h-8 text-xs w-20"
            />
          </section>
        )}

        {(dViewMode === "day" || dViewMode === "week") && (
          <section>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Display style
            </p>
            <div className="flex gap-2">
              <button className={pill(dDisplayMode === "stacked")} onClick={() => stage("displayMode", "stacked")}>
                Stacked
              </button>
              <button className={pill(dDisplayMode === "timeline")} onClick={() => stage("displayMode", "timeline")}>
                Timeline (hourly)
              </button>
            </div>
          </section>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="button-save-config">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view schedule
      </div>
    );
  }

  const isLoading = tasksLoading || (needScheduleItems && itemsLoading);
  const isError = tasksError || (needScheduleItems && itemsError);

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-muted rounded"></div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-destructive" />
        Couldn't load the schedule
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={() => { refetchTasks(); refetchItems(); }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    if (dateOnly.getTime() === today.getTime()) return "Today";
    if (dateOnly.getTime() === tomorrow.getTime()) return "Tomorrow";
    if (dateOnly < today) {
      const daysAgo = Math.floor((today.getTime() - dateOnly.getTime()) / 86400000);
      return `${daysAgo}d overdue`;
    }
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  };

  const navigatePrev = () => {
    if (viewMode === "day") setCurrentDate(d => subDays(d, 1));
    else if (viewMode === "week") setCurrentDate(d => subWeeks(d, 1));
    else if (viewMode === "month") setCurrentDate(d => subMonths(d, 1));
  };

  const navigateNext = () => {
    if (viewMode === "day") setCurrentDate(d => addDays(d, 1));
    else if (viewMode === "week") setCurrentDate(d => addWeeks(d, 1));
    else if (viewMode === "month") setCurrentDate(d => addMonths(d, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const openItem = (item: ScheduleItem) => {
    if (item.type === "task") setSelectedTaskId(item.id);
    else setSelectedItem(item);
  };

  // Shared ‹ Today › header for day/week/month views
  const renderNavHeader = (label: React.ReactNode) => (
    <div className="flex items-center justify-between px-2 py-0.5 border-b bg-muted/30 gap-2 flex-shrink-0">
      <div className="flex items-center gap-0">
        <Button size="icon" variant="ghost" className="h-4 w-4" onClick={navigatePrev} aria-label="Previous" data-testid="schedule-nav-prev">
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-4 px-1 text-[10px]" onClick={goToToday} data-testid="schedule-nav-today">
          Today
        </Button>
        <Button size="icon" variant="ghost" className="h-4 w-4" onClick={navigateNext} aria-label="Next" data-testid="schedule-nav-next">
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">{label}</div>
    </div>
  );

  const renderListView = () => {
    // Overdue first (however old), then everything upcoming from today.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const listItems = scheduleItems
      .filter(item => item.status === "overdue" || new Date(item.date) >= today)
      .slice(0, maxItems);
    const listOverdueCount = listItems.filter(i => i.status === "overdue").length;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {listOverdueCount > 0 && (
              <Badge
                className="text-xs border-transparent"
                style={{ backgroundColor: OVERDUE.wash, color: OVERDUE.text }}
              >
                {listOverdueCount} overdue
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">Overdue &amp; upcoming</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            onClick={() => navigate(`/projects/${currentProject.id}/tasks`)}
            data-testid="schedule-widget-add"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        <div className="space-y-2">
          {listItems.map((item) => {
            const notionColors = getTypeNotionColors(item.type);
            const isOverdueItem = item.status === "overdue";
            return (
              <div
                key={item.id}
                className={cn(
                  "p-2.5 border rounded-md hover-elevate cursor-pointer",
                  item.status === "completed" && "opacity-60",
                )}
                style={isOverdueItem ? { backgroundColor: OVERDUE.wash, borderColor: OVERDUE.solid } : undefined}
                data-testid={`schedule-widget-item-${item.id}`}
                onClick={() => openItem(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.type === 'milestone' && (
                        <Flag className="h-3 w-3 flex-shrink-0" style={{ color: getTypeNotionColors("milestone").originalHex }} />
                      )}
                      {item.status === 'completed' && (
                        <CheckCircle2 className="h-3 w-3 flex-shrink-0" style={{ color: "hsl(var(--sage))" }} />
                      )}
                      {isOverdueItem && (
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" style={{ color: OVERDUE.solid }} />
                      )}
                      <TaskTooltip content={item.title}>
                        <span className="text-sm font-medium truncate cursor-default">{item.title}</span>
                      </TaskTooltip>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span style={isOverdueItem ? { color: OVERDUE.text, fontWeight: 500 } : undefined}>
                          {formatDate(item.date)}
                        </span>
                      </div>
                      {item.time && <span>{item.time}</span>}
                      {item.priority && (
                        <span className="text-data" style={{ color: getPriorityStyle(item.priority).color }}>
                          {item.priority}
                        </span>
                      )}
                    </div>
                  </div>

                  <Badge
                    className="text-data font-semibold border-transparent"
                    style={{
                      backgroundColor: notionColors.pastelBg,
                      color: notionColors.darkText,
                    }}
                  >
                    {item.type}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>

        {listItems.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nothing overdue or upcoming</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs mt-1 text-primary"
              onClick={() => navigate(`/projects/${currentProject.id}/tasks`)}
            >
              Add a task <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}

        {listItems.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs justify-between"
            onClick={() => navigate(`/projects/${currentProject.id}/calendar`)}
            data-testid="button-view-calendar"
          >
            <span>View full calendar</span>
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  };

  const renderDayView = () => {
    const dayItems = scheduleItems.filter(item =>
      isSameDay(new Date(item.date), currentDate)
    );
    const isPast = isBefore(startOfDay(currentDate), startOfDay(new Date()));

    // Separate all-day items from timed items
    const allDayItems = dayItems.filter(item => !item.time);
    const timedItems = dayItems.filter(item => item.time);

    return (
      <div className="flex flex-col h-full -m-3">
        {renderNavHeader(
          <>
            <span className="text-xs font-medium">{format(currentDate, "EEEE, MMM d")}</span>
            {isTodayInTimezone(currentDate, effectiveTimezone) && (
              <Badge variant="secondary" className="text-data px-1 py-0">Today</Badge>
            )}
          </>
        )}

        {/* All-day items section */}
        {allDayItems.length > 0 && (
          <div className="flex-shrink-0 px-3 py-1.5 border-b space-y-1 bg-muted/10 max-h-20 overflow-y-auto">
            <div className="text-data text-muted-foreground uppercase tracking-wide">All Day</div>
            <div className="flex flex-wrap gap-1">
              {allDayItems.map(item => {
                const notionColors = getTypeNotionColors(item.type);
                const overdueItem = item.status === "overdue";
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-data cursor-pointer hover-elevate"
                    style={{
                      backgroundColor: overdueItem ? OVERDUE.wash : notionColors.pastelBg,
                      border: `1px solid rgba(0,0,0,0.08)`,
                    }}
                    onClick={() => openItem(item)}
                  >
                    <TypeDot type={item.type} overdue={overdueItem} />
                    <TaskTooltip content={item.title}>
                      <span
                        className="truncate max-w-[100px] font-semibold"
                        style={{ color: overdueItem ? OVERDUE.text : notionColors.darkText }}
                      >
                        {item.title}
                      </span>
                    </TaskTooltip>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline or stacked content */}
        {displayMode === "timeline" ? (
          <div ref={timelineScrollRef} className={`flex-1 overflow-y-auto min-h-0 ${isPast ? 'opacity-60' : ''}`}>
            <div className="relative" style={{ minHeight: `${24 * HOUR_HEIGHT}px`, height: `${24 * HOUR_HEIGHT}px` }}>
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-b border-border/50"
                  style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="absolute left-2 top-1 text-data text-muted-foreground">
                    {format(new Date().setHours(hour, 0), "h a")}
                  </span>
                </div>
              ))}

              {/* Current time indicator */}
              {isTodayInTimezone(currentDate, effectiveTimezone) && (
                <div
                  className="absolute left-10 right-0 border-t-2 z-20 pointer-events-none"
                  style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px`, borderColor: OVERDUE.solid }}
                >
                  <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full" style={{ backgroundColor: OVERDUE.solid }} />
                </div>
              )}

              {/* Timed events */}
              {timedItems.map(item => {
                const startHour = parseTime(item.time);
                if (startHour === null) return null;
                const top = startHour * HOUR_HEIGHT;
                const notionColors = getTypeNotionColors(item.type);
                const overdueItem = item.status === "overdue";

                return (
                  <div
                    key={item.id}
                    className="absolute left-12 right-2 rounded-md px-2 py-1 cursor-pointer hover-elevate"
                    style={{
                      top: `${top}px`,
                      minHeight: '20px',
                      backgroundColor: overdueItem ? OVERDUE.wash : notionColors.pastelBg,
                      border: `1px solid rgba(0,0,0,0.08)`,
                      borderLeftWidth: '3px',
                      borderLeftColor: overdueItem ? OVERDUE.solid : notionColors.originalHex,
                    }}
                    onClick={() => openItem(item)}
                  >
                    <div className="flex items-center gap-1">
                      <TypeDot type={item.type} overdue={overdueItem} className="w-2 h-2" />
                      <TaskTooltip content={item.title}>
                        <span
                          className="text-table truncate flex-1 font-semibold"
                          style={{ color: overdueItem ? OVERDUE.text : notionColors.darkText }}
                        >
                          {item.title}
                        </span>
                      </TaskTooltip>
                      {item.priority && (
                        <span className="text-label" style={{ color: getPriorityStyle(item.priority).color }}>
                          {item.priority}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {dayItems.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No items scheduled
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Stacked view (simple list) */
          <div className={`flex-1 overflow-y-auto p-3 space-y-1.5 ${isPast ? 'opacity-60' : ''}`}>
            {dayItems.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No items scheduled
              </div>
            ) : (
              dayItems.map(item => {
                const overdueItem = item.status === "overdue";
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded border hover-elevate cursor-pointer"
                    style={overdueItem ? { backgroundColor: OVERDUE.wash, borderColor: OVERDUE.solid } : undefined}
                    onClick={() => openItem(item)}
                  >
                    <TypeDot type={item.type} overdue={overdueItem} className="w-2 h-2" />
                    <TaskTooltip content={item.title}>
                      <span className="text-sm flex-1 truncate">{item.title}</span>
                    </TaskTooltip>
                    {item.time && (
                      <span className="text-data text-muted-foreground">{item.time}</span>
                    )}
                    {item.priority && (
                      <span className="text-data" style={{ color: getPriorityStyle(item.priority).color }}>
                        {item.priority}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: weekStartDay });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    // Get all-day items for the week
    const weekAllDayItems = scheduleItems.filter(item => {
      const itemDate = new Date(item.date);
      return !item.time && weekDays.some(day => isSameDay(itemDate, day));
    });

    const dayChip = (item: ScheduleItem) => {
      const overdueItem = item.status === "overdue";
      const notionColors = getTypeNotionColors(item.type);
      return (
        <div
          key={item.id}
          className="flex items-center gap-0.5 px-0.5 py-0.5 rounded text-2xs cursor-pointer hover-elevate mb-0.5"
          style={{ backgroundColor: overdueItem ? OVERDUE.wash : notionColors.pastelBg }}
          title={item.title}
          onClick={() => openItem(item)}
        >
          <TypeDot type={item.type} overdue={overdueItem} className="w-1 h-1" />
          <span className="truncate" style={{ color: overdueItem ? OVERDUE.text : notionColors.darkText }}>
            {item.title}
          </span>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full -m-3">
        {renderNavHeader(
          <span className="text-xs font-medium">
            {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d")}
          </span>
        )}

        {/* Day headers row */}
        <div className="grid grid-cols-7 border-b flex-shrink-0" style={{ marginLeft: displayMode === "timeline" ? "40px" : "0" }}>
          {weekDays.map((day, idx) => {
            const isTodayDate = isToday(day);
            const isWeekend = getDay(day) === 0 || getDay(day) === 6;
            return (
              <div
                key={idx}
                className={`text-center py-1 border-r last:border-r-0 ${isTodayDate ? 'bg-primary text-primary-foreground' : isWeekend ? 'bg-muted/30' : ''}`}
              >
                <div className="flex items-center justify-center gap-1">
                  <span className={`text-xs font-semibold ${isTodayDate ? 'text-primary-foreground' : ''}`}>
                    {format(day, "d")}
                  </span>
                  <span className={`text-xs ${isTodayDate ? 'text-primary-foreground/90 font-medium' : 'text-muted-foreground'}`}>
                    {format(day, "EEE")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day items row */}
        {weekAllDayItems.length > 0 && (
          <div className="border-b flex-shrink-0 bg-muted/10" style={{ marginLeft: displayMode === "timeline" ? "40px" : "0" }}>
            <div className="grid grid-cols-7">
              {weekDays.map((day, idx) => {
                const dayAllDayItems = weekAllDayItems.filter(item => isSameDay(new Date(item.date), day));
                return (
                  <div key={idx} className="border-r last:border-r-0 p-0.5 min-h-[20px]">
                    {dayAllDayItems.slice(0, 2).map(dayChip)}
                    {dayAllDayItems.length > 2 && (
                      <div className="text-2xs text-muted-foreground text-center">+{dayAllDayItems.length - 2}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline or stacked content */}
        {displayMode === "timeline" ? (
          <div ref={timelineScrollRef} className="flex-1 overflow-y-auto min-h-0">
            <div className="flex" style={{ minHeight: `${24 * HOUR_HEIGHT}px` }}>
              {/* Hour labels column */}
              <div className="flex-shrink-0 w-10 relative">
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-b border-border/30"
                    style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="absolute left-1 top-1 text-label text-muted-foreground">
                      {format(new Date().setHours(hour, 0), "ha")}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns with time grid */}
              <div className="flex-1 grid grid-cols-7">
                {weekDays.map((day, idx) => {
                  const dayTimedItems = scheduleItems.filter(item =>
                    item.time && isSameDay(new Date(item.date), day)
                  );
                  const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                  const isTodayDate = isToday(day);

                  return (
                    <div
                      key={idx}
                      className={`relative border-r last:border-r-0 ${isPast ? 'opacity-50' : ''} ${getDay(day) === 0 || getDay(day) === 6 ? 'bg-muted/30' : ''}`}
                    >
                      {HOURS.map(hour => (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 border-b border-border/30"
                          style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                        />
                      ))}

                      {isTodayDate && (
                        <div
                          className="absolute left-0 right-0 border-t-2 z-20 pointer-events-none"
                          style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px`, borderColor: OVERDUE.solid }}
                        />
                      )}

                      {dayTimedItems.map(item => {
                        const startHour = parseTime(item.time);
                        if (startHour === null) return null;
                        const top = startHour * HOUR_HEIGHT;
                        const overdueItem = item.status === "overdue";
                        const notionColors = getTypeNotionColors(item.type);

                        return (
                          <div
                            key={item.id}
                            className="absolute left-0.5 right-0.5 rounded border px-0.5 py-0.5 cursor-pointer hover-elevate overflow-hidden"
                            style={{
                              top: `${top}px`,
                              minHeight: '16px',
                              backgroundColor: overdueItem ? OVERDUE.wash : notionColors.pastelBg,
                              borderColor: overdueItem ? OVERDUE.solid : "rgba(0,0,0,0.08)",
                            }}
                            title={item.title}
                            onClick={() => openItem(item)}
                          >
                            <div className="flex items-center gap-0.5">
                              <TypeDot type={item.type} overdue={overdueItem} />
                              <span className="text-2xs truncate" style={{ color: overdueItem ? OVERDUE.text : notionColors.darkText }}>
                                {item.title}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Stacked view */
          <div className="flex-1 grid grid-cols-7 overflow-hidden">
            {weekDays.map((day, idx) => {
              const dayItems = scheduleItems.filter(item => isSameDay(new Date(item.date), day));
              const isPast = isBefore(startOfDay(day), startOfDay(new Date()));

              return (
                <div
                  key={idx}
                  className={`flex flex-col border-r last:border-r-0 min-w-0 ${isPast ? 'opacity-50' : ''} ${getDay(day) === 0 || getDay(day) === 6 ? 'bg-muted/30' : ''}`}
                >
                  <div className="flex-1 p-0.5 space-y-0.5 overflow-y-auto">
                    {dayItems.slice(0, 5).map(dayChip)}
                    {dayItems.length > 5 && (
                      <div className="text-2xs text-muted-foreground text-center">
                        +{dayItems.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: weekStartDay });

    const weeks: Date[][] = [];
    let day = startDate;

    while (day <= monthEnd || weeks.length < 6) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      weeks.push(week);
      if (weeks.length >= 6) break;
    }

    return (
      <div className="flex flex-col h-full -m-3">
        {renderNavHeader(
          <span className="text-xs font-medium">{format(currentDate, "MMMM yyyy")}</span>
        )}

        <div className="grid grid-cols-7 border-b">
          {weeks[0].map(d => (
            <div key={d.toISOString()} className="text-center py-1 text-label text-muted-foreground uppercase border-r last:border-r-0">
              {format(d, "EEE")}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0" style={{ height: `${100 / weeks.length}%` }}>
              {week.map((day, dayIdx) => {
                const dayItems = scheduleItems.filter(item => isSameDay(new Date(item.date), day));
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDate = isToday(day);
                const isPast = isBefore(startOfDay(day), startOfDay(new Date()));

                return (
                  <div
                    key={dayIdx}
                    className={`border-r last:border-r-0 p-0.5 overflow-hidden ${
                      !isCurrentMonth ? 'bg-muted/30' : ''
                    } ${isPast && isCurrentMonth ? 'opacity-60' : ''} ${isCurrentMonth && (getDay(day) === 0 || getDay(day) === 6) ? 'bg-muted/30' : ''}`}
                  >
                    <div className={`text-data mb-0.5 ${
                      isTodayDate
                        ? 'text-primary font-bold'
                        : !isCurrentMonth
                        ? 'text-muted-foreground'
                        : ''
                    }`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 2).map(item => {
                        const overdueItem = item.status === "overdue";
                        const notionColors = getTypeNotionColors(item.type);
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-0.5 px-0.5 rounded text-2xs cursor-pointer hover-elevate"
                            style={{ backgroundColor: overdueItem ? OVERDUE.wash : notionColors.pastelBg }}
                            title={item.title}
                            onClick={() => openItem(item)}
                          >
                            <TypeDot type={item.type} overdue={overdueItem} className="w-1 h-1" />
                            <span className="truncate" style={{ color: overdueItem ? OVERDUE.text : notionColors.darkText }}>
                              {item.title}
                            </span>
                          </div>
                        );
                      })}
                      {dayItems.length > 2 && (
                        <div className="text-2xs text-muted-foreground">
                          +{dayItems.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getAssigneeInitials = (name: string | undefined) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Detail dialog for non-task items (tasks open the full TaskEditModal)
  const renderItemDetailDialog = () => (
    <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedItem?.type === 'milestone' && (
              <Flag className="h-4 w-4" style={{ color: getTypeNotionColors("milestone").originalHex }} />
            )}
            {selectedItem?.status === 'overdue' && <AlertTriangle className="h-4 w-4" style={{ color: OVERDUE.solid }} />}
            {selectedItem?.status === 'completed' && <CheckCircle2 className="h-4 w-4" style={{ color: "hsl(var(--sage))" }} />}
            <span className="truncate">{selectedItem?.title}</span>
          </DialogTitle>
        </DialogHeader>
        {selectedItem && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className="text-xs font-semibold border-transparent"
                style={{
                  backgroundColor: getTypeNotionColors(selectedItem.type).pastelBg,
                  color: getTypeNotionColors(selectedItem.type).darkText,
                }}
              >
                {selectedItem.type}
              </Badge>
              <Badge
                variant={selectedItem.status === 'overdue' ? 'destructive' : selectedItem.status === 'completed' ? 'secondary' : 'outline'}
                className="text-xs"
              >
                {selectedItem.status === 'overdue' ? 'Overdue' :
                 selectedItem.status === 'completed' ? 'Completed' :
                 selectedItem.status === 'in_progress' ? 'In Progress' : 'Scheduled'}
              </Badge>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 flex-shrink-0" />
                <span style={selectedItem.status === 'overdue' ? { color: OVERDUE.text, fontWeight: 500 } : undefined}>
                  {format(new Date(selectedItem.date), "EEEE, MMMM d, yyyy")}
                </span>
              </div>

              {selectedItem.time && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 flex-shrink-0" />
                  <span>{selectedItem.time}</span>
                </div>
              )}

              {selectedItem.assigneeName && (
                <div className="flex items-center gap-3">
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarFallback className="text-xs">
                      {getAssigneeInitials(selectedItem.assigneeName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-xs text-muted-foreground">Assigned to</div>
                    <div className="font-medium">{selectedItem.assigneeName}</div>
                  </div>
                </div>
              )}

              {selectedItem.progress !== undefined && selectedItem.progress > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Progress</span>
                    <span className="text-xs font-medium">{Math.round(selectedItem.progress)}%</span>
                  </div>
                  <Progress value={Math.min(100, Math.max(0, selectedItem.progress))} className="h-2" />
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  navigate(`/projects/${currentProject.id}/schedule`);
                  setSelectedItem(null);
                }}
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                View in Schedule
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  const modals = (
    <>
      {renderItemDetailDialog()}
      <TaskEditModal
        open={!!selectedTaskId}
        onOpenChange={open => !open && setSelectedTaskId(null)}
        task={tasks.find((t: any) => t.id === selectedTaskId)}
        taskId={selectedTaskId || undefined}
        projectId={currentProject.id}
      />
    </>
  );

  if (viewMode === "day") return <>{renderDayView()}{modals}</>;
  if (viewMode === "week") return <>{renderWeekView()}{modals}</>;
  if (viewMode === "month") return <>{renderMonthView()}{modals}</>;
  return <>{renderListView()}{modals}</>;
}

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Task, type FieldCategoryWithOptions } from "@shared/schema";
import {
  Plus, Circle, CheckSquare, ChevronDown, ChevronRight, ChevronLeft, AlertCircle, Filter, ListChecks,
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import TaskEditModal from "@/components/TaskEditModal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

type FilterPriority = "all" | string;
type SortBy = "dueDate" | "priority" | "title" | "status";
type SortOrder = "asc" | "desc";
type ViewMode = "list" | "grouped" | "board" | "week";
type GroupBy = "status" | "priority" | "assignee" | "dueDate";

const PRIORITY_DOT_CLASSES: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-blue-400",
};

// Fallback header colours (Morada palette) when a field option has no colour
const PRIORITY_HEX: Record<string, string> = {
  urgent: "#DA988A",
  high: "#DA988A",
  medium: "#D4B670",
  low: "#70CAD0",
};

const DUE_BUCKETS = [
  { key: "overdue", label: "Overdue", color: "#DA988A" },
  { key: "today", label: "Today", color: "#D4B670" },
  { key: "tomorrow", label: "Tomorrow", color: "#D4B670" },
  { key: "week", label: "This week", color: "#70CAD0" },
  { key: "later", label: "Later", color: "#82C8A2" },
  { key: "none", label: "No due date", color: null },
] as const;

function isDone(status: string | null | undefined): boolean {
  return status === "done" || status === "complete";
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dueBucketKey(task: Task): string {
  if (!task.dueDate) return "none";
  const due = new Date(task.dueDate as unknown as string);
  due.setHours(0, 0, 0, 0);
  const today = startOfToday();
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return isDone(task.status) ? "later" : "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "week";
  return "later";
}

function formatDueDate(dueDate: Date | string | null | undefined): { label: string; isOverdue: boolean } {
  if (!dueDate) return { label: "", isOverdue: false };
  const date = new Date(dueDate as string);
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) return { label: "Today", isOverdue: false };
  if (dateOnly.getTime() === tomorrow.getTime()) return { label: "Tomorrow", isOverdue: false };
  const isOverdue = dateOnly < today;
  return {
    label: date.toLocaleDateString("en-AU", { month: "short", day: "numeric" }),
    isOverdue,
  };
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

interface TaskRowProps {
  task: Task;
  statusColor?: string | null;
  onToggle: (task: Task) => void;
  onClick: (id: string) => void;
}

function TaskRow({ task, statusColor, onToggle, onClick }: TaskRowProps) {
  const completed = isDone(task.status);
  const { label: dueDateLabel, isOverdue } = formatDueDate(task.dueDate);
  const priorityDot = task.priority ? PRIORITY_DOT_CLASSES[task.priority] : null;
  const checklist = (task as any).checklist as Array<{ completed?: boolean }> | undefined;
  const checklistTotal = Array.isArray(checklist) ? checklist.length : 0;
  const checklistDone = checklistTotal ? checklist!.filter(c => c?.completed).length : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded hover-elevate cursor-pointer",
        completed && "opacity-50",
      )}
      data-testid={`task-widget-item-${task.id}`}
      onClick={() => onClick(task.id)}
    >
      <button
        className="flex-shrink-0"
        onClick={e => { e.stopPropagation(); onToggle(task); }}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
      >
        {completed
          ? <CheckSquare className="h-4 w-4 text-green-500" />
          : <Circle className="h-4 w-4 text-muted-foreground" />}
      </button>

      {statusColor && !completed && (
        <span
          className="flex-shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      )}

      {priorityDot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("flex-shrink-0 w-2 h-2 rounded-full", priorityDot)} />
          </TooltipTrigger>
          <TooltipContent side="top">
            {task.priority!.charAt(0).toUpperCase() + task.priority!.slice(1)} priority
          </TooltipContent>
        </Tooltip>
      )}

      <div className="flex-1 min-w-0">
        <TaskTooltip content={task.title}>
          <span className={cn("text-sm truncate block leading-snug", completed && "line-through")}>
            {task.title}
          </span>
        </TaskTooltip>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {checklistTotal > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <ListChecks className="h-3 w-3" />
            {checklistDone}/{checklistTotal}
          </span>
        )}
        {dueDateLabel && (
          <span className={cn(
            "text-xs flex items-center gap-0.5",
            isOverdue && !completed ? "text-destructive" : "text-muted-foreground",
          )}>
            {isOverdue && !completed && <AlertCircle className="h-3 w-3" />}
            {dueDateLabel}
          </span>
        )}
        {task.assigneeName && (
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px]">{getInitials(task.assigneeName)}</AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}

interface BoardCardProps {
  task: Task;
  onToggle: (task: Task) => void;
  onClick: (id: string) => void;
}

function BoardCard({ task, onToggle, onClick }: BoardCardProps) {
  const completed = isDone(task.status);
  const { label: dueDateLabel, isOverdue } = formatDueDate(task.dueDate);

  return (
    <div
      className={cn(
        "rounded-md border bg-card px-2 py-1.5 cursor-pointer hover-elevate space-y-1",
        completed && "opacity-50",
      )}
      data-testid={`task-board-card-${task.id}`}
      onClick={() => onClick(task.id)}
    >
      <div className="flex items-start gap-1.5">
        <button
          className="flex-shrink-0 mt-0.5"
          onClick={e => { e.stopPropagation(); onToggle(task); }}
          aria-label={completed ? "Mark incomplete" : "Mark complete"}
        >
          {completed
            ? <CheckSquare className="h-3.5 w-3.5 text-green-500" />
            : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        <span className={cn("text-xs leading-snug line-clamp-2 min-w-0", completed && "line-through")}>
          {task.title}
        </span>
      </div>
      {(dueDateLabel || task.assigneeName) && (
        <div className="flex items-center justify-between gap-1 pl-5">
          <span className={cn(
            "text-[10px]",
            isOverdue && !completed ? "text-destructive" : "text-muted-foreground",
          )}>
            {dueDateLabel}
          </span>
          {task.assigneeName && (
            <Avatar className="h-4 w-4">
              <AvatarFallback className="text-[8px]">{getInitials(task.assigneeName)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
    </div>
  );
}

export default function TasksWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId, onSetHeaderActions }: WidgetProps) {
  const [, setLocation] = useLocation();
  const { currentProject } = useProject();
  const { user } = useAuth();
  // The dashboard doesn't pass userId, so resolve the current user ourselves.
  const currentUserId = userId || (user as any)?.id;

  // Legacy config values: displayMode "flat" → "list", old "grouped" keeps status grouping
  const rawMode = widget.config?.displayMode as string | undefined;
  const viewMode: ViewMode =
    rawMode === "flat" || rawMode === "list" ? "list"
    : rawMode === "board" ? "board"
    : rawMode === "week" ? "week"
    : "grouped";
  const groupBy = (widget.config?.groupBy as GroupBy) || "status";
  const maxItems = (widget.config?.maxItems as number) || 8;
  const myTasksOnly = widget.config?.myTasksOnly === true;
  const showCompletedDefault = widget.config?.showCompleted !== false;
  // Due-date range toggles (union; none active = show all tasks)
  const dateRange = (widget.config?.dateRange as {
    thisWeek?: boolean; nextWeek?: boolean; custom?: boolean;
    daysBehind?: number; daysAhead?: number;
  }) || {};
  const drThisWeek = dateRange.thisWeek === true;
  const drNextWeek = dateRange.nextWeek === true;
  const drCustom = dateRange.custom === true;
  const drBehind = dateRange.daysBehind ?? 7;
  const drAhead = dateRange.daysAhead ?? 7;
  const defaultFilterPriority = (widget.config?.defaultFilterPriority as FilterPriority) || "all";
  const defaultSortBy = (widget.config?.defaultSortBy as SortBy) || "dueDate";
  const defaultSortOrder = (widget.config?.defaultSortOrder as SortOrder) || "asc";

  // Session-level filter overrides (seeded from persisted config defaults)
  const [showCompleted, setShowCompleted] = useState(showCompletedDefault);
  const [filterPriority, setFilterPriority] = useState<FilterPriority>(defaultFilterPriority);
  const [sortBy, setSortBy] = useState<SortBy>(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editingTitle, setEditingTitle] = useState(widget.title);

  useEffect(() => { setEditingTitle(widget.title); }, [widget.title]);
  useEffect(() => { setShowCompleted(showCompletedDefault); }, [showCompletedDefault]);
  useEffect(() => { setFilterPriority(defaultFilterPriority); }, [defaultFilterPriority]);
  useEffect(() => { setSortBy(defaultSortBy); }, [defaultSortBy]);
  useEffect(() => { setSortOrder(defaultSortOrder); }, [defaultSortOrder]);

  const updateConfig = (patch: Record<string, unknown>) =>
    onUpdate?.({ ...widget, config: { ...widget.config, ...patch } });

  const commitTitle = () => {
    if (editingTitle.trim() && editingTitle !== widget.title) {
      onUpdate?.({ ...widget, title: editingTitle.trim() });
    }
  };

  const { data: allTasks = [], isLoading, isError, refetch } = useQuery<Task[]>({
    queryKey: ["/api/tasks", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const r = await fetch(`/api/tasks?projectId=${currentProject.id}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id,
  });

  // Task statuses/priorities live in field categories; tasks store the option KEY.
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
    staleTime: 5 * 60 * 1000,
  });

  const statusOptions = useMemo(() => {
    const options = fieldCategories.find(cat => cat.key === "task.status")?.options || [];
    return options
      .filter(o => o.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [fieldCategories]);

  const priorityOptions = useMemo(() => {
    const options = fieldCategories.find(cat => cat.key === "task.priority")?.options || [];
    const active = options
      .filter(o => o.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (active.length > 0) return active.map(o => ({ key: o.key, name: o.name, color: o.color }));
    return [
      { key: "high", name: "High", color: PRIORITY_HEX.high },
      { key: "medium", name: "Medium", color: PRIORITY_HEX.medium },
      { key: "low", name: "Low", color: PRIORITY_HEX.low },
    ];
  }, [fieldCategories]);

  const statusColorByKey = useMemo(() => {
    const map: Record<string, string | null> = {};
    statusOptions.forEach(o => { map[o.key] = o.color; });
    return map;
  }, [statusOptions]);

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => { await apiRequest(`/api/tasks/${taskId}`, "DELETE"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); setSelectedTaskId(null); },
  });

  // Optimistic complete-toggle: flip immediately, roll back on error. The DB is
  // ~400ms away, so waiting for the round trip makes the checkbox feel broken.
  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = isDone(task.status) ? "todo" : "done";
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onMutate: async (task: Task) => {
      const key = ["/api/tasks", currentProject?.id];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      queryClient.setQueryData<Task[]>(key, old =>
        (old || []).map(t =>
          t.id === task.id ? { ...t, status: isDone(task.status) ? "todo" : "done" } : t,
        ),
      );
      return { previous, key };
    },
    onError: (_err, _task, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); },
  });

  const processedTasks = useMemo(() => {
    let tasks = [...allTasks];

    if (myTasksOnly && currentUserId) {
      tasks = tasks.filter(t => {
        const single = (t as any).assigneeId === currentUserId;
        const multi = Array.isArray((t as any).assigneeIds) && (t as any).assigneeIds.includes(currentUserId);
        return single || multi;
      });
    }

    if (filterPriority !== "all") {
      tasks = tasks.filter(t => t.priority === filterPriority);
    }

    // Week view is already a date range, so the toggles only apply elsewhere
    if ((drThisWeek || drNextWeek || drCustom) && viewMode !== "week") {
      const today = startOfToday();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);
      const nextSunday = new Date(monday);
      nextSunday.setDate(monday.getDate() + 13);
      const customFrom = new Date(today);
      customFrom.setDate(today.getDate() - drBehind);
      const customTo = new Date(today);
      customTo.setDate(today.getDate() + drAhead);

      tasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate as unknown as string);
        due.setHours(0, 0, 0, 0);
        if (drThisWeek && due >= monday && due <= sunday) return true;
        if (drNextWeek && due >= nextMonday && due <= nextSunday) return true;
        if (drCustom && due >= customFrom && due <= customTo) return true;
        return false;
      });
    }

    tasks.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "dueDate": {
          const dA = a.dueDate ? new Date(a.dueDate as string).getTime() : (sortOrder === "asc" ? Infinity : -Infinity);
          const dB = b.dueDate ? new Date(b.dueDate as string).getTime() : (sortOrder === "asc" ? Infinity : -Infinity);
          cmp = dA - dB;
          break;
        }
        case "priority": {
          const po: Record<string, number> = {};
          priorityOptions.forEach((p, i) => { po[p.key] = i; });
          cmp = (po[a.priority ?? ""] ?? 99) - (po[b.priority ?? ""] ?? 99);
          break;
        }
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status": {
          const so: Record<string, number> = {};
          statusOptions.forEach((s, i) => { so[s.key] = i; });
          cmp = (so[a.status ?? ""] ?? 99) - (so[b.status ?? ""] ?? 99);
          break;
        }
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return tasks;
  }, [allTasks, myTasksOnly, currentUserId, filterPriority, sortBy, sortOrder, statusOptions, priorityOptions, drThisWeek, drNextWeek, drCustom, drBehind, drAhead, viewMode]);

  const visibleTasks = useMemo(() => {
    if (showCompleted) return processedTasks;
    return processedTasks.filter(t => !isDone(t.status));
  }, [processedTasks, showCompleted]);

  const cappedTasks = useMemo(() => visibleTasks.slice(0, maxItems), [visibleTasks, maxItems]);
  const hasMore = visibleTasks.length > maxItems;

  interface Section { key: string; label: string; color: string | null; tasks: Task[] }

  const groupedSections = useMemo((): Section[] | null => {
    if (viewMode !== "grouped" && viewMode !== "board") return null;

    // Board caps per column instead of globally, and keeps empty columns
    // so the pipeline stays visible.
    const source = viewMode === "board" ? visibleTasks : cappedTasks;
    let sections: Section[] = [];
    if (groupBy === "status") {
      sections = statusOptions.map(s => ({
        key: s.key,
        label: s.name,
        color: s.color,
        tasks: source.filter(t => t.status === s.key),
      }));
      const known = new Set(statusOptions.map(s => s.key));
      const other = source.filter(t => !known.has(t.status ?? ""));
      if (other.length) sections.push({ key: "__other__", label: "Other", color: null, tasks: other });
    } else if (groupBy === "priority") {
      sections = priorityOptions.map(p => ({
        key: p.key,
        label: p.name,
        color: p.color || PRIORITY_HEX[p.key] || null,
        tasks: source.filter(t => t.priority === p.key),
      }));
      const known = new Set(priorityOptions.map(p => p.key));
      const none = source.filter(t => !known.has(t.priority ?? ""));
      if (none.length) sections.push({ key: "__none__", label: "No priority", color: null, tasks: none });
    } else if (groupBy === "assignee") {
      const byName = new Map<string, Task[]>();
      const unassigned: Task[] = [];
      source.forEach(t => {
        const name = t.assigneeName?.trim();
        if (!name) { unassigned.push(t); return; }
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name)!.push(t);
      });
      sections = Array.from(byName.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, tasks]) => ({ key: name, label: name, color: null, tasks }));
      if (unassigned.length) sections.push({ key: "__unassigned__", label: "Unassigned", color: null, tasks: unassigned });
    } else {
      sections = DUE_BUCKETS.map(b => ({
        key: b.key,
        label: b.label,
        color: b.color,
        tasks: source.filter(t => dueBucketKey(t) === b.key),
      }));
    }

    // Assignee columns are derived from tasks, so empty ones can't exist anyway
    if (viewMode === "board") return sections;
    return sections.filter(s => s.tasks.length > 0);
  }, [cappedTasks, visibleTasks, viewMode, groupBy, statusOptions, priorityOptions]);

  // Week view: Monday-start week (AU), offset by weekOffset weeks
  const weekDays = useMemo(() => {
    const today = startOfToday();
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const tasksByDay = useMemo(() => {
    if (viewMode !== "week") return null;
    return weekDays.map(day => ({
      day,
      tasks: visibleTasks.filter(t => {
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate as unknown as string);
        return due.getFullYear() === day.getFullYear()
          && due.getMonth() === day.getMonth()
          && due.getDate() === day.getDate();
      }),
    }));
  }, [viewMode, weekDays, visibleTasks]);

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Header row: [+ add] [filter] … [⋮ configure menu] (menu is rendered by the card)
  useEffect(() => {
    onSetHeaderActions?.(
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="default"
              className="h-6 w-6"
              onClick={() => setCreateOpen(true)}
              data-testid="tasks-widget-add"
              aria-label="Add task"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Add task</TooltipContent>
        </Tooltip>
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label="Filter tasks"
                  data-testid="tasks-widget-filter"
                >
                  <Filter className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">Filter</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-56 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-normal text-muted-foreground">Show completed</Label>
              <Switch
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
                data-testid="tasks-filter-show-completed"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={filterPriority} onValueChange={v => setFilterPriority(v as FilterPriority)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {priorityOptions.map(p => (
                    <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sort by</Label>
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dueDate">Due date</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Order</Label>
              <Select value={sortOrder} onValueChange={v => setSortOrder(v as SortOrder)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, filterOpen, showCompleted, filterPriority, sortBy, sortOrder, priorityOptions]);

  // ------------------------------------------------------------------
  // Inline configuration panel (instant apply, Morada style)
  // ------------------------------------------------------------------
  if (isConfiguring) {
    const pill = (active: boolean) =>
      cn(
        "px-3 py-1.5 rounded-md border text-[11px] font-medium",
        active
          ? "bg-[hsl(var(--primary))] text-white border-transparent"
          : "border-border text-muted-foreground hover:border-[hsl(var(--primary))]",
      );

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="tasks-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={editingTitle}
            onChange={e => setEditingTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === "Enter") commitTitle(); }}
            className="h-8 text-xs"
            placeholder="Widget title"
            data-testid="config-input-title"
          />
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            View
          </p>
          <div className="flex flex-wrap gap-2">
            {([
              { v: "list", l: "List" },
              { v: "grouped", l: "Grouped" },
              { v: "board", l: "Board" },
              { v: "week", l: "Week" },
            ] as const).map(({ v, l }) => (
              <button key={v} className={pill(viewMode === v)} onClick={() => updateConfig({ displayMode: v })} data-testid={`config-view-${v}`}>
                {l}
              </button>
            ))}
          </div>
        </section>

        {(viewMode === "grouped" || viewMode === "board") && (
          <section>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Group by
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                { v: "status", l: "Status" },
                { v: "priority", l: "Priority" },
                { v: "assignee", l: "Assignee" },
                { v: "dueDate", l: "Due date" },
              ] as const).map(({ v, l }) => (
                <button key={v} className={pill(groupBy === v)} onClick={() => updateConfig({ groupBy: v })} data-testid={`config-groupby-${v}`}>
                  {l}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Date range
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={pill(drThisWeek)}
              onClick={() => updateConfig({ dateRange: { ...dateRange, thisWeek: !drThisWeek } })}
              data-testid="config-range-thisweek"
            >
              This week
            </button>
            <button
              className={pill(drNextWeek)}
              onClick={() => updateConfig({ dateRange: { ...dateRange, nextWeek: !drNextWeek } })}
              data-testid="config-range-nextweek"
            >
              Next week
            </button>
            <button
              className={pill(drCustom)}
              onClick={() => updateConfig({ dateRange: { ...dateRange, custom: !drCustom } })}
              data-testid="config-range-custom"
            >
              Custom
            </button>
          </div>
          {drCustom && (
            <div className="flex items-end gap-2 mt-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Days behind</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  className="w-20 h-8 text-xs"
                  value={drBehind}
                  onChange={e => {
                    const n = parseInt(e.target.value);
                    if (n >= 0 && n <= 365) updateConfig({ dateRange: { ...dateRange, daysBehind: n } });
                  }}
                  data-testid="config-range-behind"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Days ahead</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  className="w-20 h-8 text-xs"
                  value={drAhead}
                  onChange={e => {
                    const n = parseInt(e.target.value);
                    if (n >= 0 && n <= 365) updateConfig({ dateRange: { ...dateRange, daysAhead: n } });
                  }}
                  data-testid="config-range-ahead"
                />
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Nothing selected shows all tasks. Tasks without a due date are hidden while a range is active.
          </p>
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Show
          </p>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Completed tasks</Label>
            <Switch
              checked={showCompletedDefault}
              onCheckedChange={v => updateConfig({ showCompleted: v })}
              data-testid="config-show-completed"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Only tasks assigned to me</Label>
            <Switch
              checked={myTasksOnly}
              onCheckedChange={v => updateConfig({ myTasksOnly: v })}
              data-testid="config-my-tasks"
            />
          </div>
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Max tasks
          </p>
          <Input
            type="number"
            min={1}
            max={50}
            className="w-24 h-8 text-xs"
            value={maxItems}
            onChange={e => {
              const n = parseInt(e.target.value);
              if (n >= 1 && n <= 50) updateConfig({ maxItems: n });
            }}
            data-testid="config-max-items"
          />
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Default sort
          </p>
          <Select value={defaultSortBy} onValueChange={v => updateConfig({ defaultSortBy: v })}>
            <SelectTrigger className="h-8 text-xs" data-testid="config-select-sort-by"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="dueDate">Due date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <button className={pill(defaultSortOrder === "asc")} onClick={() => updateConfig({ defaultSortOrder: "asc" })}>
              Ascending
            </button>
            <button className={pill(defaultSortOrder === "desc")} onClick={() => updateConfig({ defaultSortOrder: "desc" })}>
              Descending
            </button>
          </div>
        </section>

        <div className="flex justify-end pt-1">
          <Button size="sm" className="h-7 px-3 text-xs" onClick={() => onCloseConfig?.()} data-testid="button-done-config">
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        Select a project to view tasks
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full gap-2">
        <div className="space-y-1.5 flex-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex items-center gap-2 px-2 py-1.5 rounded border">
              <div className="h-4 w-4 bg-muted rounded" />
              <div className="h-3.5 bg-muted rounded flex-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-destructive" />
        Couldn't load tasks
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full gap-1">
        <div className="flex-1 overflow-auto">
          {viewMode === "board" && groupedSections ? (
            <div className="flex gap-2 h-full overflow-x-auto pb-1">
              {groupedSections.map(section => (
                <div key={section.key} className="flex flex-col flex-shrink-0 w-[150px]">
                  <div className="flex items-center gap-1.5 px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                    {section.color && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
                    )}
                    <span className="truncate">{section.label}</span>
                    <span className="ml-auto flex-shrink-0">{section.tasks.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1 px-0.5">
                    {section.tasks.slice(0, maxItems).map(task => (
                      <BoardCard
                        key={task.id}
                        task={task}
                        onToggle={t => toggleTaskMutation.mutate(t)}
                        onClick={id => setSelectedTaskId(id)}
                      />
                    ))}
                    {section.tasks.length > maxItems && (
                      <button
                        className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1 text-center"
                        onClick={() => setLocation(`/projects/${currentProject.id}/tasks`)}
                      >
                        +{section.tasks.length - maxItems} more
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : viewMode === "week" && tasksByDay ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between pb-1.5 px-1">
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setWeekOffset(o => o - 1)} aria-label="Previous week">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <button
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setWeekOffset(0)}
                  title="Back to this week"
                >
                  {weekDays[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  {" – "}
                  {weekDays[6].toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </button>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setWeekOffset(o => o + 1)} aria-label="Next week">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex gap-1.5 flex-1 overflow-x-auto pb-1">
                {tasksByDay.map(({ day, tasks }) => {
                  const isToday = day.getTime() === startOfToday().getTime();
                  return (
                    <div key={day.toISOString()} className="flex flex-col flex-shrink-0 w-[110px]">
                      <div className={cn(
                        "text-[10px] font-medium pb-1 px-1 text-center",
                        isToday ? "text-primary font-semibold" : "text-muted-foreground",
                      )}>
                        {day.toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })}
                        {tasks.length > 0 && ` · ${tasks.length}`}
                      </div>
                      <div className={cn(
                        "flex-1 overflow-y-auto space-y-1 px-0.5 rounded-md",
                        isToday && "bg-muted/40",
                      )}>
                        {tasks.slice(0, maxItems).map(task => (
                          <BoardCard
                            key={task.id}
                            task={task}
                            onToggle={t => toggleTaskMutation.mutate(t)}
                            onClick={id => setSelectedTaskId(id)}
                          />
                        ))}
                        {tasks.length > maxItems && (
                          <button
                            className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1 text-center"
                            onClick={() => setLocation(`/projects/${currentProject.id}/tasks`)}
                          >
                            +{tasks.length - maxItems} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : cappedTasks.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {allTasks.length === 0
                ? "No tasks yet — click + to add one"
                : "No tasks match the current filters"}
            </div>
          ) : viewMode === "grouped" && groupedSections ? (
            <div className="space-y-1">
              {groupedSections.map(section => {
                const isCollapsed = collapsedSections.has(section.key);
                return (
                  <div key={section.key}>
                    <button
                      className="flex items-center gap-1.5 w-full text-xs font-medium text-muted-foreground py-1 px-1 hover:text-foreground"
                      onClick={() => toggleSection(section.key)}
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-3 w-3 flex-shrink-0" />
                        : <ChevronDown className="h-3 w-3 flex-shrink-0" />}
                      {section.color && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
                      )}
                      {section.label} · {section.tasks.length}
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-0.5">
                        {section.tasks.map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onToggle={t => toggleTaskMutation.mutate(t)}
                            onClick={id => setSelectedTaskId(id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              {cappedTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  statusColor={statusColorByKey[task.status ?? ""] || null}
                  onToggle={t => toggleTaskMutation.mutate(t)}
                  onClick={id => setSelectedTaskId(id)}
                />
              ))}
            </div>
          )}

          {(viewMode === "list" || viewMode === "grouped") && hasMore && (
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center"
              onClick={() => setLocation(`/projects/${currentProject.id}/tasks`)}
            >
              Showing {cappedTasks.length} of {visibleTasks.length} · View all →
            </button>
          )}
        </div>

        <TaskEditModal
          open={!!selectedTaskId}
          onOpenChange={open => !open && setSelectedTaskId(null)}
          task={allTasks.find(t => t.id === selectedTaskId)}
          taskId={selectedTaskId || undefined}
          projectId={currentProject.id}
          onDelete={taskId => deleteTaskMutation.mutate(taskId)}
        />

        <TaskEditModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          projectId={currentProject.id}
        />
      </div>
    </>
  );
}

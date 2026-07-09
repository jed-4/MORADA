import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import {
  Plus, Circle, CheckSquare, ChevronDown, ChevronRight, Eye, EyeOff, AlertCircle,
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import TaskEditModal from "@/components/TaskEditModal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

type FilterStatus = "all" | "todo" | "in_progress" | "done";
type FilterPriority = "all" | "low" | "medium" | "high";
type SortBy = "dueDate" | "priority" | "title" | "status";
type SortOrder = "asc" | "desc";
type DisplayMode = "grouped" | "flat";

const STATUS_TABS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

const STATUS_ORDER = ["todo", "in_progress", "done"] as const;

const PRIORITY_DOT_CLASSES: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-blue-400",
};

function formatDueDate(dueDate: Date | string | null | undefined): { label: string; isOverdue: boolean } {
  if (!dueDate) return { label: "", isOverdue: false };
  const date = new Date(dueDate as string);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
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
  onToggle: (task: Task) => void;
  onClick: (id: string) => void;
}

function TaskRow({ task, onToggle, onClick }: TaskRowProps) {
  const isCompleted = task.status === "done" || task.status === "complete";
  const { label: dueDateLabel, isOverdue } = formatDueDate(task.dueDate);
  const priorityDot = task.priority ? PRIORITY_DOT_CLASSES[task.priority] : null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded hover-elevate cursor-pointer",
        isCompleted && "opacity-50",
      )}
      data-testid={`task-widget-item-${task.id}`}
      onClick={() => onClick(task.id)}
    >
      <button
        className="flex-shrink-0"
        onClick={e => { e.stopPropagation(); onToggle(task); }}
        aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
      >
        {isCompleted
          ? <CheckSquare className="h-4 w-4 text-green-500" />
          : <Circle className="h-4 w-4 text-muted-foreground" />}
      </button>

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
          <span className={cn("text-sm truncate block leading-snug", isCompleted && "line-through")}>
            {task.title}
          </span>
        </TaskTooltip>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {dueDateLabel && (
          <span className={cn(
            "text-xs flex items-center gap-0.5",
            isOverdue ? "text-destructive" : "text-muted-foreground",
          )}>
            {isOverdue && <AlertCircle className="h-3 w-3" />}
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

export default function TasksWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [, setLocation] = useLocation();
  const { currentProject } = useProject();

  const displayMode = (widget.config?.displayMode as DisplayMode) || "grouped";
  const showStatusTabs = widget.config?.showStatusTabs !== false;
  const showSummaryBar = widget.config?.showSummaryBar !== false;
  const maxItems = (widget.config?.maxItems as number) || 8;
  const myTasksOnly = widget.config?.myTasksOnly === true;
  const defaultFilterStatus = (widget.config?.defaultFilterStatus as FilterStatus) || "all";
  const defaultFilterPriority = (widget.config?.defaultFilterPriority as FilterPriority) || "all";
  const defaultSortBy = (widget.config?.defaultSortBy as SortBy) || "dueDate";
  const defaultSortOrder = (widget.config?.defaultSortOrder as SortOrder) || "asc";

  const [activeTab, setActiveTab] = useState<FilterStatus>(defaultFilterStatus);
  const [showCompleted, setShowCompleted] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configDisplayMode, setConfigDisplayMode] = useState<DisplayMode>(displayMode);
  const [configShowStatusTabs, setConfigShowStatusTabs] = useState(showStatusTabs);
  const [configShowSummaryBar, setConfigShowSummaryBar] = useState(showSummaryBar);
  const [configMaxItems, setConfigMaxItems] = useState(maxItems);
  const [configMyTasksOnly, setConfigMyTasksOnly] = useState(myTasksOnly);
  const [configFilterStatus, setConfigFilterStatus] = useState<FilterStatus>(defaultFilterStatus);
  const [configFilterPriority, setConfigFilterPriority] = useState<FilterPriority>(defaultFilterPriority);
  const [configSortBy, setConfigSortBy] = useState<SortBy>(defaultSortBy);
  const [configSortOrder, setConfigSortOrder] = useState<SortOrder>(defaultSortOrder);

  useEffect(() => {
    setActiveTab((widget.config?.defaultFilterStatus as FilterStatus) || "all");
    setEditingTitle(widget.title);
    setConfigDisplayMode((widget.config?.displayMode as DisplayMode) || "grouped");
    setConfigShowStatusTabs(widget.config?.showStatusTabs !== false);
    setConfigShowSummaryBar(widget.config?.showSummaryBar !== false);
    setConfigMaxItems((widget.config?.maxItems as number) || 8);
    setConfigMyTasksOnly(widget.config?.myTasksOnly === true);
    setConfigFilterStatus((widget.config?.defaultFilterStatus as FilterStatus) || "all");
    setConfigFilterPriority((widget.config?.defaultFilterPriority as FilterPriority) || "all");
    setConfigSortBy((widget.config?.defaultSortBy as SortBy) || "dueDate");
    setConfigSortOrder((widget.config?.defaultSortOrder as SortOrder) || "asc");
  }, [widget.config, widget.title]);

  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const r = await fetch(`/api/tasks?projectId=${currentProject.id}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id,
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => { await apiRequest(`/api/tasks/${taskId}`, "DELETE"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); setSelectedTaskId(null); },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === "done" || task.status === "complete" ? "todo" : "done";
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tasks", currentProject?.id] }); },
  });

  const handleSaveConfig = () => {
    if (onUpdate) {
      onUpdate({
        ...widget,
        title: editingTitle,
        config: {
          ...widget.config,
          displayMode: configDisplayMode,
          showStatusTabs: configShowStatusTabs,
          showSummaryBar: configShowSummaryBar,
          maxItems: configMaxItems,
          myTasksOnly: configMyTasksOnly,
          defaultFilterStatus: configFilterStatus,
          defaultFilterPriority: configFilterPriority,
          defaultSortBy: configSortBy,
          defaultSortOrder: configSortOrder,
        },
      });
    }
    onCloseConfig?.();
  };

  const processedTasks = useMemo(() => {
    let tasks = [...allTasks];

    if (myTasksOnly && userId) {
      tasks = tasks.filter(t => (t as any).assigneeId === userId);
    }

    if (defaultFilterPriority !== "all") {
      tasks = tasks.filter(t => t.priority === defaultFilterPriority);
    }

    tasks.sort((a, b) => {
      let cmp = 0;
      switch (defaultSortBy) {
        case "dueDate": {
          const dA = a.dueDate ? new Date(a.dueDate as string).getTime() : (defaultSortOrder === "asc" ? Infinity : -Infinity);
          const dB = b.dueDate ? new Date(b.dueDate as string).getTime() : (defaultSortOrder === "asc" ? Infinity : -Infinity);
          cmp = dA - dB;
          break;
        }
        case "priority": {
          const po = { high: 0, medium: 1, low: 2 } as Record<string, number>;
          cmp = (po[a.priority ?? ""] ?? 3) - (po[b.priority ?? ""] ?? 3);
          break;
        }
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status": {
          const so = { todo: 0, in_progress: 1, done: 2 } as Record<string, number>;
          cmp = (so[a.status ?? ""] ?? 3) - (so[b.status ?? ""] ?? 3);
          break;
        }
      }
      return defaultSortOrder === "asc" ? cmp : -cmp;
    });

    return tasks;
  }, [allTasks, myTasksOnly, userId, defaultFilterPriority, defaultSortBy, defaultSortOrder]);

  const overdueCount = useMemo(() =>
    processedTasks.filter(t => {
      if (t.status === "done" || t.status === "complete") return false;
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate as string);
      d.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return d < today;
    }).length, [processedTasks]);

  const inProgressCount = useMemo(() =>
    processedTasks.filter(t => t.status === "in_progress").length, [processedTasks]);

  const tabFilteredTasks = useMemo(() => {
    if (activeTab === "all") return processedTasks;
    return processedTasks.filter(t => t.status === activeTab);
  }, [processedTasks, activeTab]);

  const visibleTasks = useMemo(() => {
    if (showCompleted) return tabFilteredTasks;
    return tabFilteredTasks.filter(t => t.status !== "done" && t.status !== "complete");
  }, [tabFilteredTasks, showCompleted]);

  const cappedTasks = useMemo(() => visibleTasks.slice(0, maxItems), [visibleTasks, maxItems]);
  const hasMore = visibleTasks.length > maxItems;

  const groupedSections = useMemo(() => {
    if (displayMode !== "grouped") return null;
    return STATUS_ORDER.map(status => ({
      status,
      label: STATUS_LABELS[status],
      tasks: cappedTasks.filter(t => t.status === status),
    })).filter(s => s.tasks.length > 0);
  }, [cappedTasks, displayMode]);

  const toggleSection = (status: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full gap-2">
        <div className="text-sm text-muted-foreground">Loading tasks...</div>
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

  return (
    <>
      <div className="flex flex-col h-full gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            {visibleTasks.length} task{visibleTasks.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowCompleted(v => !v)}
                  aria-label={showCompleted ? "Hide completed" : "Show completed"}
                >
                  {showCompleted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{showCompleted ? "Hide completed" : "Show completed"}</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLocation(currentProject?.id ? `/projects/${currentProject.id}/tasks` : "/tasks")}
              data-testid="tasks-widget-add"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {showStatusTabs && (
          <div className="flex gap-1 flex-wrap">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-full border transition-colors",
                  activeTab === tab.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {showSummaryBar && (overdueCount > 0 || inProgressCount > 0) && (
          <p className="text-xs text-muted-foreground leading-none">
            {[
              overdueCount > 0 && <span key="ov" className="text-destructive">{overdueCount} overdue</span>,
              inProgressCount > 0 && <span key="ip">{inProgressCount} in progress</span>,
            ].filter(Boolean).reduce<React.ReactNode[]>((acc, el, i) => {
              if (i > 0) acc.push(" · ");
              acc.push(el);
              return acc;
            }, [])}
          </p>
        )}

        <div className="flex-1 overflow-auto">
          {cappedTasks.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No tasks match the current filters
            </div>
          ) : displayMode === "grouped" && groupedSections ? (
            <div className="space-y-1">
              {groupedSections.map(section => {
                const isCollapsed = collapsedSections.has(section.status);
                return (
                  <div key={section.status}>
                    <button
                      className="flex items-center gap-1 w-full text-xs font-medium text-muted-foreground py-1 px-1 hover:text-foreground"
                      onClick={() => toggleSection(section.status)}
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-3 w-3 flex-shrink-0" />
                        : <ChevronDown className="h-3 w-3 flex-shrink-0" />}
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
                  onToggle={t => toggleTaskMutation.mutate(t)}
                  onClick={id => setSelectedTaskId(id)}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground py-2 text-center"
              onClick={() => setLocation(currentProject?.id ? `/projects/${currentProject.id}/tasks` : "/tasks")}
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
          onDelete={taskId => deleteTaskMutation.mutate(taskId)}
        />
      </div>

      <Dialog open={isConfiguring} onOpenChange={open => !open && onCloseConfig?.()}>
        <DialogContent data-testid="tasks-widget-config-dialog">
          <DialogHeader>
            <DialogTitle>Configure Tasks Widget</DialogTitle>
            <DialogDescription>Set display, filters and sorting for this widget</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Widget Name</Label>
              <Input value={editingTitle} onChange={e => setEditingTitle(e.target.value)} placeholder="Widget title" data-testid="config-input-title" />
            </div>
            <div className="space-y-2">
              <Label>Display Mode</Label>
              <Select value={configDisplayMode} onValueChange={v => setConfigDisplayMode(v as DisplayMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grouped">Grouped by status</SelectItem>
                  <SelectItem value="flat">Flat list</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cfg-tabs"
                checked={configShowStatusTabs}
                onCheckedChange={v => setConfigShowStatusTabs(!!v)}
              />
              <Label htmlFor="cfg-tabs" className="cursor-pointer font-normal">Show status filter tabs</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cfg-summary"
                checked={configShowSummaryBar}
                onCheckedChange={v => setConfigShowSummaryBar(!!v)}
              />
              <Label htmlFor="cfg-summary" className="cursor-pointer font-normal">Show overdue / in-progress summary bar</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="cfg-mytasks"
                checked={configMyTasksOnly}
                onCheckedChange={v => setConfigMyTasksOnly(!!v)}
              />
              <Label htmlFor="cfg-mytasks" className="cursor-pointer font-normal">Show only tasks assigned to me</Label>
            </div>
            <div className="space-y-2">
              <Label>Max tasks to show</Label>
              <Input
                type="number"
                min={1}
                max={50}
                className="w-24"
                value={configMaxItems}
                onChange={e => setConfigMaxItems(parseInt(e.target.value) || 8)}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Status Filter</Label>
              <Select value={configFilterStatus} onValueChange={v => setConfigFilterStatus(v as FilterStatus)}>
                <SelectTrigger data-testid="config-select-filter-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default Priority Filter</Label>
              <Select value={configFilterPriority} onValueChange={v => setConfigFilterPriority(v as FilterPriority)}>
                <SelectTrigger data-testid="config-select-filter-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort By</Label>
              <Select value={configSortBy} onValueChange={v => setConfigSortBy(v as SortBy)}>
                <SelectTrigger data-testid="config-select-sort-by"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dueDate">Due Date</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Select value={configSortOrder} onValueChange={v => setConfigSortOrder(v as SortOrder)}>
                <SelectTrigger data-testid="config-select-sort-order"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfigDisplayMode(displayMode);
                setConfigShowStatusTabs(showStatusTabs);
                setConfigShowSummaryBar(showSummaryBar);
                setConfigMaxItems(maxItems);
                setConfigMyTasksOnly(myTasksOnly);
                setConfigFilterStatus(defaultFilterStatus);
                setConfigFilterPriority(defaultFilterPriority);
                setConfigSortBy(defaultSortBy);
                setConfigSortOrder(defaultSortOrder);
                setEditingTitle(widget.title);
                onCloseConfig?.();
              }}
              data-testid="button-cancel-config"
            >
              Cancel
            </Button>
            <Button onClick={handleSaveConfig} data-testid="button-save-config">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

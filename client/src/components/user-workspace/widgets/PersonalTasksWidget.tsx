import { useState, useEffect, useMemo } from "react";
import { getWorkspacePreferences } from "@/lib/workspacePreferences";
import { generateNotionColors } from "@/lib/taskColors";
import { TaskRow, TaskCard } from "@/components/widgets/shared/TaskRow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import { 
  CheckSquare, 
  Clock, 
  AlertCircle, 
  Plus, 
  Circle,
  ChevronDown,
  ChevronRight,
  Folder,
  ChevronsUpDown,
  ChevronsDownUp,
  ArrowRight
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { type Task, type Project } from "@shared/schema";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import { format, isToday, isTomorrow, isBefore, startOfDay, addDays, addWeeks, addMonths, isWithinInterval, endOfWeek, endOfMonth, startOfWeek, startOfMonth } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";

// Every value here is offered in the config dropdown AND handled in the filter
// switch below. (It previously declared seven date filters that existed in
// neither, while omitting 'upcoming' — which the dropdown actually sets.)
type FilterType = 'all' | 'overdue' | 'today' | 'upcoming' | 'high-priority';
type GroupByType = 'none' | 'project' | 'dueDate' | 'priority';
type ViewType = 'list' | 'board';

/**
 * `scope` is marked legacy in shared/schema.ts and defaults to "project", so a
 * business task saved without an explicit scope reads as a project task with no
 * project — which rendered a blank label. taskContextType is the field the
 * server actually derives, so trust it first.
 */
function isBusinessTask(task: Task): boolean {
  if ((task as any).taskContextType === 'business') return true;
  if (task.scope === 'business') return true;
  return !task.projectId && !task.scope;
}

interface WidgetConfig {
  maxTasks?: number;
  showFilter?: FilterType;
  groupBy?: GroupByType;
  showCompleted?: boolean;
  projectFilter?: string;
  view?: ViewType;
}

export default function PersonalTasksWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions, userId }: WidgetProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { effectiveTimezone } = useTimezone();
  const businessLabel = (user as any)?.companyNickname || "Business";
  
  const config = widget.config as WidgetConfig || {};
  const maxTasks = config.maxTasks || 10;
  const showFilter = config.showFilter ?? 'all';
  const groupBy = config.groupBy ?? 'none';
  const showCompleted = config.showCompleted ?? false;
  const projectFilter = config.projectFilter ?? 'all';
  const view = config.view ?? 'list';
  // A board with one column is just a list with extra chrome.
  const effectiveGroupBy: GroupByType =
    view === 'board' && groupBy === 'none' ? 'project' : groupBy;

  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxTasks, setConfigMaxTasks] = useState(maxTasks);
  const [configShowFilter, setConfigShowFilter] = useState<FilterType>(showFilter);
  const [configGroupBy, setConfigGroupBy] = useState<GroupByType>(groupBy);
  const [configShowCompleted, setConfigShowCompleted] = useState(showCompleted);
  const [configProjectFilter, setConfigProjectFilter] = useState(projectFilter);
  const [configView, setConfigView] = useState<ViewType>(view);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupsInitialized, setGroupsInitialized] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'overdue' | 'upcoming' | null>(null);

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxTasks(config.maxTasks || 10);
    setConfigShowFilter(config.showFilter ?? 'all');
    setConfigGroupBy(config.groupBy ?? 'none');
    setConfigShowCompleted(config.showCompleted ?? false);
    setConfigProjectFilter(config.projectFilter ?? 'all');
    setConfigView(config.view ?? 'list');
  }, [widget.title, widget.config]);

  const { data: tasks = [], isLoading, isError, refetch } = useQuery<Task[]>({
    queryKey: ["/api/tasks/my"],
    enabled: !!userId,
  });

  // Supplies project colours for grouping and labels for the filter dropdown.
  // Shared cache key, so this is deduped with every other widget that needs it.
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Header row: + new task, hover arrow through to the full Tasks page
  useEffect(() => {
    onSetHeaderActions?.(
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="default"
              className="h-6 w-6"
              onClick={() => setShowCreateDialog(true)}
              data-testid="button-add-task-widget"
              aria-label="New task"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">New task</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => navigate("/tasks")}
              data-testid="personal-tasks-open-full"
              aria-label="Open tasks"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All tasks</TooltipContent>
        </Tooltip>
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  // Stable per-day value: rebuilding this every render made every filter memo
  // below recompute continuously.
  const today = useMemo(() => startOfDay(new Date()), []);

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'done' || task.status === 'complete' ? 'todo' : 'done';
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTask(null);
    },
  });

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (!showCompleted) {
      result = result.filter(t => t.status !== 'done' && t.status !== 'complete');
    }

    if (projectFilter === 'business') {
      // Include scope='business' OR legacy tasks (no scope + no projectId)
      result = result.filter(t => isBusinessTask(t));
    } else if (projectFilter !== 'all') {
      result = result.filter(t => t.projectId === projectFilter);
    }

    const effectiveFilter = activeFilter ?? showFilter;
    switch (effectiveFilter) {
      case 'overdue':
        result = result.filter(t => t.dueDate && isBefore(new Date(t.dueDate), today));
        break;
      case 'today':
        result = result.filter(t => t.dueDate && isToday(new Date(t.dueDate)));
        break;
      case 'upcoming':
        result = result.filter(t => {
          if (!t.dueDate) return false;
          const due = new Date(t.dueDate);
          return isWithinInterval(due, { start: today, end: addDays(today, 7) });
        });
        break;
      case 'high-priority':
        result = result.filter(t => t.priority === 'high' || t.priority === 'urgent');
        break;
    }

    return result.slice(0, maxTasks);
  }, [tasks, showFilter, activeFilter, showCompleted, projectFilter, maxTasks, today]);

  const filterCounts = useMemo(() => {
    let base = tasks;
    if (!showCompleted) {
      base = base.filter(t => t.status !== 'done' && t.status !== 'complete');
    }
    if (projectFilter === 'business') {
      base = base.filter(t => isBusinessTask(t));
    } else if (projectFilter !== 'all') {
      base = base.filter(t => t.projectId === projectFilter);
    }
    return {
      all: base.length,
      today: base.filter(t => t.dueDate && isToday(new Date(t.dueDate))).length,
      overdue: base.filter(t => t.dueDate && isBefore(new Date(t.dueDate), today)).length,
      upcoming: base.filter(t => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return isWithinInterval(d, { start: today, end: addDays(today, 7) });
      }).length,
    };
  }, [tasks, showCompleted, projectFilter, today]);

  const groupedTasks = useMemo(() => {
    if (effectiveGroupBy === 'none') {
      return [{ key: 'all', label: '', tasks: filteredTasks }];
    }

    const groups = new Map<string, { label: string; tasks: Task[]; color?: string }>();

    filteredTasks.forEach(task => {
      let key: string;
      let label: string;
      let color: string | undefined;

      switch (effectiveGroupBy) {
        case 'project':
          // Include scope='business' OR legacy tasks (no scope + no projectId) as business
          if (isBusinessTask(task)) {
            key = 'business';
            label = businessLabel;
            color = undefined;
          } else {
            key = task.projectId || 'no-project';
            const project = task.projectId ? projectMap.get(task.projectId) : null;
            label = project?.name || 'No Project';
            color = project?.color || undefined;
          }
          break;
        case 'dueDate':
          if (!task.dueDate) {
            key = 'no-date';
            label = 'No Due Date';
          } else if (isBefore(new Date(task.dueDate), today)) {
            key = 'overdue';
            label = 'Overdue';
          } else if (isToday(new Date(task.dueDate))) {
            key = 'today';
            label = 'Today';
          } else if (isTomorrow(new Date(task.dueDate))) {
            key = 'tomorrow';
            label = 'Tomorrow';
          } else {
            key = 'later';
            label = 'Later';
          }
          break;
        case 'priority':
          key = task.priority || 'none';
          label = task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : 'No Priority';
          break;
        default:
          key = 'all';
          label = '';
      }

      if (!groups.has(key)) {
        groups.set(key, { label, tasks: [], color });
      }
      groups.get(key)!.tasks.push(task);
    });

    return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
  }, [filteredTasks, effectiveGroupBy, projectMap, today]);

  const [prevGroupBy, setPrevGroupBy] = useState(effectiveGroupBy);
  useEffect(() => {
    if (effectiveGroupBy !== prevGroupBy) {
      setPrevGroupBy(effectiveGroupBy);
      setGroupsInitialized(false);
      setCollapsedGroups(new Set());
    }
  }, [effectiveGroupBy, prevGroupBy]);

  useEffect(() => {
    if (!groupsInitialized && effectiveGroupBy !== 'none' && groupedTasks.length > 0) {
      const { defaultExpanded } = getWorkspacePreferences();
      if (!defaultExpanded) {
        setCollapsedGroups(new Set(groupedTasks.map(g => g.key)));
      }
      setGroupsInitialized(true);
    }
  }, [groupedTasks, effectiveGroupBy, groupsInitialized]);

  /**
   * Every task row in this widget goes through here so the grouped and
   * ungrouped branches can't drift apart again. The accent carries the
   * project's own colour (or lavender for business-scope tasks), which is
   * the one thing a cross-project list needs that a per-project list doesn't.
   */
  const renderTaskRow = (
    task: Task,
    opts: { hideDue?: boolean; hideAccent?: boolean } = {},
  ) => {
    const project = task.projectId ? projectMap.get(task.projectId) : null;
    const isBusiness = isBusinessTask(task);

    let accentColor: string | null = null;
    let accentLabel: string | null = null;
    if (!opts.hideAccent) {
      if (project) {
        accentColor = generateNotionColors(project.color).originalHex;
        accentLabel = project.name;
      } else if (isBusiness) {
        accentColor = 'hsl(var(--primary))';
        accentLabel = businessLabel;
      }
    }

    return (
      <TaskRow
        key={task.id}
        task={{ ...task, dueDate: opts.hideDue ? null : task.dueDate } as any}
        accentColor={accentColor}
        accentLabel={accentLabel}
        onToggle={() => toggleTaskMutation.mutate(task)}
        onClick={() => setSelectedTaskId(task.id)}
        testIdPrefix="personal-task"
      />
    );
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Must sit above the isConfiguring early return — a hook after it changes the
  // hook count between renders and crashes with "Rendered fewer hooks than
  // expected" the moment the config panel opens.
  const allCollapsed = useMemo(() => {
    if (effectiveGroupBy === 'none') return false;
    return groupedTasks.every(g => collapsedGroups.has(g.key));
  }, [groupedTasks, collapsedGroups, effectiveGroupBy]);

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: {
            ...widget.config,
            maxTasks: configMaxTasks,
            showFilter: configShowFilter,
            groupBy: configGroupBy,
            view: configView,
            showCompleted: configShowCompleted,
            projectFilter: configProjectFilter,
          }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxTasks(config.maxTasks || 10);
      setConfigShowFilter(config.showFilter ?? 'all');
      setConfigGroupBy(config.groupBy ?? 'none');
      setConfigShowCompleted(config.showCompleted ?? false);
      setConfigProjectFilter(config.projectFilter ?? 'all');
      setConfigView(config.view ?? 'list');
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure My Tasks</h4>
        
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
          <Label className="text-xs">Filter</Label>
          <Select value={configShowFilter} onValueChange={(v) => setConfigShowFilter(v as FilterType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Active Tasks</SelectItem>
              <SelectItem value="overdue">Overdue Only</SelectItem>
              <SelectItem value="today">Due Today</SelectItem>
              <SelectItem value="upcoming">Due This Week</SelectItem>
              <SelectItem value="high-priority">High Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Project / Business</Label>
          <Select value={configProjectFilter} onValueChange={setConfigProjectFilter}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="business">{businessLabel} Only</SelectItem>
              <div className="h-px bg-border my-1" />
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">View</Label>
          <Select value={configView} onValueChange={(v) => setConfigView(v as ViewType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">List</SelectItem>
              <SelectItem value="board">Board</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">{configView === 'board' ? 'Columns' : 'Group By'}</Label>
          <Select value={configGroupBy} onValueChange={(v) => setConfigGroupBy(v as GroupByType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* A board needs an axis, so "no grouping" isn't offered for it. */}
              {configView !== 'board' && <SelectItem value="none">No Grouping</SelectItem>}
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="dueDate">Due Date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
            </SelectContent>
          </Select>
          {configView === 'board' && (
            <p className="text-[11px] text-muted-foreground">
              Each {configGroupBy === 'none' ? 'group' : configGroupBy === 'dueDate' ? 'due date' : configGroupBy} becomes a column.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Max Tasks</Label>
          <Input 
            type="number"
            min={1}
            max={30}
            value={configMaxTasks}
            onChange={(e) => setConfigMaxTasks(parseInt(e.target.value) || 10)}
            className="h-7 text-xs w-20"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Completed</Label>
          <Switch 
            checked={configShowCompleted} 
            onCheckedChange={setConfigShowCompleted}
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

  const toggleAllGroups = () => {
    if (effectiveGroupBy === 'none') return;
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groupedTasks.map(g => g.key)));
    }
  };

  const filterTabs: Array<{ key: 'all' | 'today' | 'overdue' | 'upcoming'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'today', label: 'Today' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'upcoming', label: 'Upcoming' },
  ];
  const effectiveActiveFilter = activeFilter ?? (
    showFilter === 'today' || showFilter === 'overdue' || showFilter === 'upcoming' || showFilter === 'all'
      ? showFilter
      : 'all'
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-0.5 flex-wrap" data-testid="personal-tasks-filter-tabs">
          {filterTabs.map((tab) => {
            const isActive = effectiveActiveFilter === tab.key;
            const count = filterCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                data-testid={`tab-filter-${tab.key}`}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium hover-elevate ${
                  isActive
                    ? 'bg-bp-purple/15 text-bp-purple'
                    : 'text-bp-muted'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        {view !== 'board' && effectiveGroupBy !== 'none' && groupedTasks.length > 1 && (
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={toggleAllGroups}
            data-testid="button-toggle-all-tasks"
            title={allCollapsed ? "Expand all" : "Collapse all"}
          >
            {allCollapsed ? (
              <ChevronsUpDown className="h-3 w-3" />
            ) : (
              <ChevronsDownUp className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
      
      <TaskEditModal
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
      
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
      
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 pr-2">
          {isLoading ? (
            <WidgetSkeleton rows={3} />
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Couldn't load your tasks
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : filteredTasks.length === 0 ? (
            <WidgetEmpty icon={CheckSquare} message="No tasks match your filters" />
          ) : view === 'board' ? (
            // Columns scroll sideways; each column scrolls on its own vertically
            // so one busy project can't stretch the whole widget.
            <div className="flex gap-2 overflow-x-auto pb-1">
              {groupedTasks.map((group) => (
                <div
                  key={group.key}
                  className="flex-shrink-0 w-[190px] flex flex-col"
                  data-testid={`personal-tasks-column-${group.key}`}
                >
                  <div className="flex items-center gap-1.5 px-1 pb-1.5">
                    {group.color && (
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                    )}
                    <span className="text-[10px] font-semibold uppercase tracking-wider truncate" title={group.label}>
                      {group.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{group.tasks.length}</span>
                  </div>
                  <div className="space-y-1 max-h-[320px] overflow-y-auto pr-0.5">
                    {group.tasks.map((task) => {
                      const project = task.projectId ? projectMap.get(task.projectId) : null;
                      const isBusiness = isBusinessTask(task);
                      const showAccent = effectiveGroupBy !== 'project';
                      return (
                        <TaskCard
                          key={task.id}
                          task={{ ...task, dueDate: effectiveGroupBy === 'dueDate' ? null : task.dueDate } as any}
                          accentColor={
                            !showAccent ? null
                              : project ? generateNotionColors(project.color).originalHex
                              : isBusiness ? 'hsl(var(--primary))' : null
                          }
                          accentLabel={
                            !showAccent ? null
                              : project ? project.name
                              : isBusiness ? businessLabel : null
                          }
                          onToggle={() => toggleTaskMutation.mutate(task)}
                          onClick={() => setSelectedTaskId(task.id)}
                          testIdPrefix="personal-task-card"
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : effectiveGroupBy === 'none' ? (
            <div className="space-y-0.5">
              {filteredTasks.map((task) => renderTaskRow(task))}
            </div>
          ) : (
            groupedTasks.map((group) => (
              <Collapsible 
                key={group.key} 
                open={!collapsedGroups.has(group.key)}
                onOpenChange={() => toggleGroup(group.key)}
              >
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-1 px-2 rounded bg-muted/50 hover-elevate cursor-pointer">
                  {collapsedGroups.has(group.key) ? (
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                  {group.color && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                  )}
                  {!group.color && effectiveGroupBy === 'project' && (
                    <Folder className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-table font-medium flex-1 text-left">{group.label}</span>
                  <Badge variant="secondary" className="text-label h-4 px-1">
                    {group.tasks.length}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-0.5 ml-2">
                  {/* Inside a group, don't repeat what the group heading already says. */}
                  {group.tasks.map((task) => renderTaskRow(task, {
                    hideDue: effectiveGroupBy === 'dueDate',
                    hideAccent: effectiveGroupBy === 'project',
                  }))}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

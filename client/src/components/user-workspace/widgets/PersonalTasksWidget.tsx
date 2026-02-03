import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskTooltip } from "@/components/ui/task-tooltip";
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
  ChevronsDownUp
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Task, type Project } from "@shared/schema";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import { format, isToday, isTomorrow, isBefore, startOfDay, addDays, addWeeks, addMonths, isWithinInterval, endOfWeek, endOfMonth, startOfWeek, startOfMonth } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";

type FilterType = 'all' | 'overdue' | 'today' | 'tomorrow' | 'next-3-days' | 'this-week' | 'next-week' | 'next-2-weeks' | 'this-month' | 'no-date' | 'high-priority';
type GroupByType = 'none' | 'project' | 'dueDate' | 'priority';

interface WidgetConfig {
  maxTasks?: number;
  showFilter?: FilterType;
  groupBy?: GroupByType;
  showCompleted?: boolean;
  projectFilter?: string;
}

export default function PersonalTasksWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const { user } = useAuth();
  const { effectiveTimezone } = useTimezone();
  const businessLabel = (user as any)?.companyNickname || "Business";
  
  const config = widget.config as WidgetConfig || {};
  const maxTasks = config.maxTasks || 10;
  const showFilter = config.showFilter ?? 'all';
  const groupBy = config.groupBy ?? 'none';
  const showCompleted = config.showCompleted ?? false;
  const projectFilter = config.projectFilter ?? 'all';

  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxTasks, setConfigMaxTasks] = useState(maxTasks);
  const [configShowFilter, setConfigShowFilter] = useState<FilterType>(showFilter);
  const [configGroupBy, setConfigGroupBy] = useState<GroupByType>(groupBy);
  const [configShowCompleted, setConfigShowCompleted] = useState(showCompleted);
  const [configProjectFilter, setConfigProjectFilter] = useState(projectFilter);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxTasks(config.maxTasks || 10);
    setConfigShowFilter(config.showFilter ?? 'all');
    setConfigGroupBy(config.groupBy ?? 'none');
    setConfigShowCompleted(config.showCompleted ?? false);
    setConfigProjectFilter(config.projectFilter ?? 'all');
  }, [widget.title, widget.config]);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!userId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const today = startOfDay(new Date());

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'done' || task.status === 'complete' ? 'todo' : 'done';
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { assigneeId: userId }] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (!showCompleted) {
      result = result.filter(t => t.status !== 'done' && t.status !== 'complete');
    }

    if (projectFilter === 'business') {
      // Include scope='business' OR legacy tasks (no scope + no projectId)
      result = result.filter(t => t.scope === 'business' || (!t.scope && !t.projectId));
    } else if (projectFilter !== 'all') {
      result = result.filter(t => t.projectId === projectFilter);
    }

    switch (showFilter) {
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
  }, [tasks, showFilter, showCompleted, projectFilter, maxTasks, today]);

  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', tasks: filteredTasks }];
    }

    const groups = new Map<string, { label: string; tasks: Task[]; color?: string }>();

    filteredTasks.forEach(task => {
      let key: string;
      let label: string;
      let color: string | undefined;

      switch (groupBy) {
        case 'project':
          // Include scope='business' OR legacy tasks (no scope + no projectId) as business
          if (task.scope === 'business' || (!task.scope && !task.projectId)) {
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
  }, [filteredTasks, groupBy, projectMap, today]);

  const getTaskDueInfo = (task: Task) => {
    if (!task.dueDate) return null;
    const dueDate = new Date(task.dueDate);
    
    if (isBefore(dueDate, today)) {
      return { label: formatInTimezone(dueDate, effectiveTimezone, { month: 'short', day: 'numeric' }), color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' };
    }
    if (isToday(dueDate)) {
      return { label: 'Today', color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30' };
    }
    if (isTomorrow(dueDate)) {
      return { label: 'Tomorrow', color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' };
    }
    return { label: formatInTimezone(dueDate, effectiveTimezone, { month: 'short', day: 'numeric' }), color: 'text-muted-foreground bg-muted' };
  };

  const getPriorityColor = (priority: string | null | undefined) => {
    switch (priority) {
      case 'urgent': return 'border-l-red-500';
      case 'high': return 'border-l-orange-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-transparent';
    }
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
          <Label className="text-xs">Group By</Label>
          <Select value={configGroupBy} onValueChange={(v) => setConfigGroupBy(v as GroupByType)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="dueDate">Due Date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
            </SelectContent>
          </Select>
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

  const allCollapsed = useMemo(() => {
    if (groupBy === 'none') return false;
    return groupedTasks.every(g => collapsedGroups.has(g.key));
  }, [groupedTasks, collapsedGroups, groupBy]);

  const toggleAllGroups = () => {
    if (groupBy === 'none') return;
    if (allCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groupedTasks.map(g => g.key)));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-1 mb-2">
        {groupBy !== 'none' && groupedTasks.length > 1 && (
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
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-5 w-5"
          onClick={() => setShowCreateDialog(true)}
          data-testid="button-add-task-widget"
        >
          <Plus className="h-3 w-3" />
        </Button>
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
      />
      
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 pr-2">
          {isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-7 bg-muted rounded" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">
              No tasks match your filters
            </div>
          ) : groupBy === 'none' ? (
            <div className="space-y-0.5">
              {filteredTasks.map((task) => {
                const dueInfo = getTaskDueInfo(task);
                const project = task.projectId ? projectMap.get(task.projectId) : null;
                const isCompleted = task.status === 'done' || task.status === 'complete';
                
                return (
                  <div 
                    key={task.id}
                    className={`flex items-center gap-2 py-1.5 px-2 rounded border-l-2 hover-elevate cursor-pointer ${getPriorityColor(task.priority)} ${isCompleted ? 'opacity-50' : ''}`}
                    onClick={() => setSelectedTaskId(task.id)}
                    data-testid={`personal-task-${task.id}`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTaskMutation.mutate(task);
                      }}
                      className="flex-shrink-0"
                    >
                      {isCompleted ? (
                        <CheckSquare className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                    
                    <TaskTooltip content={task.title}>
                      <span className={`text-[11px] flex-1 truncate cursor-default ${isCompleted ? 'line-through' : ''}`}>
                        {task.title}
                      </span>
                    </TaskTooltip>
                    
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {dueInfo && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium w-14 text-center ${dueInfo.color}`}>
                          {dueInfo.label}
                        </span>
                      )}
                      {project && (
                        <span 
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground w-20 text-center truncate"
                          title={project.name}
                        >
                          {project.name}
                        </span>
                      )}
                      {(task.scope === 'business' || (!task.scope && !task.projectId)) && (
                        <span 
                          className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary w-20 text-center truncate"
                          title={businessLabel}
                        >
                          {businessLabel}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
                  {!group.color && groupBy === 'project' && (
                    <Folder className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-[11px] font-medium flex-1 text-left">{group.label}</span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1">
                    {group.tasks.length}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-0.5 ml-2">
                  {group.tasks.map((task) => {
                    const dueInfo = getTaskDueInfo(task);
                    const project = task.projectId ? projectMap.get(task.projectId) : null;
                    const isCompleted = task.status === 'done' || task.status === 'complete';
                    
                    return (
                      <div 
                        key={task.id}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded border-l-2 hover-elevate cursor-pointer ${getPriorityColor(task.priority)} ${isCompleted ? 'opacity-50' : ''}`}
                        onClick={() => setSelectedTaskId(task.id)}
                        data-testid={`personal-task-${task.id}`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskMutation.mutate(task);
                          }}
                          className="flex-shrink-0"
                        >
                          {isCompleted ? (
                            <CheckSquare className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                        
                        
                        <TaskTooltip content={task.title}>
                          <span className={`text-[11px] flex-1 truncate cursor-default ${isCompleted ? 'line-through' : ''}`}>
                            {task.title}
                          </span>
                        </TaskTooltip>
                        
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {groupBy !== 'dueDate' && dueInfo && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium w-14 text-center ${dueInfo.color}`}>
                              {dueInfo.label}
                            </span>
                          )}
                          {groupBy !== 'project' && project && (
                            <span 
                              className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground w-20 text-center truncate"
                              title={project.name}
                            >
                              {project.name}
                            </span>
                          )}
                          {groupBy !== 'project' && (task.scope === 'business' || (!task.scope && !task.projectId)) && (
                            <span 
                              className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary w-20 text-center truncate"
                              title={businessLabel}
                            >
                              {businessLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

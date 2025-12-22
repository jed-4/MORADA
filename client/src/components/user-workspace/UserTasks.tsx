import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  LayoutGrid,
  List,
  Filter,
  X,
} from "lucide-react";
import TaskBoard from "@/components/TaskBoard";
import TaskListCompact from "@/components/TaskListCompact";
import TaskModalAsana from "@/components/TaskModalAsana";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import TaskViewsManager, { type TaskView, type TaskViewFilters } from "@/components/TaskViewsManager";
import type { User, Task, Project, FieldCategoryWithOptions } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { applyTaskFilters, extractFilterOptions } from "@/utils/taskFilters";
import { useToast } from "@/hooks/use-toast";
import { type FilterState } from "@/components/FilterPanel";
import { useTaskPriorityOptions } from "@/hooks/useTaskPriorityOptions";
import { format, startOfDay, isBefore, isToday, isTomorrow, addDays, isWithinInterval } from "date-fns";

interface UserTasksProps {
  user: User;
  isOwnPage: boolean;
}

type ViewType = "list" | "board" | "calendar";
type GroupByType = "none" | "status" | "priority" | "project";

export default function UserTasks({ user, isOwnPage }: UserTasksProps) {
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [activeView, setActiveView] = useState<ViewType>("list");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [groupBy, setGroupBy] = useState<GroupByType>("none");
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>(undefined);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("week");

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: user.id }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?assigneeId=${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const { priorityOptions: fetchedPriorityOptions } = useTaskPriorityOptions();
  
  const priorityOptions = fetchedPriorityOptions.length > 0 ? fetchedPriorityOptions : [
    { key: "low", name: "Low", color: "#10B981" },
    { key: "medium", name: "Medium", color: "#F59E0B" },
    { key: "high", name: "High", color: "#EF4444" },
    { key: "urgent", name: "Urgent", color: "#DC2626" },
  ];

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusCategory?.options?.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options?.find(opt => opt.isDefault);

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const { data: userPreferences, isError: preferencesError } = useQuery({
    queryKey: ["/api/user-view-preferences", "my_tasks"],
    queryFn: async () => {
      const response = await fetch("/api/user-view-preferences/my_tasks", {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch view preferences");
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (userPreferences?.preferences) {
      if (userPreferences.preferences.activeView) setActiveView(userPreferences.preferences.activeView);
      if (userPreferences.preferences.groupBy) setGroupBy(userPreferences.preferences.groupBy);
      if (userPreferences.preferences.filters) setFilters(userPreferences.preferences.filters);
      setPreferencesLoaded(true);
    } else if (userPreferences === null || preferencesError) {
      setPreferencesLoaded(true);
    }
  }, [userPreferences, preferencesError]);

  const savePreferencesMutation = useMutation({
    mutationFn: async (prefs: any) => {
      return await apiRequest("/api/user-view-preferences", "POST", {
        viewKey: "my_tasks",
        preferences: prefs,
      });
    },
  });

  useEffect(() => {
    if (preferencesLoaded) {
      const timer = setTimeout(() => {
        savePreferencesMutation.mutate({ activeView, groupBy, filters });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeView, groupBy, filters, preferencesLoaded]);

  const filteredTasks = useMemo(() => {
    return applyTaskFilters(tasks, filters);
  }, [tasks, filters]);

  const tasksWithProjects = useMemo(() => {
    return filteredTasks.map(task => ({
      ...task,
      projectName: task.projectId ? projectMap.get(task.projectId)?.name || 'No Project' : 'No Project',
      projectColor: task.projectId ? projectMap.get(task.projectId)?.color : undefined,
    }));
  }, [filteredTasks, projectMap]);

  const groupedTasks = useMemo(() => {
    if (groupBy === 'none') {
      return { 'All Tasks': tasksWithProjects };
    }

    const groups: Record<string, typeof tasksWithProjects> = {};
    
    tasksWithProjects.forEach((task) => {
      let groupKey = 'Ungrouped';
      
      switch (groupBy) {
        case 'status':
          groupKey = task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || 'No Status';
          break;
        case 'priority':
          groupKey = task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1) || 'No Priority';
          break;
        case 'project':
          groupKey = task.projectName || 'No Project';
          break;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });
    
    const sortedGroups: Record<string, typeof tasksWithProjects> = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });
    
    return sortedGroups;
  }, [tasksWithProjects, groupBy]);

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { assigneeId: user.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate, startTime }: { taskId: string; dueDate: string; startTime?: string }) => {
      const payload: any = { dueDate };
      if (startTime !== undefined) payload.startTime = startTime;
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { assigneeId: user.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task rescheduled" });
    },
  });

  const resizeTaskMutation = useMutation({
    mutationFn: async ({ taskId, startTime, endTime }: { taskId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { startTime, endTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { assigneeId: user.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return filteredTasks
      .filter(task => task.dueDate)
      .map(task => {
        const project = task.projectId ? projectMap.get(task.projectId) : null;
        const isCompleted = task.status === completedOption?.key;
        
        return {
          id: task.id,
          title: task.title,
          startDate: new Date(task.dueDate!),
          endDate: new Date(task.dueDate!),
          startTime: task.startTime,
          endTime: task.endTime,
          color: project?.color,
          projectId: task.projectId,
          projectColor: project?.color,
          type: "task" as const,
          status: task.status,
          isCompleted,
          assigneeId: task.assigneeId,
          priority: task.priority,
          resource: task,
        };
      });
  }, [filteredTasks, projectMap, completedOption]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    const newStatus = completed ? (completedOption?.key || "done") : (defaultOption?.key || "todo");
    updateTaskMutation.mutate({ taskId: eventId, status: newStatus });
  };

  const handleEventReschedule = (eventId: string, newDate: Date, eventType: "task" | "schedule" | "meeting" | "google-calendar", newTime?: string) => {
    const updatePayload: any = { 
      taskId: eventId, 
      dueDate: new Date(newDate).toISOString().split('T')[0]
    };
    if (newTime) updatePayload.startTime = newTime;
    rescheduleTaskMutation.mutate(updatePayload);
  };

  const handleEventResize = (eventId: string, startTime: string, endTime: string, eventType: "task" | "schedule" | "meeting" | "google-calendar") => {
    resizeTaskMutation.mutate({ taskId: eventId, startTime, endTime });
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.resource && event.type === "task") {
      setEditingTask(event.resource as Task);
    }
  };

  const hasActiveFilters = !!(filters.search || filters.status?.length || filters.priority?.length || filters.project?.length);

  const clearAllFilters = () => {
    setFilters({});
  };

  return (
    <div className="flex flex-col h-full" data-testid="user-tasks">
      {/* Row 1 - Title & Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {isOwnPage ? 'My Tasks' : `${user.firstName}'s Tasks`}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {isOwnPage && (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
              onClick={() => setShowCreateDialog(true)}
              data-testid="button-add-task"
            >
              <Plus className="w-3 h-3" />
              <span>Add Task</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2 - View Tabs & Saved Views */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5" data-testid="tabs-task-views">
          <button
            onClick={() => setActiveView("list")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeView === "list" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-list"
          >
            <List className="w-3 h-3" />
            List
          </button>
          <button
            onClick={() => setActiveView("board")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeView === "board" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-board"
          >
            <LayoutGrid className="w-3 h-3" />
            Board
          </button>
          <button
            onClick={() => setActiveView("calendar")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeView === "calendar" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-calendar"
          >
            <Calendar className="w-3 h-3" />
            Calendar
          </button>
        </div>

        {/* Right: Calendar Controls OR Saved Views */}
        {activeView === "calendar" ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const newDate = new Date(calendarDate);
                if (calendarMode === "day") newDate.setDate(newDate.getDate() - 1);
                else if (calendarMode === "week") newDate.setDate(newDate.getDate() - 7);
                else newDate.setMonth(newDate.getMonth() - 1);
                setCalendarDate(newDate);
              }}
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-calendar-prev"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              onClick={() => setCalendarDate(new Date())}
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
              data-testid="button-calendar-today"
            >
              Today
            </button>
            <button
              onClick={() => {
                const newDate = new Date(calendarDate);
                if (calendarMode === "day") newDate.setDate(newDate.getDate() + 1);
                else if (calendarMode === "week") newDate.setDate(newDate.getDate() + 7);
                else newDate.setMonth(newDate.getMonth() + 1);
                setCalendarDate(newDate);
              }}
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-calendar-next"
            >
              <ChevronRight className="w-3 h-3" />
            </button>

            <div className="flex items-center gap-0.5 ml-2">
              {(["day", "week", "month"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCalendarMode(mode)}
                  className={`h-6 w-auto px-2 text-xs border rounded-md ${
                    calendarMode === mode
                      ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                      : 'hover-elevate'
                  } active-elevate-2`}
                  data-testid={`button-view-${mode}`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <TaskViewsManager 
            currentViewType={activeView}
            currentFilters={filters as TaskViewFilters}
            currentGroupBy={groupBy === 'project' ? 'none' : groupBy}
            onViewSelect={(view: TaskView) => {
              setActiveView(view.viewType);
              setFilters(view.filters as FilterState);
              setGroupBy(view.groupBy === 'assignee' ? 'none' : view.groupBy);
              setSelectedViewId(view.id);
            }}
            selectedViewId={selectedViewId}
          />
        )}
      </div>

      {/* Row 3 - Search & Filters */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5 flex-1">
          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search tasks..."
              value={filters.search || ""}
              onChange={(e) => setFilters({...filters, search: e.target.value || undefined})}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-tasks"
            />
          </div>

          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Status</span>
                {filters.status && filters.status.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.status.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(statusOptions.length > 0 ? statusOptions : [
                { key: "todo", name: "To Do", color: null },
                { key: "in-progress", name: "In Progress", color: null },
                { key: "done", name: "Done", color: null },
              ]).map(option => (
                <DropdownMenuItem key={option.key} className="flex items-center" onSelect={(e) => e.preventDefault()}>
                  <Checkbox
                    checked={filters.status?.includes(option.key) || false}
                    onCheckedChange={() => {
                      const current = filters.status || [];
                      const next = current.includes(option.key)
                        ? current.filter(s => s !== option.key)
                        : [...current, option.key];
                      setFilters({...filters, status: next.length > 0 ? next : undefined});
                    }}
                  />
                  <span className="ml-2">{option.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Priority</span>
                {filters.priority && filters.priority.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.priority.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {priorityOptions.map(option => (
                <DropdownMenuItem key={option.key} className="flex items-center" onSelect={(e) => e.preventDefault()}>
                  <Checkbox
                    checked={filters.priority?.includes(option.key) || false}
                    onCheckedChange={() => {
                      const current = filters.priority || [];
                      const next = current.includes(option.key)
                        ? current.filter(p => p !== option.key)
                        : [...current, option.key];
                      setFilters({...filters, priority: next.length > 0 ? next : undefined});
                    }}
                  />
                  <span className="ml-2">{option.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Project Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Project</span>
                {filters.project && filters.project.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.project.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-64 overflow-y-auto">
              {projects.map(project => (
                <DropdownMenuItem key={project.id} className="flex items-center" onSelect={(e) => e.preventDefault()}>
                  <Checkbox
                    checked={filters.project?.includes(project.id) || false}
                    onCheckedChange={() => {
                      const current = filters.project || [];
                      const next = current.includes(project.id)
                        ? current.filter(p => p !== project.id)
                        : [...current, project.id];
                      setFilters({...filters, project: next.length > 0 ? next : undefined});
                    }}
                  />
                  <div className="ml-2 flex items-center gap-1.5">
                    {project.color && (
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project.color }} />
                    )}
                    <span className="truncate max-w-[150px]">{project.name}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Group By (for list view) */}
          {activeView === "list" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                  <span>Group: {groupBy === 'none' ? 'None' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(["none", "status", "priority", "project"] as const).map(option => (
                  <DropdownMenuItem key={option} onClick={() => setGroupBy(option)}>
                    {option === 'none' ? 'No Grouping' : option.charAt(0).toUpperCase() + option.slice(1)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="h-6 w-auto px-2 py-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              data-testid="button-clear-filters"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeView === "list" ? (
          <div className="p-2">
            {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
              <div key={groupName} className="mb-4">
                {groupBy !== 'none' && (
                  <div className="flex items-center gap-2 mb-2 px-2">
                    <span className="text-xs font-medium text-muted-foreground">{groupName}</span>
                    <Badge variant="outline" className="text-[10px]">{groupTasks.length}</Badge>
                  </div>
                )}
                <TaskListCompact
                  tasks={groupTasks}
                  isLoading={isLoading && groupName === 'All Tasks'}
                  onTaskClick={(task) => setEditingTask(task)}
                />
              </div>
            ))}
          </div>
        ) : activeView === "board" ? (
          <div className="p-2 h-full">
            <TaskBoard
              tasks={tasksWithProjects}
              isLoading={isLoading}
              onTaskClick={(task) => setEditingTask(task)}
            />
          </div>
        ) : (
          <div className="h-full">
            <EnhancedCalendar
              events={calendarEvents}
              currentDate={calendarDate}
              onDateChange={setCalendarDate}
              mode={calendarMode}
              onModeChange={setCalendarMode}
              onEventComplete={handleEventComplete}
              onEventReschedule={handleEventReschedule}
              onEventResize={handleEventResize}
              onEventClick={handleEventClick}
              hideHeader={true}
            />
          </div>
        )}
      </div>

      {/* Task Modals */}
      <TaskModalAsana
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        defaultAssigneeId={user.id}
      />
      <TaskModalAsana
        task={editingTask || undefined}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
      />
    </div>
  );
}

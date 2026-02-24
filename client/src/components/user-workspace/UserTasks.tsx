import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  LayoutGrid,
  List,
  Filter,
  X,
  CalendarDays,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import TaskBoard, { type BoardGroupByType } from "@/components/TaskBoard";
import TaskListCompact from "@/components/TaskListCompact";
import TaskEditModal from "@/components/TaskEditModal";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import type { User, Task, Project, FieldCategoryWithOptions, TaskView, Company } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { applyTaskFilters, extractFilterOptions, deserializeFilters } from "@/utils/taskFilters";
import { useToast } from "@/hooks/use-toast";
import { type FilterState, type DueDatePreset } from "@/components/FilterPanel";
import { useTaskPriorityOptions } from "@/hooks/useTaskPriorityOptions";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";

// Sortable View Tab component for drag-and-drop reordering
function SortableViewTab({ 
  view, 
  isSelected,
  onSelect,
  onEditClick,
  onDeleteClick,
}: { 
  view: TaskView; 
  isSelected: boolean;
  onSelect: () => void;
  onEditClick: (view: TaskView) => void;
  onDeleteClick: (view: TaskView) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="flex items-center"
      {...attributes}
    >
      <button
        onClick={onSelect}
        className={`relative h-7 px-2 text-xs flex items-center gap-1 transition-colors cursor-grab active:cursor-grabbing ${
          isSelected
            ? 'text-[#bba7db] font-medium'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        data-testid={`tab-${view.id}`}
        {...listeners}
      >
        <span>{view.name}</span>
        {isSelected && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db] rounded-full" />
        )}
      </button>
      {isSelected && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-5 px-0.5 text-[#bba7db] hover:text-[#bba7db]/80 flex items-center"
              data-testid={`button-view-options-${view.id}`}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem 
              onClick={() => onEditClick(view)}
              data-testid={`menu-edit-${view.id}`}
            >
              <Pencil className="h-3 w-3 mr-2" />
              Edit View
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDeleteClick(view)}
              className="text-destructive"
              data-testid={`menu-delete-${view.id}`}
            >
              <X className="h-3 w-3 mr-2" />
              Delete View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks } from "date-fns";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";

// Helper to resolve preset to display date range
function getPresetDateRange(preset: DueDatePreset | undefined, weekStartDay: 0 | 1 = 1): { from?: Date; to?: Date; label?: string } | null {
  if (!preset) return null;
  const today = startOfDay(new Date());
  
  switch (preset) {
    case 'overdue':
      return { to: addDays(today, -1), label: 'Overdue' };
    case 'today':
      return { from: today, to: endOfDay(today), label: 'Today' };
    case 'tomorrow':
      const tomorrow = addDays(today, 1);
      return { from: tomorrow, to: endOfDay(tomorrow), label: 'Tomorrow' };
    case 'this-week':
      return { from: startOfWeek(today, { weekStartsOn: weekStartDay }), to: endOfWeek(today, { weekStartsOn: weekStartDay }), label: 'This Week' };
    case 'last-week-to-today':
      const lastWeekStart = startOfWeek(addWeeks(today, -1), { weekStartsOn: weekStartDay });
      return { from: lastWeekStart, to: endOfDay(today), label: 'Last Week to Today' };
    case 'next-week':
      const nextWeekStart = startOfWeek(addWeeks(today, 1), { weekStartsOn: weekStartDay });
      return { from: nextWeekStart, to: endOfWeek(nextWeekStart, { weekStartsOn: weekStartDay }), label: 'Next Week' };
    case 'this-month':
      return { from: startOfMonth(today), to: endOfMonth(today), label: 'This Month' };
    case 'no-date':
      return { label: 'No Due Date' };
    case 'all':
    default:
      return null;
  }
}

interface UserTasksProps {
  user: User;
  isOwnPage: boolean;
}

type ViewType = "list" | "board" | "calendar";
type GroupByType = "none" | "status" | "priority" | "project" | "labels";

export default function UserTasks({ user, isOwnPage }: UserTasksProps) {
  const { toast } = useToast();
  const { effectiveTimezone } = useTimezone();
  const weekStartDay = useWeekStartDay();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [activeView, setActiveView] = useState<ViewType>("list");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [initialBoardStatus, setInitialBoardStatus] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [listColumnOrder, setListColumnOrder] = useState<('status' | 'priority' | 'assignee' | 'project' | 'dueDate')[]>(['status', 'priority', 'assignee', 'project', 'dueDate']);
  const [listSortConfig, setListSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' | null } | undefined>(undefined);
  const [groupBy, setGroupBy] = useState<GroupByType>("none");
  // Default to no filters - show all tasks
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>(undefined);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [cardDisplaySettings, setCardDisplaySettings] = useState({
    showPriority: true,
    showStatus: true,
    showAssignee: true,
    showDueDate: true,
    showLabels: true,
  });
  
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

  // Fetch company data for business nickname
  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", user?.companyId],
    enabled: !!user?.companyId,
  });
  const businessNickname = company?.nickname || company?.name;

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
      if (userPreferences.preferences.filters) {
        // Deserialize filters to properly convert date strings back to Date objects
        const loadedFilters = deserializeFilters(userPreferences.preferences.filters);
        // If a preset is active, clear any stale manual dates that might have been saved
        if (loadedFilters.dueDatePreset) {
          loadedFilters.dueDateFrom = undefined;
          loadedFilters.dueDateTo = undefined;
        }
        setFilters(loadedFilters);
      }
      if (userPreferences.preferences.selectedViewId) setSelectedViewId(userPreferences.preferences.selectedViewId);
      if (userPreferences.preferences.listColumnOrder) setListColumnOrder(userPreferences.preferences.listColumnOrder);
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
        savePreferencesMutation.mutate({ activeView, groupBy, filters, selectedViewId, listColumnOrder });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeView, groupBy, filters, selectedViewId, listColumnOrder, preferencesLoaded]);

  // Fetch saved task views
  const { data: taskViews = [] } = useQuery<TaskView[]>({
    queryKey: ["/api/task-views"],
    queryFn: async () => {
      const response = await fetch('/api/task-views', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch task views');
      return response.json();
    },
  });

  // State for saved views
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [viewToDelete, setViewToDelete] = useState<TaskView | null>(null);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [viewToEdit, setViewToEdit] = useState<TaskView | null>(null);
  const [showEditViewDialog, setShowEditViewDialog] = useState(false);
  const [editViewName, setEditViewName] = useState("");

  // Create view mutation
  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; viewType: string; filters: any; groupBy: string }) => {
      const response = await fetch("/api/task-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create view');
      return response.json();
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
      toast({ title: "View saved successfully" });
      setShowCreateViewDialog(false);
      setNewViewName("");
      setSelectedViewId(newView.id);
    },
    onError: () => {
      toast({ title: "Failed to save view", variant: "destructive" });
    },
  });

  // Delete view mutation
  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      const response = await fetch(`/api/task-views/${viewId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error('Failed to delete view');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
      toast({ title: "View deleted" });
      setShowDeleteViewDialog(false);
      setViewToDelete(null);
      if (selectedViewId === viewToDelete?.id) {
        setSelectedViewId(undefined);
      }
    },
    onError: () => {
      toast({ title: "Failed to delete view", variant: "destructive" });
    },
  });

  const handleSaveView = () => {
    if (!newViewName.trim()) return;
    createViewMutation.mutate({
      name: newViewName,
      viewType: activeView,
      filters,
      groupBy,
    });
  };

  const handleDeleteView = (view: TaskView) => {
    setViewToDelete(view);
    setShowDeleteViewDialog(true);
  };

  const handleEditView = (view: TaskView) => {
    setViewToEdit(view);
    setEditViewName(view.name);
    setShowEditViewDialog(true);
  };

  // Update view mutation
  const updateViewMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; filters?: any; groupBy?: string }) => {
      const response = await fetch(`/api/task-views/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: data.name, filters: data.filters, groupBy: data.groupBy }),
      });
      if (!response.ok) throw new Error('Failed to update view');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
      toast({ title: "View updated" });
      setShowEditViewDialog(false);
      setViewToEdit(null);
    },
    onError: () => {
      toast({ title: "Failed to update view", variant: "destructive" });
    },
  });

  // Create task mutation (for inline task creation)
  const createTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      return await apiRequest(`/api/tasks`, "POST", {
        type: "task",
        title,
        content: title,
        scope: "personal",
        taskContextType: "business",
        status: "todo",
        assigneeId: user.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", { assigneeId: user.id }] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created" });
    },
    onError: () => {
      toast({ title: "Failed to create task", variant: "destructive" });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest(`/api/tasks/${taskId}`, "DELETE");
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/tasks"
      });
      toast({ title: "Task deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete task", variant: "destructive" });
    },
  });

  const handleDeleteTask = (task: Task) => {
    if (confirm(`Delete "${task.title}"?`)) {
      deleteTaskMutation.mutate(task.id);
    }
  };

  const handleUpdateView = () => {
    if (!viewToEdit || !editViewName.trim()) return;
    updateViewMutation.mutate({
      id: viewToEdit.id,
      name: editViewName,
      filters,
      groupBy,
    });
  };

  // Mutation for reordering views
  const reorderViewsMutation = useMutation({
    mutationFn: async (viewIds: string[]): Promise<void> => {
      const response = await fetch("/api/task-views/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ viewIds }),
      });
      if (!response.ok) throw new Error("Failed to reorder views");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
    },
  });

  // DnD sensors for view reordering
  const viewSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle view drag end
  const handleViewDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = taskViews.findIndex((v: TaskView) => v.id === active.id);
    const newIndex = taskViews.findIndex((v: TaskView) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedViews = arrayMove(taskViews, oldIndex, newIndex);
    const viewIds = reorderedViews.map((v: TaskView) => v.id);
    
    // Optimistic update
    queryClient.setQueryData(["/api/task-views"], reorderedViews);
    
    // Persist to server
    reorderViewsMutation.mutate(viewIds);
  };

  const handleSelectSavedView = (view: TaskView) => {
    // Toggle behavior: if clicking the already selected view, deselect it
    if (selectedViewId === view.id) {
      setSelectedViewId(undefined);
      setFilters({});
      setGroupBy('none');
      return;
    }
    
    setSelectedViewId(view.id);
    // Only apply filters, not view mode - views work across all view modes
    if (view.filters) {
      setFilters(view.filters as FilterState);
    }
    if (view.groupBy) {
      setGroupBy(view.groupBy as GroupByType);
    }
  };

  const filteredTasks = useMemo(() => {
    return applyTaskFilters(tasks, filters, weekStartDay);
  }, [tasks, filters, weekStartDay]);

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
        case 'labels':
          // Check both task.labels and task.tagIds (for labels assigned via modal)
          if (task.labels && task.labels.length > 0) {
            groupKey = task.labels[0];
          } else if (task.tagIds && (task.tagIds as string[]).length > 0) {
            // Resolve tagIds to label names
            const labelCategory = fieldCategories.find(cat => cat.key === "task.labels");
            const labelOptions = labelCategory?.options || [];
            const tagId = (task.tagIds as string[])[0];
            const label = labelOptions.find(l => l.id === tagId);
            groupKey = label?.name || 'No Labels';
          } else {
            groupKey = 'No Labels';
          }
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
  }, [tasksWithProjects, groupBy, fieldCategories]);

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

  const hasActiveFilters = !!(filters.search || filters.status?.length || filters.priority?.length || filters.project?.length || filters.dueDateFrom || filters.dueDateTo);

  const clearAllFilters = () => {
    setFilters({});
  };

  return (
    <div className="flex flex-col h-full" data-testid="user-tasks">
      {/* Header Panel - 2 rows connected to content */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        {/* Row 1 - Title & Add Task */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {isOwnPage ? 'My Tasks' : `${user.firstName}'s Tasks`}
          </h2>
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

        {/* Row 2 - View Tabs + Search & Filters */}
        <div className="h-8 flex items-center justify-between px-3 gap-3">
          {/* Left: View Tabs */}
          <div className="flex items-center gap-1" data-testid="tabs-task-views">
            {/* Default View Mode Tabs */}
            {(["list", "board", "calendar"] as const).map((view) => {
              const Icon = view === "list" ? List : view === "board" ? LayoutGrid : Calendar;
              const isActive = activeView === view;
              return (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className={`relative h-7 px-2 text-xs flex items-center gap-1 transition-colors ${
                    isActive
                      ? 'text-[#bba7db] font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`tab-${view}`}
                >
                  <Icon className="w-3 h-3" />
                  <span className="capitalize">{view}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db] rounded-full" />
                  )}
                </button>
              );
            })}
            
            {/* Separator between default views and saved views */}
            {taskViews.length > 0 && (
              <div className="h-4 w-px bg-border mx-1" />
            )}
            
            {/* Saved/Custom Views - drag and drop reorderable */}
            {taskViews.length > 0 && (
              <DndContext
                sensors={viewSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleViewDragEnd}
              >
                <SortableContext
                  items={taskViews.map((v: TaskView) => v.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {taskViews.map((view: TaskView) => (
                    <SortableViewTab
                      key={view.id}
                      view={view}
                      isSelected={selectedViewId === view.id}
                      onSelect={() => handleSelectSavedView(view)}
                      onEditClick={handleEditView}
                      onDeleteClick={handleDeleteView}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              onClick={() => setShowCreateViewDialog(true)}
              data-testid="button-add-view"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Right: Search, Filters, and View-specific controls */}
          <div className="flex items-center gap-1.5 flex-1 justify-end">
            {/* Calendar Controls (when calendar view) */}
            {activeView === "calendar" && (
              <>
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
                <div className="flex items-center gap-0.5 ml-1">
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
                <div className="w-px h-4 bg-border mx-1" />
              </>
            )}

            {/* Search */}
            <div className="relative w-40">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search..."
                value={filters.search || ""}
                onChange={(e) => setFilters({...filters, search: e.target.value || undefined})}
                className="pl-7 pr-2 py-0 h-6 text-xs border"
                data-testid="input-search-tasks"
              />
            </div>

            {/* Filters */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                  <Filter className="w-3 h-3" />
                  <span>Filter</span>
                  {hasActiveFilters && (
                    <Badge variant="destructive" className="ml-1 h-3 min-w-3 p-0 text-[10px] flex items-center justify-center">
                      {(filters.status?.length || 0) + (filters.priority?.length || 0) + (filters.project?.length || 0) + (filters.dueDatePreset && filters.dueDatePreset !== 'all' ? 1 : 0)}
                    </Badge>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Status</div>
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
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-1.5">Priority</div>
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
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-1.5">Due Date Range</div>
                {/* Date Range Inputs - show preset label if active, otherwise show manual dates */}
                {(() => {
                  const presetRange = getPresetDateRange(filters.dueDatePreset, weekStartDay);
                  const fromDisplay = filters.dueDateFrom 
                    ? formatInTimezone(new Date(filters.dueDateFrom), effectiveTimezone, { year: 'numeric', month: 'short', day: 'numeric' }) 
                    : presetRange?.from 
                      ? formatInTimezone(presetRange.from, effectiveTimezone, { year: 'numeric', month: 'short', day: 'numeric' }) 
                      : 'Any start';
                  const toDisplay = filters.dueDateTo 
                    ? formatInTimezone(new Date(filters.dueDateTo), effectiveTimezone, { year: 'numeric', month: 'short', day: 'numeric' }) 
                    : presetRange?.to 
                      ? formatInTimezone(presetRange.to, effectiveTimezone, { year: 'numeric', month: 'short', day: 'numeric' }) 
                      : 'Any end';
                  return (
                    <div className="px-2 py-1 space-y-2">
                      {filters.dueDatePreset && presetRange?.label && (
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-[10px]">{presetRange.label}</Badge>
                          <span className="text-[10px] text-muted-foreground">(live filter)</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12">From:</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex-1 h-7 px-2 text-xs border rounded-md text-left flex items-center gap-1 hover-elevate">
                              <CalendarDays className="w-3 h-3 text-muted-foreground" />
                              {fromDisplay}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={filters.dueDateFrom ? new Date(filters.dueDateFrom) : presetRange?.from}
                              onSelect={(date) => {
                                setFilters({...filters, dueDateFrom: date || undefined, dueDatePreset: undefined});
                              }}
                            />
                            {(filters.dueDateFrom || filters.dueDatePreset) && (
                              <div className="p-2 border-t">
                                <button 
                                  className="text-xs text-destructive hover:underline"
                                  onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDatePreset: undefined})}
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12">To:</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex-1 h-7 px-2 text-xs border rounded-md text-left flex items-center gap-1 hover-elevate">
                              <CalendarDays className="w-3 h-3 text-muted-foreground" />
                              {toDisplay}
                            </button>
                          </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-2 border-b flex gap-1">
                          <button
                            className={`text-xs px-2 py-1 rounded border ${
                              filters.dueDatePreset === 'today' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                            }`}
                            onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'today'})}
                          >Today</button>
                          <button
                            className={`text-xs px-2 py-1 rounded border ${
                              filters.dueDatePreset === 'tomorrow' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                            }`}
                            onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'tomorrow'})}
                          >Tomorrow</button>
                        </div>
                        <CalendarComponent
                          mode="single"
                          selected={filters.dueDateTo ? new Date(filters.dueDateTo) : undefined}
                          onSelect={(date) => {
                            setFilters({...filters, dueDateTo: date || undefined, dueDatePreset: undefined});
                          }}
                        />
                        {filters.dueDateTo && (
                          <div className="p-2 border-t">
                            <button 
                              className="text-xs text-destructive hover:underline"
                              onClick={() => setFilters({...filters, dueDateTo: undefined})}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  );
                })()}
                {/* Quick Presets - use symbolic presets that resolve dynamically each day */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Quick Presets</div>
                <div className="px-2 pb-2 flex flex-wrap gap-1">
                  <button 
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      filters.dueDatePreset === 'overdue' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                    }`}
                    onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'overdue'})}
                  >Overdue</button>
                  <button 
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      filters.dueDatePreset === 'today' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                    }`}
                    onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'today'})}
                  >Today</button>
                  <button 
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      filters.dueDatePreset === 'tomorrow' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                    }`}
                    onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'tomorrow'})}
                  >Tomorrow</button>
                  <button 
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      filters.dueDatePreset === 'this-week' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                    }`}
                    onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'this-week'})}
                  >This Week</button>
                  <button 
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      filters.dueDatePreset === 'last-week-to-today' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                    }`}
                    onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'last-week-to-today'})}
                  >Last Week+</button>
                  <button 
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      filters.dueDatePreset === 'this-month' ? 'bg-[#bba7db] text-white border-[#bba7db]' : 'hover-elevate'
                    }`}
                    onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: 'this-month'})}
                  >This Month</button>
                  {(filters.dueDateFrom || filters.dueDateTo || filters.dueDatePreset) && (
                    <button 
                      className="text-[10px] px-1.5 py-0.5 rounded border text-destructive hover-elevate"
                      onClick={() => setFilters({...filters, dueDateFrom: undefined, dueDateTo: undefined, dueDatePreset: undefined})}
                    >Clear</button>
                  )}
                </div>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-1.5">Project</div>
                <div className="max-h-32 overflow-y-auto">
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
                </div>
                {hasActiveFilters && (
                  <div className="border-t mt-1 pt-1">
                    <DropdownMenuItem onClick={clearAllFilters} className="text-destructive">
                      <X className="w-3 h-3 mr-2" />
                      Clear all filters
                    </DropdownMenuItem>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Group By (list and board views) */}
            {(activeView === "list" || activeView === "board") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                    <span>Group: {groupBy === 'none' ? 'None' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {activeView === "list" ? (
                    // List view supports "none" grouping
                    (["none", "status", "priority", "project", "labels"] as const).map(option => (
                      <DropdownMenuItem key={option} onClick={() => setGroupBy(option)}>
                        {option === 'none' ? 'No Grouping' : option.charAt(0).toUpperCase() + option.slice(1)}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    // Board view always needs grouping (no "none" option)
                    (["status", "priority", "project", "labels"] as const).map(option => (
                      <DropdownMenuItem key={option} onClick={() => setGroupBy(option)}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Card Display Settings - only show in board view */}
            {activeView === "board" && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                    data-testid="button-card-settings"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Display</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Card Display</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={cardDisplaySettings.showStatus !== false}
                          onCheckedChange={(checked) => 
                            setCardDisplaySettings({...cardDisplaySettings, showStatus: checked as boolean})
                          }
                        />
                        <span className="text-xs">Status</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={cardDisplaySettings.showAssignee !== false}
                          onCheckedChange={(checked) => 
                            setCardDisplaySettings({...cardDisplaySettings, showAssignee: checked as boolean})
                          }
                        />
                        <span className="text-xs">Assignee</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={cardDisplaySettings.showDueDate !== false}
                          onCheckedChange={(checked) => 
                            setCardDisplaySettings({...cardDisplaySettings, showDueDate: checked as boolean})
                          }
                        />
                        <span className="text-xs">Due Date</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={cardDisplaySettings.showPriority !== false}
                          onCheckedChange={(checked) => 
                            setCardDisplaySettings({...cardDisplaySettings, showPriority: checked as boolean})
                          }
                        />
                        <span className="text-xs">Priority</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={cardDisplaySettings.showLabels !== false}
                          onCheckedChange={(checked) => 
                            setCardDisplaySettings({...cardDisplaySettings, showLabels: checked as boolean})
                          }
                        />
                        <span className="text-xs">Labels</span>
                      </label>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

          </div>
        </div>
      </div>

      {/* Content - connected to header (no gap, shared border) */}
      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
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
                  columnConfig={{ order: listColumnOrder, sort: listSortConfig }}
                  onColumnConfigChange={(config) => {
                    setListColumnOrder(config.order);
                    setListSortConfig(config.sort);
                  }}
                  onAddTask={(title) => createTaskMutation.mutate(title)}
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
              onAddTask={(status) => {
                setInitialBoardStatus(status);
                setShowCreateDialog(true);
              }}
              onDelete={handleDeleteTask}
              showActions={true}
              groupBy={groupBy === 'none' ? 'status' : groupBy as BoardGroupByType}
              fieldCategories={fieldCategories}
              projects={projects.map(p => ({ id: p.id, name: p.name, color: p.color }))}
              businessNickname={businessNickname}
              displaySettings={cardDisplaySettings}
            />
          </div>
        ) : (
          <div className="h-full">
            <EnhancedCalendar
              events={calendarEvents}
              currentDate={calendarDate}
              onCurrentDateChange={setCalendarDate}
              view={calendarMode}
              onViewChange={setCalendarMode}
              onEventComplete={handleEventComplete}
              onEventReschedule={handleEventReschedule}
              onEventResize={handleEventResize}
              onEventClick={handleEventClick}
              hideInternalHeader={true}
            />
          </div>
        )}
      </div>

      {/* Task Modals */}
      <TaskEditModal
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setInitialBoardStatus("");
        }}
        defaultAssigneeId={user.id}
        initialStatus={initialBoardStatus || undefined}
      />
      <TaskEditModal
        task={editingTask || undefined}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
        onDelete={(taskId) => {
          deleteTaskMutation.mutate(taskId);
          setEditingTask(null);
        }}
      />

      {/* Save View Dialog */}
      <Dialog open={showCreateViewDialog} onOpenChange={setShowCreateViewDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Save your current filters and settings as a reusable view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="My Custom View"
                data-testid="input-view-name"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreateViewDialog(false)}
              className="h-8 px-3 text-sm border rounded-md hover-elevate"
              data-testid="button-cancel-view"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveView}
              disabled={!newViewName.trim() || createViewMutation.isPending}
              className="h-8 px-3 text-sm bg-[#bba7db] text-white rounded-md hover:bg-[#bba7db]/90 disabled:opacity-50"
              data-testid="button-save-view"
            >
              {createViewMutation.isPending ? "Saving..." : "Save View"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete View Confirmation */}
      <Dialog open={showDeleteViewDialog} onOpenChange={setShowDeleteViewDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete View</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{viewToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowDeleteViewDialog(false)}
              className="h-8 px-3 text-sm border rounded-md hover-elevate"
              data-testid="button-cancel-delete"
            >
              Cancel
            </button>
            <button
              onClick={() => viewToDelete && deleteViewMutation.mutate(viewToDelete.id)}
              disabled={deleteViewMutation.isPending}
              className="h-8 px-3 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 disabled:opacity-50"
              data-testid="button-confirm-delete"
            >
              {deleteViewMutation.isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit View Dialog */}
      <Dialog open={showEditViewDialog} onOpenChange={setShowEditViewDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit View</DialogTitle>
            <DialogDescription>
              Update the view name and save current filters to this view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-view-name">View Name</Label>
              <Input
                id="edit-view-name"
                value={editViewName}
                onChange={(e) => setEditViewName(e.target.value)}
                placeholder="My Custom View"
                data-testid="input-edit-view-name"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowEditViewDialog(false)}
              className="h-8 px-3 text-sm border rounded-md hover-elevate"
              data-testid="button-cancel-edit"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateView}
              disabled={!editViewName.trim() || updateViewMutation.isPending}
              className="h-8 px-3 text-sm bg-[#bba7db] text-white rounded-md hover:bg-[#bba7db]/90 disabled:opacity-50"
              data-testid="button-update-view"
            >
              {updateViewMutation.isPending ? "Updating..." : "Update View"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

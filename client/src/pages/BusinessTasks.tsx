import React, { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, MoreHorizontal, X, Search, ChevronLeft, ChevronRight, Pencil, ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import TaskBoard from "@/components/TaskBoard";
import TaskListCompact from "@/components/TaskListCompact";
import TaskModalAsana from "@/components/TaskModalAsana";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { type TaskView, type Task, type FieldCategoryWithOptions, type Project } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { applyTaskFilters, extractFilterOptions } from "@/utils/taskFilters";
import { useToast } from "@/hooks/use-toast";
import { type FilterState } from "@/components/FilterPanel";
import { useTaskPriorityOptions } from "@/hooks/useTaskPriorityOptions";

export default function BusinessTasks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"board" | "list" | "calendar">("board");
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [initialTaskStatus, setInitialTaskStatus] = useState<string>("todo");
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'priority' | 'assignee'>('none');
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>(undefined);
  const [cardDisplaySettings, setCardDisplaySettings] = useState({
    showPriority: true,
    showStatus: true,
    showDescription: true,
    showTags: true,
    showLabels: true,
    showAssignee: true,
    showDueDate: true,
    showSubtasks: true,
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showNavigation, setShowNavigation] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  
  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState<string>("week");

  // Scroll navigation functions
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -320,
        behavior: 'smooth'
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 320,
        behavior: 'smooth'
      });
    }
  };

  // Load view preferences from database
  const { data: userPreferences, isError: preferencesError } = useQuery({
    queryKey: ["/api/user-view-preferences", "business_tasks"],
    queryFn: async () => {
      console.log('[BusinessTasks] Fetching user view preferences...');
      const response = await fetch("/api/user-view-preferences/business_tasks", {
        credentials: "include",
      });
      console.log('[BusinessTasks] Preferences fetch response status:', response.status);
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[BusinessTasks] No preferences found (404)');
          return null;
        }
        throw new Error("Failed to fetch view preferences");
      }
      const data = await response.json();
      console.log('[BusinessTasks] Preferences fetched successfully:', data);
      return data;
    },
  });

  // Apply loaded preferences
  useEffect(() => {
    console.log('[BusinessTasks] userPreferences changed:', userPreferences);
    if (userPreferences?.preferences) {
      console.log('[BusinessTasks] Applying loaded preferences');
      if (userPreferences.preferences.cardDisplaySettings) {
        setCardDisplaySettings(userPreferences.preferences.cardDisplaySettings);
      }
      if (userPreferences.preferences.activeTab) {
        setActiveTab(userPreferences.preferences.activeTab);
      }
      if (userPreferences.preferences.groupBy) {
        setGroupBy(userPreferences.preferences.groupBy);
      }
      setPreferencesLoaded(true);
    } else if (userPreferences === null || preferencesError) {
      console.log('[BusinessTasks] No saved preferences, using defaults');
      setPreferencesLoaded(true);
    }
  }, [userPreferences, preferencesError]);

  // Save view preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (prefs: { cardDisplaySettings: typeof cardDisplaySettings; activeTab: string; groupBy: string }) => {
      console.log('[BusinessTasks] Saving view preferences:', prefs);
      return await apiRequest("/api/user-view-preferences", "POST", {
        viewKey: "business_tasks",
        preferences: prefs,
      });
    },
    onSuccess: () => {
      console.log('[BusinessTasks] Preferences saved successfully');
    },
    onError: (error) => {
      console.error('[BusinessTasks] Error saving preferences:', error);
    },
  });

  // Auto-save preferences when they change (after initial load)
  useEffect(() => {
    if (preferencesLoaded) {
      const timer = setTimeout(() => {
        console.log('[BusinessTasks] Debounced save triggered');
        savePreferencesMutation.mutate({
          cardDisplaySettings,
          activeTab,
          groupBy,
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cardDisplaySettings, activeTab, groupBy, preferencesLoaded]);

  // Fetch business tasks (tasks without a project)
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { businessTasks: true }], 
    queryFn: async () => {
      const response = await fetch('/api/tasks?businessTasks=true', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch business tasks');
      return response.json();
    },
  });

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
      viewType: activeTab,
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

  const handleUpdateView = () => {
    if (!viewToEdit || !editViewName.trim()) return;
    updateViewMutation.mutate({
      id: viewToEdit.id,
      name: editViewName,
      filters,
      groupBy,
    });
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
      setGroupBy(view.groupBy as 'none' | 'status' | 'priority' | 'assignee');
    }
  };

  // Fetch task status options from field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Fetch task priority options from field categories
  const { priorityOptions: fetchedPriorityOptions } = useTaskPriorityOptions();
  
  // Use fetched priority options or fallback to defaults if none exist
  const priorityOptions = fetchedPriorityOptions.length > 0 ? fetchedPriorityOptions : [
    { key: "low", name: "Low", color: "#10B981" },
    { key: "medium", name: "Medium", color: "#F59E0B" },
    { key: "high", name: "High", color: "#EF4444" },
    { key: "urgent", name: "Urgent", color: "#DC2626" },
  ];

  // Apply filters to get filtered tasks
  const filteredTasks = applyTaskFilters(allTasks, filters);

  // Group tasks based on selected grouping
  const groupedTasks = React.useMemo(() => {
    if (groupBy === 'none' || activeTab !== 'list') {
      return { 'All Tasks': filteredTasks };
    }

    const groups: Record<string, Task[]> = {};
    
    filteredTasks.forEach((task) => {
      let groupKey = 'Ungrouped';
      
      switch (groupBy) {
        case 'status':
          groupKey = task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || 'No Status';
          break;
        case 'priority':
          groupKey = task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1) || 'No Priority';
          break;
        case 'assignee':
          groupKey = task.assignee || 'Unassigned';
          break;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });
    
    // Sort groups by name
    const sortedGroups: Record<string, Task[]> = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });
    
    return sortedGroups;
  }, [filteredTasks, groupBy, activeTab]);

  const { 
    availableAssignees: assigneeOptions = [],
    availableProjects: projectOptions = [],
  } = extractFilterOptions(allTasks);
  
  // Extract status options from field categories
  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  // Extract label options from field categories
  const labelCategory = fieldCategories.find(cat => cat.key === "task.labels");
  const labelOptions = labelCategory?.options?.map(opt => opt.name) || [];

  // Fetch projects for color coding
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Update task mutations
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully.",
      });
    },
  });

  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate, startTime }: { taskId: string; dueDate: string; startTime?: string }) => {
      const payload: any = { dueDate };
      if (startTime !== undefined) {
        payload.startTime = startTime;
      }
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task rescheduled",
        description: "Task has been moved to the new date.",
      });
    },
  });

  const resizeTaskMutation = useMutation({
    mutationFn: async ({ taskId, startTime, endTime }: { taskId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { startTime, endTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task time updated",
        description: "Task time has been updated successfully.",
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task deleted",
        description: "Task has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  const handleDeleteTask = (task: Task) => {
    deleteTaskMutation.mutate(task.id);
  };

  // Convert tasks to calendar events
  const calendarEvents: CalendarEvent[] = React.useMemo(() => {
    return filteredTasks
      .filter(task => task.dueDate)
      .map(task => {
        const project = projects.find(p => p.id === task.projectId);
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
  }, [filteredTasks, projects, completedOption]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    const newStatus = completed 
      ? (completedOption?.key || "done") 
      : (defaultOption?.key || "todo");
    updateTaskMutation.mutate({ taskId: eventId, status: newStatus });
  };

  const handleEventReschedule = (eventId: string, newDate: Date, eventType: "task" | "schedule" | "meeting" | "google-calendar", newTime?: string) => {
    const updatePayload: any = { 
      taskId: eventId, 
      dueDate: new Date(newDate).toISOString().split('T')[0]
    };
    
    if (newTime) {
      updatePayload.startTime = newTime;
    }
    
    rescheduleTaskMutation.mutate(updatePayload);
  };

  const handleEventResize = (eventId: string, startTime: string, endTime: string, eventType: "task" | "schedule" | "meeting" | "google-calendar") => {
    resizeTaskMutation.mutate({ taskId: eventId, startTime, endTime });
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.resource && event.type === "task") {
      setEditingTask(event.resource as Task);
      setShowCreateTaskDialog(true);
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="business-tasks">
      {/* Row 2 - Views & Options (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5" data-testid="tabs-task-views">
          {/* Default View Mode Tabs */}
          <button
            onClick={() => { setActiveTab("board"); setSelectedViewId(undefined); }}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "board" && !selectedViewId
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-board"
          >
            Board
          </button>
          <button
            onClick={() => { setActiveTab("list"); setSelectedViewId(undefined); }}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "list" && !selectedViewId
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-list"
          >
            List
          </button>
          <button
            onClick={() => { setActiveTab("calendar"); setSelectedViewId(undefined); }}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "calendar" && !selectedViewId
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-calendar"
          >
            Calendar
          </button>
          
          {/* Separator between default views and saved views */}
          {taskViews.length > 0 && (
            <div className="h-4 w-px bg-border mx-1" />
          )}
          
          {/* Saved/Custom Views - Toggle on/off with dropdown for options */}
          {taskViews.map((view) => (
            <div key={view.id} className="flex items-center">
              <button
                onClick={() => handleSelectSavedView(view)}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  selectedViewId === view.id 
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                    : 'hover-elevate'
                } active-elevate-2 flex items-center gap-1`}
                data-testid={`tab-${view.id}`}
              >
                {view.name}
              </button>
              {/* Dropdown arrow - only shows when view is selected */}
              {selectedViewId === view.id && (
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
                      onClick={() => handleEditView(view)}
                      data-testid={`menu-edit-${view.id}`}
                    >
                      <Pencil className="h-3 w-3 mr-2" />
                      Edit View
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleDeleteView(view)}
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
          ))}
          
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={() => setShowCreateViewDialog(true)}
            data-testid="button-add-view"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Right: Calendar Controls OR Saved Views */}
        {activeTab === "calendar" ? (
          <div className="flex items-center gap-1.5">
            {/* Calendar Navigation */}
            <button
              onClick={() => {
                const newDate = new Date(calendarDate);
                if (calendarMode === "day") {
                  newDate.setDate(newDate.getDate() - 1);
                } else if (calendarMode === "week") {
                  newDate.setDate(newDate.getDate() - 7);
                } else {
                  newDate.setMonth(newDate.getMonth() - 1);
                }
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
                if (calendarMode === "day") {
                  newDate.setDate(newDate.getDate() + 1);
                } else if (calendarMode === "week") {
                  newDate.setDate(newDate.getDate() + 7);
                } else {
                  newDate.setMonth(newDate.getMonth() + 1);
                }
                setCalendarDate(newDate);
              }}
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-calendar-next"
            >
              <ChevronRight className="w-3 h-3" />
            </button>

            {/* View Switcher */}
            <div className="flex items-center gap-0.5 ml-2">
              <button
                onClick={() => setCalendarMode("day")}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === "day"
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-day"
              >
                Day
              </button>
              <button
                onClick={() => setCalendarMode("week")}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === "week"
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-week"
              >
                Week
              </button>
              <button
                onClick={() => setCalendarMode("month")}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === "month"
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-month"
              >
                Month
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Row 3 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        {/* Left: Search + Filter Dropdowns */}
        <div className="flex items-center gap-1.5 flex-1">
          {/* Search */}
          <div className="relative w-48">
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
                <DropdownMenuItem key={option.key} className="flex items-center">
                  <Checkbox
                    checked={filters.status?.includes(option.key) || false}
                    onCheckedChange={() => {
                      const currentStatus = filters.status || [];
                      const newStatus = currentStatus.includes(option.key)
                        ? currentStatus.filter(s => s !== option.key)
                        : [...currentStatus, option.key];
                      setFilters({...filters, status: newStatus.length > 0 ? newStatus : undefined});
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
                <DropdownMenuItem key={option.key} className="flex items-center">
                  <Checkbox
                    checked={filters.priority?.includes(option.key) || false}
                    onCheckedChange={() => {
                      const currentPriority = filters.priority || [];
                      const newPriority = currentPriority.includes(option.key)
                        ? currentPriority.filter(p => p !== option.key)
                        : [...currentPriority, option.key];
                      setFilters({...filters, priority: newPriority.length > 0 ? newPriority : undefined});
                    }}
                  />
                  <span className="ml-2">{option.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assignee Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Assignee</span>
                {filters.assignee && filters.assignee.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.assignee.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {assigneeOptions.map(assignee => (
                <DropdownMenuItem key={assignee} className="flex items-center">
                  <Checkbox
                    checked={filters.assignee?.includes(assignee) || false}
                    onCheckedChange={() => {
                      const currentAssignee = filters.assignee || [];
                      const newAssignee = currentAssignee.includes(assignee)
                        ? currentAssignee.filter(a => a !== assignee)
                        : [...currentAssignee, assignee];
                      setFilters({...filters, assignee: newAssignee.length > 0 ? newAssignee : undefined});
                    }}
                  />
                  <span className="ml-2">{assignee}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Labels Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Labels</span>
                {filters.labels && filters.labels.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.labels.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {labelOptions.map(label => (
                <DropdownMenuItem key={label} className="flex items-center">
                  <Checkbox
                    checked={filters.labels?.includes(label) || false}
                    onCheckedChange={() => {
                      const currentLabels = filters.labels || [];
                      const newLabels = currentLabels.includes(label)
                        ? currentLabels.filter(l => l !== label)
                        : [...currentLabels, label];
                      setFilters({...filters, labels: newLabels.length > 0 ? newLabels : undefined});
                    }}
                  />
                  <span className="ml-2">{label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: Navigation + New Task + Settings */}
        <div className="flex items-center gap-1.5">
          {activeTab === "board" && showNavigation && (
            <>
              <button
                onClick={scrollLeft}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-scroll-left"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={scrollRight}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-scroll-right"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </>
          )}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowCreateTaskDialog(true)}
            data-testid="button-new-task-header"
          >
            <Plus className="w-3 h-3" />
            <span>New Task</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-view-menu"
              >
                <Settings className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="menu-manage-views">
                <Settings className="h-4 w-4 mr-2" />
                View Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content Area - Full Height */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "board" && (
          <div className="h-full p-4" data-testid="content-board">
            <TaskBoard
              tasks={filteredTasks}
              isLoading={tasksLoading}
              onTaskClick={(task) => {
                setEditingTask(task);
                setShowCreateTaskDialog(true);
              }}
              onAddTask={(status) => {
                setInitialTaskStatus(status);
                setEditingTask(null);
                setShowCreateTaskDialog(true);
              }}
              onDelete={handleDeleteTask}
              showActions={true}
              displaySettings={cardDisplaySettings}
            />
          </div>
        )}

        {activeTab === "list" && (
          <div className="h-full p-4" data-testid="content-list">
            <TaskListCompact
              groupedTasks={groupedTasks}
              isLoading={tasksLoading}
              onTaskClick={(task) => {
                setEditingTask(task);
                setShowCreateTaskDialog(true);
              }}
              onDelete={handleDeleteTask}
              showActions={true}
            />
          </div>
        )}

        {activeTab === "calendar" && (
          <div className="h-full" data-testid="content-calendar">
            <EnhancedCalendar
              events={calendarEvents}
              onEventClick={handleEventClick}
              onEventComplete={handleEventComplete}
              onEventReschedule={handleEventReschedule}
              onEventResize={handleEventResize}
              showCompletionCheckbox={true}
              currentDate={calendarDate}
              onCurrentDateChange={setCalendarDate}
              view={calendarMode as any}
              onViewChange={(newView) => setCalendarMode(newView)}
              hideInternalHeader={true}
            />
          </div>
        )}
      </div>

      {/* Task Creation Dialog */}
      {!editingTask && (
        <TaskModalAsana 
          open={showCreateTaskDialog}
          onOpenChange={(open) => {
            setShowCreateTaskDialog(open);
            if (!open) {
              setEditingTask(null);
              setInitialTaskStatus("todo");
            }
          }}
          projectId=""
          initialStatus={initialTaskStatus}
          defaultScope="business"
        />
      )}

      {/* Task Editing Dialog */}
      {editingTask && (
        <TaskModalAsana
          task={editingTask}
          open={showCreateTaskDialog}
          onOpenChange={(open) => {
            setShowCreateTaskDialog(open);
            if (!open) setEditingTask(null);
          }}
          projectId={editingTask.projectId || ""}
        />
      )}

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

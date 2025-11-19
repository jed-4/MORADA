import React, { useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Plus, Settings, MoreHorizontal, X, Flag, User, Tag, Layers, Eye, Zap, Search, GripVertical, Columns as ColumnsIcon, SlidersHorizontal } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TaskBoard from "@/components/TaskBoard";
import TaskList from "@/components/TaskList";
import TaskListCompact from "@/components/TaskListCompact";
import { CasvaTaskList } from "@/components/tasks/CasvaTaskList";
import TaskModalAsana from "@/components/TaskModalAsana";
import FilterPanel, { type FilterState } from "@/components/FilterPanel";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { type TaskView, type Task, type FieldCategoryWithOptions, type Project } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { applyTaskFilters, extractFilterOptions, deserializeFilters } from "@/utils/taskFilters";
import { useProject } from "@/contexts/ProjectContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts, CASVA_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

interface TasksParams {
  projectId?: string;
}

export default function Tasks() {
  // All hooks MUST be called at the top level before any conditional logic
  const { currentProject } = useProject();
  const { toast } = useToast();
  const params = useParams<TasksParams>();
  const [, setLocation] = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use projectId from URL params if available, otherwise fall back to currentProject
  const effectiveProjectId = params.projectId || currentProject?.id;
  const [activeTab, setActiveTab] = useState("list");
  const [showViewSettings, setShowViewSettings] = useState(false);
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewToDelete, setViewToDelete] = useState<TaskView | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [newViewType, setNewViewType] = useState<"kanban" | "list" | "calendar">("kanban");
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'assignee' | 'tags'>('status');
  const [filters, setFilters] = useState<FilterState>({});
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [cardWidth, setCardWidth] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');

  // Casva Keyboard Shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      ctrl: true,
      handler: () => setShowCreateTaskDialog(true),
      description: "Create new task (Ctrl+N)"
    },
    {
      key: "/",
      handler: () => searchInputRef.current?.focus(),
      description: "Focus search (/)"
    },
    {
      key: "g",
      handler: () => setActiveTab("board"),
      description: "Go to Board (G)"
    },
    {
      key: "d",
      handler: () => setLocation("/"),
      description: "Go to Dashboard (D)"
    }
  ]);
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

  // Column order and visibility for list view
  const [columnOrder, setColumnOrder] = useState(['assignee', 'dueDate', 'status', 'priority']);
  const [columnVisibility, setColumnVisibility] = useState({
    assignee: true,
    dueDate: true,
    status: true,
    priority: true,
  });

  // Track whether preferences have been loaded to prevent saving before load
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // Load card display settings from localStorage when project changes
  React.useEffect(() => {
    if (effectiveProjectId) {
      const savedSettings = localStorage.getItem(`cardDisplay_${effectiveProjectId}`);
      if (savedSettings) {
        try {
          setCardDisplaySettings(JSON.parse(savedSettings));
        } catch (e) {
          console.error('Failed to parse card display settings:', e);
        }
      }
    }
  }, [effectiveProjectId]);

  // Save card display settings to localStorage when they change
  React.useEffect(() => {
    if (effectiveProjectId) {
      localStorage.setItem(`cardDisplay_${effectiveProjectId}`, JSON.stringify(cardDisplaySettings));
    }
  }, [cardDisplaySettings, effectiveProjectId]);

  // ALL HOOKS MUST BE DECLARED HERE BEFORE ANY CONDITIONAL LOGIC
  // Mutation for creating new views
  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; viewType: "kanban" | "list"; projectId: string }): Promise<TaskView> => {
      const response = await fetch("/api/task-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create view");
      return response.json();
    },
    onSuccess: (newView: TaskView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views", effectiveProjectId] });
      setActiveTab(newView.id); // Auto-select the newly created view
      setShowCreateViewDialog(false);
      setNewViewName("");
      setNewViewType("kanban");
      toast({
        title: "View created",
        description: `"${newView.name}" has been created successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create view",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for updating views
  const updateViewMutation = useMutation({
    mutationFn: async (data: { id: string; filters?: any; columnConfig?: any }): Promise<TaskView> => {
      const response = await fetch(`/api/task-views/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ filters: data.filters, columnConfig: data.columnConfig }),
      });
      if (!response.ok) throw new Error("Failed to update view");
      return response.json();
    },
    onSuccess: (updatedView: TaskView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views", effectiveProjectId] });
      setShowCreateViewDialog(false);
      toast({
        title: "View saved",
        description: `"${updatedView.name}" has been updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save view",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting views
  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string): Promise<void> => {
      const response = await fetch(`/api/task-views/${viewId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete view");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views", effectiveProjectId] });
      // If the deleted view was active, switch to default kanban view
      if (viewToDelete && activeTab === viewToDelete.id) {
        setActiveTab("kanban");
      }
      setShowDeleteViewDialog(false);
      setViewToDelete(null);
      toast({
        title: "View deleted",
        description: `"${viewToDelete?.name}" has been deleted.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete view",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState<"day" | "week" | "month">("month");

  // Calendar mutations
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      return apiRequest(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", effectiveProjectId] });
    },
  });

  // Calendar event handlers
  const handleTaskComplete = (taskId: string, completed: boolean) => {
    updateTaskMutation.mutate({ taskId, updates: { completed } });
  };

  const handleTaskReschedule = (taskId: string, dueDate: string) => {
    updateTaskMutation.mutate({ taskId, updates: { dueDate } });
  };

  const handleTaskResize = (taskId: string, dueDate: string) => {
    updateTaskMutation.mutate({ taskId, updates: { dueDate } });
  };

  // Fetch saved task views and tasks filtered by current project (with enabled flags to prevent fetching when no project)
  const { data: taskViews = [] } = useQuery<TaskView[]>({
    queryKey: ["/api/task-views", effectiveProjectId],
    queryFn: async () => {
      if (!effectiveProjectId) return [];
      const response = await fetch(`/api/task-views?projectId=${effectiveProjectId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch task views');
      return response.json();
    },
    enabled: !!effectiveProjectId
  });

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", effectiveProjectId], 
    queryFn: async () => {
      if (!effectiveProjectId) return [];
      const response = await fetch(`/api/tasks?projectId=${effectiveProjectId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!effectiveProjectId
  });

  // Fetch task status options from field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  // Extract task status and priority options
  const taskStatusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];
  const taskPriorityCategory = fieldCategories.find(cat => cat.key === "task.priority");
  const priorityOptions = taskPriorityCategory?.options || [];

  // Load user view preferences
  const { data: userPreferences } = useQuery({
    queryKey: ["/api/user-view-preferences", "tasks"],
    queryFn: async () => {
      const response = await fetch("/api/user-view-preferences/tasks", {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch view preferences");
      }
      return response.json();
    },
  });

  // Apply loaded preferences when they arrive
  React.useEffect(() => {
    if (userPreferences?.preferences) {
      const prefs = userPreferences.preferences;
      if (prefs.activeTab) setActiveTab(prefs.activeTab);
      if (prefs.groupBy) setGroupBy(prefs.groupBy);
      if (prefs.filters) setFilters(prefs.filters);
      if (prefs.columnOrder) setColumnOrder(prefs.columnOrder);
      if (prefs.columnVisibility) setColumnVisibility(prefs.columnVisibility);
      if (prefs.cardDisplaySettings) setCardDisplaySettings(prefs.cardDisplaySettings);
      if (prefs.cardWidth) setCardWidth(prefs.cardWidth);
      setPreferencesLoaded(true);
    } else if (userPreferences === null) {
      // No saved preferences, mark as loaded with defaults
      setPreferencesLoaded(true);
    }
  }, [userPreferences]);

  // Save user view preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (preferences: any) => {
      const response = await fetch("/api/user-view-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          viewKey: "tasks",
          preferences,
        }),
      });
      if (!response.ok) throw new Error("Failed to save view preferences");
      return response.json();
    },
  });

  // Debounced save effect - save preferences when state changes (only after initial load)
  React.useEffect(() => {
    if (!preferencesLoaded) return;

    const timeoutId = setTimeout(() => {
      savePreferencesMutation.mutate({
        activeTab,
        groupBy,
        filters,
        columnOrder,
        columnVisibility,
        cardDisplaySettings,
        cardWidth,
      });
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [activeTab, groupBy, filters, columnOrder, columnVisibility, cardDisplaySettings, cardWidth, preferencesLoaded]);

  // Group tasks based on selected grouping (useMemo hook must be declared here with all other hooks)
  const groupedTasks = React.useMemo(() => {
    if (!currentProject) return {};
    
    // Calculate dependencies inline when currentProject exists
    const defaultViews = [
      { id: "kanban", name: "Board", viewType: "kanban" },
      { id: "list", name: "List View", viewType: "list" },
      { id: "calendar", name: "Calendar View", viewType: "calendar" },
    ];
    const allViews = [...defaultViews, ...taskViews];
    const filterOptions = extractFilterOptions(allTasks);
    const filteredTasks = applyTaskFilters(allTasks, filters);
    
    const getCurrentViewFilters = () => {
      const currentView = taskViews.find(view => view.id === activeTab);
      if (currentView && currentView.filters) {
        return deserializeFilters(currentView.filters as Record<string, any>);
      }
      return {};
    };
    
    const effectiveFilters = {
      ...getCurrentViewFilters(),
      ...filters,
    };
    
    const effectivelyFilteredTasks = applyTaskFilters(allTasks, effectiveFilters);
    
    if (activeTab !== 'list' && activeTab !== 'kanban') {
      return { 'All Tasks': effectivelyFilteredTasks };
    }
    
    // For list view without grouping, return all tasks
    if (activeTab === 'list') {
      return { 'All Tasks': effectivelyFilteredTasks };
    }

    const groups: Record<string, Task[]> = {};
    
    effectivelyFilteredTasks.forEach((task) => {
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
        case 'tags':
          groupKey = task.tags && task.tags.length > 0 ? task.tags[0] : 'No Tags';
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
  }, [currentProject, taskViews, allTasks, filters, groupBy, activeTab]);

  // CONDITIONAL RENDERING - MUST BE AFTER ALL HOOKS
  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-medium text-muted-foreground">No Project Selected</h2>
          <p className="text-muted-foreground">Please select a project from the dropdown to view its tasks.</p>
        </div>
      </div>
    );
  }

  // Helper functions and logic (after hooks, after early return)
  const isCustomView = (view: any): view is TaskView => {
    return view.id !== "kanban" && view.id !== "list" && view.id !== "calendar";
  };

  const handleDeleteView = (view: TaskView) => {
    setViewToDelete(view);
    setShowDeleteViewDialog(true);
  };

  const confirmDeleteView = () => {
    if (viewToDelete) {
      deleteViewMutation.mutate(viewToDelete.id);
    }
  };

  const handleSaveView = () => {
    if (!effectiveProjectId) return;
    
    // Check if we're on a custom view
    const currentView = taskViews.find(view => view.id === activeTab);
    
    if (currentView) {
      // Update existing view with current filters and settings
      updateViewMutation.mutate({
        id: currentView.id,
        filters: filters,
        columnConfig: {
          columnOrder,
          columnVisibility,
          cardDisplaySettings,
          cardWidth,
          groupBy,
        },
      });
    } else {
      // Create new view from default view
      if (!newViewName.trim()) return;
      createViewMutation.mutate({
        name: newViewName.trim(),
        viewType: newViewType === "calendar" ? "kanban" : newViewType,
        projectId: effectiveProjectId,
        filters: filters,
        columnConfig: {
          columnOrder,
          columnVisibility,
          cardDisplaySettings,
          cardWidth,
          groupBy,
        },
      });
    }
  };


  // Default views
  const defaultViews = [
    { id: "kanban", name: "Board", viewType: "kanban" },
    { id: "list", name: "List View", viewType: "list" },
    { id: "calendar", name: "Calendar View", viewType: "calendar" },
  ];

  const allViews = [...defaultViews, ...taskViews];

  // Extract filter options from all tasks
  const filterOptions = extractFilterOptions(allTasks);

  // Apply filters to tasks
  const filteredTasks = applyTaskFilters(allTasks, filters);

  // Get current view filters for custom views
  const getCurrentViewFilters = () => {
    const currentView = taskViews.find(view => view.id === activeTab);
    if (currentView && currentView.filters) {
      return deserializeFilters(currentView.filters as Record<string, any>);
    }
    return {};
  };

  // Merge view filters with user filters
  const effectiveFilters = {
    ...getCurrentViewFilters(),
    ...filters,
  };

  const effectivelyFilteredTasks = applyTaskFilters(allTasks, effectiveFilters);

  // Convert tasks to calendar events
  const tasksToCalendarEvents = (tasks: Task[]): CalendarEvent[] => {
    return tasks.map((task) => {
      const dueDate = task.dueDate ? new Date(task.dueDate) : new Date();
      return {
        id: task.id,
        title: task.title,
        start: dueDate,
        end: dueDate,
        type: "task" as const,
        projectId: task.projectId,
        status: task.status,
        priority: task.priority,
        completed: task.completed,
        assigneeId: task.assigneeId,
      };
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* UNIFIED 3-ROW HEADER FOR ALL VIEWS */}
      
      {/* Row 1 - Project Controls (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Project Name + Task Count */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {params.projectId ? `${currentProject.name} Tasks` : 'All Tasks'}
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-task-count">
            {effectivelyFilteredTasks.length} tasks
          </Badge>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowCreateTaskDialog(true)}
            data-testid="button-add-task"
          >
            <Plus className="w-3 h-3" />
            <span>Add Task</span>
          </button>
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={() => setShowViewSettings(true)}
            data-testid="button-settings"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Row 2 - Views & Options (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5" data-testid="tabs-task-views">
          {allViews.map((view) => {
            const canDelete = isCustomView(view);
            return (
              <div key={view.id} className="relative group">
                <button
                  onClick={() => setActiveTab(view.id)}
                  className={`h-6 w-auto px-2 text-xs border rounded-md ${
                    activeTab === view.id 
                      ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                      : 'hover-elevate'
                  } active-elevate-2 flex items-center gap-1`}
                  data-testid={`tab-${view.id}`}
                >
                  {view.name}
                  {view.viewType === "list" && view.id !== "list" && (
                    <Badge variant="outline" className="ml-1 text-xs px-1 py-0 h-4">
                      NEW
                    </Badge>
                  )}
                </button>
                {canDelete && (
                  <button
                    className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteView(view);
                    }}
                    data-testid={`button-delete-${view.id}`}
                  >
                    <X className="h-2 w-2" />
                  </button>
                )}
              </div>
            );
          })}
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={() => setShowCreateViewDialog(true)}
            data-testid="button-add-view"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Right: More Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-view-menu"
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowCreateViewDialog(true)} data-testid="menu-save-view">
              <Plus className="h-4 w-4 mr-2" />
              Save View
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menu-manage-views">
              <Settings className="h-4 w-4 mr-2" />
              Manage Views
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Row 3 - Search & Filters (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
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
                      className="mr-2"
                    />
                    <div className="flex items-center gap-2">
                      {option.color && (
                        <div 
                          className="w-3 h-3 rounded-full border border-border" 
                          style={{ backgroundColor: option.color }}
                        />
                      )}
                      {option.name}
                    </div>
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
                {(priorityOptions.length > 0 ? priorityOptions : [
                  { key: "high", name: "High", color: null },
                  { key: "medium", name: "Medium", color: null },
                  { key: "low", name: "Low", color: null },
                ]).map(option => (
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
                      className="mr-2"
                    />
                    <div className="flex items-center gap-2">
                      {option.color && (
                        <div 
                          className="w-3 h-3 rounded-full border border-border" 
                          style={{ backgroundColor: option.color }}
                        />
                      )}
                      {option.name}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Assignee Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5" data-testid="button-filter-assignee">
                  <span>Assignee</span>
                  {filters.assignee && filters.assignee.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {filters.assignee.length}
                    </Badge>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {filterOptions.availableAssignees.length > 0 ? (
                  filterOptions.availableAssignees.map(assignee => (
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
                        className="mr-2"
                        data-testid={`filter-assignee-${assignee.replace(/\s+/g, '-').toLowerCase()}`}
                      />
                      {assignee}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled className="text-muted-foreground text-sm">
                    No assignees yet
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Tags Filter */}
            {filterOptions.availableTags.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                    <span>Tags</span>
                    {filters.tags && filters.tags.length > 0 && (
                      <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                        {filters.tags.length}
                      </Badge>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {filterOptions.availableTags.map(tag => (
                    <DropdownMenuItem key={tag} className="flex items-center">
                      <Checkbox
                        checked={filters.tags?.includes(tag) || false}
                        onCheckedChange={() => {
                          const currentTags = filters.tags || [];
                          const newTags = currentTags.includes(tag)
                            ? currentTags.filter(t => t !== tag)
                            : [...currentTags, tag];
                          setFilters({...filters, tags: newTags.length > 0 ? newTags : undefined});
                        }}
                        className="mr-2"
                      />
                      {tag}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Labels Filter */}
            {filterOptions.availableLabels && filterOptions.availableLabels.length > 0 && (
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
                  {filterOptions.availableLabels.map(label => (
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
                        className="mr-2"
                      />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

          </div>

          {/* Right: Card Width & Group By Controls */}
          <div className="flex items-center gap-1.5">
            {/* Card Width - only show in kanban view */}
            {activeTab === "kanban" && (
              <Select value={cardWidth} onValueChange={(value) => setCardWidth(value as typeof cardWidth)}>
                <SelectTrigger className="h-6 w-auto px-2 py-0 text-xs border [&>svg]:hidden" data-testid="select-card-width">
                  <span>Cards</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="spacious">Spacious</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Card Display Settings - only show in kanban view */}
            {activeTab === "kanban" && (
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
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Group by - only show in kanban view */}
            {activeTab === "kanban" && (
              <Select value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)}>
                <SelectTrigger className="h-6 w-auto px-2 py-0 text-xs border [&>svg]:hidden" data-testid="select-group-by">
                  <span>Group by</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">By Status</SelectItem>
                  <SelectItem value="priority">By Priority</SelectItem>
                  {filterOptions.availableAssignees.length > 0 && (
                    <SelectItem value="assignee">By Assignee</SelectItem>
                  )}
                  {filterOptions.availableTags.length > 0 && (
                    <SelectItem value="tags">By Tags</SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}

            {/* Columns button - only show in list view */}
            {activeTab === "list" && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                    data-testid="button-columns"
                  >
                    <ColumnsIcon className="w-3 h-3" />
                    <span>Columns</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <div className="space-y-3">
                    <div className="text-sm font-semibold">Columns</div>
                    
                    <div className="space-y-2">
                      {columnOrder.map((columnKey, index) => {
                        const columnLabels = {
                          assignee: 'Assignee',
                          dueDate: 'Due Date',
                          status: 'Status',
                          priority: 'Priority'
                        };
                        
                        return (
                          <div key={columnKey} className="flex items-center gap-2 group">
                            <button
                              className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                              onMouseDown={(e) => {
                                const startY = e.clientY;
                                const startIndex = index;
                                
                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                  const deltaY = moveEvent.clientY - startY;
                                  const newIndex = Math.max(0, Math.min(columnOrder.length - 1, startIndex + Math.round(deltaY / 32)));
                                  
                                  if (newIndex !== startIndex) {
                                    const newOrder = [...columnOrder];
                                    const [removed] = newOrder.splice(startIndex, 1);
                                    newOrder.splice(newIndex, 0, removed);
                                    setColumnOrder(newOrder);
                                  }
                                };
                                
                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                };
                                
                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                            >
                              <GripVertical className="h-4 w-4 text-gray-400" />
                            </button>
                            
                            <Checkbox
                              checked={columnVisibility[columnKey as keyof typeof columnVisibility]}
                              onCheckedChange={(checked) => {
                                setColumnVisibility({
                                  ...columnVisibility,
                                  [columnKey]: checked
                                });
                              }}
                            />
                            
                            <span className="text-sm flex-1">
                              {columnLabels[columnKey as keyof typeof columnLabels]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

      {/* Content Area with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <TabsContent value="kanban" className="h-full m-0 data-[state=active]:flex">
            <TaskBoard tasks={effectivelyFilteredTasks} isLoading={tasksLoading} onTaskClick={(task: Task) => setEditingTask(task)} projectId={effectiveProjectId} displaySettings={cardDisplaySettings} cardWidth={cardWidth} />
          </TabsContent>
          
          <TabsContent value="list" className="h-full m-0 data-[state=active]:flex">
            <div className="flex-1 overflow-auto p-1">
              <CasvaTaskList
                tasks={effectivelyFilteredTasks}
                onEditTask={(task: Task) => setEditingTask(task)}
                onAddTask={() => setIsCreatingInline(true)}
                showCheckboxes={true}
                isCreatingInline={isCreatingInline}
                onCancelInlineCreate={() => setIsCreatingInline(false)}
                projectId={effectiveProjectId}
                columnVisibility={columnVisibility}
                columnOrder={columnOrder}
                statusOptions={statusOptions}
                priorityOptions={priorityOptions}
              />
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="h-full m-0 data-[state=active]:flex">
            <EnhancedCalendar
              events={tasksToCalendarEvents(effectivelyFilteredTasks)}
              date={calendarDate}
              onDateChange={setCalendarDate}
              mode={calendarMode}
              onEventClick={(event) => {
                const task = allTasks.find((t) => t.id === event.id);
                if (task) setEditingTask(task);
              }}
              onEventComplete={handleTaskComplete}
              onEventReschedule={handleTaskReschedule}
              onEventResize={handleTaskResize}
            />
          </TabsContent>
          
          {/* Custom Views */}
          {taskViews.map((view) => {
            // For custom views, merge view filters with user filters and apply to tasks
            const viewFilters = deserializeFilters(view.filters as Record<string, any> || {});
            const combinedFilters = { ...viewFilters, ...filters };
            const viewFilteredTasks = applyTaskFilters(allTasks, combinedFilters);
            
            return (
              <TabsContent key={view.id} value={view.id} className="h-full m-0 data-[state=active]:flex">
                {view.viewType === "kanban" ? (
                  <TaskBoard tasks={viewFilteredTasks} isLoading={tasksLoading} onTaskClick={(task: Task) => setEditingTask(task)} displaySettings={cardDisplaySettings} cardWidth={cardWidth} />
                ) : view.viewType === "calendar" ? (
                  <EnhancedCalendar
                    events={tasksToCalendarEvents(viewFilteredTasks)}
                    date={calendarDate}
                    onDateChange={setCalendarDate}
                    mode={calendarMode}
                    onEventClick={(event) => {
                      const task = allTasks.find((t) => t.id === event.id);
                      if (task) setEditingTask(task);
                    }}
                    onEventComplete={handleTaskComplete}
                    onEventReschedule={handleTaskReschedule}
                    onEventResize={handleTaskResize}
                  />
                ) : (
                  <div className="flex-1 overflow-auto p-4">
                    <TaskListCompact tasks={viewFilteredTasks} isLoading={tasksLoading} onTaskClick={(task: Task) => setEditingTask(task)} projectId={effectiveProjectId} />
                  </div>
                )}
              </TabsContent>
            );
          })}
        </div>
      </Tabs>

      {/* Save View Dialog */}
      <Dialog open={showCreateViewDialog} onOpenChange={setShowCreateViewDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {taskViews.find(view => view.id === activeTab) ? "Save View" : "Save As New View"}
            </DialogTitle>
            <DialogDescription>
              {taskViews.find(view => view.id === activeTab) 
                ? "Update the current view with your current filters and settings."
                : "Create a new view from the current view with your filters and settings."}
            </DialogDescription>
          </DialogHeader>
          {!taskViews.find(view => view.id === activeTab) && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="view-name">View Name</Label>
                <Input
                  id="view-name"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Enter view name"
                  data-testid="input-view-name"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="view-type">View Type</Label>
                <Select value={newViewType} onValueChange={(value: "kanban" | "list") => setNewViewType(value)}>
                  <SelectTrigger data-testid="select-view-type">
                    <SelectValue placeholder="Select view type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kanban">Board</SelectItem>
                    <SelectItem value="list">List View</SelectItem>
                    <SelectItem value="calendar">Calendar View</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateViewDialog(false)}
              data-testid="button-cancel-view"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveView}
              disabled={(taskViews.find(view => view.id === activeTab) ? false : !newViewName.trim()) || createViewMutation.isPending || updateViewMutation.isPending}
              data-testid="button-save-view"
            >
              {(createViewMutation.isPending || updateViewMutation.isPending) ? "Saving..." : "Save View"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete View Confirmation Dialog */}
      <AlertDialog open={showDeleteViewDialog} onOpenChange={setShowDeleteViewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete View</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{viewToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteView}
              disabled={deleteViewMutation.isPending}
              data-testid="button-confirm-delete"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteViewMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Creation Dialog */}
      <TaskModalAsana 
        open={showCreateTaskDialog}
        onOpenChange={setShowCreateTaskDialog}
        projectId={effectiveProjectId}
      />

      {/* Task Editing Dialog */}
      {editingTask && (
        <TaskModalAsana
          task={editingTask}
          open={!!editingTask}
          onOpenChange={(open) => !open && setEditingTask(null)}
          projectId={effectiveProjectId}
        />
      )}
    </div>
  );
}
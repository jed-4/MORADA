import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Plus, Settings, MoreHorizontal, X, Flag, User, Tag, Layers, Eye, Zap, Search, GripVertical, Columns as ColumnsIcon, SlidersHorizontal, Pencil, ChevronDown, List, LayoutGrid, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
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
import TaskEditModal from "@/components/TaskEditModal";
import FilterPanel, { type FilterState } from "@/components/FilterPanel";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { type TaskView, type Task, type FieldCategoryWithOptions, type Project } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { applyTaskFilters, extractFilterOptions, deserializeFilters } from "@/utils/taskFilters";
import { useProject } from "@/contexts/ProjectContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts, CASVA_SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";

interface TasksParams {
  projectId?: string;
}

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

export default function Tasks() {
  // All hooks MUST be called at the top level before any conditional logic
  const { currentProject } = useProject();
  const { toast } = useToast();
  const weekStartDay = useWeekStartDay();
  const params = useParams<TasksParams>();
  const [location, setLocation] = useLocation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use projectId from URL params if available, otherwise fall back to currentProject
  const effectiveProjectId = params.projectId || currentProject?.id;
  const [activeView, setActiveView] = useState<"list" | "kanban" | "calendar">("list");
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [showViewSettings, setShowViewSettings] = useState(false);
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [showEditViewDialog, setShowEditViewDialog] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewToDelete, setViewToDelete] = useState<TaskView | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [duplicateTaskData, setDuplicateTaskData] = useState<Partial<Task> | undefined>(undefined);
  const [viewToEdit, setViewToEdit] = useState<TaskView | null>(null);
  const [editViewName, setEditViewName] = useState("");
  const [newViewName, setNewViewName] = useState("");
  const [newViewType, setNewViewType] = useState<"kanban" | "list" | "calendar">("kanban");
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'assignee' | 'tags' | 'labels'>('status');
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
      handler: () => setActiveView("kanban"),
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

  // Column order, sorting, and visibility for list view
  const [columnOrder, setColumnOrder] = useState(['assignee', 'dueDate', 'status', 'priority']);
  const [listSortConfig, setListSortConfig] = useState<{ column: string; direction: 'asc' | 'desc' | null } | undefined>(undefined);
  const [columnVisibility, setColumnVisibility] = useState({
    assignee: true,
    dueDate: true,
    status: true,
    priority: true,
  });

  // Track whether preferences have been loaded to prevent saving before load
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);


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
      setSelectedViewId(newView.id); // Auto-select the newly created view
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
    mutationFn: async (data: { id: string; name?: string; filters?: any; columnConfig?: any }): Promise<TaskView> => {
      const response = await fetch(`/api/task-views/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: data.name, filters: data.filters, columnConfig: data.columnConfig }),
      });
      if (!response.ok) throw new Error("Failed to update view");
      return response.json();
    },
    onSuccess: (updatedView: TaskView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views", effectiveProjectId] });
      setShowCreateViewDialog(false);
      setShowEditViewDialog(false);
      setViewToEdit(null);
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

  // Handle edit view
  const handleEditView = (view: TaskView) => {
    setViewToEdit(view);
    setEditViewName(view.name);
    setShowEditViewDialog(true);
  };

  const handleUpdateView = () => {
    if (!viewToEdit || !editViewName.trim()) return;
    updateViewMutation.mutate({
      id: viewToEdit.id,
      name: editViewName,
      filters,
      columnConfig: {
        columnOrder,
        columnVisibility,
        cardDisplaySettings,
        cardWidth,
        groupBy,
      },
    });
  };

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
      if (viewToDelete && selectedViewId === viewToDelete.id) {
        setSelectedViewId(null);
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

  // Mutation for reordering views
  const reorderViewsMutation = useMutation({
    mutationFn: async (viewIds: string[]): Promise<void> => {
      await apiRequest("/api/task-views/reorder", {
        method: "POST",
        body: JSON.stringify({ viewIds }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views", effectiveProjectId] });
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
    queryClient.setQueryData(["/api/task-views", effectiveProjectId], reorderedViews);
    
    // Persist to server
    reorderViewsMutation.mutate(viewIds);
  };

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

  // Create task mutation (for inline task creation)
  const createTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      return await apiRequest(`/api/tasks`, "POST", {
        type: "task",
        title,
        content: title,
        projectId: effectiveProjectId || undefined,
        taskContextType: effectiveProjectId ? "project" : "business",
        taskContextId: effectiveProjectId || undefined,
        status: defaultStatusOption?.key || statusOptions[0]?.key || "todo",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", effectiveProjectId] });
      toast({
        title: "Task created",
        description: "New task has been created.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create task",
        variant: "destructive",
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", effectiveProjectId] });
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
    setTaskToDelete(task);
  };

  const confirmDeleteTask = () => {
    if (taskToDelete) {
      deleteTaskMutation.mutate(taskToDelete.id);
      setTaskToDelete(null);
      setShowCreateTaskDialog(false);
      setEditingTask(null);
    }
  };

  // Handle saved view selection with toggle behavior
  const handleSelectSavedView = (view: TaskView) => {
    // Toggle behavior: if clicking the already selected view, deselect it
    if (selectedViewId === view.id) {
      setSelectedViewId(null);
      setFilters({});
      setGroupBy('status');
      return;
    }
    
    setSelectedViewId(view.id);
    // Only apply filters, not view mode - views work across all view modes
    if (view.filters) {
      setFilters(view.filters as FilterState);
    }
    if (view.groupBy && view.groupBy !== 'assignee') {
      setGroupBy(view.groupBy as 'status' | 'priority' | 'assignee' | 'tags' | 'labels');
    }
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

  // Handle taskId from URL query params for notification links
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const taskId = urlParams.get('taskId');
    
    if (taskId && allTasks.length > 0 && !editingTask) {
      const taskToOpen = allTasks.find(t => t.id === taskId);
      if (taskToOpen) {
        setEditingTask(taskToOpen);
        // Clear taskId while preserving other query params
        urlParams.delete('taskId');
        const newSearch = urlParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [allTasks, editingTask, location]);

  // Fetch task status options from field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  // Extract task status and priority options
  const taskStatusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];
  const defaultStatusOption = taskStatusCategory?.options?.find(opt => opt.isDefault);
  const taskPriorityCategory = fieldCategories.find(cat => cat.key === "task.priority");
  const priorityOptions = taskPriorityCategory?.options || [];

  // Load user view preferences
  const { data: userPreferences, isLoading: preferencesLoading, error: preferencesError } = useQuery({
    queryKey: ["/api/user-view-preferences", "tasks"],
    queryFn: async () => {
      console.log('[Tasks] Fetching user view preferences...');
      const response = await fetch("/api/user-view-preferences/tasks", {
        credentials: "include",
      });
      console.log('[Tasks] Preferences fetch response status:', response.status);
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[Tasks] No preferences found (404)');
          return null;
        }
        const errorText = await response.text();
        console.error('[Tasks] Preferences fetch error:', response.status, errorText);
        throw new Error("Failed to fetch view preferences");
      }
      const data = await response.json();
      console.log('[Tasks] Preferences fetched successfully:', data);
      return data;
    },
  });
  
  // Log preferences loading state
  React.useEffect(() => {
    if (preferencesError) {
      console.error('[Tasks] Preferences query error:', preferencesError);
    }
  }, [preferencesError]);

  // Apply loaded preferences when they arrive
  React.useEffect(() => {
    console.log('[Tasks] userPreferences changed:', userPreferences);
    if (userPreferences?.preferences) {
      const prefs = userPreferences.preferences;
      console.log('[Tasks] Applying loaded preferences:', prefs);
      if (prefs.activeView) setActiveView(prefs.activeView);
      if (prefs.selectedViewId) setSelectedViewId(prefs.selectedViewId);
      if (prefs.groupBy) setGroupBy(prefs.groupBy);
      if (prefs.filters) setFilters(prefs.filters);
      if (prefs.columnOrder) {
        console.log('[Tasks] Setting columnOrder from preferences:', prefs.columnOrder);
        setColumnOrder(prefs.columnOrder);
      }
      if (prefs.columnVisibility) {
        console.log('[Tasks] Setting columnVisibility from preferences:', prefs.columnVisibility);
        setColumnVisibility(prefs.columnVisibility);
      }
      if (prefs.cardDisplaySettings) setCardDisplaySettings(prefs.cardDisplaySettings);
      if (prefs.cardWidth) setCardWidth(prefs.cardWidth);
      setPreferencesLoaded(true);
    } else if (userPreferences === null) {
      // No saved preferences, mark as loaded with defaults
      console.log('[Tasks] No saved preferences found, using defaults');
      setPreferencesLoaded(true);
    }
  }, [userPreferences]);

  // Save user view preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (preferences: any) => {
      console.log('[Tasks] Saving preferences:', { viewKey: 'tasks', preferences });
      const response = await fetch("/api/user-view-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          viewKey: "tasks",
          preferences,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Tasks] Failed to save preferences:', response.status, errorText);
        throw new Error(`Failed to save view preferences: ${response.status}`);
      }
      const result = await response.json();
      console.log('[Tasks] Preferences saved successfully:', result);
      return result;
    },
    onError: (error) => {
      console.error('[Tasks] Save preferences mutation error:', error);
    },
  });

  // Debounced save effect - save preferences when state changes (only after initial load)
  React.useEffect(() => {
    if (!preferencesLoaded) return;

    const timeoutId = setTimeout(() => {
      savePreferencesMutation.mutate({
        activeView,
        selectedViewId,
        groupBy,
        filters,
        columnOrder,
        columnVisibility,
        cardDisplaySettings,
        cardWidth,
      });
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [activeView, selectedViewId, groupBy, filters, columnOrder, columnVisibility, cardDisplaySettings, cardWidth, preferencesLoaded]);

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
    const filteredTasks = applyTaskFilters(allTasks, filters, weekStartDay);
    
    const getCurrentViewFilters = () => {
      if (!selectedViewId) return {};
      const currentView = taskViews.find(view => view.id === selectedViewId);
      if (currentView && currentView.filters) {
        return deserializeFilters(currentView.filters as Record<string, any>);
      }
      return {};
    };
    
    const effectiveFilters = {
      ...getCurrentViewFilters(),
      ...filters,
    };
    
    const effectivelyFilteredTasks = applyTaskFilters(allTasks, effectiveFilters, weekStartDay);
    
    // For list view without grouping, return all tasks
    if (activeView === 'list') {
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
    
    // Sort groups by name
    const sortedGroups: Record<string, Task[]> = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });
    
    return sortedGroups;
  }, [currentProject, taskViews, allTasks, filters, groupBy, activeView, selectedViewId, fieldCategories]);

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
    const currentView = selectedViewId ? taskViews.find(view => view.id === selectedViewId) : null;
    
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
  const filteredTasks = applyTaskFilters(allTasks, filters, weekStartDay);

  // Get current view filters for custom views
  const getCurrentViewFilters = () => {
    if (!selectedViewId) return {};
    const currentView = taskViews.find(view => view.id === selectedViewId);
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

  const effectivelyFilteredTasks = applyTaskFilters(allTasks, effectiveFilters, weekStartDay);

  // Convert tasks to calendar events
  const tasksToCalendarEvents = (tasks: Task[]): CalendarEvent[] => {
    return tasks.map((task) => {
      const dueDate = task.dueDate ? new Date(task.dueDate) : new Date();
      return {
        id: task.id,
        title: task.title,
        startDate: dueDate,
        endDate: dueDate,
        startTime: task.startTime,
        endTime: task.endTime,
        type: "task" as const,
        projectId: task.projectId,
        status: task.status,
        priority: task.priority,
        isCompleted: task.completed,
        color: (task as any).color,
        resource: task,
      };
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header Panel - 2 rows connected to content */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        {/* Row 1 - Title & Add Task */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {params.projectId ? `${currentProject.name} Tasks` : 'Tasks'}
          </h2>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowCreateTaskDialog(true)}
            data-testid="button-add-task"
          >
            <Plus className="w-3 h-3" />
            <span>Add Task</span>
          </button>
        </div>

        {/* Row 2 - View Tabs + Search & Filters */}
        <div className="h-8 flex items-center justify-between px-3 gap-3">
          {/* Left: View Tabs */}
          <div className="flex items-center gap-1" data-testid="tabs-task-views">
            {/* Default View Mode Tabs */}
            {(["list", "kanban", "calendar"] as const).map((view) => {
              const Icon = view === "list" ? List : view === "kanban" ? LayoutGrid : Calendar;
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
                  <span className="capitalize">{view === "kanban" ? "Board" : view}</span>
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
                      <span className="capitalize">{mode}</span>
                    </button>
                  ))}
                </div>
                <div className="h-4 w-px bg-border mx-1" />
              </>
            )}
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
                  <DropdownMenuItem key={option.key} className="flex items-center" onSelect={(e) => e.preventDefault()}>
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
                  <DropdownMenuItem key={option.key} className="flex items-center" onSelect={(e) => e.preventDefault()}>
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
                    <DropdownMenuItem key={assignee} className="flex items-center" onSelect={(e) => e.preventDefault()}>
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
                    <DropdownMenuItem key={tag} className="flex items-center" onSelect={(e) => e.preventDefault()}>
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
                    <DropdownMenuItem key={label} className="flex items-center" onSelect={(e) => e.preventDefault()}>
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
            {activeView === "kanban" && (
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
            {activeView === "kanban" && (
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
            {activeView === "kanban" && (
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
                  <SelectItem value="labels">By Labels</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Columns button - only show in list view */}
            {activeView === "list" && (
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
      </div>

      {/* Content Area - render based on activeView mode, with saved view filters applied */}
      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
        {activeView === "kanban" && (
          <div className="h-full p-2">
            <TaskBoard 
              tasks={effectivelyFilteredTasks} 
              isLoading={tasksLoading} 
              onTaskClick={(task: Task) => setEditingTask(task)} 
              projectId={effectiveProjectId} 
              displaySettings={cardDisplaySettings} 
              cardWidth={cardWidth} 
              onDelete={handleDeleteTask} 
              showActions={true}
              groupBy={groupBy === 'tags' ? 'labels' : groupBy === 'assignee' ? 'status' : groupBy as 'status' | 'priority' | 'labels'}
              fieldCategories={fieldCategories}
            />
          </div>
        )}
        
        {activeView === "list" && (
          <div className="flex-1 overflow-auto p-2">
            <TaskListCompact
              tasks={effectivelyFilteredTasks}
              isLoading={tasksLoading}
              onTaskClick={(task: Task) => setEditingTask(task)}
              projectId={effectiveProjectId}
              columnConfig={{ order: columnOrder, sort: listSortConfig }}
              onColumnConfigChange={(config) => {
                setColumnOrder(config.order);
                setListSortConfig(config.sort);
              }}
              onDelete={handleDeleteTask}
              showActions={true}
              onAddTask={(title) => createTaskMutation.mutate(title)}
            />
          </div>
        )}

        {activeView === "calendar" && (
          <div className="h-full p-2">
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
          </div>
        )}
      </div>

      {/* Save View Dialog */}
      <Dialog open={showCreateViewDialog} onOpenChange={setShowCreateViewDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedViewId && taskViews.find(view => view.id === selectedViewId) ? "Save View" : "Save As New View"}
            </DialogTitle>
            <DialogDescription>
              {selectedViewId && taskViews.find(view => view.id === selectedViewId) 
                ? "Update the current view with your current filters and settings."
                : "Create a new view from the current view with your filters and settings."}
            </DialogDescription>
          </DialogHeader>
          {!(selectedViewId && taskViews.find(view => view.id === selectedViewId)) && (
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
              disabled={(selectedViewId && taskViews.find(view => view.id === selectedViewId) ? false : !newViewName.trim()) || createViewMutation.isPending || updateViewMutation.isPending}
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
            <Button
              variant="outline"
              onClick={() => setShowEditViewDialog(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateView}
              disabled={!editViewName.trim() || updateViewMutation.isPending}
              data-testid="button-update-view"
            >
              {updateViewMutation.isPending ? "Updating..." : "Update View"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Creation Dialog */}
      <TaskEditModal 
        open={showCreateTaskDialog}
        onOpenChange={(open) => {
          setShowCreateTaskDialog(open);
          if (!open) setDuplicateTaskData(undefined);
        }}
        projectId={effectiveProjectId}
        initialData={duplicateTaskData}
      />

      {/* Task Editing Dialog */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          open={!!editingTask}
          onOpenChange={(open) => !open && setEditingTask(null)}
          projectId={effectiveProjectId}
          onDuplicate={(taskData) => {
            setEditingTask(null);
            setDuplicateTaskData(taskData);
            setShowCreateTaskDialog(true);
          }}
        />
      )}

      {/* Delete Task Confirmation Dialog */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taskToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-task">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-task"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
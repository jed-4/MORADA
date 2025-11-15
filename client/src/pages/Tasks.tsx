import React, { useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Plus, Settings, MoreHorizontal, X, Flag, User, Tag, Layers, Eye, Zap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { TaskCalendar } from "@/components/TaskCalendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { type TaskView, type Task, type FieldCategoryWithOptions } from "@shared/schema";
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
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'priority' | 'assignee' | 'tags'>('none');
  const [filters, setFilters] = useState<FilterState>({});

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
      handler: () => setActiveTab("kanban"),
      description: "Go to Kanban (G)"
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
  
  // Extract task status options
  const taskStatusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];

  // Group tasks based on selected grouping (useMemo hook must be declared here with all other hooks)
  const groupedTasks = React.useMemo(() => {
    if (!currentProject) return {};
    
    // Calculate dependencies inline when currentProject exists
    const defaultViews = [
      { id: "kanban", name: "Kanban Board", viewType: "kanban" },
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
    
    if (groupBy === 'none' || activeTab !== 'list') {
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

  const handleCreateView = () => {
    if (!effectiveProjectId || !newViewName.trim()) return;
    createViewMutation.mutate({
      name: newViewName.trim(),
      viewType: newViewType === "calendar" ? "kanban" : newViewType,
      projectId: effectiveProjectId,
    });
  };


  // Default views
  const defaultViews = [
    { id: "kanban", name: "Kanban Board", viewType: "kanban" },
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

  return (
    <div className="flex h-full flex-col">
      {/* UNIFIED 3-ROW HEADER FOR ALL VIEWS */}
      
      {/* Row 1 - Project Controls (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-4 flex-shrink-0">
        {/* Left: Project Name + Task Count */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">{currentProject.name} Tasks</h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-task-count">
            {effectivelyFilteredTasks.length} tasks
          </Badge>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="button-card-display-settings"
              >
                <Eye className="w-3 h-3" />
                <span>Display</span>
              </button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm font-semibold">Show on cards</div>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showPriority: !cardDisplaySettings.showPriority});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showPriority}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showPriority: !cardDisplaySettings.showPriority})}
                    className="mr-2"
                  />
                  Priority
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showStatus: !cardDisplaySettings.showStatus});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showStatus}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showStatus: !cardDisplaySettings.showStatus})}
                    className="mr-2"
                  />
                  Status
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showDescription: !cardDisplaySettings.showDescription});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showDescription}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showDescription: !cardDisplaySettings.showDescription})}
                    className="mr-2"
                  />
                  Description
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showTags: !cardDisplaySettings.showTags});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showTags}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showTags: !cardDisplaySettings.showTags})}
                    className="mr-2"
                  />
                  Tags
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showLabels: !cardDisplaySettings.showLabels});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showLabels}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showLabels: !cardDisplaySettings.showLabels})}
                    className="mr-2"
                  />
                  Labels
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showAssignee: !cardDisplaySettings.showAssignee});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showAssignee}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showAssignee: !cardDisplaySettings.showAssignee})}
                    className="mr-2"
                  />
                  Assignee
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showDueDate: !cardDisplaySettings.showDueDate});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showDueDate}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showDueDate: !cardDisplaySettings.showDueDate})}
                    className="mr-2"
                  />
                  Due Date
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    setCardDisplaySettings({...cardDisplaySettings, showSubtasks: !cardDisplaySettings.showSubtasks});
                  }}
                >
                  <Checkbox
                    checked={cardDisplaySettings.showSubtasks}
                    onCheckedChange={() => setCardDisplaySettings({...cardDisplaySettings, showSubtasks: !cardDisplaySettings.showSubtasks})}
                    className="mr-2"
                  />
                  Subtasks
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={() => setShowViewSettings(true)}
            data-testid="button-settings"
          >
            <Settings className="w-3 h-3" />
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowCreateTaskDialog(true)}
            data-testid="button-add-task"
          >
            <Plus className="w-3 h-3" />
            <span>Add Task</span>
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
            <DropdownMenuItem onClick={() => setShowCreateViewDialog(true)} data-testid="menu-create-view">
              <Plus className="h-4 w-4 mr-2" />
              Create New View
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
                {[
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ].map(option => (
                  <DropdownMenuItem key={option.value} className="flex items-center">
                    <Checkbox
                      checked={filters.priority?.includes(option.value) || false}
                      onCheckedChange={() => {
                        const currentPriority = filters.priority || [];
                        const newPriority = currentPriority.includes(option.value)
                          ? currentPriority.filter(p => p !== option.value)
                          : [...currentPriority, option.value];
                        setFilters({...filters, priority: newPriority.length > 0 ? newPriority : undefined});
                      }}
                      className="mr-2"
                    />
                    {option.label}
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

          {/* Right: Group By Controls */}
          <div className="flex items-center gap-1.5">
            <Select value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)}>
              <SelectTrigger className="h-6 w-auto px-2 py-0 text-xs border [&>svg]:hidden" data-testid="select-group-by">
                <span>Group by</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
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
          </div>
        </div>

      {/* Content Area with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto">
          <TabsContent value="kanban" className="h-full m-0 data-[state=active]:flex">
            <TaskBoard tasks={effectivelyFilteredTasks} isLoading={tasksLoading} onTaskClick={(task: Task) => setEditingTask(task)} projectId={effectiveProjectId} displaySettings={cardDisplaySettings} />
          </TabsContent>
          
          <TabsContent value="list" className="h-full m-0 data-[state=active]:flex">
            <div className="flex-1 overflow-auto p-4">
              <CasvaTaskList
                tasks={effectivelyFilteredTasks}
                onEditTask={(task: Task) => setEditingTask(task)}
                showCheckboxes={true}
              />
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="h-full m-0 data-[state=active]:flex">
            <TaskCalendar 
              tasks={effectivelyFilteredTasks} 
              projectId={effectiveProjectId || ""} 
              onTaskClick={(task: Task) => setEditingTask(task)} 
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
                  <TaskBoard tasks={viewFilteredTasks} isLoading={tasksLoading} onTaskClick={(task: Task) => setEditingTask(task)} displaySettings={cardDisplaySettings} />
                ) : view.viewType === "calendar" ? (
                  <TaskCalendar 
                    tasks={viewFilteredTasks} 
                    projectId={effectiveProjectId || ""} 
                    onTaskClick={(task: Task) => setEditingTask(task)} 
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

      {/* Create View Dialog */}
      <Dialog open={showCreateViewDialog} onOpenChange={setShowCreateViewDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New View</DialogTitle>
            <DialogDescription>
              Create a new view to organize and filter your tasks.
            </DialogDescription>
          </DialogHeader>
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
                  <SelectItem value="kanban">Kanban Board</SelectItem>
                  <SelectItem value="list">List View</SelectItem>
                  <SelectItem value="calendar">Calendar View</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCreateViewDialog(false)}
              data-testid="button-cancel-view"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateView}
              disabled={!newViewName.trim() || createViewMutation.isPending}
              data-testid="button-create-view"
            >
              {createViewMutation.isPending ? "Creating..." : "Create View"}
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
      {effectiveProjectId && (
        <TaskModalAsana 
          open={showCreateTaskDialog}
          onOpenChange={setShowCreateTaskDialog}
          projectId={effectiveProjectId}
        />
      )}

      {/* Task Editing Dialog */}
      {effectiveProjectId && editingTask && (
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
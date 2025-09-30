import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Plus, Settings, MoreHorizontal, X, Flag, User, Tag, Layers, Eye } from "lucide-react";
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
import TaskForm from "@/components/TaskForm";
import FilterPanel, { type FilterState } from "@/components/FilterPanel";
import { TaskCalendar } from "@/components/TaskCalendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { type TaskView, type Task, type FieldCategoryWithOptions } from "@shared/schema";
import { applyTaskFilters, extractFilterOptions, deserializeFilters } from "@/utils/taskFilters";
import { useProject } from "@/contexts/ProjectContext";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TasksParams {
  projectId?: string;
}

export default function Tasks() {
  // All hooks MUST be called at the top level before any conditional logic
  const { currentProject } = useProject();
  const { toast } = useToast();
  const params = useParams<TasksParams>();
  
  // Use projectId from URL params if available, otherwise fall back to currentProject
  const effectiveProjectId = params.projectId || currentProject?.id;
  const [activeTab, setActiveTab] = useState("kanban");
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
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Tasks
            </h1>
            <Badge variant="secondary" data-testid="text-task-count">
              {currentProject.name}
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-card-display-settings"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Card Display
                </Button>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowViewSettings(true)}
              data-testid="button-view-settings"
            >
              <Settings className="h-4 w-4 mr-2" />
              View Settings
            </Button>
            <Button 
              size="sm" 
              onClick={() => setShowCreateTaskDialog(true)}
              data-testid="button-add-task"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>
        
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4">
          <div className="flex items-center justify-between">
            <TabsList className="flex w-auto" data-testid="tabs-task-views">
              {allViews.map((view) => {
                const canDelete = isCustomView(view);
                return (
                  <div key={view.id} className="relative group">
                    <TabsTrigger
                      value={view.id}
                      className="data-[state=active]:bg-background data-[state=active]:text-foreground relative pr-8"
                      data-testid={`tab-${view.id}`}
                    >
                      {view.name}
                      {view.viewType === "list" && view.id !== "list" && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          NEW
                        </Badge>
                      )}
                    </TabsTrigger>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteView(view);
                        }}
                        data-testid={`button-delete-${view.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 data-[state=active]:bg-background data-[state=active]:text-foreground"
                onClick={() => setShowCreateViewDialog(true)}
                data-testid="button-add-view"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TabsList>
            
            {/* View Management Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-view-menu">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="menu-create-view">
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
        </div>

        {/* Filter Bar */}
        <div className="border-b border-border/50 bg-muted/30 px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            {/* Search */}
            <div className="relative min-w-64">
              <Input
                placeholder="Search tasks..."
                value={filters.search || ""}
                onChange={(e) => setFilters({...filters, search: e.target.value || undefined})}
                className="h-8 text-sm"
                data-testid="input-search-tasks"
              />
              {filters.search && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setFilters({...filters, search: undefined})}
                  data-testid="button-clear-search"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-sm">
                  <Flag className="h-3 w-3 mr-1" />
                  Status
                  {filters.status && filters.status.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs">
                      {filters.status.length}
                    </Badge>
                  )}
                </Button>
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
                <Button variant="outline" size="sm" className="h-8 text-sm">
                  <Flag className="h-3 w-3 mr-1" />
                  Priority
                  {filters.priority && filters.priority.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs">
                      {filters.priority.length}
                    </Badge>
                  )}
                </Button>
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
                <Button variant="outline" size="sm" className="h-8 text-sm" data-testid="button-filter-assignee">
                  <User className="h-3 w-3 mr-1" />
                  Assignee
                  {filters.assignee && filters.assignee.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs">
                      {filters.assignee.length}
                    </Badge>
                  )}
                </Button>
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
                  <Button variant="outline" size="sm" className="h-8 text-sm">
                    <Tag className="h-3 w-3 mr-1" />
                    Tags
                    {filters.tags && filters.tags.length > 0 && (
                      <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs">
                        {filters.tags.length}
                      </Badge>
                    )}
                  </Button>
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
                  <Button variant="outline" size="sm" className="h-8 text-sm">
                    <Tag className="h-3 w-3 mr-1" />
                    Labels
                    {filters.labels && filters.labels.length > 0 && (
                      <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-xs">
                        {filters.labels.length}
                      </Badge>
                    )}
                  </Button>
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

            {/* Group By Controls - Enhanced visibility */}
            <>
              <div className="border-l border-border/50 h-6" />
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Group by:</span>
                <Select value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)}>
                  <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-group-by">
                    <SelectValue placeholder="Choose grouping..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <Layers className="w-3 h-3" />
                        Grouping
                      </div>
                    </SelectItem>
                    <SelectItem value="status">
                      <div className="flex items-center gap-2">
                        <Flag className="w-3 h-3" />
                        By Status
                      </div>
                    </SelectItem>
                    <SelectItem value="priority">
                      <div className="flex items-center gap-2">
                        <Flag className="w-3 h-3" />
                        By Priority
                      </div>
                    </SelectItem>
                    {filterOptions.availableAssignees.length > 0 && (
                      <SelectItem value="assignee">
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3" />
                          By Assignee
                        </div>
                      </SelectItem>
                    )}
                    {filterOptions.availableTags.length > 0 && (
                      <SelectItem value="tags">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3 h-3" />
                          By Tags
                        </div>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {groupBy !== 'none' && (
                  <Badge variant="secondary" className="text-xs">
                    Grouped by {groupBy}
                  </Badge>
                )}
              </div>
            </>

            {/* Clear All Filters */}
            {(filters.search || filters.status?.length || filters.priority?.length || filters.assignee?.length || filters.tags?.length) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-sm text-muted-foreground"
                onClick={() => setFilters({})}
                data-testid="button-clear-all-filters"
              >
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="kanban" className="h-full m-0 data-[state=active]:flex">
            <TaskBoard tasks={effectivelyFilteredTasks} isLoading={tasksLoading} onTaskClick={(task: Task) => setEditingTask(task)} projectId={effectiveProjectId} displaySettings={cardDisplaySettings} />
          </TabsContent>
          
          <TabsContent value="list" className="h-full m-0 data-[state=active]:flex">
            <TaskList 
              tasks={effectivelyFilteredTasks} 
              groupedTasks={groupBy !== 'none' ? groupedTasks : undefined}
              groupBy={groupBy}
              projectId={effectiveProjectId}
              isLoading={tasksLoading} 
              onTaskClick={(task: Task) => setEditingTask(task)} 
            />
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
                  <TaskList tasks={viewFilteredTasks} isLoading={tasksLoading} columnConfig={view.columnConfig as Record<string, any>} onTaskClick={(task: Task) => setEditingTask(task)} projectId={effectiveProjectId} />
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
        <TaskForm 
          open={showCreateTaskDialog}
          onOpenChange={setShowCreateTaskDialog}
          projectId={effectiveProjectId}
        />
      )}

      {/* Task Editing Dialog */}
      {effectiveProjectId && (
        <TaskForm
          task={editingTask || undefined}
          open={!!editingTask}
          onOpenChange={(open) => !open && setEditingTask(null)}
          projectId={effectiveProjectId}
        />
      )}
    </div>
  );
}
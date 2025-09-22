import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, MoreHorizontal } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TaskBoard from "@/components/TaskBoard";
import TaskList from "@/components/TaskList";
import FilterPanel, { type FilterState } from "@/components/FilterPanel";
import { type TaskView, type Task } from "@shared/schema";
import { applyTaskFilters, extractFilterOptions, deserializeFilters } from "@/utils/taskFilters";
import { useProject } from "@/contexts/ProjectContext";
import { useMutation, queryClient } from "@/lib/queryClient";

export default function Tasks() {
  const { currentProject } = useProject();
  const [activeTab, setActiveTab] = useState("kanban");
  const [showViewSettings, setShowViewSettings] = useState(false);
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewType, setNewViewType] = useState<"kanban" | "list">("kanban");
  const [filters, setFilters] = useState<FilterState>({});

  // Mutation for creating new views
  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; viewType: "kanban" | "list"; projectId: string }) => {
      const response = await fetch("/api/task-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create view");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views", currentProject?.id] });
      setShowCreateViewDialog(false);
      setNewViewName("");
      setNewViewType("kanban");
    },
  });

  const handleCreateView = () => {
    if (!currentProject || !newViewName.trim()) return;
    createViewMutation.mutate({
      name: newViewName.trim(),
      viewType: newViewType,
      projectId: currentProject.id,
    });
  };

  // Fetch saved task views and tasks filtered by current project
  const { data: taskViews = [] } = useQuery<TaskView[]>({
    queryKey: ["/api/task-views", currentProject?.id],
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/task-views?projectId=${currentProject.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch task views');
      return response.json();
    },
    enabled: !!currentProject
  });

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", currentProject?.id], 
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/tasks?projectId=${currentProject.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!currentProject
  });

  // Show loading state if no project is selected
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

  // Default views
  const defaultViews = [
    { id: "kanban", name: "Kanban Board", viewType: "kanban" },
    { id: "list", name: "List View", viewType: "list" },
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowViewSettings(true)}
              data-testid="button-view-settings"
            >
              <Settings className="h-4 w-4 mr-2" />
              View Settings
            </Button>
            <Button size="sm" data-testid="button-add-task">
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>
        
        {/* Filter Panel */}
        <div className="mt-4">
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            availableAssignees={filterOptions.availableAssignees}
            availableProjects={filterOptions.availableProjects}
            availableTags={filterOptions.availableTags}
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4">
          <div className="flex items-center justify-between">
            <TabsList className="flex w-auto" data-testid="tabs-task-views">
              {allViews.map((view) => (
                <TabsTrigger
                  key={view.id}
                  value={view.id}
                  className="data-[state=active]:bg-background data-[state=active]:text-foreground relative"
                  data-testid={`tab-${view.id}`}
                >
                  {view.name}
                  {view.viewType === "list" && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      NEW
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
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

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="kanban" className="h-full m-0 data-[state=active]:flex">
            <TaskBoard tasks={effectivelyFilteredTasks} isLoading={tasksLoading} />
          </TabsContent>
          
          <TabsContent value="list" className="h-full m-0 data-[state=active]:flex">
            <TaskList tasks={effectivelyFilteredTasks} isLoading={tasksLoading} />
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
                  <TaskBoard tasks={viewFilteredTasks} isLoading={tasksLoading} />
                ) : (
                  <TaskList tasks={viewFilteredTasks} isLoading={tasksLoading} columnConfig={view.columnConfig as Record<string, any>} />
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
    </div>
  );
}
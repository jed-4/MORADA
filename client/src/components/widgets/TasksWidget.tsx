import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { Plus, Circle, CheckSquare } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import TaskModalAsana from "@/components/TaskModalAsana";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useMemo } from "react";

type FilterStatus = "all" | "todo" | "in_progress" | "done";
type FilterPriority = "all" | "low" | "medium" | "high";
type SortBy = "dueDate" | "priority" | "title" | "status";
type SortOrder = "asc" | "desc";

export default function TasksWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const [, setLocation] = useLocation();
  const { currentProject } = useProject();
  
  // Widget config with defaults
  const defaultFilterStatus = (widget.config?.defaultFilterStatus as FilterStatus) || "all";
  const defaultFilterPriority = (widget.config?.defaultFilterPriority as FilterPriority) || "all";
  const defaultSortBy = (widget.config?.defaultSortBy as SortBy) || "dueDate";
  const defaultSortOrder = (widget.config?.defaultSortOrder as SortOrder) || "asc";
  
  // Active filters and sort
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(defaultFilterStatus);
  const [filterPriority, setFilterPriority] = useState<FilterPriority>(defaultFilterPriority);
  const [sortBy, setSortBy] = useState<SortBy>(defaultSortBy);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);
  
  // Configuration state
  const [configFilterStatus, setConfigFilterStatus] = useState<FilterStatus>(defaultFilterStatus);
  const [configFilterPriority, setConfigFilterPriority] = useState<FilterPriority>(defaultFilterPriority);
  const [configSortBy, setConfigSortBy] = useState<SortBy>(defaultSortBy);
  const [configSortOrder, setConfigSortOrder] = useState<SortOrder>(defaultSortOrder);
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'done' || task.status === 'complete' ? 'todo' : 'done';
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", currentProject?.id] });
    },
  });
  
  // Sync config state when widget config changes
  useEffect(() => {
    const newFilterStatus = (widget.config?.defaultFilterStatus as FilterStatus) || "all";
    const newFilterPriority = (widget.config?.defaultFilterPriority as FilterPriority) || "all";
    const newSortBy = (widget.config?.defaultSortBy as SortBy) || "dueDate";
    const newSortOrder = (widget.config?.defaultSortOrder as SortOrder) || "asc";
    
    setFilterStatus(newFilterStatus);
    setFilterPriority(newFilterPriority);
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setConfigFilterStatus(newFilterStatus);
    setConfigFilterPriority(newFilterPriority);
    setConfigSortBy(newSortBy);
    setConfigSortOrder(newSortOrder);
    setEditingTitle(widget.title);
  }, [widget.config, widget.title]);
  
  const handleSaveConfig = () => {
    if (onUpdate) {
      onUpdate({
        ...widget,
        title: editingTitle,
        config: {
          ...widget.config,
          defaultFilterStatus: configFilterStatus,
          defaultFilterPriority: configFilterPriority,
          defaultSortBy: configSortBy,
          defaultSortOrder: configSortOrder,
        },
      });
    }
    onCloseConfig?.();
  };
  
  // Fetch all tasks from the API filtered by current project
  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/tasks?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = [...allTasks];
    
    // Apply status filter
    if (filterStatus !== "all") {
      filtered = filtered.filter(task => task.status === filterStatus);
    }
    
    // Apply priority filter
    if (filterPriority !== "all") {
      filtered = filtered.filter(task => task.priority === filterPriority);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "dueDate":
          // Handle null dates: always place them at the end regardless of sort order
          const dateA = a.dueDate ? new Date(a.dueDate).getTime() : (sortOrder === "asc" ? Infinity : -Infinity);
          const dateB = b.dueDate ? new Date(b.dueDate).getTime() : (sortOrder === "asc" ? Infinity : -Infinity);
          comparison = dateA - dateB;
          break;
        case "priority":
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          comparison = priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
          break;
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "status":
          const statusOrder = { todo: 0, in_progress: 1, done: 2 };
          comparison = statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder];
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
    
    return filtered;
  }, [allTasks, filterStatus, filterPriority, sortBy, sortOrder]);
  
  const formatDueDate = (dueDate: Date | string | null) => {
    if (!dueDate) return "No due date";
    const date = new Date(dueDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const getAssigneeInitials = (name: string | null) => {
    if (!name) return "UN";
    return name
      .split(" ")
      .map(word => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const priorityColors = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const statusLabels = {
    todo: "To Do",
    in_progress: "In Progress",
    done: "Done",
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-muted-foreground">
            Loading tasks...
          </div>
        </div>
        <div className="space-y-2 flex-1 overflow-auto">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center justify-between p-2 rounded border">
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-muted rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
                <div className="h-6 w-6 bg-muted rounded-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header row only */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">
            {filteredAndSortedTasks.length} task{filteredAndSortedTasks.length !== 1 ? 's' : ''}
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setLocation("/tasks")}
            data-testid="tasks-widget-add"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
        
        {/* Task List */}
        <div className="space-y-2 flex-1 overflow-auto">
          {filteredAndSortedTasks.map((task) => {
            const isCompleted = task.status === 'done' || task.status === 'complete';
            return (
              <div 
                key={task.id} 
                className={`flex items-center gap-2 p-2 rounded border hover-elevate cursor-pointer ${isCompleted ? 'opacity-50' : ''}`}
                data-testid={`task-widget-item-${task.id}`}
                onClick={() => setSelectedTaskId(task.id)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTaskMutation.mutate(task);
                  }}
                  className="flex-shrink-0"
                >
                  {isCompleted ? (
                    <CheckSquare className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TaskTooltip content={task.title}>
                      <span className={`text-sm font-medium truncate cursor-default ${isCompleted ? 'line-through' : ''}`}>{task.title}</span>
                    </TaskTooltip>
                    <Badge className={`text-xs ${priorityColors[task.priority as "low" | "medium" | "high"]}`}>
                      {task.priority}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDueDate(task.dueDate)}</div>
                </div>
                
                {task.assigneeName && (
                  <Avatar className="h-6 w-6 ml-2">
                    <AvatarFallback className="text-xs">{getAssigneeInitials(task.assigneeName)}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
        </div>
        
        <TaskModalAsana
          open={!!selectedTaskId}
          onOpenChange={(open) => !open && setSelectedTaskId(null)}
          task={allTasks.find(t => t.id === selectedTaskId)}
          taskId={selectedTaskId || undefined}
        />
        
        {filteredAndSortedTasks.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No tasks match the current filters
          </div>
        )}
      </div>

      {/* Configuration Dialog */}
      <Dialog open={isConfiguring} onOpenChange={(open) => !open && onCloseConfig?.()}>
        <DialogContent data-testid="tasks-widget-config-dialog">
          <DialogHeader>
            <DialogTitle>Configure Tasks Widget</DialogTitle>
            <DialogDescription>
              Set default filters and sorting for this widget
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Widget Name</Label>
              <Input 
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                placeholder="Widget title"
                data-testid="config-input-title"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Default Status Filter</Label>
              <Select value={configFilterStatus} onValueChange={(value) => setConfigFilterStatus(value as FilterStatus)}>
                <SelectTrigger data-testid="config-select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Default Priority Filter</Label>
              <Select value={configFilterPriority} onValueChange={(value) => setConfigFilterPriority(value as FilterPriority)}>
                <SelectTrigger data-testid="config-select-filter-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Default Sort By</Label>
              <Select value={configSortBy} onValueChange={(value) => setConfigSortBy(value as SortBy)}>
                <SelectTrigger data-testid="config-select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dueDate">Due Date</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Default Sort Order</Label>
              <Select value={configSortOrder} onValueChange={(value) => setConfigSortOrder(value as SortOrder)}>
                <SelectTrigger data-testid="config-select-sort-order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfigFilterStatus(defaultFilterStatus);
                setConfigFilterPriority(defaultFilterPriority);
                setConfigSortBy(defaultSortBy);
                setConfigSortOrder(defaultSortOrder);
                setEditingTitle(widget.title);
                onCloseConfig?.();
              }}
              data-testid="button-cancel-config"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfig}
              data-testid="button-save-config"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

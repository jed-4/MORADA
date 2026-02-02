import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions, type Project } from "@shared/schema";
import { useTaskStatusOptions } from "@/hooks/useTaskStatusOptions";
import { useTaskLabelOptions } from "@/hooks/useTaskLabelOptions";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Calendar,
  User,
  Flag,
  ArrowUpDown,
  Trash2,
  Copy,
  CircleCheck,
  Building2,
  FolderOpen,
  X,
} from "lucide-react";
import { format } from "date-fns";
import SubtaskList from "@/components/SubtaskList";

interface TaskListProps {
  tasks?: Task[];
  groupedTasks?: Record<string, Task[]>;
  groupBy?: 'none' | 'status' | 'priority' | 'assignee' | 'tags' | 'labels';
  isLoading?: boolean;
  filters?: Record<string, any>;
  columnConfig?: Record<string, any>;
  onTaskClick?: (task: Task) => void;
  projectId?: string;
}

type SortConfig = {
  key: keyof Task | null;
  direction: 'asc' | 'desc';
};

type ColumnConfig = {
  id: string;
  label: string;
  sortKey?: keyof Task;
  width?: string;
  visible: boolean;
};

// Draggable grid row component
function DraggableGridRow({ 
  task, 
  canDrag,
  isSelected,
  onSelect,
  onComplete,
  onClick,
  getStatusBadge,
  getPriorityIcon,
  completedOption,
}: { 
  task: Task; 
  canDrag: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onComplete: (checked: boolean) => void;
  onClick: () => void;
  getStatusBadge: (status: string) => React.ReactNode;
  getPriorityIcon: (priority: string) => React.ReactNode;
  completedOption: any;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: "task",
      task,
    },
    disabled: !canDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "grid items-center gap-4 px-4 h-10 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer",
        isDragging && "relative z-50 shadow-lg",
        isSelected && "bg-blue-50"
      )}
      style={{
        gridTemplateColumns: "28px 32px 120px 1fr 140px 120px 100px 32px",
        ...style,
      }}
      onClick={onClick}
      data-testid={`task-row-${task.id}`}
    >
      {/* Selection Checkbox */}
      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          className="flex-shrink-0"
          data-testid={`select-task-${task.id}`}
        />
      </div>

      {/* Drag Handle */}
      <div
        {...(canDrag ? attributes : {})}
        {...(canDrag ? listeners : {})}
        className={cn(
          "flex items-center justify-center",
          canDrag 
            ? "cursor-grab hover:cursor-grabbing text-gray-400 hover:text-gray-600" 
            : "cursor-not-allowed opacity-30"
        )}
        onClick={(e) => e.stopPropagation()}
        data-testid={`drag-handle-${task.id}`}
        title={canDrag ? "Drag to reorder" : "Clear sort to enable reordering"}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Checkbox + Status */}
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={task.status === completedOption?.key}
          onCheckedChange={onComplete}
          className="flex-shrink-0"
          data-testid={`complete-task-${task.id}`}
        />
        {getStatusBadge(task.status || "todo")}
      </div>

      {/* Title */}
      <div className="flex items-center gap-2 min-w-0">
        <span 
          className={cn(
            "truncate text-sm font-medium",
            task.status === completedOption?.key 
              ? "line-through text-muted-foreground" 
              : "text-gray-900"
          )}
          title={task.title}
        >
          {task.title}
        </span>
        {task.labels && Array.isArray(task.labels) && task.labels.length > 0 && (
          <Badge 
            variant="outline" 
            className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
          >
            +{task.labels.length}
          </Badge>
        )}
      </div>

      {/* Assignee */}
      <div className="flex items-center gap-2 min-w-0">
        {task.assigneeName ? (
          <>
            <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-700 flex-shrink-0">
              {task.assigneeName.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
            </div>
            <span className="text-sm text-gray-700 truncate" title={task.assigneeName}>
              {task.assigneeName}
            </span>
          </>
        ) : (
          <span className="text-sm text-gray-400">Unassigned</span>
        )}
      </div>

      {/* Due Date */}
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <span className="truncate">{task.dueDate ? format(new Date(task.dueDate), "MMM d, yyyy") : "-"}</span>
      </div>

      {/* Priority */}
      <div className="flex items-center gap-1.5">
        {getPriorityIcon(task.priority || "medium")}
        <span className="capitalize text-sm text-gray-700">
          {task.priority || "medium"}
        </span>
      </div>

      {/* Actions */}
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`task-menu-${task.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Edit Task</DropdownMenuItem>
            <DropdownMenuItem>Add Subtask</DropdownMenuItem>
            <DropdownMenuItem>Duplicate</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function TaskList({ tasks: propTasks, groupedTasks, groupBy, isLoading: propIsLoading, filters, columnConfig, onTaskClick, projectId: propProjectId }: TaskListProps) {
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<ColumnConfig | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  
  // Fetch projects for copy-to-project feature
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  
  // Bulk action mutation
  const bulkActionMutation = useMutation({
    mutationFn: (data: { ids: string[]; action: string; status?: string; projectId?: string }) =>
      apiRequest("/api/tasks/bulk-action", "POST", data),
    onSuccess: (result: { success: number; errors: string[] }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setSelectedTasks([]);
      const actionLabels: Record<string, string> = {
        changeStatus: "updated",
        delete: "deleted",
        copyToProject: "copied",
        copyToBusiness: "copied to business",
      };
      toast({
        title: `${result.success} task${result.success !== 1 ? "s" : ""} ${actionLabels[variables.action] || "updated"}`,
        description: result.errors.length > 0 ? `${result.errors.length} failed` : undefined,
      });
    },
    onError: () => {
      toast({
        title: "Bulk action failed",
        variant: "destructive",
      });
    },
  });
  
  // Define default columns
  const defaultColumns: ColumnConfig[] = [
    { id: 'title', label: 'Task', sortKey: 'title', width: 'min-w-[200px]', visible: true },
    { id: 'status', label: 'Status', sortKey: 'status', width: 'w-32', visible: true },
    { id: 'priority', label: 'Priority', sortKey: 'priority', width: 'w-24', visible: true },
    { id: 'assignee', label: 'Assignee', sortKey: 'assigneeName', width: 'w-40', visible: true },
    { id: 'dueDate', label: 'Due Date', sortKey: 'dueDate', width: 'w-32', visible: true },
    { id: 'project', label: 'Project', sortKey: 'projectId', width: 'w-40', visible: true },
  ];
  
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  
  // Use passed projectId or fallback to default (but this should always be passed from parent)
  const projectId = propProjectId || 'default';
  
  // Load column order from localStorage per project
  useEffect(() => {
    const savedColumns = localStorage.getItem(`taskListColumns_${projectId}`);
    if (savedColumns) {
      try {
        const parsed = JSON.parse(savedColumns);
        setColumns(parsed);
      } catch (e) {
        console.error('Failed to parse saved column config:', e);
      }
    } else {
      // Reset to default when switching projects
      setColumns(defaultColumns);
    }
  }, [projectId]);
  
  // Save column order and widths to localStorage when they change
  useEffect(() => {
    if (projectId) {
      localStorage.setItem(`taskListColumns_${projectId}`, JSON.stringify(columns));
    }
  }, [columns, projectId]);

  // Set up drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Use props tasks if provided, otherwise fetch all tasks
  const { data: fetchedTasks = [], isLoading: fetchIsLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: !propTasks, // Only fetch if no tasks provided as props
  });
  
  const tasks = propTasks || fetchedTasks;
  const isLoading = propIsLoading !== undefined ? propIsLoading : fetchIsLoading;
  
  // Fetch field categories to get completed status option
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  // Find the task status category and its completed option
  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  // Update task status mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      const response = await apiRequest(`/api/tasks/${taskId}/status`, "PATCH", { status: newStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task updated successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to update task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });
  
  // Handle toggling task completion
  const handleToggleComplete = (task: Task, checked: boolean | string) => {
    if (!completedOption) {
      toast({
        title: "No completed status configured",
        description: "Please configure a completed status in field settings",
        variant: "destructive",
      });
      return;
    }
    
    // Set status based on checked state
    const newStatus = checked
      ? completedOption.key
      : (defaultOption?.key || "todo");
    
    updateTaskMutation.mutate({ taskId: task.id, newStatus });
  };

  // Tasks are already filtered when passed as props, but apply additional filters if any
  const filteredTasks = filters && Object.keys(filters).length > 0 
    ? tasks.filter(task => {
        // Apply any additional filters passed from parent
        for (const [key, value] of Object.entries(filters)) {
          if (value && task[key as keyof Task] !== value) {
            return false;
          }
        }
        return true;
      })
    : tasks;

  // Update ordered IDs when tasks change - reconcile with existing order
  useEffect(() => {
    const currentIds = filteredTasks.map(task => task.id);
    
    const reconcileOrder = (prev: string[]) => {
      if (prev.length === 0) return currentIds;
      
      const setPrev = new Set(prev);
      const kept = prev.filter(id => currentIds.includes(id));
      const added = currentIds.filter(id => !setPrev.has(id));
      const next = [...kept, ...added];
      
      // Only return new array if order actually changed
      return next.length === prev.length && next.every((v, i) => v === prev[i]) ? prev : next;
    };
    
    setOrderedIds(reconcileOrder);
  }, [filteredTasks]);

  // Apply sorting or manual ordering
  const sortedTasks = useMemo(() => {
    if (!sortConfig.key) {
      // Manual order mode - use orderedIds
      return orderedIds.map(id => filteredTasks.find(task => task.id === id)).filter(Boolean) as Task[];
    }
    
    // Sort mode
    return [...filteredTasks].sort((a, b) => {
      const aValue = a[sortConfig.key!] as string | number | Date | null;
      const bValue = b[sortConfig.key!] as string | number | Date | null;
      
      // Handle null values
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue === null) return sortConfig.direction === 'asc' ? -1 : 1;
      
      // Special handling for priority
      if (sortConfig.key === 'priority') {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[aValue as keyof typeof priorityOrder] || 0;
        const bPriority = priorityOrder[bValue as keyof typeof priorityOrder] || 0;
        return sortConfig.direction === 'asc' ? aPriority - bPriority : bPriority - aPriority;
      }
      
      // Special handling for dates
      if (sortConfig.key === 'dueDate' || sortConfig.key === 'createdAt' || sortConfig.key === 'updatedAt') {
        const aTime = new Date(aValue as string | Date).getTime();
        const bTime = new Date(bValue as string | Date).getTime();
        return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
      }
      
      // Default comparison
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredTasks, sortConfig, orderedIds]);

  const handleSort = (key: keyof Task) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleManualOrder = () => {
    setSortConfig({ key: null, direction: 'asc' });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activeData = event.active.data.current;
    
    if (activeData?.type === 'task') {
      const task = tasks.find(t => t.id === event.active.id);
      setActiveTask(task || null);
    } else if (activeData?.type === 'column') {
      setActiveColumn(activeData.column);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    setActiveColumn(null);
    
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
    const activeData = active.data.current;
    const overData = over.data.current;
    
    // Handle column reordering
    if (activeData?.type === 'column' && overData?.type === 'column') {
      setColumns(current => {
        const oldIndex = current.findIndex(col => col.id === active.id);
        const newIndex = current.findIndex(col => col.id === over.id);
        return arrayMove(current, oldIndex, newIndex);
      });
      return;
    }
    
    // Handle task reordering
    if (activeData?.type === 'task' && overData?.type === 'task') {
      // Only allow reordering in manual order mode (no sort applied)
      if (sortConfig.key !== null) {
        toast({ 
          title: "Clear sort to reorder", 
          description: "Remove sorting to manually reorder tasks",
          variant: "destructive" 
        });
        return;
      }
      
      setOrderedIds(current => {
        const oldIndex = current.indexOf(active.id as string);
        const newIndex = current.indexOf(over.id as string);
        return arrayMove(current, oldIndex, newIndex);
      });
      
      // TODO: Implement API call to persist order
      // updateTaskOrderMutation.mutate({ taskIds: newOrderedIds });
    }
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(current =>
      current.includes(taskId)
        ? current.filter(id => id !== taskId)
        : [...current, taskId]
    );
  };

  const toggleAllTasks = () => {
    setSelectedTasks(current =>
      current.length === sortedTasks.length ? [] : sortedTasks.map(task => task.id)
    );
  };

  const toggleTaskExpansion = (taskId: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "high":
        return <Flag className="h-4 w-4 text-red-500" />;
      case "medium":
        return <Flag className="h-4 w-4 text-yellow-500" />;
      case "low":
        return <Flag className="h-4 w-4 text-green-500" />;
      default:
        return <Flag className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const { getStatusInfo } = useTaskStatusOptions();
  const { getLabelInfo } = useTaskLabelOptions();
  
  const getStatusBadge = (status: string) => {
    const statusInfo = getStatusInfo(status);
    
    return (
      <div className="flex items-center gap-2">
        {statusInfo.color && (
          <div 
            className="w-3 h-3 rounded-full border border-border" 
            style={{ backgroundColor: statusInfo.color }}
          />
        )}
        <Badge variant="secondary">
          {statusInfo.name}
        </Badge>
      </div>
    );
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return format(d, "MMM dd, yyyy");
  };

  // Column resize state
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Handle column resize
  const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const column = columns.find(col => col.id === columnId);
    if (!column) return;
    
    setResizingColumn(columnId);
    setResizeStartX(e.clientX);
    // Parse width from Tailwind classes like 'w-32' or 'min-w-[200px]'
    const currentWidth = parseInt(column.width?.match(/\d+/)?.[0] || '160');
    setResizeStartWidth(currentWidth);
    
    // Prevent any text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const diff = e.clientX - resizeStartX;
      const newWidth = Math.max(80, resizeStartWidth + diff); // Min width 80px
      
      setColumns(prev => prev.map(col => 
        col.id === resizingColumn 
          ? { ...col, width: `w-[${newWidth}px]` }
          : col
      ));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
      // Restore cursor and selection
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Cleanup in case component unmounts during resize
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  // Sortable Column Header component
  const SortableHeader = ({ 
    column,
    className = "" 
  }: { 
    column: ColumnConfig;
    className?: string;
  }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({
      id: column.id,
      data: {
        type: "column",
        column,
      },
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <TableHead 
        ref={setNodeRef} 
        style={style}
        className={`${column.width || className} ${isDragging ? 'relative z-50' : 'relative'} group`}
      >
        <div className="flex items-center gap-1">
          <div 
            {...attributes} 
            {...listeners}
            className="cursor-grab hover:cursor-grabbing p-1 rounded hover:bg-muted"
            data-testid={`drag-column-${column.id}`}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
          {column.sortKey && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 font-medium hover:bg-transparent flex-1"
              onClick={() => handleSort(column.sortKey!)}
              data-testid={`sort-${String(column.sortKey)}`}
            >
              {column.label}
              <ArrowUpDown className="ml-2 h-3 w-3" />
              {sortConfig.key === column.sortKey && (
                sortConfig.direction === 'asc' ? 
                  <ChevronUp className="ml-1 h-3 w-3" /> : 
                  <ChevronDown className="ml-1 h-3 w-3" />
              )}
            </Button>
          )}
          {!column.sortKey && (
            <span className="font-medium">{column.label}</span>
          )}
        </div>
        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
          style={{ pointerEvents: 'auto', touchAction: 'none' }}
          onMouseDown={(e) => handleResizeStart(e, column.id)}
          data-testid={`resize-handle-${column.id}`}
        />
      </TableHead>
    );
  };

  // Function to render a cell based on column ID
  const renderCell = (task: Task, columnId: string) => {
    switch (columnId) {
      case 'title':
        return (
          <TableCell className="font-medium">
            <div className="flex items-center gap-2">
              {!task.parentTaskId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 p-0"
                  onClick={() => toggleTaskExpansion(task.id)}
                  data-testid={`button-toggle-task-${task.id}`}
                >
                  {expandedTasks.has(task.id) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              )}
              <span 
                className="truncate cursor-pointer hover:text-primary" 
                onClick={(e) => {
                  e.preventDefault();
                  onTaskClick?.(task);
                }}
                data-testid={`task-title-${task.id}`}
              >
                {task.title}
              </span>
              {task.tags && Array.isArray(task.tags) && task.tags.length > 0 && (
                <div className="flex gap-1">
                  {task.tags.slice(0, 2).map((tag: string, index: number) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {task.tags.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{task.tags.length - 2}
                    </Badge>
                  )}
                </div>
              )}
              {task.labels && Array.isArray(task.labels) && task.labels.length > 0 && (
                <div className="flex gap-1">
                  {task.labels.slice(0, 2).map((labelKey: string, index: number) => {
                    const labelInfo = getLabelInfo(labelKey);
                    return (
                      <Badge 
                        key={index} 
                        variant="outline" 
                        className="text-xs"
                        style={{
                          backgroundColor: labelInfo.color || undefined,
                          color: "#ffffff",
                          borderColor: labelInfo.color || undefined
                        }}
                      >
                        {labelInfo.name}
                      </Badge>
                    );
                  })}
                  {task.labels.length > 2 && (
                    <Badge 
                      variant="outline" 
                      className="text-xs"
                      style={{
                        backgroundColor: "#6B7280",
                        color: "#ffffff",
                        borderColor: "#6B7280"
                      }}
                    >
                      +{task.labels.length - 2}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        );
      
      case 'status':
        if (groupBy === 'status') return null;
        return <TableCell>{getStatusBadge(task.status || "todo")}</TableCell>;
      
      case 'priority':
        if (groupBy === 'priority') return null;
        return (
          <TableCell>
            <div className="flex items-center gap-2">
              {getPriorityIcon(task.priority || "medium")}
              <span className="capitalize text-sm">
                {task.priority || "medium"}
              </span>
            </div>
          </TableCell>
        );
      
      case 'assignee':
        if (groupBy === 'assignee') return null;
        return (
          <TableCell>
            {task.assigneeName ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                  {task.assigneeName.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                </div>
                <span className="text-sm">{task.assigneeName}</span>
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">Unassigned</span>
            )}
          </TableCell>
        );
      
      case 'dueDate':
        return (
          <TableCell>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              {formatDate(task.dueDate)}
            </div>
          </TableCell>
        );
      
      case 'project':
        return (
          <TableCell>
            <span className="text-sm text-muted-foreground">
              {task.projectId || "-"}
            </span>
          </TableCell>
        );
      
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="text-center py-8 text-muted-foreground">
          Loading tasks...
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">List View</h2>
            {sortConfig.key && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleManualOrder}
                data-testid="button-manual-order"
              >
                Clear Sort
              </Button>
            )}
            {selectedTasks.length > 0 && (
              <Badge variant="secondary">
                {selectedTasks.length} selected
              </Badge>
            )}
          </div>
          {selectedTasks.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Change Status */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" data-testid="button-bulk-status">
                    <CircleCheck className="h-4 w-4 mr-1" />
                    Change Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {statusOptions.map((status) => (
                    <DropdownMenuItem
                      key={status.key}
                      onClick={() => bulkActionMutation.mutate({ ids: selectedTasks, action: "changeStatus", status: status.key })}
                    >
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: status.color || '#6b7280' }} />
                      {status.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Copy To */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" data-testid="button-bulk-copy">
                    <Copy className="h-4 w-4 mr-1" />
                    Copy To
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    onClick={() => bulkActionMutation.mutate({ ids: selectedTasks, action: "copyToBusiness" })}
                  >
                    <Building2 className="h-4 w-4 mr-2" />
                    Business Tasks
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Project...
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {projects.filter(p => p.id !== propProjectId).map((project) => (
                        <DropdownMenuItem
                          key={project.id}
                          onClick={() => bulkActionMutation.mutate({ ids: selectedTasks, action: "copyToProject", projectId: project.id })}
                        >
                          {project.name}
                        </DropdownMenuItem>
                      ))}
                      {projects.filter(p => p.id !== propProjectId).length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No other projects</div>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Delete */}
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => bulkActionMutation.mutate({ ids: selectedTasks, action: "delete" })}
                disabled={bulkActionMutation.isPending}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
              
              {/* Clear Selection */}
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setSelectedTasks([])}
                data-testid="button-clear-selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Grid List */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            <div className="overflow-auto h-full">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {/* Grid Header */}
                <div 
                  className="sticky top-0 z-10 bg-background border-b border-gray-200 grid items-center gap-4 px-4 h-9"
                  style={{ gridTemplateColumns: "28px 32px 120px 1fr 140px 120px 100px 32px" }}
                >
                  <div className="flex items-center justify-center">
                    <Checkbox
                      checked={selectedTasks.length > 0 && selectedTasks.length === sortedTasks.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTasks(sortedTasks.map(t => t.id));
                        } else {
                          setSelectedTasks([]);
                        }
                      }}
                      data-testid="select-all-tasks"
                    />
                  </div>
                  <div></div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Status</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Task</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Assignee</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Due Date</div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Priority</div>
                  <div></div>
                </div>
                  
                {/* Grid Body */}
                <div className="bg-background">
                  {/* Regular ungrouped tasks */}
                  <SortableContext items={sortedTasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
                    {sortedTasks.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        No tasks found
                      </div>
                    ) : (
                      sortedTasks.map((task) => (
                        <DraggableGridRow
                          key={task.id}
                          task={task}
                          canDrag={sortConfig.key === null}
                          isSelected={selectedTasks.includes(task.id)}
                          onSelect={() => toggleTaskSelection(task.id)}
                          onComplete={(checked) => handleToggleComplete(task, checked)}
                          onClick={() => onTaskClick?.(task)}
                          getStatusBadge={getStatusBadge}
                          getPriorityIcon={getPriorityIcon}
                          completedOption={completedOption}
                        />
                      ))
                    )}
                  </SortableContext>
                </div>

                <DragOverlay>
                  {activeTask ? (
                    <div className="bg-background border rounded p-2 shadow-lg">
                      <span className="font-medium">{activeTask.title}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
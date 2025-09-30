import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions } from "@shared/schema";
import { useTaskStatusOptions } from "@/hooks/useTaskStatusOptions";
import { useTaskLabelOptions } from "@/hooks/useTaskLabelOptions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from "lucide-react";
import { format } from "date-fns";
import SubtaskList from "@/components/SubtaskList";

interface TaskListProps {
  tasks?: Task[];
  groupedTasks?: Record<string, Task[]>;
  groupBy?: 'none' | 'status' | 'priority' | 'assignee' | 'tags';
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

// Draggable table row component
function DraggableTableRow({ 
  task, 
  children, 
  canDrag 
}: { 
  task: Task; 
  children: React.ReactNode; 
  canDrag: boolean;
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
    <TableRow
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "relative z-50" : ""} hover:bg-muted/50`}
      data-testid={`task-row-${task.id}`}
    >
      <TableCell className="w-8">
        <div
          {...(canDrag ? attributes : {})}
          {...(canDrag ? listeners : {})}
          className={`p-1 rounded ${
            canDrag 
              ? "cursor-grab hover:cursor-grabbing hover:bg-muted" 
              : "cursor-not-allowed opacity-50"
          }`}
          data-testid={`drag-handle-${task.id}`}
          title={canDrag ? "Drag to reorder" : "Clear sort to enable reordering"}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      {children}
    </TableRow>
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
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status: newStatus });
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
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
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
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
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
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
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
              <Button size="sm" variant="outline">
                Bulk Edit
              </Button>
              <Button size="sm" variant="outline">
                Delete Selected
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            <div className="overflow-auto h-full">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={selectedTasks.length === sortedTasks.length && sortedTasks.length > 0}
                          onCheckedChange={toggleAllTasks}
                          data-testid="select-all-tasks"
                        />
                      </TableHead>
                      <TableHead className="w-8" title="Mark as complete"></TableHead>
                      <SortableContext 
                        items={columns.map(col => col.id)} 
                        strategy={horizontalListSortingStrategy}
                      >
                        {columns.map(column => (
                          <SortableHeader 
                            key={column.id}
                            column={column}
                            className={column.width}
                          />
                        ))}
                      </SortableContext>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  
                  <TableBody>
                    {/* Render grouped tasks if grouping is enabled */}
                    {groupedTasks && groupBy !== 'none' ? (
                      Object.entries(groupedTasks).map(([groupName, groupTasks]) => [
                        // Group header row
                        <TableRow key={`group-${groupName}`} className="bg-muted/30">
                          <TableCell colSpan={9} className="font-semibold py-3">
                            <div className="flex items-center gap-2">
                              <span>{groupName}</span>
                              <Badge variant="secondary" className="text-xs">
                                {groupTasks.length} {groupTasks.length === 1 ? 'task' : 'tasks'}
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>,
                        // Group tasks
                        ...groupTasks.flatMap((task) => [
                          <DraggableTableRow key={task.id} task={task} canDrag={false}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedTasks.includes(task.id)}
                                  onCheckedChange={() => toggleTaskSelection(task.id)}
                                  data-testid={`select-task-${task.id}`}
                                />
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={task.status === completedOption?.key}
                                  onCheckedChange={(checked) => handleToggleComplete(task, checked)}
                                  data-testid={`complete-task-${task.id}`}
                                />
                              </TableCell>
                              {columns.map(column => (
                                <React.Fragment key={`${task.id}-${column.id}`}>
                                  {renderCell(task, column.id)}
                                </React.Fragment>
                              ))}
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`task-menu-${task.id}`}>
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
                              </TableCell>
                          </DraggableTableRow>,
                          
                          // Expandable Subtasks Row
                          ...(!task.parentTaskId && expandedTasks.has(task.id) ? [
                            <TableRow key={`${task.id}-subtasks`}>
                              <TableCell colSpan={8} className="p-0 border-b-0">
                                <div className="px-4 py-2 bg-muted/30">
                                  <SubtaskList parentTask={task} compact={false} />
                                </div>
                              </TableCell>
                            </TableRow>
                          ] : [])
                        ])
                      ]).flat()
                    ) : (
                      // Regular ungrouped tasks
                      <SortableContext items={sortedTasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
                        {sortedTasks.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                              No tasks found
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedTasks.flatMap((task) => [
                          <DraggableTableRow key={task.id} task={task} canDrag={sortConfig.key === null}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedTasks.includes(task.id)}
                                  onCheckedChange={() => toggleTaskSelection(task.id)}
                                  data-testid={`select-task-${task.id}`}
                                />
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={task.status === completedOption?.key}
                                  onCheckedChange={(checked) => handleToggleComplete(task, checked)}
                                  data-testid={`complete-task-${task.id}`}
                                />
                              </TableCell>
                              {columns.map(column => (
                                <React.Fragment key={`${task.id}-${column.id}`}>
                                  {renderCell(task, column.id)}
                                </React.Fragment>
                              ))}
                              <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" data-testid={`task-menu-${task.id}`}>
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
                            </TableCell>
                          </DraggableTableRow>,
                          
                          // Expandable Subtasks Row
                          ...(!task.parentTaskId && expandedTasks.has(task.id) ? [
                            <TableRow key={`${task.id}-subtasks`}>
                              <TableCell colSpan={8} className="p-0 border-b-0">
                                <div className="px-4 py-2 bg-muted/30">
                                  <SubtaskList parentTask={task} compact={false} />
                                </div>
                              </TableCell>
                            </TableRow>
                          ] : [])
                          ])
                        )}
                      </SortableContext>
                    )}
                  </TableBody>
                </Table>

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
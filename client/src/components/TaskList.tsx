import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task } from "@shared/schema";
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
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MoreHorizontal,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Calendar,
  User,
  Flag,
  ArrowUpDown,
} from "lucide-react";
import { format } from "date-fns";

interface TaskListProps {
  tasks?: Task[];
  isLoading?: boolean;
  filters?: Record<string, any>;
  columnConfig?: Record<string, any>;
}

type SortConfig = {
  key: keyof Task | null;
  direction: 'asc' | 'desc';
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

export default function TaskList({ tasks: propTasks, isLoading: propIsLoading, filters, columnConfig }: TaskListProps) {
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const { toast } = useToast();

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
    const task = tasks.find(t => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    
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

  const getStatusBadge = (status: string) => {
    const variants = {
      todo: "secondary",
      "in-progress": "default",
      done: "outline",
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "secondary"}>
        {status.replace("-", " ").toUpperCase()}
      </Badge>
    );
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-";
    const d = new Date(date);
    return format(d, "MMM dd, yyyy");
  };

  const SortableHeader = ({ 
    sortKey, 
    children, 
    className = "" 
  }: { 
    sortKey: keyof Task; 
    children: React.ReactNode; 
    className?: string;
  }) => (
    <TableHead className={className}>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto p-0 font-medium hover:bg-transparent"
        onClick={() => handleSort(sortKey)}
        data-testid={`sort-${sortKey}`}
      >
        {children}
        <ArrowUpDown className="ml-2 h-3 w-3" />
        {sortConfig.key === sortKey && (
          sortConfig.direction === 'asc' ? 
            <ChevronUp className="ml-1 h-3 w-3" /> : 
            <ChevronDown className="ml-1 h-3 w-3" />
        )}
      </Button>
    </TableHead>
  );

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
                      <SortableHeader sortKey="title" className="min-w-[200px]">
                        Task
                      </SortableHeader>
                      <SortableHeader sortKey="status" className="w-32">
                        Status
                      </SortableHeader>
                      <SortableHeader sortKey="priority" className="w-24">
                        Priority
                      </SortableHeader>
                      <SortableHeader sortKey="assigneeName" className="w-40">
                        Assignee
                      </SortableHeader>
                      <SortableHeader sortKey="dueDate" className="w-32">
                        Due Date
                      </SortableHeader>
                      <SortableHeader sortKey="projectId" className="w-40">
                        Project
                      </SortableHeader>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  
                  <TableBody>
                    <SortableContext items={sortedTasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
                      {sortedTasks.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            No tasks found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedTasks.map((task) => (
                          <DraggableTableRow key={task.id} task={task} canDrag={sortConfig.key === null}>
                            <TableCell>
                              <Checkbox
                                checked={selectedTasks.includes(task.id)}
                                onCheckedChange={() => toggleTaskSelection(task.id)}
                                data-testid={`select-task-${task.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span className="truncate" data-testid={`task-title-${task.id}`}>
                                  {task.title}
                                </span>
                                {task.tags && Array.isArray(task.tags) && task.tags.length > 0 && (
                                  <div className="flex gap-1">
                                    {task.tags.slice(0, 2).map((tag, index) => (
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
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(task.status || "todo")}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getPriorityIcon(task.priority || "medium")}
                                <span className="capitalize text-sm">
                                  {task.priority || "medium"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {task.assigneeName ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                                    {task.assigneeName.split(" ").map(n => n[0]).join("").toUpperCase()}
                                  </div>
                                  <span className="text-sm">{task.assigneeName}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                {formatDate(task.dueDate)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {task.projectId || "No Project"}
                              </span>
                            </TableCell>
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
                          </DraggableTableRow>
                        ))
                      )}
                    </SortableContext>
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
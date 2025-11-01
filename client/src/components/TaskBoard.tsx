import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task } from "@shared/schema";
import { Plus, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TaskCardCompact from "./TaskCardCompact";
import TaskModalAsana from "./TaskModalAsana";
import { useTaskStatusOptions } from "@/hooks/useTaskStatusOptions";

// DnD Kit imports
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


type ColumnWidth = 'small' | 'medium' | 'wide';

interface CardDisplaySettings {
  showPriority?: boolean;
  showDescription?: boolean;
  showTags?: boolean;
  showLabels?: boolean;
  showAssignee?: boolean;
  showDueDate?: boolean;
  showSubtasks?: boolean;
}

interface TaskBoardProps {
  tasks?: Task[];
  isLoading?: boolean;
  filters?: Record<string, any>;
  onTaskClick?: (task: Task) => void;
  projectId?: string;
  displaySettings?: CardDisplaySettings;
}

// Draggable Task Card wrapper
function DraggableTaskCard({ task, onTaskClick }: { task: Task; onTaskClick?: (task: Task) => void }) {
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
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <TaskCardCompact task={task} onClick={() => onTaskClick?.(task)} isDragging={isDragging} />
    </div>
  );
}

// Loading skeleton card - exactly 80px
function SkeletonCard() {
  return (
    <div className="h-20 rounded-lg border border-border/50 bg-muted/20 animate-pulse p-2">
      <div className="flex items-start gap-1.5">
        <div className="w-3.5 h-3.5 bg-muted rounded mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="h-2 bg-muted rounded w-1/2" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="h-3 w-16 bg-muted rounded-full" />
        <div className="w-5 h-5 bg-muted rounded-full" />
      </div>
    </div>
  );
}

// Droppable Column wrapper
function DroppableColumn({ 
  column, 
  tasks, 
  onAddTask,
  onTaskClick,
}: { 
  column: { id: string; title: string; status: string; color?: string }; 
  tasks: Task[]; 
  onAddTask: () => void;
  onTaskClick?: (task: Task) => void;
}) {
  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      column,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border transition-all duration-200 ${
        isOver ? 'border-2 border-blue-500 border-dashed bg-blue-500/5' : 'border-border bg-background'
      }`}
    >
      {/* Column Header - Asana style */}
      <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
          <Badge variant="secondary" className="text-xs px-2 py-0 h-5 rounded-full bg-muted/50 no-default-hover-elevate">
            {tasks.length}
          </Badge>
        </div>
      </div>

      {/* Cards Container - max height with scroll for 6-8 cards */}
      <div className="p-2 space-y-1.5 max-h-[calc(100vh-300px)] overflow-y-auto">
        <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              No tasks
            </div>
          ) : (
            tasks.map((task) => (
              <DraggableTaskCard key={task.id} task={task} onTaskClick={onTaskClick} />
            ))
          )}
        </SortableContext>

        {/* Add Task Button - compact */}
        <Button 
          variant="ghost" 
          size="sm"
          className="w-full h-7 text-xs border border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30 mt-1"
          onClick={onAddTask}
          data-testid={`add-task-${column.id}`}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

export default function TaskBoard({ tasks: propTasks, isLoading: propIsLoading, filters, onTaskClick, projectId, displaySettings }: TaskBoardProps = {}) {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [selectedColumnStatus, setSelectedColumnStatus] = useState<string>("todo");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const { toast } = useToast();
  
  // Column width state with localStorage persistence
  const [columnWidth, setColumnWidth] = useState<ColumnWidth>('medium');
  
  // Load column width from localStorage
  useEffect(() => {
    if (projectId) {
      const savedWidth = localStorage.getItem(`columnWidth_${projectId}`);
      if (savedWidth && (savedWidth === 'small' || savedWidth === 'medium' || savedWidth === 'wide')) {
        setColumnWidth(savedWidth as ColumnWidth);
      }
    }
  }, [projectId]);
  
  // Save column width to localStorage when it changes
  useEffect(() => {
    if (projectId) {
      localStorage.setItem(`columnWidth_${projectId}`, columnWidth);
    }
  }, [columnWidth, projectId]);
  
  // Scroll container ref for navigation
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showNavigation, setShowNavigation] = useState(false);
  
  // Placeholder for checkOverflow - will be defined after columns

  // Navigation functions for smooth scrolling
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -344, // Scroll by column width (320px) + gap (24px)
        behavior: 'smooth'
      });
    }
  };
  
  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 344, // Scroll by column width (320px) + gap (24px)
        behavior: 'smooth'
      });
    }
  };
  
  // Get column width class based on setting
  const getColumnWidthClass = () => {
    switch (columnWidth) {
      case 'small':
        return 'w-60'; // 240px
      case 'wide':
        return 'w-[400px]'; // 400px
      case 'medium':
      default:
        return 'w-80'; // 320px (default)
    }
  };

  // Set up drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get dynamic status options
  const { statusOptions, getStatusInfo, isLoading: statusOptionsLoading, hasLoadedButNoOptions } = useTaskStatusOptions();
  
  // Fallback columns for loading and no-options states
  const fallbackColumns = [
    { id: "todo", title: "To Do", status: "todo", color: "#6B7280" },
    { id: "in-progress", title: "In Progress", status: "in-progress", color: "#F59E0B" },
    { id: "done", title: "Done", status: "done", color: "#10B981" }
  ];

  // Create dynamic columns from status options with fallback to defaults
  const columns = statusOptions.length > 0 
    ? statusOptions.map(option => ({
        id: option.key,
        title: option.name,
        status: option.key,
        color: option.color || undefined
      }))
    : fallbackColumns; // Use fallback during loading and when no options configured
  
  // Robust overflow detection using ResizeObserver
  useEffect(() => {
    const checkOverflow = () => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const hasOverflow = container.scrollWidth > container.clientWidth;
        setShowNavigation(hasOverflow);
      }
    };

    const container = scrollContainerRef.current;
    if (!container) return;

    // Use ResizeObserver for better detection of size changes
    const resizeObserver = new ResizeObserver(() => {
      // Small delay to ensure content layout is complete
      requestAnimationFrame(checkOverflow);
    });

    resizeObserver.observe(container);

    // Initial check after content loads
    const timer = setTimeout(checkOverflow, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, [columns]);
  
  // Use props tasks if provided, otherwise fetch all tasks
  const { data: fetchedTasks = [], isLoading: fetchIsLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: !propTasks, // Only fetch if no tasks provided as props
  });
  
  const tasks = propTasks || fetchedTasks;
  const isLoading = (propIsLoading !== undefined ? propIsLoading : fetchIsLoading) || statusOptionsLoading;

  // Move task to different column
  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      const response = await apiRequest(`/api/tasks/${taskId}/status`, "PATCH", { status: newStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task moved successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to move task", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  // Group tasks by status
  const tasksByStatus = tasks.reduce((acc, task) => {
    const status = task.status || "todo";
    if (!acc[status]) acc[status] = [];
    acc[status].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const handleAddTaskToColumn = (status: string) => {
    setSelectedColumnStatus(status);
    setIsCreateTaskOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === "task") {
      setActiveTask(active.data.current.task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeTaskId = active.id as string;
    const activeTask = tasks.find(task => task.id === activeTaskId);
    
    if (!activeTask) return;

    // If dropped over a column
    if (over.data.current?.type === "column") {
      const newStatus = over.data.current.column.status;
      if (activeTask.status !== newStatus) {
        moveTaskMutation.mutate({ taskId: activeTaskId, newStatus });
      }
    }
    // If dropped over another task, move to that task's column
    else if (over.data.current?.type === "task") {
      const overTask = over.data.current.task;
      if (activeTask.status !== overTask.status) {
        moveTaskMutation.mutate({ taskId: activeTaskId, newStatus: overTask.status });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-6" data-testid="task-board">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Tasks</h1>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
             style={{ scrollbarWidth: 'thin' }}>
          {columns.map((column) => (
            <div key={column.id} className={`${getColumnWidthClass()} flex-shrink-0 rounded-lg border border-border bg-background`}>
              <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{column.title}</h3>
                  <Badge variant="secondary" className="text-xs px-2 py-0 h-5 rounded-full bg-muted/50">...</Badge>
                </div>
              </div>
              <div className="p-2 space-y-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="p-6" data-testid="task-board">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline"
                  size="sm"
                  data-testid="button-column-width"
                  className="h-9"
                >
                  <Columns3 className="h-4 w-4 mr-2" />
                  {columnWidth === 'small' ? 'Small' : columnWidth === 'wide' ? 'Wide' : 'Medium'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => setColumnWidth('small')}
                  data-testid="menu-item-column-small"
                >
                  Small (240px)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setColumnWidth('medium')}
                  data-testid="menu-item-column-medium"
                >
                  Medium (320px)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setColumnWidth('wide')}
                  data-testid="menu-item-column-wide"
                >
                  Wide (400px)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {showNavigation && (
              <>
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={scrollLeft}
                  data-testid="button-scroll-left"
                  className="h-9 w-9"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={scrollRight}
                  data-testid="button-scroll-right"
                  className="h-9 w-9"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            {columns.length > 0 && (
              <Button 
                onClick={() => handleAddTaskToColumn(columns[0].status)}
                data-testid="button-new-task"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            )}
          </div>
        </div>

        <div 
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          style={{ 
            scrollbarWidth: 'thin', 
            scrollBehavior: 'smooth'
          }}>
          <SortableContext items={columns.map(col => col.id)} strategy={verticalListSortingStrategy}>
            {columns.map((column) => {
              const columnTasks = tasksByStatus[column.status] || [];
              
              return (
                <div key={column.id} className={`${getColumnWidthClass()} flex-shrink-0`}>
                  <DroppableColumn
                    column={column}
                    tasks={columnTasks}
                    onAddTask={() => handleAddTaskToColumn(column.status)}
                    onTaskClick={(task) => {
                      setSelectedTask(task);
                      setIsTaskModalOpen(true);
                    }}
                  />
                </div>
              );
            })}
          </SortableContext>
        </div>
        
        {projectId && (
          <>
            <TaskModalAsana 
              open={isCreateTaskOpen}
              onOpenChange={setIsCreateTaskOpen}
              initialStatus={selectedColumnStatus}
              projectId={projectId}
            />
            {selectedTask && (
              <TaskModalAsana
                task={selectedTask}
                open={isTaskModalOpen}
                onOpenChange={(open) => {
                  setIsTaskModalOpen(open);
                  if (!open) setSelectedTask(null);
                }}
                projectId={projectId}
              />
            )}
          </>
        )}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTask ? (
            <div className="rotate-2">
              <TaskCardCompact task={activeTask} onClick={() => {}} isDragging={true} />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task } from "@shared/schema";
import { Plus } from "lucide-react";
import TaskCard from "./TaskCard";
import TaskForm from "./TaskForm";

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

const columns = [
  { id: "todo", title: "To Do", status: "todo" as const },
  { id: "in-progress", title: "In Progress", status: "in-progress" as const },
  { id: "done", title: "Done", status: "done" as const },
];

interface TaskBoardProps {
  tasks?: Task[];
  isLoading?: boolean;
  filters?: Record<string, any>;
}

// Draggable Task Card wrapper
function DraggableTaskCard({ task }: { task: Task }) {
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
    opacity: isDragging ? 0.5 : 1,
  };


  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <TaskCard task={task} showSubtasks={true} />
    </div>
  );
}

// Droppable Column wrapper
function DroppableColumn({ 
  column, 
  tasks, 
  onAddTask 
}: { 
  column: typeof columns[0]; 
  tasks: Task[]; 
  onAddTask: () => void; 
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
    <Card 
      ref={setNodeRef}
      className={`h-fit transition-colors ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{column.title}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
            <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tasks yet
            </div>
          ) : (
            tasks.map((task) => (
              <DraggableTaskCard key={task.id} task={task} />
            ))
          )}
        </SortableContext>
        <Button 
          variant="ghost" 
          className="w-full h-auto p-4 border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50"
          onClick={onAddTask}
          data-testid={`add-task-${column.id}`}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </CardContent>
    </Card>
  );
}

export default function TaskBoard({ tasks: propTasks, isLoading: propIsLoading, filters }: TaskBoardProps = {}) {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [selectedColumnStatus, setSelectedColumnStatus] = useState<"todo" | "in-progress" | "done">("todo");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
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

  // Move task to different column
  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status: newStatus });
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

  const handleAddTaskToColumn = (status: "todo" | "in-progress" | "done") => {
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((column) => (
            <Card key={column.id} className="h-fit">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{column.title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">...</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-center py-4 text-muted-foreground">Loading tasks...</div>
              </CardContent>
            </Card>
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
          <Button 
            onClick={() => handleAddTaskToColumn("todo")}
            data-testid="button-new-task"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SortableContext items={columns.map(col => col.id)} strategy={verticalListSortingStrategy}>
            {columns.map((column) => {
              const columnTasks = tasksByStatus[column.status] || [];
              
              return (
                <DroppableColumn
                  key={column.id}
                  column={column}
                  tasks={columnTasks}
                  onAddTask={() => handleAddTaskToColumn(column.status)}
                />
              );
            })}
          </SortableContext>
        </div>
        
        <TaskForm 
          open={isCreateTaskOpen}
          onOpenChange={setIsCreateTaskOpen}
          initialStatus={selectedColumnStatus}
        />

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTask ? (
            <div className="opacity-90 transform rotate-3 shadow-lg">
              <DraggableTaskCard task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
import { Task } from "@shared/schema";
import { CasvaTaskRow } from "./CasvaTaskRow";
import { CasvaTaskCreateRow } from "./CasvaTaskCreateRow";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useRef, useCallback } from "react";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export interface CasvaTaskListProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onToggleComplete?: (task: Task) => void;
  onAddTask?: () => void;
  showCheckboxes?: boolean;
  maxHeight?: string;
  isCreatingInline?: boolean;
  onCancelInlineCreate?: () => void;
  projectId?: string;
  columnVisibility?: {
    assignee?: boolean;
    dueDate?: boolean;
    status?: boolean;
    priority?: boolean;
  };
}

export function CasvaTaskList({ 
  tasks, 
  onEditTask, 
  onToggleComplete,
  onAddTask,
  showCheckboxes = false,
  maxHeight = "calc(100vh - 280px)",
  isCreatingInline = false,
  onCancelInlineCreate,
  projectId,
  columnVisibility = { assignee: true, dueDate: true, status: true, priority: true }
}: CasvaTaskListProps) {
  const { toast } = useToast();

  // Column widths state
  const [columnWidths, setColumnWidths] = useState({
    assignee: 128, // w-32 = 8rem = 128px
    dueDate: 112,  // w-28 = 7rem = 112px
    status: 80,    // w-20 = 5rem = 80px
    priority: 80   // w-20 = 5rem = 80px
  });

  // Column resize state
  const resizeRef = useRef<{
    column: keyof typeof columnWidths | null;
    startX: number;
    startWidth: number;
  }>({ column: null, startX: 0, startWidth: 0 });

  // Fetch users for assignee dropdown
  const { data: users = [] } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ["/api/users"],
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: { title: string; projectId?: string }) => {
      const response = await apiRequest("/api/tasks", "POST", taskData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      onCancelInlineCreate?.();
      toast({
        title: "Task created",
        description: "Task has been created successfully"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
        variant: "destructive"
      });
    }
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const response = await apiRequest(`/api/tasks/${taskId}`, "PATCH", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update task",
        variant: "destructive"
      });
    }
  });

  // Handle checkbox toggle
  const handleToggleComplete = (task: Task) => {
    const newStatus = task.status === "done" ? "in_progress" : "done";
    updateTaskMutation.mutate({
      taskId: task.id,
      updates: { status: newStatus }
    });
    onToggleComplete?.(task);
  };

  // Handle inline field updates
  const handleUpdateTask = (taskId: string, updates: Partial<Task>): Promise<void> => {
    return new Promise((resolve, reject) => {
      updateTaskMutation.mutate(
        { taskId, updates },
        {
          onSuccess: () => resolve(),
          onError: (error) => reject(error)
        }
      );
    });
  };

  // Column resize handlers
  const handleResizeStart = useCallback((column: keyof typeof columnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      column,
      startX: e.clientX,
      startWidth: columnWidths[column]
    };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [columnWidths]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current.column) return;
    const delta = e.clientX - resizeRef.current.startX;
    const newWidth = Math.max(60, resizeRef.current.startWidth + delta);
    setColumnWidths(prev => ({
      ...prev,
      [resizeRef.current.column as keyof typeof columnWidths]: newWidth
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeRef.current = { column: null, startX: 0, startWidth: 0 };
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      
      // Reorder locally (parent component should handle this)
      const reordered = arrayMove(tasks, oldIndex, newIndex);
      
      // You can add API call here to persist the new order if needed
      toast({
        title: "Task reordered",
        description: "Task order updated"
      });
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">No tasks found</p>
        {onAddTask && (
          <button
            onClick={onAddTask}
            className="h-9 px-4 rounded-md border border-border hover-elevate active-elevate-2 flex items-center gap-2 text-sm"
            data-testid="button-add-first-task"
          >
            <Plus className="h-4 w-4" />
            Add your first task
          </button>
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="border rounded-md bg-card overflow-hidden m-0">
        {/* Header */}
        <div className="group/header flex items-center gap-3 h-8 px-2 border-b border-border bg-white sticky top-0 z-10 relative">
          <div className="w-4 flex-shrink-0"></div>
          {showCheckboxes && <div className="w-5 flex-shrink-0"></div>}
          <div className="flex-1 text-xs font-medium text-muted-foreground">TASK</div>
          
          {/* Assignee column with resize handle */}
          {columnVisibility.assignee && (
            <div className="flex-shrink-0 relative group/col" style={{ width: columnWidths.assignee }}>
              <div className="text-xs font-medium text-muted-foreground">ASSIGNEE</div>
              <div 
                className="absolute right-0 top-[-8px] bottom-[-8px] w-1 bg-border opacity-0 group-hover/header:opacity-100 hover:!bg-primary cursor-col-resize transition-all z-20"
                onMouseDown={(e) => handleResizeStart('assignee', e)}
              />
            </div>
          )}

          {/* Due Date column with resize handle */}
          {columnVisibility.dueDate && (
            <div className="flex-shrink-0 relative group/col" style={{ width: columnWidths.dueDate }}>
              <div className="text-xs font-medium text-muted-foreground">DUE DATE</div>
              <div 
                className="absolute right-0 top-[-8px] bottom-[-8px] w-1 bg-border opacity-0 group-hover/header:opacity-100 hover:!bg-primary cursor-col-resize transition-all z-20"
                onMouseDown={(e) => handleResizeStart('dueDate', e)}
              />
            </div>
          )}

          {/* Status column with resize handle */}
          {columnVisibility.status && (
            <div className="flex-shrink-0 relative group/col" style={{ width: columnWidths.status }}>
              <div className="text-xs font-medium text-muted-foreground">STATUS</div>
              <div 
                className="absolute right-0 top-[-8px] bottom-[-8px] w-1 bg-border opacity-0 group-hover/header:opacity-100 hover:!bg-primary cursor-col-resize transition-all z-20"
                onMouseDown={(e) => handleResizeStart('status', e)}
              />
            </div>
          )}

          {/* Priority column with resize handle */}
          {columnVisibility.priority && (
            <div className="flex-shrink-0 relative group/col" style={{ width: columnWidths.priority }}>
              <div className="text-xs font-medium text-muted-foreground">PRIORITY</div>
              <div 
                className="absolute right-0 top-[-8px] bottom-[-8px] w-1 bg-border opacity-0 group-hover/header:opacity-100 hover:!bg-primary cursor-col-resize transition-all z-20"
                onMouseDown={(e) => handleResizeStart('priority', e)}
              />
            </div>
          )}

          <div className="flex-shrink-0 w-6"></div>
        </div>

        {/* Task List */}
        <ScrollArea style={{ maxHeight }} className="w-full">
          <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div>
              {tasks.map((task) => (
                <CasvaTaskRow
                  key={task.id}
                  task={task}
                  onEdit={() => onEditTask(task)}
                  onToggleComplete={() => handleToggleComplete(task)}
                  onUpdate={handleUpdateTask}
                  showCheckbox={showCheckboxes}
                  isDraggable={true}
                  users={users}
                  columnWidths={columnWidths}
                  columnVisibility={columnVisibility}
                />
              ))}
            </div>
          </SortableContext>
        </ScrollArea>
      
        {/* Inline Add Row */}
        {isCreatingInline ? (
          <CasvaTaskCreateRow
            onSave={(title) => createTaskMutation.mutate({ title, projectId })}
            onCancel={onCancelInlineCreate}
            showCheckbox={showCheckboxes}
          />
        ) : onAddTask ? (
          <div 
            className="group flex items-center gap-3 h-10 px-2 transition-all duration-200 hover:bg-gray-50 cursor-pointer border-t border-border"
            onClick={onAddTask}
            data-testid="button-add-task-inline"
          >
            <div className="w-4 flex-shrink-0"></div>
            <Plus className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-500 group-hover:text-gray-700">Add task</span>
          </div>
        ) : null}
      </div>
    </DndContext>
  );
}

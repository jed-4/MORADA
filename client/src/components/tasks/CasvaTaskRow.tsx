import { Task } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { Button } from "@/components/ui/button";
import { Pencil, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

export interface CasvaTaskRowProps {
  task: Task;
  onEdit: () => void;
  onToggleComplete?: () => void;
  isDraggable?: boolean;
  dragAttributes?: any;
  dragListeners?: any;
}

export function CasvaTaskRow({ 
  task, 
  onEdit, 
  onToggleComplete,
  isDraggable = false,
  dragAttributes,
  dragListeners 
}: CasvaTaskRowProps) {
  const isCompleted = task.status === "done" || task.status === "completed";

  return (
    <div 
      className={cn(
        "group casva-row flex items-center gap-3 px-4 border-b border-border",
        "casva-hover-lift bg-card hover:bg-accent/5 transition-colors",
        isCompleted && "opacity-60"
      )}
      data-testid={`task-row-${task.id}`}
    >
      {/* Drag Handle */}
      {isDraggable && (
        <div 
          className="drag-handle-enhanced cursor-grab active:cursor-grabbing" 
          {...dragAttributes} 
          {...dragListeners}
          data-testid="drag-handle"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      {/* Checkbox */}
      {onToggleComplete && (
        <Checkbox
          checked={isCompleted}
          onCheckedChange={onToggleComplete}
          className="shrink-0"
          data-testid={`checkbox-task-${task.id}`}
        />
      )}

      {/* Title - Takes most space */}
      <div className="flex-1 min-w-0 truncate font-medium text-sm" data-testid="task-title">
        {task.title}
      </div>

      {/* Status Chip */}
      <ColorChip type="status" value={task.status || "todo"} className="shrink-0" />

      {/* Priority Chip */}
      {task.priority && (
        <ColorChip type="priority" value={task.priority} className="shrink-0" />
      )}

      {/* Assignee */}
      {task.assigneeName && (
        <div className="text-xs text-muted-foreground shrink-0 min-w-[100px] truncate" data-testid="task-assignee">
          {task.assigneeName}
        </div>
      )}

      {/* Due Date */}
      {task.dueDate && (
        <div className="text-xs text-muted-foreground shrink-0 min-w-[80px]" data-testid="task-due-date">
          {format(new Date(task.dueDate), 'MMM d')}
        </div>
      )}

      {/* Edit Icon - Appears on hover */}
      <Button
        variant="ghost"
        size="icon"
        className="casva-edit-icon h-8 w-8 shrink-0"
        onClick={onEdit}
        data-testid={`button-edit-task-${task.id}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

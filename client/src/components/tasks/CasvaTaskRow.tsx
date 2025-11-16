import { Task } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { Button } from "@/components/ui/button";
import { Pencil, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell } from "@/components/ui/table";

export interface CasvaTaskRowProps {
  task: Task;
  onEdit: () => void;
  onToggleComplete?: () => void;
  showCheckbox?: boolean;
  isDraggable?: boolean;
  dragAttributes?: any;
  dragListeners?: any;
}

export function CasvaTaskRow({ 
  task, 
  onEdit, 
  onToggleComplete,
  showCheckbox = false,
  isDraggable = false,
  dragAttributes,
  dragListeners 
}: CasvaTaskRowProps) {
  const isCompleted = task.status === "done" || task.status === "completed";

  return (
    <>
      {/* Checkbox Column */}
      {showCheckbox && (
        <TableCell className="w-12 h-9 py-0">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={onToggleComplete}
            data-testid={`checkbox-task-${task.id}`}
          />
        </TableCell>
      )}

      {/* Title Column */}
      <TableCell className="h-9 py-0">
        <div className="flex items-center gap-1.5">
          {isDraggable && (
            <div 
              className="drag-handle-enhanced cursor-grab active:cursor-grabbing" 
              {...dragAttributes} 
              {...dragListeners}
              data-testid="drag-handle"
            >
              <GripVertical className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
          <span className={cn("text-sm truncate", isCompleted && "line-through opacity-60")} data-testid="task-title">
            {task.title}
          </span>
        </div>
      </TableCell>

      {/* Status Column */}
      <TableCell className="w-32 h-9 py-0">
        <ColorChip type="status" value={task.status || "todo"} />
      </TableCell>

      {/* Priority Column */}
      <TableCell className="w-32 h-9 py-0">
        {task.priority ? (
          <ColorChip type="priority" value={task.priority} />
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Assignee Column */}
      <TableCell className="w-40 h-9 py-0">
        {task.assigneeName ? (
          <div className="text-xs text-muted-foreground truncate" data-testid="task-assignee">
            {task.assigneeName}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Due Date Column */}
      <TableCell className="w-32 h-9 py-0">
        {task.dueDate ? (
          <div className="text-xs text-muted-foreground" data-testid="task-due-date">
            {format(new Date(task.dueDate), 'MMM d, yyyy')}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Actions Column */}
      <TableCell className="w-12 h-9 py-0">
        <button
          className="h-6 w-6 rounded-md border border-border hover-elevate active-elevate-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onEdit}
          data-testid={`button-edit-task-${task.id}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </TableCell>
    </>
  );
}

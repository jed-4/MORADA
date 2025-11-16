import { Task } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { Pencil, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

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
    <div 
      className="group flex items-center gap-3 h-10 px-3 transition-all duration-200 hover:bg-gray-50 hover:shadow-md hover:scale-[1.01] cursor-pointer"
      data-testid={`task-row-${task.id}`}
    >
      {/* Drag Handle - Hidden until hover */}
      <div 
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing flex-shrink-0" 
        {...dragAttributes} 
        {...dragListeners}
        data-testid="drag-handle"
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Checkbox (optional) */}
      {showCheckbox && (
        <div className="flex-shrink-0">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={onToggleComplete}
            data-testid={`checkbox-task-${task.id}`}
          />
        </div>
      )}

      {/* Title Column - Flex grow to take remaining space */}
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm font-semibold truncate", isCompleted && "line-through opacity-60")} data-testid="task-title">
          {task.title}
        </div>
      </div>

      {/* Assignee - Secondary text */}
      <div className="flex-shrink-0 w-32">
        {task.assigneeName ? (
          <div className="text-[13px] text-gray-600 truncate" data-testid="task-assignee">
            {task.assigneeName}
          </div>
        ) : (
          <span className="text-[13px] text-gray-400">-</span>
        )}
      </div>

      {/* Due Date - Secondary text */}
      <div className="flex-shrink-0 w-28">
        {task.dueDate ? (
          <div className="text-[13px] text-gray-600" data-testid="task-due-date">
            {format(new Date(task.dueDate), 'MMM d, yyyy')}
          </div>
        ) : (
          <span className="text-[13px] text-gray-400">-</span>
        )}
      </div>

      {/* Chips Column - Vertical stack */}
      <div className="flex-shrink-0 flex flex-col gap-1 items-end w-24">
        <ColorChip type="status" value={task.status || "todo"} />
        {task.priority && (
          <ColorChip type="priority" value={task.priority} />
        )}
      </div>

      {/* Edit Action - Hidden until hover */}
      <div className="flex-shrink-0">
        <button
          className="h-6 w-6 rounded-md border border-border hover-elevate active-elevate-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          data-testid={`button-edit-task-${task.id}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

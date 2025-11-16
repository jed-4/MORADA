import { Task } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { MoreHorizontal, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useRef, useEffect } from "react";

export interface CasvaTaskRowProps {
  task: Task;
  onEdit: () => void;
  onToggleComplete?: () => void;
  onUpdate?: (taskId: string, updates: Partial<Task>) => void;
  showCheckbox?: boolean;
  isDraggable?: boolean;
}

export function CasvaTaskRow({ 
  task, 
  onEdit, 
  onToggleComplete,
  onUpdate,
  showCheckbox = false,
  isDraggable = false
}: CasvaTaskRowProps) {
  const isCompleted = task.status === "done" || task.status === "completed";
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const startEditing = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const saveEdit = async () => {
    if (!editingField || !onUpdate) return;
    
    // Validate non-empty title
    const trimmedValue = editValue.trim();
    if (editingField === 'title' && !trimmedValue) {
      // Keep editor open if title is empty
      return;
    }
    
    // Only save if value changed
    const originalValue = task[editingField as keyof Task];
    if (trimmedValue !== originalValue) {
      setIsSaving(true);
      try {
        await onUpdate(task.id, { [editingField]: trimmedValue });
        // Only close editor on successful save
        setEditingField(null);
        setEditValue("");
      } catch (error) {
        // Restore original value and re-focus input on error
        setEditValue(originalValue as string);
        console.error("Failed to save edit:", error);
        // Re-focus the input after a brief delay to allow blur to complete
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }, 0);
      } finally {
        setIsSaving(false);
      }
    } else {
      // No change, just close
      setEditingField(null);
      setEditValue("");
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 h-9 px-2 transition-all duration-200 hover:bg-gray-50 cursor-pointer relative"
      data-testid={`task-row-${task.id}`}
    >
      {/* Drag Handle - Hidden until hover with border on hover */}
      <div 
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing flex-shrink-0 relative" 
        {...attributes} 
        {...listeners}
        data-testid="drag-handle"
      >
        <div className="absolute inset-0 border border-transparent group-hover:border-gray-400 rounded-sm pointer-events-none" />
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Checkbox (optional) with border on hover */}
      {showCheckbox && (
        <div className="flex-shrink-0 relative">
          <div className="absolute inset-0 border border-transparent group-hover:border-gray-400 rounded-sm pointer-events-none" />
          <Checkbox
            checked={isCompleted}
            onCheckedChange={onToggleComplete}
            data-testid={`checkbox-task-${task.id}`}
          />
        </div>
      )}

      {/* Title Column - Flex grow to take remaining space */}
      <div className="flex-1 min-w-0">
        {editingField === "title" ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            className="w-full text-sm font-semibold bg-transparent border-none outline-none focus:ring-0 p-0"
            data-testid="input-edit-title"
          />
        ) : (
          <div 
            className={cn("text-sm font-semibold truncate cursor-text", isCompleted && "line-through opacity-60")} 
            onClick={(e) => {
              e.stopPropagation();
              startEditing("title", task.title);
            }}
            data-testid="task-title"
          >
            {task.title}
          </div>
        )}
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

      {/* Status Column */}
      <div className="flex-shrink-0 w-20">
        <ColorChip type="status" value={task.status || "todo"} />
      </div>

      {/* Priority Column */}
      <div className="flex-shrink-0 w-20">
        {task.priority ? (
          <ColorChip type="priority" value={task.priority} />
        ) : (
          <span className="text-[13px] text-gray-400">-</span>
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
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

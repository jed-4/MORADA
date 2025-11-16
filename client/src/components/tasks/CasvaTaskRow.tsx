import { Task } from "@shared/schema";
import { ColorChip } from "@/components/ui/color-chip";
import { MoreHorizontal, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useRef, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface CasvaTaskRowProps {
  task: Task;
  onEdit: () => void;
  onToggleComplete?: () => void;
  onUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
  showCheckbox?: boolean;
  isDraggable?: boolean;
  users?: Array<{ id: string; name: string; email: string }>;
  columnWidths?: {
    assignee: number;
    dueDate: number;
    status: number;
    priority: number;
  };
}

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function CasvaTaskRow({ 
  task, 
  onEdit, 
  onToggleComplete,
  onUpdate,
  showCheckbox = false,
  isDraggable = false,
  users = [],
  columnWidths = {
    assignee: 128,
    dueDate: 112,
    status: 80,
    priority: 80
  }
}: CasvaTaskRowProps) {
  const isCompleted = task.status === "done" || task.status === "completed";
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
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
    
    const trimmedValue = editValue.trim();
    if (editingField === 'title' && !trimmedValue) {
      return;
    }
    
    const originalValue = task[editingField as keyof Task];
    if (trimmedValue !== originalValue) {
      setIsSaving(true);
      try {
        await onUpdate(task.id, { [editingField]: trimmedValue });
        setEditingField(null);
        setEditValue("");
      } catch (error) {
        setEditValue(originalValue as string);
        console.error("Failed to save edit:", error);
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

  const handleStatusChange = async (newStatus: string) => {
    if (onUpdate) {
      try {
        await onUpdate(task.id, { status: newStatus });
        setStatusOpen(false);
      } catch (error) {
        console.error("Failed to update status:", error);
      }
    }
  };

  const handleAssigneeChange = async (userId: string) => {
    if (onUpdate) {
      try {
        await onUpdate(task.id, { assignee: userId });
        setAssigneeOpen(false);
      } catch (error) {
        console.error("Failed to update assignee:", error);
      }
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (onUpdate) {
      try {
        await onUpdate(task.id, { priority });
        setPriorityOpen(false);
      } catch (error) {
        console.error("Failed to update priority:", error);
      }
    }
  };

  const handleDueDateChange = async (date: Date | undefined, hours?: string, minutes?: string) => {
    if (onUpdate) {
      try {
        let finalDate: Date | null = null;
        if (date) {
          finalDate = new Date(date);
          if (hours !== undefined && minutes !== undefined) {
            finalDate.setHours(parseInt(hours) || 0, parseInt(minutes) || 0, 0, 0);
          }
        }
        await onUpdate(task.id, { dueDate: finalDate ? finalDate.toISOString() : null });
        setDueDateOpen(false);
      } catch (error) {
        console.error("Failed to update due date:", error);
      }
    }
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-3 h-10 px-2 transition-all duration-200 hover:bg-gray-50 relative"
      data-testid={`task-row-${task.id}`}
    >
      {/* Drag Handle - Hidden until hover */}
      <div 
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing flex-shrink-0" 
        {...attributes} 
        {...listeners}
        data-testid="drag-handle"
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Checkbox - Hidden by default, shows on hover */}
      {showCheckbox && (
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-4 h-4 flex items-center justify-center">
            <Checkbox
              checked={isCompleted}
              onCheckedChange={onToggleComplete}
              className="w-4 h-4 border-2 rounded data-[state=checked]:bg-[#bba7db] data-[state=checked]:border-[#bba7db]"
              data-testid={`checkbox-task-${task.id}`}
            />
          </div>
        </div>
      )}

      {/* Title Column - Click to edit */}
      <div className="flex-1 min-w-0">
        {editingField === "title" ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            className="w-full text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-[#bba7db] rounded px-1 -mx-1"
            data-testid="input-edit-title"
          />
        ) : (
          <div 
            className={cn(
              "text-sm font-medium truncate cursor-text hover:bg-gray-100 rounded px-1 -mx-1",
              isCompleted && "line-through opacity-60"
            )} 
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

      {/* Assignee - Click for popover */}
      <div className="flex-shrink-0" style={{ width: columnWidths.assignee }}>
        <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
          <PopoverTrigger asChild>
            <button 
              className="text-left w-full hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 min-h-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              {task.assigneeName && (
                <div className="text-[13px] text-gray-600 truncate" data-testid="task-assignee">
                  {task.assigneeName}
                </div>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-1">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleAssigneeChange(user.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 transition-colors",
                    task.assignee === user.id && "bg-[#bba7db]/10 text-[#bba7db]"
                  )}
                >
                  <div className="font-medium">{user.name || user.email}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </button>
              ))}
              {users.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">No users available</div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Due Date - Click for date picker popover */}
      <div className="flex-shrink-0" style={{ width: columnWidths.dueDate }}>
        <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
          <PopoverTrigger asChild>
            <button 
              className="text-left w-full hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 min-h-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              {task.dueDate ? (
                <div className="text-[13px] text-gray-600" data-testid="task-due-date">
                  {format(new Date(task.dueDate), 'MMM d, h:mm a')}
                </div>
              ) : null}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex flex-col">
              <Calendar
                mode="single"
                selected={task.dueDate ? new Date(task.dueDate) : undefined}
                onSelect={(date) => {
                  const currentDate = task.dueDate ? new Date(task.dueDate) : new Date();
                  const hours = currentDate.getHours().toString().padStart(2, '0');
                  const minutes = currentDate.getMinutes().toString().padStart(2, '0');
                  handleDueDateChange(date, hours, minutes);
                }}
                initialFocus
              />
              <div className="border-t p-3 space-y-2">
                <div className="text-xs font-medium text-gray-600 mb-2">Time</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    placeholder="HH"
                    defaultValue={task.dueDate ? format(new Date(task.dueDate), 'HH') : '09'}
                    onChange={(e) => {
                      const currentDate = task.dueDate ? new Date(task.dueDate) : new Date();
                      const minutes = currentDate.getMinutes().toString().padStart(2, '0');
                      handleDueDateChange(currentDate, e.target.value, minutes);
                    }}
                    className="w-14 text-sm border border-border rounded px-2 py-1 focus:ring-1 focus:ring-[#bba7db] outline-none text-center"
                  />
                  <span className="text-gray-500">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="MM"
                    defaultValue={task.dueDate ? format(new Date(task.dueDate), 'mm') : '00'}
                    onChange={(e) => {
                      const currentDate = task.dueDate ? new Date(task.dueDate) : new Date();
                      const hours = currentDate.getHours().toString().padStart(2, '0');
                      handleDueDateChange(currentDate, hours, e.target.value);
                    }}
                    className="w-14 text-sm border border-border rounded px-2 py-1 focus:ring-1 focus:ring-[#bba7db] outline-none text-center"
                  />
                </div>
                {task.dueDate && (
                  <button
                    onClick={() => handleDueDateChange(undefined)}
                    className="w-full text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    Clear date
                  </button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Status - Click for popover */}
      <div className="flex-shrink-0" style={{ width: columnWidths.status }}>
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <button 
              className="hover:opacity-80 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <ColorChip type="status" value={task.status || "todo"} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors flex items-center gap-2"
                >
                  <ColorChip type="status" value={option.value} />
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Priority - Click for popover */}
      <div className="flex-shrink-0" style={{ width: columnWidths.priority }}>
        <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
          <PopoverTrigger asChild>
            <button 
              className="hover:opacity-80 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              {task.priority ? (
                <ColorChip type="priority" value={task.priority} />
              ) : (
                <span className="text-[13px] text-gray-400">-</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-1">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handlePriorityChange(option.value)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-100 transition-colors flex items-center gap-2"
                >
                  <ColorChip type="priority" value={option.value} />
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
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

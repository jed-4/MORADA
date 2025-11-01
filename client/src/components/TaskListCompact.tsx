import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions, type User } from "@shared/schema";
import { GripVertical, Calendar as CalendarIcon, Flag, Pencil, User as UserIcon } from "lucide-react";
import { format } from "date-fns";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TaskListCompactProps {
  tasks?: Task[];
  groupedTasks?: Record<string, Task[]>;
  isLoading?: boolean;
  onTaskClick?: (task: Task) => void;
  projectId?: string;
}

// Status colors matching Asana 2025
const getStatusColor = (status: string | null): string => {
  const s = status?.toLowerCase() || '';
  if (s.includes('done') || s.includes('complete')) return 'bg-green-500/10 text-green-700 dark:text-green-400';
  if (s.includes('progress') || s.includes('active')) return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
  if (s.includes('todo') || s.includes('pending') || s.includes('capture')) return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
  return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
};

// Priority colors
const getPriorityColor = (priority: string | null): string | null => {
  const p = priority?.toLowerCase() || '';
  if (p === 'high' || p === 'urgent') return 'bg-red-500/10 text-red-700 dark:text-red-400';
  if (p === 'medium') return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400';
  if (p === 'low') return 'bg-gray-500/10 text-gray-600 dark:text-gray-500';
  return null;
};

// Get initials
const getInitials = (name: string | null | undefined): string => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

// Loading skeleton - exactly 40px
function TaskRowSkeleton() {
  return (
    <div className="h-10 px-2 flex items-center gap-1.5 border-b border-border/50 animate-pulse">
      <div className="w-3 h-3 bg-muted rounded" />
      <div className="w-4 h-4 bg-muted rounded" />
      <div className="flex-1 h-3 bg-muted rounded max-w-xs" />
      <div className="w-14 h-4 bg-muted rounded-full" />
      <div className="w-10 h-4 bg-muted rounded-full" />
      <div className="w-5 h-5 bg-muted rounded-full" />
      <div className="w-16 h-3 bg-muted rounded" />
    </div>
  );
}

// Single sortable task row - EXACTLY 40px tall
function SortableTaskRow({
  task,
  onClick,
  onToggleComplete,
  isCompleted,
  isSelected,
  statusOptions,
  priorityOptions,
  users,
  onUpdate,
}: {
  task: Task;
  onClick: () => void;
  onToggleComplete: (checked: boolean) => void;
  isCompleted: boolean;
  isSelected: boolean;
  statusOptions: any[];
  priorityOptions: any[];
  users: User[];
  onUpdate: (field: string, value: any) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleEditClick = (e: React.MouseEvent, field: string, currentValue: any) => {
    e.stopPropagation();
    setEditingField(field);
    setEditValue(currentValue || '');
    if (field === 'dueDate' && dateInputRef.current) {
      setTimeout(() => dateInputRef.current?.showPicker(), 0);
    }
  };

  const handleSave = (field: string) => {
    if (editValue !== task[field as keyof Task]) {
      onUpdate(field, editValue);
    }
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: string) => {
    if (e.key === 'Enter') {
      handleSave(field);
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  const statusColor = getStatusColor(task.status);
  const priorityColor = getPriorityColor(task.priority);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`h-10 px-2 flex items-center gap-1.5 border-b border-border/50 cursor-pointer transition-all duration-100 ${
        isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/50'
      } ${isHovered ? 'shadow-sm' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`task-row-${task.id}`}
    >
      {/* Drag handle - ALWAYS visible, subtle */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground" />
      </div>

      {/* Checkbox - compact */}
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isCompleted}
          onCheckedChange={onToggleComplete}
          className="h-4 w-4"
          data-testid={`checkbox-${task.id}`}
        />
      </div>

      {/* Title - truncated, compact */}
      <div className={`flex-1 text-sm leading-5 truncate ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        {task.title}
      </div>

      {/* Status Chip - inline editable */}
      {editingField === 'status' ? (
        <Select
          value={task.status || ''}
          onValueChange={(value) => {
            onUpdate('status', value);
            setEditingField(null);
          }}
          open={editingField === 'status'}
          onOpenChange={(open) => !open && setEditingField(null)}
        >
          <SelectTrigger className="h-5 w-20 text-xs px-1 py-0" onClick={(e) => e.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.key} value={opt.key} className="text-xs">
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : task.status ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setEditingField('status');
          }}
          className="group relative"
        >
          <Badge className={`text-xs px-2 py-0.5 h-5 rounded-full ${statusColor} border-0 no-default-hover-elevate no-default-active-elevate cursor-pointer hover:opacity-80`}>
            {task.status}
          </Badge>
          {isHovered && (
            <Pencil className="absolute -right-3 top-0.5 h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
          )}
        </div>
      ) : null}

      {/* Priority Tag - inline editable */}
      {editingField === 'priority' ? (
        <Select
          value={task.priority || ''}
          onValueChange={(value) => {
            onUpdate('priority', value);
            setEditingField(null);
          }}
          open={editingField === 'priority'}
          onOpenChange={(open) => !open && setEditingField(null)}
        >
          <SelectTrigger className="h-5 w-20 text-xs px-1 py-0" onClick={(e) => e.stopPropagation()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorityOptions.map((opt) => (
              <SelectItem key={opt.key} value={opt.key} className="text-xs">
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : priorityColor ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setEditingField('priority');
          }}
          className="group relative"
        >
          <Badge className={`text-xs px-1.5 py-0.5 h-5 rounded-full ${priorityColor} border-0 gap-0.5 no-default-hover-elevate no-default-active-elevate cursor-pointer hover:opacity-80`}>
            <Flag className="h-2.5 w-2.5" />
            {task.priority}
          </Badge>
          {isHovered && (
            <Pencil className="absolute -right-3 top-0.5 h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
          )}
        </div>
      ) : null}

      {/* Assignee Avatar - inline editable */}
      {editingField === 'assigneeId' ? (
        <Popover open={editingField === 'assigneeId'} onOpenChange={(open) => !open && setEditingField(null)}>
          <PopoverTrigger onClick={(e) => e.stopPropagation()} />
          <PopoverContent className="w-48 p-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="px-2 py-1 text-xs hover:bg-muted rounded cursor-pointer flex items-center gap-2"
                  onClick={() => {
                    onUpdate('assigneeId', user.id);
                    setEditingField(null);
                  }}
                >
                  <Avatar className="h-4 w-4">
                    <AvatarFallback className="text-[8px]">{getInitials(user.firstName || user.email)}</AvatarFallback>
                  </Avatar>
                  <span>{user.firstName || user.email}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : task.assigneeName ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setEditingField('assigneeId');
          }}
          className="cursor-pointer hover:opacity-80"
        >
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {getInitials(task.assigneeName)}
            </AvatarFallback>
          </Avatar>
        </div>
      ) : (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setEditingField('assigneeId');
          }}
          className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/30 cursor-pointer hover:border-muted-foreground/60 flex items-center justify-center"
        >
          <UserIcon className="h-2.5 w-2.5 text-muted-foreground/40" />
        </div>
      )}

      {/* Due Date - inline editable */}
      {editingField === 'dueDate' ? (
        <Input
          ref={dateInputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSave('dueDate')}
          onKeyDown={(e) => handleKeyDown(e, 'dueDate')}
          onClick={(e) => e.stopPropagation()}
          className="h-5 w-24 text-xs px-1 py-0"
          autoFocus
        />
      ) : task.dueDate ? (
        <div
          onClick={(e) => handleEditClick(e, 'dueDate', task.dueDate)}
          className="group relative flex items-center gap-0.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground"
        >
          <CalendarIcon className="h-2.5 w-2.5" />
          <span className="leading-5">{format(new Date(task.dueDate), 'MMM d')}</span>
          {isHovered && (
            <Pencil className="absolute -right-3 top-0.5 h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
          )}
        </div>
      ) : isHovered ? (
        <div
          onClick={(e) => handleEditClick(e, 'dueDate', '')}
          className="text-xs text-muted-foreground/50 cursor-pointer hover:text-muted-foreground flex items-center gap-0.5"
        >
          <CalendarIcon className="h-2.5 w-2.5" />
          <span className="leading-5">Add</span>
        </div>
      ) : (
        <div className="w-16" />
      )}
    </div>
  );
}

export default function TaskListCompact({
  tasks: propTasks,
  groupedTasks,
  isLoading,
  onTaskClick,
  projectId,
}: TaskListCompactProps) {
  const { toast } = useToast();
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [taskOrder, setTaskOrder] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch tasks if not provided
  const { data: fetchedTasks = [], isLoading: fetchIsLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", projectId],
    enabled: !propTasks,
  });

  const tasks = propTasks || fetchedTasks;
  const loading = isLoading !== undefined ? isLoading : fetchIsLoading;

  // Fetch field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Fetch users for assignee dropdown
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const statusCategory = fieldCategories.find((cat) => cat.key === "task.status");
  const priorityCategory = fieldCategories.find((cat) => cat.key === "task.priority");
  const completedOption = statusCategory?.options.find((opt) => opt.isCompleted);
  const defaultOption = statusCategory?.options.find((opt) => opt.isDefault);

  // Create ordered tasks using useMemo to avoid infinite re-renders
  const orderedTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    
    // If we have a custom order from drag-drop, apply it
    if (taskOrder.length > 0 && taskOrder.length === tasks.length) {
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      return taskOrder.map(id => taskMap.get(id)).filter(Boolean) as Task[];
    }
    
    // Otherwise, return tasks as-is
    return tasks;
  }, [tasks, taskOrder]);

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
      const oldIndex = orderedTasks.findIndex((item) => item.id === active.id);
      const newIndex = orderedTasks.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(orderedTasks.map(t => t.id), oldIndex, newIndex);
      setTaskOrder(newOrder);
    }
  };

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      const response = await apiRequest(`/api/tasks/${taskId}`, "PATCH", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleComplete = (task: Task, checked: boolean) => {
    if (!completedOption) {
      toast({
        title: "No completed status configured",
        description: "Please configure a completed status in field settings",
        variant: "destructive",
      });
      return;
    }

    const newStatus = checked ? completedOption.key : defaultOption?.key || "todo";
    updateTaskMutation.mutate({ taskId: task.id, updates: { status: newStatus } });
  };

  const handleUpdate = (taskId: string, field: string, value: any) => {
    updateTaskMutation.mutate({ taskId, updates: { [field]: value } });
  };

  const handleTaskClick = (task: Task, index: number) => {
    setSelectedIndex(index);
    if (onTaskClick) {
      onTaskClick(task);
    }
  };

  const isTaskCompleted = (task: Task): boolean => {
    if (!completedOption) return false;
    return task.status === completedOption.key;
  };

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!orderedTasks.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, orderedTasks.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      onTaskClick && onTaskClick(orderedTasks[selectedIndex]);
    } else if (e.key === ' ' && selectedIndex >= 0) {
      e.preventDefault();
      const task = orderedTasks[selectedIndex];
      handleToggleComplete(task, !isTaskCompleted(task));
    }
  };

  // Loading state - 15 rows to show density
  if (loading) {
    return (
      <div className="border border-border rounded-md bg-background">
        {Array.from({ length: 20 }).map((_, i) => (
          <TaskRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (!orderedTasks || orderedTasks.length === 0) {
    return (
      <div className="border border-border rounded-md bg-background p-12 text-center">
        <p className="text-sm text-muted-foreground">No tasks found</p>
      </div>
    );
  }

  // Grouped view
  if (groupedTasks) {
    return (
      <div className="border border-border rounded-md bg-background overflow-hidden">
        {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
          <div key={groupName}>
            <div className="h-7 px-2 flex items-center bg-muted/30 border-b border-border/50">
              <span className="text-xs font-medium text-muted-foreground">{groupName}</span>
              <span className="ml-1.5 text-[10px] text-muted-foreground/70">({groupTasks.length})</span>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={groupTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {groupTasks.map((task, idx) => (
                  <SortableTaskRow
                    key={task.id}
                    task={task}
                    onClick={() => handleTaskClick(task, idx)}
                    onToggleComplete={(checked) => handleToggleComplete(task, checked)}
                    isCompleted={isTaskCompleted(task)}
                    isSelected={false}
                    statusOptions={statusCategory?.options || []}
                    priorityOptions={priorityCategory?.options || []}
                    users={users}
                    onUpdate={(field, value) => handleUpdate(task.id, field, value)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ))}
      </div>
    );
  }

  // Flat list with keyboard navigation and drag-drop
  return (
    <div
      ref={listRef}
      className="border border-border rounded-md bg-background overflow-hidden focus:outline-none focus:ring-1 focus:ring-primary"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="max-h-[calc(100vh-250px)] overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {orderedTasks.map((task, idx) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                onClick={() => handleTaskClick(task, idx)}
                onToggleComplete={(checked) => handleToggleComplete(task, checked)}
                isCompleted={isTaskCompleted(task)}
                isSelected={selectedIndex === idx}
                statusOptions={statusCategory?.options || []}
                priorityOptions={priorityCategory?.options || []}
                users={users}
                onUpdate={(field, value) => handleUpdate(task.id, field, value)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="h-6 px-2 flex items-center justify-between bg-muted/20 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground">{orderedTasks.length} tasks</span>
        <span className="text-[10px] text-muted-foreground/70">↑↓ Navigate • Enter Open • Space Toggle</span>
      </div>
    </div>
  );
}

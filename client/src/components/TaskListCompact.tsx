import { useState, useEffect, useRef, useMemo, useCallback, KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions, type User, type Project } from "@shared/schema";
import { GripVertical, Calendar as CalendarIcon, Flag, Pencil, User as UserIcon, ArrowUp, ArrowDown, ArrowUpDown, Trash2, MoreVertical, Plus } from "lucide-react";
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
  horizontalListSortingStrategy,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type TaskColumnKey = 'status' | 'priority' | 'assignee' | 'dueDate' | 'project';
export type SortDirection = 'asc' | 'desc' | null;

export interface TaskColumnConfig {
  order: TaskColumnKey[];
  sort?: { column: TaskColumnKey | 'title'; direction: SortDirection };
  widths?: Record<TaskColumnKey, number>;
}

export const DEFAULT_COLUMN_ORDER: TaskColumnKey[] = ['status', 'priority', 'assignee', 'dueDate'];

const DEFAULT_COLUMN_WIDTHS: Record<TaskColumnKey, number> = {
  status: 80,
  priority: 80,
  assignee: 96,
  dueDate: 80,
  project: 112,
};

const COLUMN_DEFINITIONS: Record<TaskColumnKey, { label: string; minWidth: number }> = {
  status: { label: 'Status', minWidth: 60 },
  priority: { label: 'Priority', minWidth: 60 },
  assignee: { label: 'Assignee', minWidth: 70 },
  dueDate: { label: 'Due Date', minWidth: 70 },
  project: { label: 'Project', minWidth: 80 },
};

interface TaskListCompactProps {
  tasks?: Task[];
  groupedTasks?: Record<string, Task[]>;
  isLoading?: boolean;
  onTaskClick?: (task: Task) => void;
  projectId?: string;
  columnConfig?: TaskColumnConfig;
  onColumnConfigChange?: (config: TaskColumnConfig) => void;
  onDelete?: (task: Task) => void;
  showActions?: boolean;
  onAddTask?: (title: string) => void | Promise<void>;
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

// Sortable and resizable header column
function SortableHeaderColumn({
  columnKey,
  label,
  width,
  minWidth,
  sortConfig,
  onSort,
  onResize,
}: {
  columnKey: TaskColumnKey;
  label: string;
  width: number;
  minWidth: number;
  sortConfig?: { column: TaskColumnKey | 'title'; direction: SortDirection };
  onSort: (column: TaskColumnKey) => void;
  onResize?: (column: TaskColumnKey, width: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnKey,
  });
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: `${width}px`,
    minWidth: `${minWidth}px`,
  };

  const isActive = sortConfig?.column === columnKey;
  const direction = isActive ? sortConfig.direction : null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, startWidthRef.current + delta);
      onResize?.(columnKey, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-0.5 cursor-pointer select-none text-[10px] font-medium text-muted-foreground hover:text-foreground relative flex-shrink-0"
      onClick={() => onSort(columnKey)}
      {...attributes}
      {...listeners}
    >
      <span className="truncate">{label}</span>
      {direction === 'asc' && <ArrowUp className="h-2.5 w-2.5" />}
      {direction === 'desc' && <ArrowDown className="h-2.5 w-2.5" />}
      {!direction && <ArrowUpDown className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50" />}
      {/* Resize handle - visible bar on hover */}
      {onResize && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize group/resize flex items-center justify-center"
          onMouseDown={handleMouseDown}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Hover indicator - visible vertical bar */}
          <div className={`w-1 h-4 rounded-full transition-all ${isResizing ? 'bg-primary scale-y-125' : 'bg-transparent group-hover/resize:bg-primary/60'}`} />
        </div>
      )}
    </div>
  );
}

// Loading skeleton - exactly 40px
function TaskRowSkeleton() {
  return (
    <div className="h-10 px-2 flex items-center gap-1.5 border-b border-border/50 animate-pulse">
      <div className="w-3 h-3 bg-muted rounded" />
      <div className="w-4 h-4 bg-muted rounded" />
      <div className="flex-1 h-3 bg-muted rounded max-w-xs" />
      <div className="w-20 h-4 bg-muted rounded-full" />
      <div className="w-20 h-4 bg-muted rounded-full" />
      <div className="w-24 h-4 bg-muted rounded-full" />
      <div className="w-20 h-3 bg-muted rounded" />
      <div className="w-6 flex-shrink-0" /> {/* Actions column spacer */}
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
  projects,
  onUpdate,
  columnOrder,
  columnWidths,
  onDelete,
  showActions = false,
}: {
  task: Task;
  onClick: () => void;
  onToggleComplete: (checked: boolean) => void;
  isCompleted: boolean;
  isSelected: boolean;
  statusOptions: any[];
  priorityOptions: any[];
  users: User[];
  projects: Project[];
  onUpdate: (field: string, value: any) => void;
  columnOrder: TaskColumnKey[];
  columnWidths: Record<TaskColumnKey, number>;
  onDelete?: (task: Task) => void;
  showActions?: boolean;
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

      {/* Render columns in order */}
      {columnOrder.map((col) => {
        const colDef = COLUMN_DEFINITIONS[col];
        
        if (col === 'status') {
          return (
            <div key={col} style={{ width: `${columnWidths[col]}px` }} className="flex-shrink-0">
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
                  <SelectTrigger className="h-5 w-full text-xs px-1 py-0" onClick={(e) => e.stopPropagation()}>
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
                  <Badge className={`text-xs px-2 py-0.5 h-5 rounded-full ${statusColor} border-0 no-default-hover-elevate no-default-active-elevate cursor-pointer hover:opacity-80 truncate max-w-full`}>
                    {statusOptions.find(opt => opt.key === task.status)?.name || task.status}
                  </Badge>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/30">—</div>
              )}
            </div>
          );
        }
        
        if (col === 'priority') {
          return (
            <div key={col} style={{ width: `${columnWidths[col]}px` }} className="flex-shrink-0">
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
                  <SelectTrigger className="h-5 w-full text-xs px-1 py-0" onClick={(e) => e.stopPropagation()}>
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
                    {priorityOptions.find(opt => opt.key === task.priority)?.name || task.priority}
                  </Badge>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/30">—</div>
              )}
            </div>
          );
        }
        
        if (col === 'assignee') {
          return (
            <div key={col} style={{ width: `${columnWidths[col]}px` }} className="flex-shrink-0">
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
                            <AvatarFallback className="text-[8px]">
                              {getInitials(user.firstName && user.lastName 
                                ? `${user.firstName} ${user.lastName}` 
                                : user.firstName || user.email || '')}
                            </AvatarFallback>
                          </Avatar>
                          <span>
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName}` 
                              : user.firstName || user.email}
                          </span>
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
                  className="cursor-pointer hover:opacity-80 flex items-center gap-1"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {getInitials(task.assigneeName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs truncate">{task.assigneeName.split(' ')[0]}</span>
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
            </div>
          );
        }
        
        if (col === 'dueDate') {
          return (
            <div key={col} style={{ width: `${columnWidths[col]}px` }} className="flex-shrink-0">
              {editingField === 'dueDate' ? (
                <Input
                  ref={dateInputRef}
                  type="date"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleSave('dueDate')}
                  onKeyDown={(e) => handleKeyDown(e, 'dueDate')}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-full text-xs px-1 py-0"
                  autoFocus
                />
              ) : task.dueDate ? (
                <div
                  onClick={(e) => handleEditClick(e, 'dueDate', task.dueDate)}
                  className="flex items-center gap-0.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                >
                  <CalendarIcon className="h-2.5 w-2.5" />
                  <span className="leading-5">{format(new Date(task.dueDate), 'MMM d')}</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/30">—</div>
              )}
            </div>
          );
        }
        
        if (col === 'project') {
          const project = projects.find(p => p.id === task.projectId);
          return (
            <div key={col} style={{ width: `${columnWidths[col]}px` }} className="flex-shrink-0">
              {project ? (
                <div className="flex items-center gap-1 text-xs truncate">
                  {project.color && (
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: project.color }}
                    />
                  )}
                  <span className="truncate text-muted-foreground">{project.name}</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/30">—</div>
              )}
            </div>
          );
        }
        
        return null;
      })}

      {/* Actions column - fixed width for alignment */}
      <div className="w-6 flex-shrink-0">
        {showActions && onDelete && (
          <div className={`transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task);
                  }}
                  data-testid={`delete-task-${task.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TaskListCompact({
  tasks: propTasks,
  groupedTasks,
  isLoading,
  onTaskClick,
  projectId,
  columnConfig,
  onColumnConfigChange,
  onDelete,
  showActions = false,
  onAddTask,
}: TaskListCompactProps) {
  const { toast } = useToast();
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [taskOrder, setTaskOrder] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  
  // Inline task creation state
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  
  // Internal state for uncontrolled mode
  const [internalColumnOrder, setInternalColumnOrder] = useState<TaskColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [internalSort, setInternalSort] = useState<{ column: TaskColumnKey | 'title'; direction: SortDirection } | undefined>();
  const [internalColumnWidths, setInternalColumnWidths] = useState<Record<TaskColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);
  
  // Use controlled or internal state
  const columnOrder = columnConfig?.order || internalColumnOrder;
  const sortConfig = columnConfig?.sort ?? internalSort;
  const columnWidths = columnConfig?.widths || internalColumnWidths;

  // Handle column resize
  const handleColumnResize = (column: TaskColumnKey, width: number) => {
    if (onColumnConfigChange) {
      onColumnConfigChange({
        ...columnConfig,
        order: columnOrder,
        widths: { ...columnWidths, [column]: width },
      });
    } else {
      setInternalColumnWidths(prev => ({ ...prev, [column]: width }));
    }
  };

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

  // Fetch projects for project column
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const statusCategory = fieldCategories.find((cat) => cat.key === "task.status");
  const priorityCategory = fieldCategories.find((cat) => cat.key === "task.priority");
  const completedOption = statusCategory?.options.find((opt) => opt.isCompleted);
  const defaultOption = statusCategory?.options.find((opt) => opt.isDefault);

  // Helper function to sort tasks based on sortConfig
  const sortTasks = useCallback((tasksToSort: Task[]): Task[] => {
    if (!tasksToSort || tasksToSort.length === 0) return [];
    if (!sortConfig?.column || !sortConfig?.direction) return tasksToSort;
    
    return [...tasksToSort].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      switch (sortConfig.column) {
        case 'title':
          aVal = a.title?.toLowerCase() || '';
          bVal = b.title?.toLowerCase() || '';
          break;
        case 'status':
          aVal = a.status?.toLowerCase() || '';
          bVal = b.status?.toLowerCase() || '';
          break;
        case 'priority':
          const priorityOrder: Record<string, number> = { 'high': 3, 'urgent': 3, 'medium': 2, 'low': 1 };
          aVal = priorityOrder[a.priority?.toLowerCase() || ''] || 0;
          bVal = priorityOrder[b.priority?.toLowerCase() || ''] || 0;
          break;
        case 'assignee':
          aVal = a.assigneeName?.toLowerCase() || 'zzz';
          bVal = b.assigneeName?.toLowerCase() || 'zzz';
          break;
        case 'dueDate':
          aVal = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          bVal = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          break;
        case 'project':
          aVal = a.projectName?.toLowerCase() || 'zzz';
          bVal = b.projectName?.toLowerCase() || 'zzz';
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  // Create sorted and ordered tasks using useMemo
  const orderedTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    
    // Apply sorting if configured - takes precedence over drag-drop order
    if (sortConfig?.column && sortConfig?.direction) {
      return sortTasks(tasks);
    }
    
    // Apply custom order from drag-drop if present and matches (only when no sort is active)
    if (taskOrder.length > 0 && taskOrder.length === tasks.length) {
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      return taskOrder.map(id => taskMap.get(id)).filter(Boolean) as Task[];
    }
    
    return [...tasks];
  }, [tasks, taskOrder, sortConfig, sortTasks]);
  
  // Create sorted grouped tasks
  const sortedGroupedTasks = useMemo(() => {
    if (!groupedTasks) return null;
    
    const result: Record<string, Task[]> = {};
    for (const [groupName, groupTaskList] of Object.entries(groupedTasks)) {
      result[groupName] = sortTasks(groupTaskList);
    }
    return result;
  }, [groupedTasks, sortTasks]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // Require 8px drag before activating
    }),
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
  
  // Column header drag handling
  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id as TaskColumnKey);
      const newIndex = columnOrder.indexOf(over.id as TaskColumnKey);
      const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
      
      // Update controlled or internal state
      if (onColumnConfigChange) {
        onColumnConfigChange({
          ...columnConfig,
          order: newOrder,
          sort: sortConfig,
        });
      } else {
        setInternalColumnOrder(newOrder);
      }
    }
  };
  
  // Click-to-sort handler
  const handleSort = (column: TaskColumnKey) => {
    let newDirection: SortDirection;
    
    if (sortConfig?.column === column) {
      // Cycle through: asc -> desc -> null
      if (sortConfig.direction === 'asc') {
        newDirection = 'desc';
      } else if (sortConfig.direction === 'desc') {
        newDirection = null;
      } else {
        newDirection = 'asc';
      }
    } else {
      newDirection = 'asc';
    }
    
    const newSort = newDirection ? { column, direction: newDirection } : undefined;
    
    // Update controlled or internal state
    if (onColumnConfigChange) {
      onColumnConfigChange({
        ...columnConfig,
        order: columnOrder,
        sort: newSort,
      });
    } else {
      setInternalSort(newSort);
    }
  };

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      return apiRequest(`/api/tasks/${taskId}`, "PATCH", updates);
    },
    onSuccess: () => {
      // Invalidate all task queries including assignee-scoped ones
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/tasks"
      });
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

  // Inline task creation handlers
  const handleStartAddTask = () => {
    setIsAddingTask(true);
    setNewTaskTitle("");
    setTimeout(() => newTaskInputRef.current?.focus(), 0);
  };

  const handleSubmitNewTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) {
      setIsAddingTask(false);
      setNewTaskTitle("");
      return;
    }
    
    try {
      if (onAddTask) {
        await onAddTask(title);
      }
      setNewTaskTitle("");
      setIsAddingTask(false);
    } catch (error) {
      // Keep input open on error so user can retry
      toast({
        title: "Failed to create task",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelAddTask = () => {
    setIsAddingTask(false);
    setNewTaskTitle("");
  };

  const handleNewTaskKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmitNewTask();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelAddTask();
    }
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

  // Header row component
  const HeaderRow = () => (
    <div className="h-7 px-2 flex items-center gap-1.5 border-b border-border bg-muted/30 sticky top-0 z-10">
      <div className="w-3" /> {/* Drag handle spacer */}
      <div className="w-4" /> {/* Checkbox spacer */}
      <div className="flex-1 text-[10px] font-medium text-muted-foreground">Title</div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
          {columnOrder.map((col) => {
            const colDef = COLUMN_DEFINITIONS[col];
            return (
              <SortableHeaderColumn
                key={col}
                columnKey={col}
                label={colDef.label}
                width={columnWidths[col]}
                minWidth={colDef.minWidth}
                sortConfig={sortConfig}
                onSort={handleSort}
                onResize={handleColumnResize}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      <div className="w-6 flex-shrink-0" /> {/* Actions column spacer */}
    </div>
  );

  // Grouped view
  if (sortedGroupedTasks) {
    return (
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <HeaderRow />
        {Object.entries(sortedGroupedTasks).map(([groupName, groupTasks]) => (
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
                    projects={projects}
                    onUpdate={(field, value) => handleUpdate(task.id, field, value)}
                    columnOrder={columnOrder}
                    columnWidths={columnWidths}
                    onDelete={onDelete}
                    showActions={showActions}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        ))}
        {onAddTask && (
          isAddingTask ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-border/50">
              <div className="w-3" />
              <div className="w-4 h-4 flex items-center justify-center">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <Input
                ref={newTaskInputRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={handleNewTaskKeyDown}
                onBlur={handleSubmitNewTask}
                placeholder="Task name..."
                className="h-6 text-xs border-0 p-0 focus-visible:ring-0 bg-transparent"
                data-testid="input-new-task-title"
              />
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartAddTask}
              className="w-full justify-start gap-1.5 text-muted-foreground"
              data-testid="button-add-task-row"
            >
              <div className="w-3" />
              <Plus className="h-3.5 w-3.5" />
              <span className="text-xs">Add Task</span>
            </Button>
          )
        )}
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
      <HeaderRow />
      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
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
                projects={projects}
                onUpdate={(field, value) => handleUpdate(task.id, field, value)}
                columnOrder={columnOrder}
                columnWidths={columnWidths}
                onDelete={onDelete}
                showActions={showActions}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {onAddTask && (
        isAddingTask ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-border/50">
            <div className="w-3" />
            <div className="w-4 h-4 flex items-center justify-center">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <Input
              ref={newTaskInputRef}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={handleNewTaskKeyDown}
              onBlur={handleSubmitNewTask}
              placeholder="Task name..."
              className="h-6 text-xs border-0 p-0 focus-visible:ring-0 bg-transparent"
              data-testid="input-new-task-title"
            />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartAddTask}
            className="w-full justify-start gap-1.5 text-muted-foreground"
            data-testid="button-add-task-row"
          >
            <div className="w-3" />
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">Add Task</span>
          </Button>
        )
      )}
      <div className="h-6 px-2 flex items-center justify-between bg-muted/20 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground">{orderedTasks.length} tasks</span>
        <span className="text-[10px] text-muted-foreground/70">↑↓ Navigate • Enter Open • Space Toggle</span>
      </div>
    </div>
  );
}

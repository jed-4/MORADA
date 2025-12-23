import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, Flag, Pencil, DollarSign, GripVertical, MoreHorizontal, Trash2, FolderKanban } from "lucide-react";
import { Task, type FieldCategoryWithOptions } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface TaskCardCompactProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
  displaySettings?: {
    showStatus?: boolean;
    showAssignee?: boolean;
    showDueDate?: boolean;
    showPriority?: boolean;
    showProject?: boolean;
  };
  onDelete?: (task: Task) => void;
  showActions?: boolean;
}

// Status colors matching Asana 2025
const getStatusColor = (status: string | null, isCompleted: boolean): string => {
  if (isCompleted) return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20';
  
  const s = status?.toLowerCase() || '';
  if (s.includes('progress') || s.includes('active')) return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20';
  return 'bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/20';
};

// Priority colors
const getPriorityColor = (priority: string | null): string | null => {
  const p = priority?.toLowerCase() || '';
  if (p === 'high' || p === 'urgent') return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20';
  if (p === 'medium') return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
  if (p === 'low') return 'bg-gray-500/15 text-gray-600 dark:text-gray-500 border-gray-500/20';
  return null;
};

const getInitials = (name: string | null | undefined): string => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

export default function TaskCardCompact({ task, onClick, isDragging = false, displaySettings, onDelete, showActions = false }: TaskCardCompactProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { toast } = useToast();

  // Fetch field categories to get completed status option
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);
  const statusOption = statusCategory?.options.find(opt => opt.key === task.status);

  const isCompleted = task.status === completedOption?.key;

  // Mutation to update task status
  const updateTaskStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleToggleComplete = (checked: boolean | string) => {
    if (!completedOption) {
      toast({
        title: "No completed status configured",
        description: "Please configure a completed status in field settings",
        variant: "destructive",
      });
      return;
    }

    const newStatus = checked ? completedOption.key : (defaultOption?.key || "todo");
    updateTaskStatusMutation.mutate(newStatus);
  };

  const statusColor = getStatusColor(task.status, isCompleted);
  const priorityColor = getPriorityColor(task.priority);
  const hasCostOrUnits = task.estimatedCost || task.estimatedUnits;

  return (
    <Card
      className={`h-[90px] transition-all duration-200 cursor-pointer rounded-xl border-border/50 ${
        isHovered ? 'shadow-lg scale-[1.02]' : 'shadow-sm'
      } ${isDragging ? 'opacity-80 shadow-xl' : ''} group`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`task-card-${task.id}`}
    >
      <CardContent className="p-2 h-full flex flex-col justify-between relative">
        {/* Drag handle - appears on hover */}
        {isHovered && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}

        <div className="flex items-start gap-1.5">
          {/* Checkbox */}
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={isCompleted}
              onCheckedChange={handleToggleComplete}
              className="h-3.5 w-3.5 mt-0.5"
              data-testid={`checkbox-${task.id}`}
            />
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1">
              <h3 className={`text-sm leading-5 truncate flex-1 ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>
                {task.title}
              </h3>
            </div>

            {/* Construction fields - small line below title */}
            {hasCostOrUnits && (
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                {task.estimatedCost && (
                  <span className="flex items-center gap-0.5">
                    <DollarSign className="h-2.5 w-2.5" />
                    {task.estimatedCost}
                  </span>
                )}
                {task.estimatedUnits && (
                  <span>{task.estimatedUnits} units</span>
                )}
              </div>
            )}
          </div>

          {/* Priority tag - top right */}
          {priorityColor && (displaySettings?.showPriority !== false) && (
            <Badge className={`text-[10px] px-1 py-0 h-4 rounded-full ${priorityColor} border gap-0.5 no-default-hover-elevate no-default-active-elevate shrink-0`}>
              <Flag className="h-2 w-2" />
            </Badge>
          )}

          {/* Actions menu on hover */}
          {showActions && isHovered ? (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onClick?.()}
                    data-testid={`edit-task-${task.id}`}
                  >
                    <Pencil className="h-3 w-3 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  {onDelete && (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onDelete(task)}
                      data-testid={`delete-task-${task.id}`}
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : isHovered ? (
            <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : null}
        </div>

        {/* Bottom row: Status, Due date & Assignee */}
        <div className="flex items-center justify-between mt-1 gap-1">
          <div className="flex items-center gap-1">
            {/* Status chip - bottom left */}
            {statusOption && (displaySettings?.showStatus !== false) && (
              <Badge className={`text-[10px] px-1.5 py-0 h-4 rounded-full ${statusColor} border no-default-hover-elevate no-default-active-elevate shrink-0`}>
                {isCompleted ? '✓' : statusOption.name}
              </Badge>
            )}
            
            {/* Due date chip */}
            {task.dueDate && (displaySettings?.showDueDate !== false) && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-background border-border/50 no-default-hover-elevate no-default-active-elevate">
                <Calendar className="h-2 w-2 mr-0.5" />
                {format(new Date(task.dueDate), 'MMM d')}
              </Badge>
            )}

            {/* Project chip */}
            {(task as any).projectName && (displaySettings?.showProject !== false) && (
              <Badge 
                variant="outline" 
                className="text-[10px] px-1.5 py-0 h-4 rounded-full bg-background border-border/50 no-default-hover-elevate no-default-active-elevate max-w-[80px] truncate"
                style={(task as any).projectColor ? { borderColor: (task as any).projectColor, color: (task as any).projectColor } : undefined}
              >
                <FolderKanban className="h-2 w-2 mr-0.5 shrink-0" />
                <span className="truncate">{(task as any).projectName}</span>
              </Badge>
            )}
          </div>

          {/* Assignee avatar */}
          {(displaySettings?.showAssignee !== false) && (
            task.assigneeName ? (
              <Avatar className="h-5 w-5 border border-border/50">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {getInitials(task.assigneeName)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="w-5 h-5 rounded-full border border-dashed border-muted-foreground/20" />
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, MessageSquare, MoreVertical, Pencil, Trash2 } from "lucide-react";
import SubtaskList from "@/components/SubtaskList";
import { Task, type FieldCategoryWithOptions } from "@shared/schema";
import { useTaskLabelOptions } from "@/hooks/useTaskLabelOptions";
import { useDeleteSubtask, useSubtasks } from "@/hooks/useSubtasks";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface CardDisplaySettings {
  showPriority?: boolean;
  showStatus?: boolean;
  showDescription?: boolean;
  showTags?: boolean;
  showLabels?: boolean;
  showAssignee?: boolean;
  showDueDate?: boolean;
  showSubtasks?: boolean;
}

interface TaskCardProps {
  task: Task;
  showSubtasks?: boolean; // Option to hide subtasks in certain contexts
  onClick?: () => void; // Optional click handler
  onEdit?: (task: Task) => void; // Optional edit handler
  displaySettings?: CardDisplaySettings;
}

export default function TaskCard({
  task,
  showSubtasks = true,
  onClick,
  onEdit,
  displaySettings = {},
}: TaskCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const deleteTaskMutation = useDeleteSubtask(user?.id);
  
  // Fetch field categories to get completed status option
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  // Find the task status category and its completed option
  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);
  
  // Check if task is currently completed
  const isCompleted = task.status === completedOption?.key;
  
  // Fetch subtasks to check if any exist (only for parent tasks)
  const { data: subtasks = [] } = useSubtasks(task.parentTaskId ? undefined : task.id);
  
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
        title: "Failed to update task status",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Merge default settings with provided settings
  const settings = {
    showPriority: true,
    showStatus: true,
    showDescription: true,
    showTags: true,
    showLabels: true,
    showAssignee: true,
    showDueDate: true,
    showSubtasks: true,
    ...displaySettings
  };
  
  // Get status option info for display
  const statusOption = statusCategory?.options.find(opt => opt.key === task.status);
  const statusLabel = statusOption?.name || task.status;
  const {
    title,
    content: description,
    assigneeName,
    dueDate,
    priority = "medium",
    tags = [],
    labels = [],
  } = task;
  
  // Type-safe tag and label handling
  const taskTags = Array.isArray(tags) ? tags as string[] : [];
  const taskLabels = Array.isArray(labels) ? labels as string[] : [];
  
  // Create assignee object if assigneeName exists
  const assignee = assigneeName ? {
    name: assigneeName,
    avatar: undefined,
    initials: assigneeName.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
  } : undefined;
  
  const comments = 0; // TODO: Implement comments system
  const priorityColors = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const { getLabelInfo } = useTaskLabelOptions();

  const handleDelete = async () => {
    try {
      await deleteTaskMutation.mutateAsync({ 
        taskId: task.id, 
        parentTaskId: task.parentTaskId || undefined,
        task: task
      });
      toast({ title: "Task deleted successfully" });
      setShowDeleteDialog(false);
    } catch (error) {
      toast({
        title: "Failed to delete task",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(task);
    } else if (onClick) {
      onClick();
    }
  };
  
  const handleToggleComplete = (checked: boolean | string) => {
    if (!completedOption) {
      toast({
        title: "No completed status configured",
        description: "Please configure a completed status in field settings",
        variant: "destructive",
      });
      return;
    }
    
    // Set status based on checked state
    const newStatus = checked
      ? completedOption.key
      : (defaultOption?.key || "todo");
    
    updateTaskStatusMutation.mutate(newStatus);
  };

  return (
    <>
    <Card 
      className="hover-elevate cursor-pointer group" 
      onClick={onClick}
      data-testid={`task-${task.id}`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <Checkbox
                checked={isCompleted}
                onCheckedChange={handleToggleComplete}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5"
                data-testid={`checkbox-complete-${task.id}`}
              />
              <h3 className={cn(
                "font-medium text-sm flex-1",
                isCompleted && "line-through text-muted-foreground"
              )}>{title}</h3>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-task-menu-${task.id}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={handleEdit} data-testid={`menu-edit-task-${task.id}`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  className="text-destructive"
                  data-testid={`menu-delete-task-${task.id}`}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {settings.showDescription && description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}

          {settings.showTags && taskTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {taskTags.map((tag: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {settings.showLabels && taskLabels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {taskLabels.map((labelKey: string, index: number) => {
                const labelInfo = getLabelInfo(labelKey);
                return (
                  <Badge 
                    key={index} 
                    variant="secondary" 
                    className="text-xs"
                    style={{
                      backgroundColor: labelInfo.color || undefined,
                      color: "#ffffff",
                      borderColor: labelInfo.color || undefined
                    }}
                  >
                    {labelInfo.name}
                  </Badge>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {settings.showAssignee && assignee && (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={assignee.avatar} alt={assignee.name} />
                  <AvatarFallback className="text-xs">{assignee.initials}</AvatarFallback>
                </Avatar>
              )}
              
              {settings.showDueDate && dueDate && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {new Date(dueDate).toLocaleDateString()}
                </div>
              )}
              
              {settings.showPriority && (
                <Badge className={`text-xs ${priorityColors[priority as keyof typeof priorityColors] || priorityColors.medium}`}>
                  {priority}
                </Badge>
              )}
              
              {settings.showStatus && (
                <Badge variant="outline" className="text-xs">
                  {statusLabel}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {comments > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {comments}
                </div>
              )}
            </div>
          </div>
          
          {/* Subtasks Section - only show when subtasks exist */}
          {settings.showSubtasks && showSubtasks && !task.parentTaskId && subtasks.length > 0 && (
            <SubtaskList parentTask={task} compact={true} />
          )}
        </div>
      </CardContent>
    </Card>
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{title}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
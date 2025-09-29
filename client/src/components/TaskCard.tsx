import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, MessageSquare, MoreVertical, Pencil, Trash2 } from "lucide-react";
import SubtaskList from "@/components/SubtaskList";
import { Task } from "@shared/schema";
import { useTaskLabelOptions } from "@/hooks/useTaskLabelOptions";
import { useDeleteSubtask } from "@/hooks/useSubtasks";
import { useToast } from "@/hooks/use-toast";
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

interface CardDisplaySettings {
  showPriority?: boolean;
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
  const deleteTaskMutation = useDeleteSubtask();

  // Merge default settings with provided settings
  const settings = {
    showPriority: true,
    showDescription: true,
    showTags: true,
    showLabels: true,
    showAssignee: true,
    showDueDate: true,
    showSubtasks: true,
    ...displaySettings
  };
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
        parentTaskId: task.parentTaskId || undefined 
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
            <h3 className="font-medium text-sm flex-1">{title}</h3>
            <div className="flex items-center gap-1">
              {settings.showPriority && (
                <Badge className={`text-xs ${priorityColors[priority as keyof typeof priorityColors] || priorityColors.medium}`}>
                  {priority}
                </Badge>
              )}
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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
          
          {/* Subtasks Section */}
          {settings.showSubtasks && showSubtasks && !task.parentTaskId && (
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
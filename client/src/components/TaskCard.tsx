import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar, MessageSquare } from "lucide-react";
import SubtaskList from "@/components/SubtaskList";
import { Task } from "@shared/schema";
import { useTaskStatusOptions } from "@/hooks/useTaskStatusOptions";

interface TaskCardProps {
  task: Task;
  showSubtasks?: boolean; // Option to hide subtasks in certain contexts
  onClick?: () => void; // Optional click handler
}

export default function TaskCard({
  task,
  showSubtasks = true,
  onClick,
}: TaskCardProps) {
  const {
    title,
    content: description,
    assigneeName,
    dueDate,
    priority = "medium",
    status = "todo",
    tags = [],
  } = task;
  
  // Type-safe tag handling
  const taskTags = Array.isArray(tags) ? tags as string[] : [];
  
  // Create assignee object if assigneeName exists
  const assignee = assigneeName ? {
    name: assigneeName,
    avatar: undefined,
    initials: assigneeName.split(' ').map(n => n[0]).join('').toUpperCase(),
  } : undefined;
  
  const comments = 0; // TODO: Implement comments system
  const priorityColors = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const { getStatusInfo } = useTaskStatusOptions();
  const statusInfo = getStatusInfo(task.status || "todo");

  return (
    <Card 
      className="hover-elevate cursor-pointer" 
      onClick={onClick}
      data-testid={`task-${task.id}`}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <h3 className="font-medium text-sm">{title}</h3>
            <Badge className={`text-xs ${priorityColors[priority as keyof typeof priorityColors] || priorityColors.medium}`}>
              {priority}
            </Badge>
          </div>

          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}

          {taskTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {taskTags.map((tag: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {assignee && (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={assignee.avatar} alt={assignee.name} />
                  <AvatarFallback className="text-xs">{assignee.initials}</AvatarFallback>
                </Avatar>
              )}
              
              {dueDate && (
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
              
              <div className="flex items-center gap-1">
                {statusInfo.color && (
                  <div 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: statusInfo.color }}
                  />
                )}
                <Badge variant="secondary" className="text-xs">
                  {statusInfo.name}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Subtasks Section */}
          {showSubtasks && !task.parentTaskId && (
            <SubtaskList parentTask={task} compact={true} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
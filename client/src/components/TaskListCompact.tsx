import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { type Task, type FieldCategoryWithOptions } from "@shared/schema";
import { GripVertical, Calendar as CalendarIcon, Flag } from "lucide-react";
import { format } from "date-fns";
import { FixedSizeList as List } from "react-window";

interface TaskListCompactProps {
  tasks?: Task[];
  groupedTasks?: Record<string, Task[]>;
  isLoading?: boolean;
  onTaskClick?: (task: Task) => void;
  projectId?: string;
}

// Status colors matching Asana
const getStatusColor = (status: string | null): { bg: string; text: string; border: string } => {
  const s = status?.toLowerCase() || '';
  if (s.includes('done') || s.includes('complete')) {
    return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-800' };
  }
  if (s.includes('progress') || s.includes('active')) {
    return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' };
  }
  if (s.includes('capture') || s.includes('pending')) {
    return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-200 dark:border-yellow-800' };
  }
  return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-200 dark:border-gray-700' };
};

// Priority colors
const getPriorityColor = (priority: string | null): { bg: string; text: string } | null => {
  const p = priority?.toLowerCase() || '';
  if (p === 'high' || p === 'urgent') {
    return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' };
  }
  if (p === 'medium') {
    return { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' };
  }
  if (p === 'low') {
    return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' };
  }
  return null;
};

// Get initials for avatar
const getInitials = (name: string | null | undefined): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Loading skeleton component
function TaskRowSkeleton() {
  return (
    <div className="h-10 px-4 flex items-center gap-2 border-b border-border animate-pulse">
      <div className="w-4 h-4 bg-muted rounded" />
      <div className="w-6 h-6 bg-muted rounded" />
      <div className="flex-1 h-4 bg-muted rounded max-w-md" />
      <div className="w-16 h-5 bg-muted rounded-full" />
      <div className="w-12 h-5 bg-muted rounded-full" />
      <div className="w-8 h-8 bg-muted rounded-full" />
      <div className="w-20 h-4 bg-muted rounded" />
    </div>
  );
}

// Single task row component
function TaskRow({ 
  task, 
  onClick, 
  onToggleComplete,
  isCompleted 
}: { 
  task: Task; 
  onClick: () => void;
  onToggleComplete: (checked: boolean) => void;
  isCompleted: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const statusColors = getStatusColor(task.status);
  const priorityColors = getPriorityColor(task.priority);

  return (
    <div
      className="h-10 px-4 flex items-center gap-2 border-b border-border cursor-pointer transition-all duration-150 hover:shadow-md hover:scale-[1.01] hover:bg-muted/30 relative"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`task-row-${task.id}`}
    >
      {/* Drag handle - shows on hover */}
      <div className={`transition-opacity duration-150 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
      </div>
      
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isCompleted}
          onCheckedChange={onToggleComplete}
          className="h-4 w-4"
          data-testid={`checkbox-${task.id}`}
        />
      </div>
      
      {/* Title */}
      <div className={`flex-1 text-sm truncate ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
        {task.title}
      </div>
      
      {/* Status Chip */}
      {task.status && (
        <Badge 
          variant="outline" 
          className={`text-xs px-2 h-5 ${statusColors.bg} ${statusColors.text} ${statusColors.border} border no-default-hover-elevate no-default-active-elevate`}
        >
          {task.status}
        </Badge>
      )}
      
      {/* Priority Tag */}
      {priorityColors && (
        <Badge 
          variant="outline"
          className={`text-xs px-1.5 h-5 ${priorityColors.bg} ${priorityColors.text} border-0 gap-1 no-default-hover-elevate no-default-active-elevate`}
        >
          <Flag className="h-2.5 w-2.5" />
          {task.priority}
        </Badge>
      )}
      
      {/* Assignee Avatar */}
      {task.assigneeName ? (
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {getInitials(task.assigneeName)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="w-6 h-6 rounded-full border-2 border-dashed border-muted-foreground/30" />
      )}
      
      {/* Due Date */}
      {task.dueDate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarIcon className="h-3 w-3" />
          <span>{format(new Date(task.dueDate), 'MMM d')}</span>
        </div>
      )}
    </div>
  );
}

export default function TaskListCompact({ 
  tasks: propTasks, 
  groupedTasks, 
  isLoading, 
  onTaskClick, 
  projectId 
}: TaskListCompactProps) {
  const { toast } = useToast();

  // Fetch tasks if not provided
  const { data: fetchedTasks = [], isLoading: fetchIsLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", projectId],
    enabled: !propTasks,
  });

  const tasks = propTasks || fetchedTasks;
  const loading = isLoading !== undefined ? isLoading : fetchIsLoading;

  // Fetch field categories to get completed status option
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  // Update task status mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      const response = await apiRequest(`/api/tasks/${taskId}/status`, "PATCH", { status: newStatus });
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

    const newStatus = checked
      ? completedOption.key
      : (defaultOption?.key || "todo");

    updateTaskMutation.mutate({ taskId: task.id, newStatus });
  };

  const handleTaskClick = (task: Task) => {
    if (onTaskClick) {
      onTaskClick(task);
    }
  };

  // Check if task is completed
  const isTaskCompleted = (task: Task): boolean => {
    if (!completedOption) return false;
    return task.status === completedOption.key;
  };

  // Loading state
  if (loading) {
    return (
      <div className="border border-border rounded-md bg-background">
        {Array.from({ length: 15 }).map((_, i) => (
          <TaskRowSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state
  if (!tasks || tasks.length === 0) {
    return (
      <div className="border border-border rounded-md bg-background p-12 text-center">
        <p className="text-muted-foreground">No tasks found</p>
      </div>
    );
  }

  // Render grouped or flat list
  if (groupedTasks) {
    return (
      <div className="border border-border rounded-md bg-background overflow-hidden">
        {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
          <div key={groupName}>
            <div className="h-8 px-4 flex items-center bg-muted/50 border-b border-border">
              <span className="text-sm font-medium text-muted-foreground">{groupName}</span>
              <span className="ml-2 text-xs text-muted-foreground">({groupTasks.length})</span>
            </div>
            {groupTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={() => handleTaskClick(task)}
                onToggleComplete={(checked) => handleToggleComplete(task, checked)}
                isCompleted={isTaskCompleted(task)}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Virtualized list for large datasets (>50 tasks)
  if (tasks.length > 50) {
    const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const task = tasks[index];
      return (
        <div style={style}>
          <TaskRow
            task={task}
            onClick={() => handleTaskClick(task)}
            onToggleComplete={(checked) => handleToggleComplete(task, checked)}
            isCompleted={isTaskCompleted(task)}
          />
        </div>
      );
    };

    return (
      <div className="border border-border rounded-md bg-background overflow-hidden">
        <List
          height={Math.min(800, window.innerHeight - 300)}
          itemCount={tasks.length}
          itemSize={40}
          width="100%"
        >
          {Row}
        </List>
      </div>
    );
  }

  // Regular list for smaller datasets
  return (
    <div className="border border-border rounded-md bg-background overflow-hidden">
      {tasks.map(task => (
        <TaskRow
          key={task.id}
          task={task}
          onClick={() => handleTaskClick(task)}
          onToggleComplete={(checked) => handleToggleComplete(task, checked)}
          isCompleted={isTaskCompleted(task)}
        />
      ))}
    </div>
  );
}

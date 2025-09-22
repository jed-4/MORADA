import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { type Task } from "@shared/schema";
import { Plus } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useLocation } from "wouter";
import { useProject } from "@/contexts/ProjectContext";

export default function TasksWidget({ widget }: WidgetProps) {
  const maxTasks = widget.config?.maxTasks || 3;
  const showCompleted = widget.config?.showCompleted || false;
  const [, setLocation] = useLocation();
  const { currentProject } = useProject();
  
  // Fetch real tasks from the API filtered by current project
  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/tasks?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });

  // Filter and limit tasks based on widget configuration
  const filteredTasks = allTasks
    .filter(task => showCompleted || task.status !== 'done')
    .slice(0, maxTasks);
  
  const formatDueDate = (dueDate: Date | string | null) => {
    if (!dueDate) return "No due date";
    const date = new Date(dueDate);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const getAssigneeInitials = (name: string | null) => {
    if (!name) return "UN";
    return name
      .split(" ")
      .map(word => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const priorityColors = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Loading tasks...
          </div>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setLocation("/tasks")}
            data-testid="tasks-widget-add"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center justify-between p-2 rounded border">
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-muted rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
                <div className="h-6 w-6 bg-muted rounded-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTasks.length} active task{filteredTasks.length !== 1 ? 's' : ''}
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => setLocation("/tasks")}
          data-testid="tasks-widget-add"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      
      <div className="space-y-2">
        {filteredTasks.map((task) => (
          <div 
            key={task.id} 
            className="flex items-center justify-between p-2 rounded border hover-elevate cursor-pointer"
            data-testid={`task-widget-item-${task.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{task.title}</span>
                <Badge className={`text-xs ${priorityColors[task.priority as "low" | "medium" | "high"]}`}>
                  {task.priority}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">{formatDueDate(task.dueDate)}</div>
            </div>
            
            {task.assigneeName && (
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">{getAssigneeInitials(task.assigneeName)}</AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}
      </div>
      
      {filteredTasks.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          {showCompleted ? "No tasks found" : "No active tasks"}
        </div>
      )}
    </div>
  );
}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus } from "lucide-react";
import { WidgetProps } from "@/types/widgets";

// todo: remove mock functionality
const mockTasks = [
  {
    id: "1",
    title: "Foundation Inspection",
    assignee: { name: "Mike Johnson", initials: "MJ" },
    dueDate: "Today",
    priority: "high" as const,
    status: "todo" as const,
  },
  {
    id: "2", 
    title: "Electrical Rough-in",
    assignee: { name: "Sarah Williams", initials: "SW" },
    dueDate: "Mar 15",
    priority: "medium" as const,
    status: "in-progress" as const,
  },
  {
    id: "3",
    title: "Order Materials",
    assignee: { name: "Tom Brown", initials: "TB" },
    dueDate: "Mar 12",
    priority: "medium" as const,
    status: "todo" as const,
  },
  {
    id: "4",
    title: "Site Preparation",
    assignee: { name: "Mike Johnson", initials: "MJ" },
    dueDate: "Mar 1",
    priority: "low" as const,
    status: "done" as const,
  },
];

export default function TasksWidget({ widget }: WidgetProps) {
  const maxTasks = widget.config?.maxTasks || 3;
  const showCompleted = widget.config?.showCompleted || false;
  
  const filteredTasks = mockTasks
    .filter(task => showCompleted || task.status !== 'done')
    .slice(0, maxTasks);

  const priorityColors = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredTasks.length} active task{filteredTasks.length !== 1 ? 's' : ''}
        </div>
        <Button size="sm" variant="ghost" data-testid="tasks-widget-add">
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
                <Badge className={`text-xs ${priorityColors[task.priority]}`}>
                  {task.priority}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">{task.dueDate}</div>
            </div>
            
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">{task.assignee.initials}</AvatarFallback>
            </Avatar>
          </div>
        ))}
      </div>
      
      {filteredTasks.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No active tasks
        </div>
      )}
    </div>
  );
}
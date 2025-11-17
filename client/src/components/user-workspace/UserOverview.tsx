import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Calendar, Clock, AlertCircle, TrendingUp } from "lucide-react";
import type { User, Task } from "@shared/schema";

interface UserOverviewProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserOverview({ user, isOwnPage }: UserOverviewProps) {
  // Fetch user's tasks
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: user.id }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?assigneeId=${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });

  // Calculate stats
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'complete');
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const dueDate = new Date(t.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today && t.status !== 'done' && t.status !== 'complete';
  });
  const dueTodayTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const dueDate = new Date(t.dueDate);
    const today = new Date();
    return dueDate.toDateString() === today.toDateString() && t.status !== 'done' && t.status !== 'complete';
  });
  const dueTomorrowTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const dueDate = new Date(t.dueDate);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dueDate.toDateString() === tomorrow.toDateString() && t.status !== 'done' && t.status !== 'complete';
  });

  // Get unique projects
  const projectIds = new Set(tasks.filter(t => t.projectId).map(t => t.projectId));

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const getAISummary = () => {
    const parts: string[] = [];
    
    if (isOwnPage) {
      parts.push(`${getGreeting()}, ${user.firstName || 'there'}`);
    }

    if (dueTodayTasks.length > 0) {
      parts.push(`you have ${dueTodayTasks.length} task${dueTodayTasks.length === 1 ? '' : 's'} due today`);
    } else if (dueTomorrowTasks.length > 0) {
      parts.push(`you have ${dueTomorrowTasks.length} task${dueTomorrowTasks.length === 1 ? '' : 's'} due tomorrow`);
    } else if (activeTasks.length > 0) {
      parts.push(`you have ${activeTasks.length} active task${activeTasks.length === 1 ? '' : 's'}`);
    } else {
      parts.push("you're all caught up!");
    }

    if (overdueTasks.length > 0) {
      parts.push(`${overdueTasks.length} overdue`);
    }

    return parts.join(", ");
  };

  return (
    <div className="p-4 space-y-4" data-testid="user-overview">
      {/* AI Summary Card */}
      <Card className="bg-gradient-to-br from-[#bba7db]/10 to-transparent border-[#bba7db]/20">
        <CardContent className="p-4">
          <p className="text-sm" data-testid="text-ai-summary">
            {getAISummary()}
          </p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active Tasks
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-tasks">
              {activeTasks.length}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Due Today
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600" data-testid="stat-due-today">
              {dueTodayTasks.length}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Overdue
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="stat-overdue">
              {overdueTasks.length}
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Projects
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-projects">
              {projectIds.size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions / Upcoming */}
      {dueTodayTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Due Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dueTodayTasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                data-testid={`task-due-today-${task.id}`}
              >
                <CheckSquare className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm flex-1">{task.title}</span>
                {task.priority && (
                  <Badge variant="outline" className="text-xs">
                    {task.priority}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {overdueTasks.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm text-red-600">Overdue Tasks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueTasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                data-testid={`task-overdue-${task.id}`}
              >
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-sm flex-1">{task.title}</span>
                {task.dueDate && (
                  <span className="text-xs text-red-600">
                    {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

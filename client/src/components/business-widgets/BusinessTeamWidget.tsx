import { useQuery } from "@tanstack/react-query";
import type { WidgetProps } from "@/types/widgets";
import type { User, Task, Timesheet, UserRole } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function BusinessTeamWidget({ widget }: WidgetProps) {
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: timesheets = [] } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const { data: roles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/user-roles"],
  });

  const activeUsers = users.filter(u => u.status !== "inactive");

  const getUserWorkload = (userId: string) => {
    const userTasks = tasks.filter(t => t.assigneeId === userId && t.status !== "done");
    const activeTasks = userTasks.length;
    const overdueTasks = userTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;
    return { activeTasks, overdueTasks };
  };

  const getUserHours = (userId: string) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    return timesheets
      .filter(t => 
        t.userId === userId && 
        new Date(t.date) >= weekStart &&
        t.status === "approved"
      )
      .reduce((sum, t) => sum + (Number(t.hours) || 0), 0);
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  };

  const getRoleName = (roleId: string | null) => {
    if (!roleId) return null;
    const role = roles.find(r => r.id === roleId);
    return role?.name || null;
  };

  if (activeUsers.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm" data-testid="business-team-widget">
        No team members found
      </div>
    );
  }

  return (
    <ScrollArea className="h-[280px]" data-testid="business-team-widget">
      <div className="space-y-3 pr-4">
        {activeUsers.slice(0, 8).map((user) => {
          const workload = getUserWorkload(user.id);
          const weeklyHours = getUserHours(user.id);
          const workloadPercent = Math.min(100, (workload.activeTasks / 10) * 100);
          
          return (
            <div key={user.id} className="flex items-center gap-3 p-2 rounded-md hover-elevate">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.profilePicture || undefined} />
                <AvatarFallback className="text-xs">
                  {getInitials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {user.firstName} {user.lastName}
                  </span>
                  {getRoleName(user.roleId) && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {getRoleName(user.roleId)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{workload.activeTasks} tasks</span>
                    {workload.overdueTasks > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0">
                        {workload.overdueTasks} overdue
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{weeklyHours.toFixed(1)}h this week</span>
                </div>
                <Progress value={workloadPercent} className="h-1 mt-1.5" />
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

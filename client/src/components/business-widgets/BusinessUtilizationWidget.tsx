import { useQuery } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, format, subWeeks } from "date-fns";
import type { WidgetProps } from "@/types/widgets";
import type { User, Timesheet, Task } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const TARGET_HOURS_PER_WEEK = 40;

export default function BusinessUtilizationWidget({ widget }: WidgetProps) {
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: timesheets = [] } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  
  const activeUsers = users.filter(u => u.status !== "inactive");

  const getUserUtilization = (userId: string) => {
    const userTimesheets = timesheets.filter(t => 
      t.userId === userId &&
      new Date(t.date) >= weekStart &&
      new Date(t.date) <= weekEnd &&
      t.status === "approved"
    );
    
    const hoursLogged = userTimesheets.reduce((sum, t) => sum + (Number(t.hours) || 0), 0);
    const utilizationPercent = (hoursLogged / TARGET_HOURS_PER_WEEK) * 100;
    
    const userTasks = tasks.filter(t => 
      t.assigneeId === userId && t.status !== "done"
    );
    
    return {
      hoursLogged,
      utilizationPercent,
      activeTasks: userTasks.length,
      status: utilizationPercent >= 80 ? "optimal" : 
              utilizationPercent >= 50 ? "moderate" : "low",
    };
  };

  const usersWithUtilization = activeUsers.map(user => ({
    ...user,
    utilization: getUserUtilization(user.id),
  })).sort((a, b) => b.utilization.utilizationPercent - a.utilization.utilizationPercent);

  const avgUtilization = usersWithUtilization.length > 0
    ? usersWithUtilization.reduce((sum, u) => sum + u.utilization.utilizationPercent, 0) / usersWithUtilization.length
    : 0;

  const totalHours = usersWithUtilization.reduce((sum, u) => sum + u.utilization.hoursLogged, 0);
  const totalCapacity = activeUsers.length * TARGET_HOURS_PER_WEEK;

  const getInitials = (firstName: string | null, lastName: string | null) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "optimal": return "text-green-600 bg-green-500/10";
      case "moderate": return "text-yellow-600 bg-yellow-500/10";
      default: return "text-red-600 bg-red-500/10";
    }
  };

  if (activeUsers.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm" data-testid="widget-utilization-empty">
        No team members found
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="widget-team-utilization">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-md bg-muted/50">
          <p className="text-lg font-bold">{avgUtilization.toFixed(0)}%</p>
          <p className="text-[10px] text-muted-foreground">Avg Utilization</p>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <p className="text-lg font-bold">{totalHours.toFixed(0)}h</p>
          <p className="text-[10px] text-muted-foreground">Logged</p>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <p className="text-lg font-bold">{totalCapacity}h</p>
          <p className="text-[10px] text-muted-foreground">Capacity</p>
        </div>
      </div>

      <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-muted">
        <div 
          className="h-full bg-green-500 transition-all"
          style={{ width: `${Math.min(100, (totalHours / totalCapacity) * 100)}%` }}
        />
      </div>
      <p className="text-center text-[10px] text-muted-foreground">
        Week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d")}
      </p>

      <ScrollArea className="h-[180px]">
        <div className="space-y-2 pr-4">
          {usersWithUtilization.map((user) => {
            const { hoursLogged, utilizationPercent, activeTasks, status } = user.utilization;
            
            return (
              <div key={user.id} className="flex items-center gap-2 p-2 rounded-md border">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user.profilePicture || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {getInitials(user.firstName, user.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium truncate">
                      {user.firstName} {user.lastName}
                    </span>
                    <Badge className={`text-[9px] px-1 py-0 ${getStatusColor(status)}`}>
                      {utilizationPercent.toFixed(0)}%
                    </Badge>
                  </div>
                  <Progress 
                    value={Math.min(100, utilizationPercent)} 
                    className={`h-1 ${utilizationPercent > 100 ? '[&>div]:bg-orange-500' : ''}`}
                  />
                  <div className="flex items-center justify-between mt-0.5 text-[9px] text-muted-foreground">
                    <span>{hoursLogged.toFixed(1)}h / {TARGET_HOURS_PER_WEEK}h</span>
                    <span>{activeTasks} tasks</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

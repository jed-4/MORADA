import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, startOfWeek, endOfWeek } from "date-fns";
import type { WidgetProps } from "@/types/widgets";
import type { Timesheet, User, Project } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { WidgetError } from "@/components/ui/WidgetError";

export default function BusinessTimesheetsWidget({}: WidgetProps) {
  const timesheetsQ = useQuery<Timesheet[]>({ queryKey: ["/api/timesheets"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  if (timesheetsQ.isLoading) return <WidgetSkeleton rows={4} />;
  if (timesheetsQ.isError)
    return <WidgetError onRetry={() => timesheetsQ.refetch()} message="Couldn't load timesheets." />;
  const timesheets = timesheetsQ.data ?? [];
  if (timesheets.length === 0) return <WidgetEmpty title="No timesheet entries yet" />;

  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  const thisWeekTimesheets = timesheets.filter(t => {
    const date = new Date(t.date);
    return date >= weekStart && date <= weekEnd;
  });

  const pendingTimesheets = timesheets.filter(t => t.status === "submitted");
  const approvedThisWeek = thisWeekTimesheets.filter(t => t.status === "approved");
  const totalHoursThisWeek = approvedThisWeek.reduce((sum, t) => sum + (Number(t.hours) || 0), 0);

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "Business";
    const project = projects.find(p => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case "submitted":
        return <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />;
      case "rejected":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-status-success-bg text-status-success";
      case "submitted": return "bg-status-warning-bg text-status-warning";
      case "rejected": return "bg-status-danger-bg text-status-danger";
      default: return "bg-muted text-secondary";
    }
  };

  return (
    <div className="space-y-4" data-testid="business-timesheets-widget">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-md bg-muted/50">
          <p className="text-lg font-semibold">{totalHoursThisWeek.toFixed(1)}h</p>
          <p className="text-data text-muted-foreground">This Week</p>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <p className="text-lg font-semibold">{pendingTimesheets.length}</p>
          <p className="text-data text-muted-foreground">Pending</p>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <p className="text-lg font-semibold">{approvedThisWeek.length}</p>
          <p className="text-data text-muted-foreground">Approved</p>
        </div>
      </div>

      <ScrollArea className="h-[180px]">
        <div className="space-y-2 pr-4">
          <p className="text-xs font-medium text-muted-foreground">Recent Entries</p>
          {timesheets.slice(0, 6).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between p-2 rounded-md border text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {getStatusIcon(entry.status)}
                <div className="min-w-0">
                  <p className="truncate text-sm">{getUserName(entry.userId)}</p>
                  <p className="text-data text-muted-foreground truncate">
                    {getProjectName(entry.projectId)} • {format(new Date(entry.date), "MMM d")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{Number(entry.hours).toFixed(1)}h</span>
                <Badge className={`text-data px-1 py-0 ${getStatusColor(entry.status)}`}>
                  {entry.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

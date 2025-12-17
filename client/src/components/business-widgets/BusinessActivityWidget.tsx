import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import type { WidgetProps } from "@/types/widgets";
import type { Activity, User, Project } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  CheckSquare, 
  DollarSign, 
  Users, 
  Calendar,
  Building2
} from "lucide-react";

export default function BusinessActivityWidget({ widget }: WidgetProps) {
  const { data: activities = [] } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const recentActivities = activities
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  const getUserName = (userId: string | null) => {
    if (!userId) return "System";
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  };

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    const project = projects.find(p => p.id === projectId);
    return project?.name || null;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "task":
        return <CheckSquare className="h-3.5 w-3.5 text-blue-500" />;
      case "bill":
        return <DollarSign className="h-3.5 w-3.5 text-green-500" />;
      case "estimate":
        return <FileText className="h-3.5 w-3.5 text-purple-500" />;
      case "project":
        return <Building2 className="h-3.5 w-3.5 text-orange-500" />;
      case "user":
        return <Users className="h-3.5 w-3.5 text-cyan-500" />;
      default:
        return <Calendar className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (action: string) => {
    if (action.includes("created")) return "bg-green-500";
    if (action.includes("updated")) return "bg-blue-500";
    if (action.includes("deleted")) return "bg-red-500";
    if (action.includes("completed")) return "bg-emerald-500";
    return "bg-gray-500";
  };

  if (recentActivities.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm" data-testid="business-activity-widget">
        No recent activity
      </div>
    );
  }

  return (
    <ScrollArea className="h-[280px]" data-testid="business-activity-widget">
      <div className="space-y-3 pr-4">
        {recentActivities.map((activity) => {
          const projectName = getProjectName(activity.projectId);
          return (
            <div key={activity.id} className="flex items-start gap-3 text-sm">
              <div className={`w-2 h-2 rounded-full mt-2 ${getStatusColor(activity.action)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {getActivityIcon(activity.type)}
                  <p className="truncate">{activity.description}</p>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-xs mt-0.5">
                  <span>{getUserName(activity.userId)}</span>
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}</span>
                  {projectName && (
                    <>
                      <span>•</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {projectName}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

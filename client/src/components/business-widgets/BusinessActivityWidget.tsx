import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
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
  Building2,
} from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { WidgetError } from "@/components/ui/WidgetError";

export default function BusinessActivityWidget({}: WidgetProps) {
  const activitiesQ = useQuery<Activity[]>({ queryKey: ["/api/activities"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  if (activitiesQ.isLoading) return <WidgetSkeleton rows={4} />;
  if (activitiesQ.isError)
    return <WidgetError onRetry={() => activitiesQ.refetch()} message="Couldn't load activity." />;

  const activities = activitiesQ.data ?? [];
  const recent = [...activities]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  if (recent.length === 0)
    return <WidgetEmpty title="No recent activity" />;

  const getUserName = (userId: string | null) => {
    if (!userId) return "System";
    const u = users.find((x) => x.id === userId);
    return u ? `${u.firstName} ${u.lastName}`.trim() : "Unknown";
  };
  const getProjectName = (projectId: string | null) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId)?.name ?? null;
  };
  const getIcon = (type: string) => {
    switch (type) {
      case "task": return <CheckSquare className="h-3.5 w-3.5 text-bp-teal" />;
      case "bill": return <DollarSign className="h-3.5 w-3.5 text-bp-green" />;
      case "estimate": return <FileText className="h-3.5 w-3.5 text-bp-purple" />;
      case "project": return <Building2 className="h-3.5 w-3.5 text-bp-amber" />;
      case "user": return <Users className="h-3.5 w-3.5 text-bp-teal" />;
      default: return <Calendar className="h-3.5 w-3.5 text-bp-muted" />;
    }
  };

  return (
    <ScrollArea className="h-[280px]" data-testid="business-activity-widget">
      <div className="space-y-3 pr-2">
        {recent.map((a) => {
          const projectName = getProjectName(a.projectId);
          return (
            <div key={a.id} className="flex items-start gap-3 text-sm">
              <div className="w-2 h-2 rounded-full mt-2 bg-bp-muted/50" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {getIcon(a.type)}
                  <p className="truncate">{a.description}</p>
                </div>
                <div className="flex items-center gap-2 text-bp-muted text-xs mt-0.5">
                  <span>{getUserName(a.userId)}</span>
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                  {projectName && (
                    <>
                      <span>•</span>
                      <Badge variant="outline" className="px-1 py-0 text-[10px]">
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

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Activity, 
  MessageSquare, 
  CheckSquare, 
  FileText, 
  DollarSign,
  Eye,
  Clock
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { getUserDisplayName } from "@/lib/utils";

interface ActivityItem {
  id: string;
  type: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  projectId?: string;
  projectName?: string;
  userId: string;
  user?: { firstName?: string; lastName?: string; email?: string };
  createdAt: string;
  metadata?: Record<string, any>;
}

const ACTIVITY_ICONS: Record<string, any> = {
  task: CheckSquare,
  comment: MessageSquare,
  note: FileText,
  estimate: DollarSign,
  bill: DollarSign,
  default: Activity,
};

const ACTION_COLORS: Record<string, string> = {
  created: "text-green-600 dark:text-green-400",
  updated: "text-blue-600 dark:text-blue-400",
  completed: "text-emerald-600 dark:text-emerald-400",
  deleted: "text-red-600 dark:text-red-400",
  commented: "text-purple-600 dark:text-purple-400",
};

export default function PersonalActivityWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const maxItems = widget.config?.maxItems || 8;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxItems, setConfigMaxItems] = useState(maxItems);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxItems(widget.config?.maxItems || 8);
  }, [widget.title, widget.config]);

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["/api/tasks", "user", userId],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const recentlyUpdatedTasks = tasks
    .filter(t => t.updatedAt && new Date(t.updatedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, maxItems);

  const activities: ActivityItem[] = recentlyUpdatedTasks.map(task => {
    const project = projects.find(p => p.id === task.projectId);
    return {
      id: task.id,
      type: 'task',
      action: task.status === 'done' || task.status === 'complete' ? 'completed' : 'updated',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      projectId: task.projectId,
      projectName: project?.name,
      userId: task.assigneeId || userId,
      createdAt: task.updatedAt,
    };
  });

  const isLoading = false;

  const displayActivities = activities.slice(0, maxItems);

  const getActivityIcon = (type: string) => {
    const Icon = ACTIVITY_ICONS[type] || ACTIVITY_ICONS.default;
    return Icon;
  };

  const formatAction = (activity: ActivityItem) => {
    const userName = activity.user ? getUserDisplayName(activity.user) : 'Someone';
    const entityName = activity.entityName || activity.entityType;
    return `${userName} ${activity.action} ${entityName}`;
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, maxItems: configMaxItems }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxItems(widget.config?.maxItems || 8);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Activity</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Items</Label>
          <Input 
            type="number"
            min={1}
            max={20}
            value={configMaxItems}
            onChange={(e) => setConfigMaxItems(parseInt(e.target.value) || 8)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="h-3 w-3" />
          <span>Watching & Assigned</span>
        </div>
      </div>
      
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse p-2 border rounded-md">
                <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                <div className="h-2 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : displayActivities.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            <Activity className="h-6 w-6 mx-auto mb-1 opacity-30" />
            <p>No recent activity</p>
            <p className="text-[10px]">Activity on your tasks and watched items will appear here</p>
          </div>
        ) : (
          displayActivities.map((activity) => {
            const Icon = getActivityIcon(activity.entityType);
            const actionColor = ACTION_COLORS[activity.action] || 'text-muted-foreground';
            
            return (
              <div 
                key={activity.id}
                className="p-2 border rounded-md hover-elevate cursor-pointer"
                onClick={() => {
                  if (activity.projectId) {
                    setLocation(`/projects/${activity.projectId}`);
                  }
                }}
                data-testid={`activity-${activity.id}`}
              >
                <div className="flex items-start gap-2">
                  <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${actionColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate leading-tight">
                      {formatAction(activity)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                      </span>
                      {activity.projectName && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">
                          {activity.projectName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Activity } from "@shared/schema";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText,
  DollarSign,
  Receipt,
  GitBranch,
  FileCheck,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ActivityWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxItems, setConfigMaxItems] = useState(widget.config?.maxItems || 20);
  
  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxItems(widget.config?.maxItems || 20);
  }, [widget.title, widget.config]);

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(
        `/api/activities?projectId=${currentProject.id}&limit=20`,
        {
          credentials: "include",
        }
      );
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "task":
        return <FileCheck className="h-4 w-4" />;
      case "estimate":
        return <FileText className="h-4 w-4" />;
      case "bill":
        return <Receipt className="h-4 w-4" />;
      case "variation":
        return <GitBranch className="h-4 w-4" />;
      case "invoice":
        return <DollarSign className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case "task":
        return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950";
      case "estimate":
        return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950";
      case "bill":
        return "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950";
      case "variation":
        return "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950";
      case "invoice":
        return "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950";
      default:
        return "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-950";
    }
  };

  // Configuration mode
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
      setConfigMaxItems(widget.config?.maxItems || 20);
      onCloseConfig?.();
    };
    
    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Activity Feed</h4>
        
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
          <Label className="text-xs">Max Items to Show</Label>
          <Input 
            type="number"
            min={5}
            max={50}
            value={configMaxItems}
            onChange={(e) => setConfigMaxItems(parseInt(e.target.value) || 20)}
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

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-sm text-muted-foreground mb-3">
          Loading activities...
        </div>
        <div className="space-y-3 flex-1 overflow-auto">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 bg-muted rounded-full"></div>
              <div className="flex-1 min-w-0">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-8">
        <Clock className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No recent activity on this project
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-sm font-semibold mb-3">
        {activities.length} recent activit{activities.length === 1 ? "y" : "ies"}
      </div>

      <div className="space-y-3 flex-1 overflow-auto">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="flex gap-3"
            data-testid={`activity-item-${activity.id}`}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getActivityColor(
                activity.activityType
              )}`}
            >
              {getActivityIcon(activity.activityType)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="font-medium">{activity.userName || "Someone"}</span>{" "}
                <span className="text-muted-foreground">{activity.description}</span>
              </p>
              {activity.entityName && (
                <p className="text-sm text-muted-foreground truncate">
                  {activity.entityName}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(activity.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

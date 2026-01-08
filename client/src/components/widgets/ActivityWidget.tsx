import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Activity, type CompanySettings } from "@shared/schema";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  DollarSign,
  Receipt,
  GitBranch,
  FileCheck,
  Clock,
  Calendar,
  Plus,
  MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function ActivityWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxItems, setConfigMaxItems] = useState(widget.config?.maxItems || 20);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  
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

  // Fetch company settings for activity visibility preferences
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Create activity note mutation
  const createActivityMutation = useMutation({
    mutationFn: async (description: string) => {
      return apiRequest("/api/activities", "POST", {
        projectId: currentProject?.id,
        activityType: "manual",
        action: "note",
        description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities", currentProject?.id] });
      setNewNoteText("");
      setIsAddingNote(false);
      toast({
        title: "Note added",
        description: "Your activity note has been added.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add note",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter activities based on company visibility settings and apply maxItems limit
  const filteredActivities = useMemo(() => {
    let result = activities;
    
    // Apply visibility filter if settings exist
    if (companySettings?.activityTypesVisible) {
      const visibility = companySettings.activityTypesVisible as Record<string, boolean>;
      result = activities.filter(activity => {
        // If the activity type has a visibility setting, use it; otherwise default to visible
        return visibility[activity.activityType] !== false;
      });
    }
    
    // Apply maxItems limit from widget config
    const maxItems = widget.config?.maxItems || 20;
    return result.slice(0, maxItems);
  }, [activities, companySettings?.activityTypesVisible, widget.config?.maxItems]);

  // Group consecutive schedule activities when more than 5 in a row
  const groupedActivities = useMemo(() => {
    const result: Array<Activity | { type: 'group'; activities: Activity[]; count: number }> = [];
    let scheduleBuffer: Activity[] = [];
    
    const flushScheduleBuffer = () => {
      if (scheduleBuffer.length > 5) {
        // Group them
        result.push({ type: 'group', activities: scheduleBuffer, count: scheduleBuffer.length });
      } else {
        // Add individually
        scheduleBuffer.forEach(a => result.push(a));
      }
      scheduleBuffer = [];
    };
    
    filteredActivities.forEach(activity => {
      if (activity.activityType === 'schedule') {
        scheduleBuffer.push(activity);
      } else {
        // Flush any pending schedule activities
        if (scheduleBuffer.length > 0) {
          flushScheduleBuffer();
        }
        result.push(activity);
      }
    });
    
    // Flush remaining schedule activities
    if (scheduleBuffer.length > 0) {
      flushScheduleBuffer();
    }
    
    return result;
  }, [filteredActivities]);

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
      case "schedule":
        return <Calendar className="h-4 w-4" />;
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
      case "schedule":
        return "text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950";
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

  if (filteredActivities.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">0 recent activities</div>
          {!isAddingNote && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setIsAddingNote(true)}
              data-testid="button-add-activity-note-empty"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Note
            </Button>
          )}
        </div>

        {isAddingNote && (
          <div className="mb-3 p-2 border rounded-md bg-muted/30 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              <span>Add activity note</span>
            </div>
            <Textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="What's the update?"
              className="min-h-[60px] text-sm resize-none"
              data-testid="input-activity-note-empty"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNoteText("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={!newNoteText.trim() || createActivityMutation.isPending}
                onClick={() => createActivityMutation.mutate(newNoteText.trim())}
                data-testid="button-save-activity-note-empty"
              >
                {createActivityMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center justify-center flex-1 text-center py-8">
          <Clock className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No recent activity on this project
          </p>
        </div>
      </div>
    );
  }

  const toggleGroup = (index: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Render individual activity item
  const renderActivityItem = (activity: Activity) => {
    const metadata = activity.metadata as { changes?: Array<{ name: string; change: string }> } | null;
    const hasSubItems = metadata?.changes && metadata.changes.length > 0;
    
    return (
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
          {hasSubItems ? (
            <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
              {metadata!.changes!.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1">
                  <span className="text-muted-foreground/60">-</span>
                  <span>
                    <span className="font-medium text-foreground/80">{item.name}</span>
                    {item.change && <span className="text-muted-foreground"> {item.change}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : activity.entityName ? (
            <p className="text-sm text-muted-foreground truncate">
              {activity.entityName}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(activity.createdAt), {
              addSuffix: true,
            })}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">
          {filteredActivities.length} recent activit{filteredActivities.length === 1 ? "y" : "ies"}
        </div>
        {!isAddingNote && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => setIsAddingNote(true)}
            data-testid="button-add-activity-note"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Note
          </Button>
        )}
      </div>

      {isAddingNote && (
        <div className="mb-3 p-2 border rounded-md bg-muted/30 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>Add activity note</span>
          </div>
          <Textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="What's the update?"
            className="min-h-[60px] text-sm resize-none"
            data-testid="input-activity-note"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setIsAddingNote(false);
                setNewNoteText("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={!newNoteText.trim() || createActivityMutation.isPending}
              onClick={() => createActivityMutation.mutate(newNoteText.trim())}
              data-testid="button-save-activity-note"
            >
              {createActivityMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3 flex-1 overflow-auto">
        {groupedActivities.map((item, index) => {
          // Check if this is a group or individual activity
          if ('type' in item && item.type === 'group') {
            const isExpanded = expandedGroups.has(index);
            return (
              <div key={`group-${index}`} className="space-y-2">
                <button
                  onClick={() => toggleGroup(index)}
                  className="flex gap-3 w-full text-left hover-elevate rounded-md p-1 -m-1"
                  data-testid={`activity-group-${index}`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getActivityColor('schedule')}`}>
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{item.count} schedule updates</span>
                      <span className="text-muted-foreground ml-1">
                        {isExpanded ? '(click to collapse)' : '(click to expand)'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(item.activities[0].createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
                {isExpanded && (
                  <div className="ml-4 pl-4 border-l border-border space-y-3">
                    {item.activities.map(activity => renderActivityItem(activity))}
                  </div>
                )}
              </div>
            );
          } else {
            return renderActivityItem(item as Activity);
          }
        })}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  DollarSign,
  Receipt,
  GitBranch,
  FileCheck,
  Clock,
  Calendar,
  Pin,
  PinOff,
  Plus,
  MessageSquare,
  Folder,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Activity, User, Project } from "@shared/schema";

interface UserActivityProps {
  user: User;
  isOwnPage: boolean;
}

export default function UserActivity({ user, isOwnPage }: UserActivityProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newActivityDescription, setNewActivityDescription] = useState("");

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities", "user", user.id],
    queryFn: async () => {
      const response = await fetch(
        `/api/activities?userId=${user.id}&limit=100`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user.id,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectMap = new Map(projects.map(p => [p.id, p]));

  const createActivityMutation = useMutation({
    mutationFn: async (data: { description: string }) => {
      return apiRequest("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          activityType: "manual",
          action: "note",
          description: data.description,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities", "user", user.id] });
      setNewActivityDescription("");
      setIsAddDialogOpen(false);
      toast({
        title: "Activity added",
        description: "Your activity note has been added.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add activity",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      return apiRequest(`/api/activities/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities", "user", user.id] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update activity",
        description: error.message,
        variant: "destructive",
      });
    },
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
      case "schedule":
        return <Calendar className="h-4 w-4" />;
      case "manual":
        return <MessageSquare className="h-4 w-4" />;
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
      case "manual":
        return "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950";
      default:
        return "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-950";
    }
  };

  const handleAddActivity = () => {
    if (!newActivityDescription.trim()) return;
    createActivityMutation.mutate({ description: newActivityDescription });
  };

  const pinnedActivities = activities.filter(a => a.pinned);
  const unpinnedActivities = activities.filter(a => !a.pinned);

  return (
    <div className="p-4 space-y-4" data-testid="user-activity">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activity</h2>
          <p className="text-sm text-muted-foreground">
            {isOwnPage ? "Your recent activity across all projects" : `${user.firstName}'s recent activity`}
          </p>
        </div>
        {isOwnPage && (
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-user-activity">
            <Plus className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activity yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pinnedActivities.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Pin className="h-4 w-4" />
                Pinned
              </h3>
              {pinnedActivities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  projectName={activity.projectId ? projectMap.get(activity.projectId)?.name : undefined}
                  getActivityIcon={getActivityIcon}
                  getActivityColor={getActivityColor}
                  onTogglePin={(pinned) => togglePinMutation.mutate({ id: activity.id, pinned })}
                  canPin={isOwnPage}
                />
              ))}
            </div>
          )}

          <div className="space-y-2">
            {pinnedActivities.length > 0 && unpinnedActivities.length > 0 && (
              <h3 className="text-sm font-medium text-muted-foreground">Recent</h3>
            )}
            {unpinnedActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                projectName={activity.projectId ? projectMap.get(activity.projectId)?.name : undefined}
                getActivityIcon={getActivityIcon}
                getActivityColor={getActivityColor}
                onTogglePin={(pinned) => togglePinMutation.mutate({ id: activity.id, pinned })}
                canPin={isOwnPage}
              />
            ))}
          </div>
        </div>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Activity Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="What are you working on?"
              value={newActivityDescription}
              onChange={(e) => setNewActivityDescription(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-user-activity-description"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddActivity}
              disabled={!newActivityDescription.trim() || createActivityMutation.isPending}
              data-testid="button-save-user-activity"
            >
              {createActivityMutation.isPending ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivityItem({
  activity,
  projectName,
  getActivityIcon,
  getActivityColor,
  onTogglePin,
  canPin,
}: {
  activity: Activity;
  projectName?: string;
  getActivityIcon: (type: string) => JSX.Element;
  getActivityColor: (type: string) => string;
  onTogglePin: (pinned: boolean) => void;
  canPin: boolean;
}) {
  return (
    <Card className={activity.pinned ? "border-primary/50 bg-primary/5" : ""}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full flex-shrink-0 ${getActivityColor(activity.activityType)}`}>
            {getActivityIcon(activity.activityType)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm">{activity.description}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {projectName && (
                <Badge variant="outline" className="text-xs">
                  <Folder className="h-3 w-3 mr-1" />
                  {projectName}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </span>
              {activity.activityType === "manual" && (
                <Badge variant="secondary" className="text-xs">Note</Badge>
              )}
            </div>
          </div>
          {canPin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => onTogglePin(!activity.pinned)}
              data-testid={`button-pin-user-activity-${activity.id}`}
            >
              {activity.pinned ? (
                <PinOff className="h-4 w-4 text-primary" />
              ) : (
                <Pin className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

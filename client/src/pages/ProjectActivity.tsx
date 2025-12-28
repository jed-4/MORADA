import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { Activity, CompanySettings } from "@shared/schema";

export default function ProjectActivity() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newActivityDescription, setNewActivityDescription] = useState("");

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities", "project", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(
        `/api/activities?projectId=${currentProject.id}&limit=100`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });

  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const createActivityMutation = useMutation({
    mutationFn: async (data: { description: string }) => {
      return apiRequest("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          projectId: currentProject?.id,
          activityType: "manual",
          action: "note",
          description: data.description,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/activities", "project", currentProject?.id] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/activities", "project", currentProject?.id] });
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
        return "text-[#bba7db] bg-[#bba7db]/10";
      case "estimate":
        return "text-primary bg-primary/10";
      case "bill":
        return "text-destructive bg-destructive/10";
      case "variation":
        return "text-[#bba7db] bg-[#bba7db]/10";
      case "invoice":
        return "text-primary bg-primary/10";
      case "schedule":
        return "text-[#bba7db] bg-[#bba7db]/10";
      case "manual":
        return "text-[#bba7db] bg-[#bba7db]/10";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  const handleAddActivity = () => {
    if (!newActivityDescription.trim()) return;
    createActivityMutation.mutate({ description: newActivityDescription });
  };

  const pinnedActivities = activities.filter(a => a.pinned);
  const unpinnedActivities = activities.filter(a => !a.pinned);

  if (!currentProject) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Please select a project to view activity.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4" data-testid="project-activity">
      {/* Toolbar row */}
      <div className="flex items-center justify-end">
        <Button 
          onClick={() => setIsAddDialogOpen(true)} 
          className="bg-[#bba7db] text-white border-[#bba7db]"
          data-testid="button-add-activity"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
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
            <p>No activity yet. Add a note to start tracking your work.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pinnedActivities.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2 text-[#bba7db]">
                <Pin className="h-4 w-4" />
                Pinned
              </h3>
              {pinnedActivities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  getActivityIcon={getActivityIcon}
                  getActivityColor={getActivityColor}
                  onTogglePin={(pinned) => togglePinMutation.mutate({ id: activity.id, pinned })}
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
                getActivityIcon={getActivityIcon}
                getActivityColor={getActivityColor}
                onTogglePin={(pinned) => togglePinMutation.mutate({ id: activity.id, pinned })}
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
              placeholder="What did you work on? (e.g., 'Completed framing inspection - passed')"
              value={newActivityDescription}
              onChange={(e) => setNewActivityDescription(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-activity-description"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddActivity}
              disabled={!newActivityDescription.trim() || createActivityMutation.isPending}
              className="bg-[#bba7db] text-white border-[#bba7db]"
              data-testid="button-save-activity"
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
  getActivityIcon,
  getActivityColor,
  onTogglePin,
}: {
  activity: Activity;
  getActivityIcon: (type: string) => JSX.Element;
  getActivityColor: (type: string) => string;
  onTogglePin: (pinned: boolean) => void;
}) {
  return (
    <Card className={activity.pinned ? "border-[#bba7db]/50 bg-[#bba7db]/5" : ""}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full ${getActivityColor(activity.activityType)}`}>
            {getActivityIcon(activity.activityType)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm">{activity.description}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {activity.userName || "System"} • {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </span>
              {activity.activityType === "manual" && (
                <Badge variant="secondary" className="text-xs">Note</Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onTogglePin(!activity.pinned)}
            data-testid={`button-pin-activity-${activity.id}`}
          >
            {activity.pinned ? (
              <PinOff className="h-4 w-4 text-[#bba7db]" />
            ) : (
              <Pin className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

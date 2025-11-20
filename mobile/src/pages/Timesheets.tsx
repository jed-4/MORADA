import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileButton } from "@/components/ui/MobileButton";
import { BottomSheet } from "@/components/BottomSheet";
import { MobileInput } from "@/components/ui/MobileInput";
import { MobileTextarea } from "@/components/ui/MobileTextarea";
import { Plus, Calendar, Clock } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { apiRequest } from "@shared/api";
import { queryClient } from "@lib/queryClient";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import type { Timesheet, Project } from "@shared/schema";

export function Timesheets() {
  const [isLogSheetOpen, setIsLogSheetOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");

  const { data: timesheets = [], isLoading, refetch } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets"],
    enabled: true,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: true,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refetch().then(() => undefined);
    },
  });

  const createTimesheetMutation = useMutation({
    mutationFn: async (data: {
      projectId: string;
      duration: string;
      description?: string;
    }) => {
      const now = new Date();
      return await apiRequest("/api/timesheets", "POST", {
        projectId: data.projectId,
        date: now.toISOString(),
        duration: data.duration,
        description: data.description || "",
        status: "draft",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timesheets"] });
      setIsLogSheetOpen(false);
      setSelectedProjectId("");
      setDuration("");
      setDescription("");
    },
  });

  const handleLogTime = () => {
    if (!selectedProjectId || !duration) return;
    createTimesheetMutation.mutate({
      projectId: selectedProjectId,
      duration,
      description,
    });
  };

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  // Calculate current week hours
  const currentWeekHours = timesheets
    .filter((t) => {
      const date = new Date(t.date);
      return date >= weekStart && date <= weekEnd;
    })
    .reduce((sum, t) => sum + Number(t.duration || 0), 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-500/10 text-green-600";
      case "submitted":
        return "bg-primary/10 text-primary";
      case "rejected":
        return "bg-red-500/10 text-red-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  return (
    <div className="flex flex-col h-full">
      <MobileHeader 
        title="Timesheets"
        action={
          <MobileButton
            size="icon"
            variant="ghost"
            onClick={() => setIsLogSheetOpen(true)}
            data-testid="button-add-timesheet"
          >
            <Plus className="w-5 h-5" />
          </MobileButton>
        }
      />
      
      <main
        className="flex-1 overflow-y-auto"
        {...pullToRefresh.touchHandlers}
      >
        <PullToRefreshIndicator {...pullToRefresh} />

        {/* Current Week Quick Entry */}
        <div className="p-4 bg-card border-b">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-muted-foreground">Current Week</div>
              <div className="text-xl font-bold">{currentWeekHours.toFixed(1)} hours</div>
            </div>
            <MobileButton
              onClick={() => setIsLogSheetOpen(true)}
              variant="default"
              data-testid="button-log-time"
            >
              Log Time
            </MobileButton>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>
              {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
            </span>
          </div>
        </div>

        {/* Timesheet History */}
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : timesheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">No Timesheets Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start tracking your time on projects
            </p>
            <MobileButton onClick={() => setIsLogSheetOpen(true)} variant="default">
              Log Your First Entry
            </MobileButton>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Recent Timesheets
            </h3>
            {timesheets.map((timesheet) => (
              <div
                key={timesheet.id}
                className="bg-card rounded-xl p-4 border hover-elevate active-elevate-2"
                data-testid={`timesheet-card-${timesheet.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-1">
                      {format(new Date(timesheet.date), "MMM d, yyyy")}
                    </h3>
                    <div className="text-xs text-muted-foreground">
                      {getProjectName(timesheet.projectId)}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${getStatusColor(
                      timesheet.status
                    )}`}
                  >
                    {timesheet.status.charAt(0).toUpperCase() +
                      timesheet.status.slice(1)}
                  </span>
                </div>
                <div className="text-2xl font-bold text-primary mb-2">
                  {Number(timesheet.duration).toFixed(1)} hrs
                </div>
                {timesheet.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {timesheet.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Log Time Bottom Sheet */}
      <BottomSheet
        isOpen={isLogSheetOpen}
        onClose={() => setIsLogSheetOpen(false)}
        title="Log Time"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Project</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full h-11 px-3 rounded-md border bg-background text-sm"
              data-testid="select-project"
            >
              <option value="">Select a project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Duration (hours)
            </label>
            <MobileInput
              type="number"
              step="0.5"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g., 8.5"
              data-testid="input-duration"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Description (optional)
            </label>
            <MobileTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
              data-testid="textarea-description"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <MobileButton
              onClick={() => setIsLogSheetOpen(false)}
              variant="ghost"
              className="flex-1"
              data-testid="button-cancel"
            >
              Cancel
            </MobileButton>
            <MobileButton
              onClick={handleLogTime}
              variant="default"
              className="flex-1"
              disabled={!selectedProjectId || !duration || createTimesheetMutation.isPending}
              data-testid="button-save-timesheet"
            >
              {createTimesheetMutation.isPending ? "Saving..." : "Save Entry"}
            </MobileButton>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

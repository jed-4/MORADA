import { MobileHeader } from "@/components/MobileHeader";
import { useQuery } from "@tanstack/react-query";
import type { Project, Task, Activity } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

export function Dashboard() {
  const { data: projects = [], isLoading: isLoadingProjects, refetch: refetchProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: tasks = [], isLoading: isLoadingTasks, refetch: refetchTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: activities = [], isLoading: isLoadingActivities, refetch: refetchActivities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    queryFn: async () => {
      const response = await fetch("/api/activities?limit=10", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      // Invalidate and wait for all queries to refetch
      await Promise.all([
        refetchProjects().then(() => undefined),
        refetchTasks().then(() => undefined),
        refetchActivities().then(() => undefined),
      ]);
    },
  });

  const isLoading = isLoadingProjects || isLoadingTasks || isLoadingActivities;

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const dueToday = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const today = new Date().toDateString();
    return new Date(t.dueDate).toDateString() === today;
  }).length;

  return (
    <div className="flex flex-col h-full">
      <MobileHeader title="Dashboard" />
      
      <main 
        ref={pullToRefresh.containerRef}
        className="flex-1 overflow-y-auto"
        {...pullToRefresh.touchHandlers}
      >
        <PullToRefreshIndicator 
          isRefreshing={pullToRefresh.isRefreshing}
          pullDistance={pullToRefresh.pullDistance}
          pullPercentage={pullToRefresh.pullPercentage}
        />
        
        <div className="p-4 space-y-4">
          {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="bg-card rounded-xl p-6 border">
              <h2 className="text-xl font-bold mb-2">Quick Stats</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Overview of your active projects and tasks
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-primary/10 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{activeProjects}</div>
                  <div className="text-xs text-muted-foreground mt-1">Active Projects</div>
                </div>
                <div className="bg-primary/10 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{openTasks}</div>
                  <div className="text-xs text-muted-foreground mt-1">Open Tasks</div>
                </div>
                <div className="bg-primary/10 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{projects.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Projects</div>
                </div>
                <div className="bg-primary/10 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{dueToday}</div>
                  <div className="text-xs text-muted-foreground mt-1">Due Today</div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl p-6 border">
              <h3 className="font-semibold mb-3">Recent Activity</h3>
              <div className="space-y-3">
                {activities.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{activity.action}</div>
                      <div className="text-xs text-muted-foreground">{activity.details}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {activities.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recent activity
                  </p>
                )}
              </div>
            </div>
          </>
        )}
        </div>
      </main>
    </div>
  );
}

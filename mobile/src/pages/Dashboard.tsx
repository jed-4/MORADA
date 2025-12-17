import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { MobileHeader } from "@/components/MobileHeader";
import { useQuery } from "@tanstack/react-query";
import type { Project, Task, Activity } from "@shared/schema";
import { Loader2, Briefcase, User } from "lucide-react";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { MobileFAB, useDefaultQuickActions } from "@/components/MobileFAB";
import { useToast } from "@/hooks/use-toast";

type DashboardMode = "personal" | "business";

export function Dashboard() {
  const [mode, setMode] = useState<DashboardMode>(() => {
    const savedMode = localStorage.getItem("mobile-dashboard-mode");
    return (savedMode === "personal" || savedMode === "business") ? savedMode : "personal";
  });
  
  useEffect(() => {
    localStorage.setItem("mobile-dashboard-mode", mode);
  }, [mode]);
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
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const dueToday = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const today = new Date().toDateString();
    return new Date(t.dueDate).toDateString() === today;
  }).length;

  // Quick action handlers
  const quickActions = useDefaultQuickActions({
    onCreateTask: () => {
      setLocation("/tasks?create=true");
    },
    onCreateSiteDiary: () => {
      if (projects.length > 0) {
        setLocation(`/projects/${projects[0].id}/site-diary?create=true`);
      } else {
        toast({ title: "No Projects", description: "Create a project first to add site diary entries." });
      }
    },
    onCreateNote: () => {
      if (projects.length > 0) {
        setLocation(`/projects/${projects[0].id}/notes?create=true`);
      } else {
        toast({ title: "No Projects", description: "Create a project first to add notes." });
      }
    },
    onCreateMemo: () => {
      toast({ title: "Quick Memo", description: "Memo feature coming soon!" });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <MobileHeader title="Dashboard" />
      
      {/* Dashboard Mode Toggle */}
      <div className="px-4 pt-2 pb-1">
        <div className="bg-muted rounded-lg p-1 flex gap-1">
          <button
            onClick={() => setMode("personal")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              mode === "personal"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="toggle-personal-dashboard"
          >
            <User className="w-4 h-4" />
            <span>Personal</span>
          </button>
          <button
            onClick={() => setMode("business")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              mode === "business"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="toggle-business-dashboard"
          >
            <Briefcase className="w-4 h-4" />
            <span>Business</span>
          </button>
        </div>
      </div>
      
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
          ) : mode === "personal" ? (
            <>
              {/* Personal Dashboard Content */}
              <div className="bg-card rounded-xl p-6 border">
                <h2 className="text-xl font-bold mb-2">My Day</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Your personal tasks and priorities
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-primary/10 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{openTasks}</div>
                    <div className="text-xs text-muted-foreground mt-1">My Tasks</div>
                  </div>
                  <div className="bg-primary/10 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{dueToday}</div>
                    <div className="text-xs text-muted-foreground mt-1">Due Today</div>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-xl p-6 border">
                <h3 className="font-semibold mb-3">Upcoming Tasks</h3>
                <div className="space-y-3">
                  {tasks.filter(t => t.status !== "done").slice(0, 5).map((task) => (
                    <div key={task.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        task.priority === "high" ? "bg-destructive" : 
                        task.priority === "medium" ? "bg-amber-500" : "bg-primary"
                      }`} />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{task.title}</div>
                        {task.dueDate && (
                          <div className="text-xs text-muted-foreground">
                            Due: {new Date(task.dueDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {tasks.filter(t => t.status !== "done").length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No upcoming tasks
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Business Dashboard Content */}
              <div className="bg-card rounded-xl p-6 border">
                <h2 className="text-xl font-bold mb-2">Business Overview</h2>
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
      
      {/* Quick Action FAB */}
      <MobileFAB actions={quickActions} />
    </div>
  );
}

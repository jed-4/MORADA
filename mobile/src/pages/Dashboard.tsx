import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { MobileHeader } from "@/components/MobileHeader";
import { useQuery } from "@tanstack/react-query";
import type { Project, Task, Activity, DashboardTheme } from "@shared/schema";
import { Loader2, Briefcase, User, CalendarCheck, ListTodo, Building2, Clock, ChevronsDownUp, Palette } from "lucide-react";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { MobileFAB, useDefaultQuickActions } from "@/components/MobileFAB";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { MobileWidgetCard } from "@/components/MobileWidgetCard";
import { useMobileWidgetState } from "@/hooks/useMobileWidgetState";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { ReactNode } from "react";

type DashboardMode = "personal" | "business";

interface WidgetDefinition {
  title: string;
  icon: ReactNode;
  summary: string;
  content: ReactNode;
}

async function triggerHaptic() {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {
    // Haptics not available on web
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha / 100})`;
}

export function Dashboard() {
  const { user } = useAuth();
  const [mode, setMode] = useState<DashboardMode>(() => {
    const savedMode = localStorage.getItem("mobile-dashboard-mode");
    return (savedMode === "personal" || savedMode === "business") ? savedMode : "personal";
  });
  
  const availableWidgetIds = mode === "personal" 
    ? ["my-day", "upcoming-tasks"] 
    : ["business-overview", "recent-activity"];
  
  const widgetState = useMobileWidgetState(user?.id, mode, availableWidgetIds);
  
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

  // Query user workspace theme (for personal mode)
  const { data: userTheme } = useQuery<DashboardTheme | null>({
    queryKey: ['/api/user-dashboard-themes', user?.id],
    enabled: !!user?.id && mode === "personal",
  });

  // Query business dashboard theme (for business mode)
  const { data: businessTheme } = useQuery<DashboardTheme | null>({
    queryKey: ['/api/business-dashboard-theme'],
    enabled: mode === "business",
  });

  // Get the active theme based on mode
  const theme = mode === "personal" ? userTheme : businessTheme;

  // Background style based on theme
  const getBackgroundStyle = (): React.CSSProperties => {
    if (!theme) return {};
    
    if (theme.backgroundType === "color" && theme.backgroundColor) {
      return { backgroundColor: theme.backgroundColor };
    } else if (theme.backgroundType === "gradient" && theme.backgroundGradient) {
      return { background: theme.backgroundGradient };
    } else if (theme.backgroundType === "image" && theme.backgroundImage) {
      return { 
        backgroundImage: `url(${theme.backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }
    return {};
  };

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = () => {
    triggerHaptic();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = widgetState.order.indexOf(active.id as string);
      const newIndex = widgetState.order.indexOf(over.id as string);
      const newOrder = arrayMove(widgetState.order, oldIndex, newIndex);
      widgetState.setOrder(newOrder);
      triggerHaptic();
    }
  };

  const personalWidgets: Record<string, WidgetDefinition> = {
    "my-day": {
      title: "My Day",
      icon: <CalendarCheck className="w-5 h-5" />,
      summary: `${openTasks} tasks, ${dueToday} due today`,
      content: (
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
      ),
    },
    "upcoming-tasks": {
      title: "Upcoming Tasks",
      icon: <ListTodo className="w-5 h-5" />,
      summary: `${tasks.filter(t => t.status !== "done").length} pending`,
      content: (
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
      ),
    },
  };

  const businessWidgets: Record<string, WidgetDefinition> = {
    "business-overview": {
      title: "Business Overview",
      icon: <Building2 className="w-5 h-5" />,
      summary: `${activeProjects} active, ${openTasks} tasks`,
      content: (
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
      ),
    },
    "recent-activity": {
      title: "Recent Activity",
      icon: <Clock className="w-5 h-5" />,
      summary: `${activities.length} recent items`,
      content: (
        <div className="space-y-3">
          {activities.slice(0, 5).map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
              <div className="w-2 h-2 bg-primary rounded-full mt-2" />
              <div className="flex-1">
                <div className="font-medium text-sm">{activity.action}</div>
                <div className="text-xs text-muted-foreground">{activity.description}</div>
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
      ),
    },
  };

  const widgets = mode === "personal" ? personalWidgets : businessWidgets;

  return (
    <div className="flex flex-col h-full relative" style={getBackgroundStyle()}>
      {/* Overlay for image backgrounds */}
      {theme?.backgroundType === "image" && theme.overlayEnabled && (
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{ 
            backgroundColor: hexToRgba(theme.overlayColor || '#000000', theme.overlayOpacity || 40),
            backdropFilter: theme.blurStrength ? `blur(${theme.blurStrength}px)` : undefined,
          }}
        />
      )}
      <MobileHeader 
        title={mode === "personal" ? "User Workspace" : "Business Dashboard"} 
        action={
          <button
            onClick={() => {
              toast({
                title: "Theme Settings",
                description: "Theme customization is available in the desktop app. Visit BuildPro on desktop to customize your dashboard theme.",
              });
            }}
            className="p-2 hover-elevate active-elevate-2 rounded-md"
            data-testid="button-theme-settings"
          >
            <Palette className="w-5 h-5" />
          </button>
        }
      />
      
      <div className="px-4 pt-2 pb-1 relative z-10">
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

      <div className="px-4 py-1 flex justify-end relative z-10">
        <button
          onClick={widgetState.collapseAll}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-collapse-all"
        >
          <ChevronsDownUp className="w-3.5 h-3.5" />
          <span>Collapse All</span>
        </button>
      </div>
      
      <main 
        ref={pullToRefresh.containerRef}
        className="flex-1 overflow-y-auto relative z-10"
        {...pullToRefresh.touchHandlers}
      >
        <PullToRefreshIndicator 
          isRefreshing={pullToRefresh.isRefreshing}
          pullDistance={pullToRefresh.pullDistance}
          pullPercentage={pullToRefresh.pullPercentage}
        />
        
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={widgetState.order}
                strategy={verticalListSortingStrategy}
              >
                {widgetState.order.map((widgetId) => {
                  const widget = widgets[widgetId as keyof typeof widgets];
                  if (!widget) return null;
                  
                  return (
                    <MobileWidgetCard
                      key={widgetId}
                      id={widgetId}
                      title={widget.title}
                      icon={widget.icon}
                      summary={widget.summary}
                      isExpanded={widgetState.isExpanded(widgetId)}
                      onToggle={() => widgetState.toggleExpanded(widgetId)}
                    >
                      {widget.content}
                    </MobileWidgetCard>
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </main>
      
      <MobileFAB actions={quickActions} />
    </div>
  );
}

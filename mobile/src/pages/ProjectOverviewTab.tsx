import { useProject } from "@/contexts/ProjectContext";
import { useQuery } from "@tanstack/react-query";
import { 
  Home, CheckSquare, Clock, FileText, AlertTriangle, 
  ChevronRight, Loader2, MapPin, Calendar, Building2
} from "lucide-react";
import { format } from "date-fns";
import { getApiBaseUrl } from "@lib/queryClient";
import { useLocation } from "wouter";

interface Task {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
}

interface Defect {
  id: string;
  title: string;
  status: string;
  priority: string;
}

interface Note {
  id: string;
  title: string;
  updatedAt: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ProjectOverviewTab() {
  const { currentProject } = useProject();
  const [, setLocation] = useLocation();

  // Fetch tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/tasks?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentProject?.id,
    retry: false,
  });

  // Fetch defects
  const { data: defects = [] } = useQuery<Defect[]>({
    queryKey: ["/api/defects", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/defects?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentProject?.id,
    retry: false,
  });

  // Fetch recent notes
  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["/api/notes", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/notes?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!currentProject?.id,
    retry: false,
  });

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Please select a project</p>
      </div>
    );
  }

  const activeTasks = tasks.filter(t => t.status !== "completed");
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate || t.status === "completed") return false;
    return new Date(t.dueDate) < new Date();
  });
  const openDefects = defects.filter(d => d.status !== "resolved" && d.status !== "closed");
  const recentNotes = notes.slice(0, 3);

  const navigateToTab = (tab: string) => {
    setLocation(`/projects/${currentProject.id}/${tab}`);
  };

  const getStatusPhase = (status: string | null) => {
    if (!status) return "Not Set";
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Project Header Card */}
        <div 
          className="rounded-xl p-4"
          style={{ 
            background: `linear-gradient(to bottom right, ${hexToRgba(currentProject.color || '#6366f1', 0.15)}, ${hexToRgba(currentProject.color || '#6366f1', 0.05)})`,
            border: `1px solid ${hexToRgba(currentProject.color || '#6366f1', 0.2)}`
          }}
        >
          <div className="flex items-start gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: hexToRgba(currentProject.color || '#6366f1', 0.2) }}
            >
              <Building2 className="w-6 h-6" style={{ color: currentProject.color || '#6366f1' }} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">{currentProject.name}</h1>
              {currentProject.projectSubStatus && (
                <span 
                  className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: currentProject.color || '#6366f1' }}
                >
                  {getStatusPhase(currentProject.projectSubStatus)}
                </span>
              )}
            </div>
          </div>

          {/* Project Details */}
          <div className="mt-4 space-y-2">
            {currentProject.location && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">{currentProject.location}</span>
              </div>
            )}
            {currentProject.startDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Started {format(new Date(currentProject.startDate), "MMM d, yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigateToTab("tasks")}
            className="bg-card border rounded-xl p-4 text-left hover-elevate"
            data-testid="stat-active-tasks"
          >
            <div className="flex items-center justify-between">
              <CheckSquare className="w-5 h-5 text-blue-500" />
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{activeTasks.length}</div>
              <div className="text-xs text-muted-foreground">Active Tasks</div>
            </div>
          </button>

          <button
            onClick={() => navigateToTab("tasks")}
            className={`bg-card border rounded-xl p-4 text-left hover-elevate ${overdueTasks.length > 0 ? "border-red-200 dark:border-red-900" : ""}`}
            data-testid="stat-overdue-tasks"
          >
            <div className="flex items-center justify-between">
              <Clock className={`w-5 h-5 ${overdueTasks.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <div className={`text-2xl font-bold ${overdueTasks.length > 0 ? "text-red-500" : ""}`}>
                {overdueTasks.length}
              </div>
              <div className="text-xs text-muted-foreground">Overdue</div>
            </div>
          </button>

          <button
            onClick={() => navigateToTab("defects")}
            className={`bg-card border rounded-xl p-4 text-left hover-elevate ${openDefects.length > 0 ? "border-amber-200 dark:border-amber-900" : ""}`}
            data-testid="stat-open-defects"
          >
            <div className="flex items-center justify-between">
              <AlertTriangle className={`w-5 h-5 ${openDefects.length > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <div className={`text-2xl font-bold ${openDefects.length > 0 ? "text-amber-500" : ""}`}>
                {openDefects.length}
              </div>
              <div className="text-xs text-muted-foreground">Open Defects</div>
            </div>
          </button>

          <button
            onClick={() => navigateToTab("notes")}
            className="bg-card border rounded-xl p-4 text-left hover-elevate"
            data-testid="stat-notes"
          >
            <div className="flex items-center justify-between">
              <FileText className="w-5 h-5 text-purple-500" />
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{notes.length}</div>
              <div className="text-xs text-muted-foreground">Notes</div>
            </div>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="bg-card border rounded-xl p-4">
          <h3 className="font-semibold mb-3">Quick Actions</h3>
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => navigateToTab("tasks")}
              className="flex flex-col items-center gap-1 p-3 rounded-lg hover-elevate"
              data-testid="action-tasks"
            >
              <CheckSquare className="w-6 h-6 text-blue-500" />
              <span className="text-xs">Tasks</span>
            </button>
            <button
              onClick={() => navigateToTab("timesheets")}
              className="flex flex-col items-center gap-1 p-3 rounded-lg hover-elevate"
              data-testid="action-timesheets"
            >
              <Clock className="w-6 h-6 text-green-500" />
              <span className="text-xs">Time</span>
            </button>
            <button
              onClick={() => navigateToTab("notes")}
              className="flex flex-col items-center gap-1 p-3 rounded-lg hover-elevate"
              data-testid="action-notes"
            >
              <FileText className="w-6 h-6 text-purple-500" />
              <span className="text-xs">Notes</span>
            </button>
            <button
              onClick={() => navigateToTab("site-diary")}
              className="flex flex-col items-center gap-1 p-3 rounded-lg hover-elevate"
              data-testid="action-diary"
            >
              <Calendar className="w-6 h-6 text-orange-500" />
              <span className="text-xs">Diary</span>
            </button>
          </div>
        </div>

        {/* Recent Notes */}
        {recentNotes.length > 0 && (
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Recent Notes</h3>
              <button
                onClick={() => navigateToTab("notes")}
                className="text-xs text-primary flex items-center gap-1"
                data-testid="link-all-notes"
              >
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {recentNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => navigateToTab("notes")}
                  className="p-3 bg-muted/50 rounded-lg cursor-pointer hover-elevate"
                  data-testid={`note-item-${note.id}`}
                >
                  <div className="font-medium text-sm truncate">{note.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(note.updatedAt), "MMM d, h:mm a")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Tasks */}
        {activeTasks.length > 0 && (
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Upcoming Tasks</h3>
              <button
                onClick={() => navigateToTab("tasks")}
                className="text-xs text-primary flex items-center gap-1"
                data-testid="link-all-tasks"
              >
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {activeTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigateToTab("tasks")}
                  className="p-3 bg-muted/50 rounded-lg cursor-pointer hover-elevate flex items-center gap-3"
                  data-testid={`task-item-${task.id}`}
                >
                  <CheckSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{task.title}</div>
                    {task.dueDate && (
                      <div className={`text-xs mt-0.5 ${new Date(task.dueDate) < new Date() ? "text-red-500" : "text-muted-foreground"}`}>
                        Due {format(new Date(task.dueDate), "MMM d")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {tasksLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!tasksLoading && activeTasks.length === 0 && recentNotes.length === 0 && (
          <div className="text-center py-8">
            <Home className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No recent activity</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Add tasks, notes, or track time to see them here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

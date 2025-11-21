import { MobileHeader } from "@/components/MobileHeader";
import { useProject } from "@/contexts/ProjectContext";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Project, Task } from "@shared/schema";
import { getApiBaseUrl } from "@lib/queryClient";
import { 
  Home, ListTree, MessageSquare, FileText, ClipboardList, 
  Clock, CheckSquare, Calculator, FileBarChart, FileSearch,
  Receipt, DollarSign, FolderOpen, Users, Loader2, ChevronRight
} from "lucide-react";
import { useEffect } from "react";

const PROJECT_FEATURES = [
  { title: "Overview", path: "", icon: Home },
  { title: "Scope", path: "/scope", icon: ListTree },
  { title: "Tasks", path: "/tasks", icon: CheckSquare },
  { title: "Messages", path: "/messages", icon: MessageSquare },
  { title: "Schedule", path: "/schedule", icon: Clock },
  { title: "Estimates", path: "/estimates", icon: FileBarChart },
  { title: "RFQ", path: "/rfq", icon: FileSearch },
  { title: "Bills", path: "/bills", icon: Receipt },
  { title: "Allowances", path: "/allowances", icon: DollarSign },
  { title: "Notes", path: "/notes", icon: FileText },
  { title: "Minutes", path: "/minutes", icon: ClipboardList },
  { title: "Take off", path: "/takeoff", icon: Calculator },
  { title: "Files", path: "/files", icon: FolderOpen },
  { title: "Team", path: "/team", icon: Users },
];

export function ProjectHome() {
  const [, params] = useRoute("/projects/:id");
  const [, setLocation] = useLocation();
  const { setCurrentProject } = useProject();
  const projectId = params?.id;

  const { data: project, isLoading, error } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Project not found");
        }
        if (res.status === 403) {
          throw new Error("Access denied");
        }
        throw new Error("Failed to fetch project");
      }
      return res.json();
    },
    enabled: !!projectId,
    retry: false,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { projectId }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/tasks?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch tasks");
      }
      return res.json();
    },
    enabled: !!projectId && !!project,
    retry: false,
  });

  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
    
    // Clear project when component unmounts
    return () => {
      setCurrentProject(null);
    };
  }, [project, setCurrentProject]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <MobileHeader title="Error" showBack />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              {error instanceof Error ? error.message : "Failed to load project"}
            </p>
            <p className="text-xs text-muted-foreground">
              Please try again or contact support if the problem persists.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <MobileHeader title="Project Not Found" showBack />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Project not found</p>
        </div>
      </div>
    );
  }

  const activeTasks = tasks.filter(t => t.status !== "completed");
  const completedTasks = tasks.filter(t => t.status === "completed");

  return (
    <div className="flex flex-col h-full">
      <MobileHeader title={project.name} showBack />
      
      {/* Project Summary Cards */}
      <div className="bg-card border-b px-4 py-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-background rounded-xl p-3 border">
            <div className="text-xs text-muted-foreground mb-1">Active Tasks</div>
            <div className="text-lg font-semibold">{activeTasks.length}</div>
          </div>
          <div className="bg-background rounded-xl p-3 border">
            <div className="text-xs text-muted-foreground mb-1">Completed</div>
            <div className="text-lg font-semibold">{completedTasks.length}</div>
          </div>
          <div className="bg-background rounded-xl p-3 border">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <div className="text-sm font-semibold capitalize">
              {project.status === "active" ? "Active" :
               project.status === "on_hold" ? "On Hold" :
               project.status === "completed" ? "Done" : project.status}
            </div>
          </div>
        </div>

        {project.clientName && (
          <div className="text-xs text-muted-foreground mb-1">Client</div>
        )}
        {project.clientName && (
          <div className="text-sm font-medium mb-3">{project.clientName}</div>
        )}

        {project.address && (
          <>
            <div className="text-xs text-muted-foreground mb-1">Address</div>
            <div className="text-sm">{project.address}</div>
          </>
        )}
      </div>

      {/* Feature Rail */}
      <div className="bg-card border-b px-4 py-3">
        <div className="text-xs font-semibold text-muted-foreground mb-3">PROJECT TOOLS</div>
        <div className="grid grid-cols-3 gap-2">
          {PROJECT_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <button
                key={feature.path}
                onClick={() => setLocation(`/projects/${projectId}${feature.path}`)}
                className="flex flex-col items-center justify-center p-3 rounded-xl border hover-elevate active-elevate-2 bg-background"
                data-testid={`feature-${feature.title.toLowerCase()}`}
              >
                <Icon className="w-5 h-5 mb-1.5 text-muted-foreground" />
                <span className="text-xs font-medium text-center leading-tight">{feature.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Section (placeholder) */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="text-xs font-semibold text-muted-foreground mb-3">RECENT ACTIVITY</div>
        <div className="text-sm text-muted-foreground text-center py-8">
          No recent activity
        </div>
      </div>
    </div>
  );
}

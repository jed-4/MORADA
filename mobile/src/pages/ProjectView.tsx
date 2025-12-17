import { MobileHeader } from "@/components/MobileHeader";
import { ProjectTabs } from "@/components/ProjectTabs";
import { SwipeableView } from "@/components/SwipeableView";
import { useProject } from "@/contexts/ProjectContext";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Project, DashboardTheme } from "@shared/schema";
import { getApiBaseUrl } from "@lib/queryClient";
import { useProjectRoute } from "@/hooks/useProjectRoute";
import { ProjectTasksTab } from "./ProjectTasksTab";
import { ProjectScheduleTab } from "./ProjectScheduleTab";
import { ProjectBillsTab } from "./ProjectBillsTab";
import { ProjectBudgetTab } from "./ProjectBudgetTab";
import { ProjectTeamTab } from "./ProjectTeamTab";
import { ProjectFilesTab } from "./ProjectFilesTab";
import { ProjectScopeTab } from "./ProjectScopeTab";
import { ProjectNotesTab } from "./ProjectNotesTab";
import { ProjectMinutesTab } from "./ProjectMinutesTab";
import { ProjectRFQTab } from "./ProjectRFQTab";
import { ProjectRFITab } from "./ProjectRFITab";
import { ProjectSelectionsTab } from "./ProjectSelectionsTab";
import { ProjectDefectsTab } from "./ProjectDefectsTab";
import { ProjectPOsTab } from "./ProjectPOsTab";
import { ProjectVariationsTab } from "./ProjectVariationsTab";
import { ProjectClientInvoicesTab } from "./ProjectClientInvoicesTab";
import { ProjectSiteDiaryTab } from "./ProjectSiteDiaryTab";
import { ProjectComingSoonTab } from "./ProjectComingSoonTab";
import { ProjectMessagesTab } from "./ProjectMessagesTab";
import { ProjectEstimatesTab } from "./ProjectEstimatesTab";
import { ProjectProposalsTab } from "./ProjectProposalsTab";
import { ProjectTimesheetsTab } from "./ProjectTimesheetsTab";
import { ProjectOverviewTab } from "./ProjectOverviewTab";
import { ProjectAllowancesTab } from "./ProjectAllowancesTab";

function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha / 100})`;
}

export function ProjectView() {
  const routeParams = useProjectRoute();
  const [, setLocation] = useLocation();
  const { currentProject, setCurrentProject } = useProject();
  const projectId = routeParams?.projectId;
  const currentTab = routeParams?.tab || "overview";

  // Fetch project if route ID doesn't match current project
  const needsFetch = !!projectId && (!currentProject || currentProject.id !== projectId);
  
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: needsFetch,
  });

  // Update current project when route changes or project loads
  useEffect(() => {
    if (project && project.id === projectId) {
      setCurrentProject(project);
    }
  }, [project, projectId, setCurrentProject]);

  // Query project-specific dashboard theme
  const { data: theme } = useQuery<DashboardTheme | null>({
    queryKey: ['/api/project-dashboard-themes', projectId],
    enabled: !!projectId,
  });

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

  const handleTabChange = (newTab: string) => {
    if (projectId) {
      setLocation(`/projects/${projectId}/${newTab}`);
    }
  };

  const tabs = [
    { key: "overview", content: <ProjectOverviewTab /> },
    { key: "scope", content: <ProjectScopeTab /> },
    { key: "notes", content: <ProjectNotesTab /> },
    { key: "messages", content: <ProjectMessagesTab /> },
    { key: "minutes", content: <ProjectMinutesTab /> },
    { key: "tasks", content: <ProjectTasksTab /> },
    { key: "schedule", content: <ProjectScheduleTab /> },
    { key: "estimates", content: <ProjectEstimatesTab /> },
    { key: "selections", content: <ProjectSelectionsTab /> },
    { key: "rfq", content: <ProjectRFQTab /> },
    { key: "rfi", content: <ProjectRFITab /> },
    { key: "proposals", content: <ProjectProposalsTab /> },
    { key: "allowances", content: <ProjectAllowancesTab /> },
    { key: "defects", content: <ProjectDefectsTab /> },
    { key: "pos", content: <ProjectPOsTab /> },
    { key: "variations", content: <ProjectVariationsTab /> },
    { key: "bills", content: <ProjectBillsTab /> },
    { key: "client-invoices", content: <ProjectClientInvoicesTab /> },
    { key: "site-diary", content: <ProjectSiteDiaryTab /> },
    { key: "timesheets", content: <ProjectTimesheetsTab /> },
    { key: "budget", content: <ProjectBudgetTab /> },
    { key: "files", content: <ProjectFilesTab /> },
    { key: "team", content: <ProjectTeamTab /> },
  ];

  // Show loading or empty state if no project
  if (!currentProject && !project) {
    return (
      <div className="flex flex-col h-full">
        <MobileHeader showProjectSelector showNotifications />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-muted-foreground">
              Please select a project from the dropdown above
            </p>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="relative z-10 flex flex-col h-full">
        <MobileHeader showProjectSelector showNotifications />
        <ProjectTabs />
        <SwipeableView tabs={tabs} currentTab={currentTab} onTabChange={handleTabChange} />
      </div>
    </div>
  );
}

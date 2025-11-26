import { MobileHeader } from "@/components/MobileHeader";
import { ProjectTabs } from "@/components/ProjectTabs";
import { SwipeableView } from "@/components/SwipeableView";
import { useProject } from "@/contexts/ProjectContext";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Project } from "@shared/schema";
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
    { key: "allowances", content: <ProjectComingSoonTab title="Allowances" /> },
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
    <div className="flex flex-col h-full">
      <MobileHeader showProjectSelector showNotifications />
      <ProjectTabs />
      <SwipeableView tabs={tabs} currentTab={currentTab} onTabChange={handleTabChange} />
    </div>
  );
}

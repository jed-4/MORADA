import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProject } from "@/contexts/ProjectContext";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { getApiBaseUrl } from "@lib/queryClient";
import { useLocation } from "wouter";
import { useProjectRoute } from "@/hooks/useProjectRoute";

export function ProjectSelector() {
  const { currentProject, setCurrentProject } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const routeParams = useProjectRoute();

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project);
    setIsOpen(false);
    
    // Keep current tab or default to 'tasks'
    const currentTab = routeParams?.tab || 'tasks';
    
    // Navigate to new project with same tab
    setLocation(`/projects/${project.id}/${currentTab}`);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 hover-elevate active-elevate-2 rounded-md px-2 py-1 -ml-2"
        data-testid="button-project-selector"
      >
        <span className="text-lg font-semibold">
          {currentProject?.name || "Select Project"}
        </span>
        <ChevronDown className="w-5 h-5 text-muted-foreground" />
      </button>

      <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} title="Select Project">
        <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleSelectProject(project)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                currentProject?.id === project.id
                  ? "bg-[#bba7db]/10 border-[#bba7db]"
                  : "bg-card hover-elevate active-elevate-2"
              }`}
              data-testid={`project-option-${project.id}`}
            >
              <div className="font-semibold">{project.name}</div>
              {project.address && (
                <div className="text-sm text-muted-foreground mt-0.5">
                  {project.address}
                </div>
              )}
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

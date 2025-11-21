import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProject } from "@/contexts/ProjectContext";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
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
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm font-medium hover-elevate active-elevate-2 rounded-md px-2 py-1"
        data-testid="button-project-selector"
      >
        <span className="truncate max-w-[180px]">
          {currentProject?.name || "Select Project"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-card border rounded-md shadow-lg z-50 min-w-[200px]" data-testid="project-dropdown">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleSelectProject(project)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent/10 ${
                currentProject?.id === project.id
                  ? "bg-[#bba7db]/10 text-foreground"
                  : "text-foreground"
              }`}
              data-testid={`project-option-${project.id}`}
            >
              {project.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

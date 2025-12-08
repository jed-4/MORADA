import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Project } from "@shared/schema";

type ProjectProviderProps = {
  children: ReactNode;
};

type ProjectProviderState = {
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  isProjectLoading: boolean;
};

const initialState: ProjectProviderState = {
  currentProject: null,
  setCurrentProject: () => null,
  isProjectLoading: true,
};

const ProjectProviderContext = createContext<ProjectProviderState>(initialState);

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);

  // Subscribe to projects query to sync currentProject with cache
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Load saved project from localStorage when projects become available, and sync with cache
  useEffect(() => {
    if (!projects) return;
    
    // If we have a current project, sync it with the latest data from cache
    if (currentProject) {
      const updatedProject = projects.find(p => p.id === currentProject.id);
      if (updatedProject) {
        // Only update if data actually changed to avoid infinite loops
        const hasChanged = 
          updatedProject.currentSystemPhase !== currentProject.currentSystemPhase ||
          updatedProject.status !== currentProject.status ||
          updatedProject.name !== currentProject.name;
        
        if (hasChanged) {
          setCurrentProject(updatedProject);
        }
      }
    } else {
      // No current project - try to load from localStorage
      const savedProjectId = localStorage.getItem("currentProjectId");
      if (savedProjectId) {
        const savedProject = projects.find(p => p.id === savedProjectId);
        if (savedProject) {
          setCurrentProject(savedProject);
        }
      }
    }
    
    setIsProjectLoading(false);
  }, [projects, currentProject?.id]);

  // Save project to localStorage when it changes
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem("currentProjectId", currentProject.id);
    } else {
      localStorage.removeItem("currentProjectId");
    }
  }, [currentProject]);

  const value: ProjectProviderState = {
    currentProject,
    setCurrentProject: (project: Project | null) => {
      setCurrentProject(project);
    },
    isProjectLoading,
  };

  return (
    <ProjectProviderContext.Provider value={value}>
      {children}
    </ProjectProviderContext.Provider>
  );
}

export const useProject = () => {
  const context = useContext(ProjectProviderContext);

  if (context === undefined) {
    throw new Error("useProject must be used within a ProjectProvider");
  }

  return context;
};
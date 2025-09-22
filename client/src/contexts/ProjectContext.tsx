import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  // Load saved project from localStorage on mount
  useEffect(() => {
    const savedProjectId = localStorage.getItem("currentProjectId");
    if (savedProjectId) {
      // We'll fetch the project details when we have the projects list
      setIsProjectLoading(false);
    } else {
      setIsProjectLoading(false);
    }
  }, []);

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
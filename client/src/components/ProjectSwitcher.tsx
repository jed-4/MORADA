import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  ChevronDown, 
  Search, 
  Plus, 
  ArrowRight,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProject } from "@/contexts/ProjectContext";
import { ProjectIcon } from "./ProjectIcon";
import CreateProjectDialog from "./CreateProjectDialog";
import { Project } from "@shared/schema";

const RECENT_PROJECTS_KEY = "recentProjectIds";
const SELECTED_PHASE_KEY = "selectedProjectPhase";
const MAX_RECENT = 5;

type ProjectPhase = "lead" | "pre_construction" | "construction" | "post_construction";

const phases: { id: ProjectPhase; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "pre_construction", label: "Pre-Con" },
  { id: "construction", label: "Construction" },
  { id: "post_construction", label: "Post-Con" },
];

interface ProjectSwitcherProps {
  compact?: boolean;
}

export function ProjectSwitcher({ compact = false }: ProjectSwitcherProps) {
  const [location, navigate] = useLocation();
  const { currentProject, setCurrentProject } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SELECTED_PHASE_KEY);
      const index = saved ? parseInt(saved, 10) : 2;
      return index >= 0 && index < phases.length ? index : 2;
    } catch {
      return 2;
    }
  });
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_PROJECTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const activeProjects = useMemo(() => 
    projects.filter(p => !p.isArchived), 
    [projects]
  );

  const selectedPhase = phases[selectedPhaseIndex];

  const phaseProjects = useMemo(() => {
    return activeProjects.filter(p => 
      p.currentSystemPhase === selectedPhase.id || 
      (!p.currentSystemPhase && selectedPhase.id === "construction")
    );
  }, [activeProjects, selectedPhase.id]);

  const handlePrevPhase = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newIndex = selectedPhaseIndex > 0 ? selectedPhaseIndex - 1 : phases.length - 1;
    setSelectedPhaseIndex(newIndex);
    localStorage.setItem(SELECTED_PHASE_KEY, String(newIndex));
  };

  const handleNextPhase = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newIndex = selectedPhaseIndex < phases.length - 1 ? selectedPhaseIndex + 1 : 0;
    setSelectedPhaseIndex(newIndex);
    localStorage.setItem(SELECTED_PHASE_KEY, String(newIndex));
  };

  // Sync phase with current project
  useEffect(() => {
    if (currentProject) {
      const projectPhase = currentProject.currentSystemPhase || "construction";
      const phaseIndex = phases.findIndex(p => p.id === projectPhase);
      if (phaseIndex !== -1 && phaseIndex !== selectedPhaseIndex) {
        setSelectedPhaseIndex(phaseIndex);
        localStorage.setItem(SELECTED_PHASE_KEY, String(phaseIndex));
      }
    }
  }, [currentProject?.id, currentProject?.currentSystemPhase]);

  // Track recent projects
  useEffect(() => {
    if (currentProject && !recentProjectIds.includes(currentProject.id)) {
      const updated = [currentProject.id, ...recentProjectIds].slice(0, MAX_RECENT);
      setRecentProjectIds(updated);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    } else if (currentProject && recentProjectIds[0] !== currentProject.id) {
      const filtered = recentProjectIds.filter(id => id !== currentProject.id);
      const updated = [currentProject.id, ...filtered].slice(0, MAX_RECENT);
      setRecentProjectIds(updated);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
    }
  }, [currentProject?.id]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      // Always include current project in the list, even if it's in a different phase
      if (currentProject && !phaseProjects.some(p => p.id === currentProject.id)) {
        const currentFromActive = activeProjects.find(p => p.id === currentProject.id);
        if (currentFromActive) {
          return [currentFromActive, ...phaseProjects];
        }
      }
      return phaseProjects;
    }
    const query = searchQuery.toLowerCase();
    return activeProjects.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
  }, [searchQuery, phaseProjects, activeProjects, currentProject]);

  const handleProjectSelect = (project: Project) => {
    setCurrentProject(project);
    setIsOpen(false);
    setSearchQuery("");
    
    if (project.isBusiness) {
      navigate('/business');
    } else {
      navigate(`/projects/${project.id}`);
    }
  };

  const handleViewAllProjects = () => {
    setIsOpen(false);
    setSearchQuery("");
    navigate('/business/projects');
  };

  const handleCreateProject = () => {
    setIsOpen(false);
    setIsCreateProjectOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-0.5 w-full">
        <div className="text-[10px] text-muted-foreground text-center font-medium">
          {selectedPhase.label}
        </div>
        
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrevPhase}
            className="h-7 w-7 flex-shrink-0"
            data-testid="button-prev-phase"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                className={`flex-1 justify-between h-auto hover-elevate min-w-0 ${
                  compact ? "py-1 px-2" : "py-1.5 px-2"
                }`}
                data-testid="button-project-switcher"
                disabled={isLoading}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {currentProject ? (
                    <>
                      <ProjectIcon 
                        icon={currentProject.icon} 
                        color={currentProject.color} 
                        className="w-4 h-4 flex-shrink-0" 
                      />
                      <span className="text-xs font-medium truncate max-w-[100px]">
                        {currentProject.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {isLoading ? "..." : "Select"}
                      </span>
                    </>
                  )}
                </div>
                <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            
            <PopoverContent 
              className="w-60 p-0" 
              align="center" 
              side="bottom"
              sideOffset={4}
            >
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-7 text-xs"
                    data-testid="input-project-search"
                  />
                </div>
              </div>

              <ScrollArea className="max-h-[200px]">
                <div className="p-1">
                  {filteredProjects.length === 0 && (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      {searchQuery.trim() ? "No projects found" : `No ${selectedPhase.label.toLowerCase()} projects`}
                    </div>
                  )}

                  {filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectSelect(project)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate transition-colors ${
                        currentProject?.id === project.id 
                          ? "bg-primary/10 text-primary" 
                          : ""
                      }`}
                      data-testid={`project-option-${project.id}`}
                    >
                      <ProjectIcon 
                        icon={project.icon} 
                        color={project.color} 
                        className="w-3.5 h-3.5 flex-shrink-0" 
                      />
                      <span className={`text-xs truncate flex-1 ${
                        currentProject?.id === project.id ? "font-medium" : ""
                      }`}>
                        {project.name}
                      </span>
                      {project.isBusiness && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">
                          Biz
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t p-1 flex gap-1">
                <button
                  onClick={handleViewAllProjects}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover-elevate"
                  data-testid="button-all-projects"
                >
                  <span>All</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
                
                <button
                  onClick={handleCreateProject}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-primary hover-elevate"
                  data-testid="button-new-project-switcher"
                >
                  <Plus className="h-3 w-3" />
                  <span>New</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextPhase}
            className="h-7 w-7 flex-shrink-0"
            data-testid="button-next-phase"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CreateProjectDialog 
        open={isCreateProjectOpen} 
        onOpenChange={setIsCreateProjectOpen} 
      />
    </>
  );
}

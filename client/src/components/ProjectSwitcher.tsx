import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  ChevronDown, 
  Search, 
  ArrowRight,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Star,
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
import { Project } from "@shared/schema";

const RECENT_PROJECTS_KEY = "recentProjectIds";
const SELECTED_PHASE_KEY = "selectedProjectPhase";
const FAVORITE_PROJECTS_KEY = "sidebar_favorite_projects";
const MAX_RECENT = 5;

type ProjectPhase = "all" | "lead" | "pre_construction" | "construction" | "post_construction";

interface FavoriteProject {
  id: string;
  order: number;
}

const phases: { id: ProjectPhase; label: string }[] = [
  { id: "all", label: "All" },
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
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SELECTED_PHASE_KEY);
      const index = saved ? parseInt(saved, 10) : 0;
      return index >= 0 && index < phases.length ? index : 0;
    } catch {
      return 0;
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
  const [favoriteProjects, setFavoriteProjects] = useState<FavoriteProject[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITE_PROJECTS_KEY);
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
    if (selectedPhase.id === "all") return activeProjects;
    return activeProjects.filter(p => 
      p.currentSystemPhase === selectedPhase.id || 
      (!p.currentSystemPhase && selectedPhase.id === "construction")
    );
  }, [activeProjects, selectedPhase.id]);

  const groupedByPhase = useMemo(() => {
    const groups: { phase: typeof phases[0]; projects: Project[] }[] = [];
    for (const phase of phases) {
      if (phase.id === "all") continue;
      const matching = activeProjects.filter(p =>
        p.currentSystemPhase === phase.id ||
        (!p.currentSystemPhase && phase.id === "construction")
      );
      if (matching.length > 0) {
        groups.push({ phase, projects: matching });
      }
    }
    return groups;
  }, [activeProjects]);

  const handlePrevPhase = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const newIndex = selectedPhaseIndex > 0 ? selectedPhaseIndex - 1 : phases.length - 1;
    setSelectedPhaseIndex(newIndex);
    localStorage.setItem(SELECTED_PHASE_KEY, String(newIndex));
  };

  const handleNextPhase = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const newIndex = selectedPhaseIndex < phases.length - 1 ? selectedPhaseIndex + 1 : 0;
    setSelectedPhaseIndex(newIndex);
    localStorage.setItem(SELECTED_PHASE_KEY, String(newIndex));
  };

  const isLocalUpdateRef = useRef(false);

  useEffect(() => {
    const newValue = JSON.stringify(favoriteProjects);
    const currentValue = localStorage.getItem(FAVORITE_PROJECTS_KEY);
    
    if (newValue !== currentValue) {
      isLocalUpdateRef.current = true;
      localStorage.setItem(FAVORITE_PROJECTS_KEY, newValue);
      window.dispatchEvent(new StorageEvent('storage', {
        key: FAVORITE_PROJECTS_KEY,
        newValue
      }));
      setTimeout(() => { isLocalUpdateRef.current = false; }, 0);
    }
  }, [favoriteProjects]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (isLocalUpdateRef.current) return;
      
      if (e.key === FAVORITE_PROJECTS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (JSON.stringify(parsed) !== JSON.stringify(favoriteProjects)) {
            setFavoriteProjects(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [favoriteProjects]);

  useEffect(() => {
    if (currentProject) {
      const projectPhase = currentProject.currentSystemPhase || "construction";
      const phaseIndex = phases.findIndex(p => p.id === projectPhase);
      if (phaseIndex !== -1 && phaseIndex !== selectedPhaseIndex && selectedPhaseIndex !== 0) {
        setSelectedPhaseIndex(phaseIndex);
        localStorage.setItem(SELECTED_PHASE_KEY, String(phaseIndex));
      }
    }
  }, [currentProject?.id, currentProject?.currentSystemPhase]);

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

  const toggleFavoriteProject = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFavoriteProjects(prev => {
      const existingIndex = prev.findIndex(p => p.id === projectId);
      if (existingIndex >= 0) {
        return prev.filter(p => p.id !== projectId);
      }
      return [...prev, { id: projectId, order: prev.length }];
    });
  }, []);

  const isProjectFavorite = useCallback((projectId: string) => {
    return favoriteProjects.some(p => p.id === projectId);
  }, [favoriteProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return phaseProjects;
    }
    const query = searchQuery.toLowerCase();
    return activeProjects.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
  }, [searchQuery, phaseProjects, activeProjects]);

  const searchFilteredGrouped = useMemo(() => {
    if (!searchQuery.trim()) return groupedByPhase;
    const query = searchQuery.toLowerCase();
    return groupedByPhase
      .map(g => ({
        ...g,
        projects: g.projects.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        ),
      }))
      .filter(g => g.projects.length > 0);
  }, [searchQuery, groupedByPhase]);

  const handleProjectSelect = (project: Project) => {
    setIsOpen(false);
    setSearchQuery("");
    
    requestAnimationFrame(() => {
      setCurrentProject(project);
      if (project.isBusiness) {
        navigate('/business');
      } else {
        navigate(`/projects/${project.id}`);
      }
    });
  };

  const handleViewAllProjects = () => {
    setIsOpen(false);
    setSearchQuery("");
    navigate('/business/projects');
  };

  const renderProjectRow = (project: Project) => {
    const isFavorite = isProjectFavorite(project.id);
    return (
      <div 
        key={project.id}
        className="group flex items-center"
      >
        <button
          onClick={() => handleProjectSelect(project)}
          className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate transition-colors ${
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
        <button
          onClick={(e) => toggleFavoriteProject(project.id, e)}
          className={`p-1 rounded transition-opacity ${
            isFavorite 
              ? "text-primary opacity-100" 
              : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary"
          }`}
          data-testid={`button-favorite-project-${project.id}`}
        >
          <Star className={`h-3 w-3 ${isFavorite ? "fill-current" : ""}`} />
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-1 w-full">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              className={`w-full justify-between h-auto hover-elevate ${
                compact ? "py-1 px-2" : "py-1.5 px-2"
              }`}
              data-testid="button-project-switcher"
              disabled={isLoading}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {currentProject ? (
                  <>
                    <ProjectIcon 
                      icon={currentProject.icon} 
                      color={currentProject.color} 
                      className="w-4 h-4 flex-shrink-0" 
                    />
                    <span className="text-xs font-medium truncate">
                      {currentProject.name}
                    </span>
                  </>
                ) : (
                  <>
                    <FolderOpen className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {isLoading ? "..." : "Select Project"}
                    </span>
                  </>
                )}
              </div>
              <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground ml-1" />
            </Button>
          </PopoverTrigger>
          
          <PopoverContent 
            className="w-64 p-0" 
            align="start" 
            side="bottom"
            sideOffset={4}
          >
            <div className="flex items-center justify-center gap-1 px-2 py-1.5 border-b">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevPhase}
                className="h-5 w-5 flex-shrink-0"
                data-testid="button-prev-phase"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="text-[10px] text-muted-foreground font-medium min-w-[70px] text-center">
                {selectedPhase.label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextPhase}
                className="h-5 w-5 flex-shrink-0"
                data-testid="button-next-phase"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>

            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search all projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-7 text-xs"
                  data-testid="input-project-search"
                />
              </div>
            </div>

            <ScrollArea className="max-h-[300px]">
              <div className="p-1">
                {selectedPhase.id === "all" ? (
                  <>
                    {searchFilteredGrouped.length === 0 && (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        {searchQuery.trim() ? "No projects found" : "No active projects"}
                      </div>
                    )}
                    {searchFilteredGrouped.map((group) => (
                      <div key={group.phase.id}>
                        <div className="px-2 pt-2 pb-1">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.phase.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            ({group.projects.length})
                          </span>
                        </div>
                        {group.projects.map(renderProjectRow)}
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {filteredProjects.length === 0 && (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        {searchQuery.trim() ? "No projects found" : `No ${selectedPhase.label.toLowerCase()} projects`}
                      </div>
                    )}
                    {filteredProjects.map(renderProjectRow)}
                  </>
                )}
              </div>
            </ScrollArea>

            <div className="border-t p-1">
              <button
                onClick={handleViewAllProjects}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover-elevate"
                data-testid="button-all-projects"
              >
                <span>All Projects</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}

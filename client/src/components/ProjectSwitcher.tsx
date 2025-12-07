import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  ChevronDown, 
  Search, 
  Plus, 
  ArrowRight,
  Building2,
  FolderOpen
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
const MAX_RECENT = 5;

export function ProjectSwitcher() {
  const [location, navigate] = useLocation();
  const { currentProject, setCurrentProject } = useProject();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
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

  const recentProjects = useMemo(() => {
    return recentProjectIds
      .map(id => activeProjects.find(p => p.id === id))
      .filter((p): p is Project => p !== undefined)
      .slice(0, MAX_RECENT);
  }, [recentProjectIds, activeProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return activeProjects.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    );
  }, [searchQuery, activeProjects]);

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

  const displayProjects = searchQuery.trim() ? filteredProjects : recentProjects;

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between h-auto py-2 px-3 hover-elevate"
            data-testid="button-project-switcher"
            disabled={isLoading}
          >
            <div className="flex items-center gap-2 min-w-0">
              {currentProject ? (
                <>
                  <ProjectIcon 
                    icon={currentProject.icon} 
                    color={currentProject.color} 
                    className="w-5 h-5 flex-shrink-0" 
                  />
                  <div className="flex flex-col items-start min-w-0">
                    <span className="font-semibold text-sm truncate max-w-[140px]">
                      {currentProject.name}
                    </span>
                    {currentProject.isBusiness && (
                      <span className="text-xs text-muted-foreground">Business</span>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <FolderOpen className="w-5 h-5 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {isLoading ? "Loading..." : "Select Project"}
                  </span>
                </>
              )}
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent 
          className="w-72 p-0" 
          align="start" 
          side="bottom"
          sideOffset={4}
        >
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
                data-testid="input-project-search"
                autoFocus
              />
            </div>
          </div>

          <ScrollArea className="max-h-[280px]">
            <div className="p-1">
              {!searchQuery.trim() && recentProjects.length > 0 && (
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Recent
                </div>
              )}
              
              {searchQuery.trim() && filteredProjects.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No projects found
                </div>
              )}

              {displayProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleProjectSelect(project)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-md text-left hover-elevate transition-colors ${
                    currentProject?.id === project.id 
                      ? "bg-primary/10 text-primary" 
                      : ""
                  }`}
                  data-testid={`project-option-${project.id}`}
                >
                  <ProjectIcon 
                    icon={project.icon} 
                    color={project.color} 
                    className="w-4 h-4 flex-shrink-0" 
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm truncate ${
                        currentProject?.id === project.id ? "font-semibold" : "font-medium"
                      }`}>
                        {project.name}
                      </span>
                      {project.isBusiness && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                          Business
                        </Badge>
                      )}
                    </div>
                  </div>
                  {currentProject?.id === project.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t p-1">
            <button
              onClick={handleViewAllProjects}
              className="w-full flex items-center justify-between px-2 py-2 rounded-md text-sm text-muted-foreground hover-elevate"
              data-testid="button-all-projects"
            >
              <span>All Projects</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            
            <button
              onClick={handleCreateProject}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm font-medium text-primary hover-elevate"
              data-testid="button-new-project-switcher"
            >
              <Plus className="h-4 w-4" />
              <span>New Project</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <CreateProjectDialog 
        open={isCreateProjectOpen} 
        onOpenChange={setIsCreateProjectOpen} 
      />
    </>
  );
}

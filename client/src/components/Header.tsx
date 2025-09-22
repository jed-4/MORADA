import { ChevronDown, Calendar, Search, User, Settings, LogOut, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { Project } from "@shared/schema";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const { currentProject, setCurrentProject } = useProject();
  
  // Fetch projects from API
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Set first project as current if none selected and projects are available
  useEffect(() => {
    if (!currentProject && projects.length > 0) {
      const savedProjectId = localStorage.getItem("currentProjectId");
      if (savedProjectId) {
        const savedProject = projects.find(p => p.id === savedProjectId);
        if (savedProject) {
          setCurrentProject(savedProject);
        } else {
          // Fallback to first project if saved project not found
          setCurrentProject(projects[0]);
        }
      } else {
        // Set first project as default
        setCurrentProject(projects[0]);
      }
    }
  }, [projects, currentProject, setCurrentProject]);

  const handleProjectSelect = (project: Project) => {
    setCurrentProject(project);
    
    // Navigate to appropriate page based on project type
    if (project.isBusiness) {
      navigate('/business');
    } else {
      navigate('/');
    }
    console.log(`Selected project: ${project.name} (${project.id})`);
  };

  const handleCreateProject = () => {
    setIsCreateProjectOpen(true);
  };
  
  return (
    <header className="flex items-center justify-between p-4 border-b bg-background">
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        
        <div className="flex items-center gap-2">
          {/* Projects Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-projects-dropdown" disabled={projectsLoading}>
                {currentProject ? currentProject.name : (projectsLoading ? "Loading..." : "Select Project")} 
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Projects</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projectsLoading ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">Loading projects...</span>
                </DropdownMenuItem>
              ) : projects.length === 0 ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground">No projects found</span>
                </DropdownMenuItem>
              ) : (
                projects.map((project) => (
                  <DropdownMenuItem 
                    key={project.id} 
                    data-testid={`project-${project.id}`}
                    onClick={() => handleProjectSelect(project)}
                    className={currentProject?.id === project.id ? "bg-accent" : ""}
                  >
                    <div className="flex flex-col w-full">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{project.name}</span>
                        {project.isBusiness && (
                          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Business
                          </Badge>
                        )}
                        {currentProject?.id === project.id && (
                          <Badge variant="outline" className="text-xs ml-auto">
                            Current
                          </Badge>
                        )}
                      </div>
                      {project.description && (
                        <span className="text-sm text-muted-foreground truncate">{project.description}</span>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="button-new-project" onClick={handleCreateProject}>
                <Plus className="h-4 w-4 mr-2" />
                Create New Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* All Items Dropdown - Coming Soon */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-all-items-dropdown">
                All Items <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>Recent Items</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <span className="text-muted-foreground">No recent items yet</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="button-view-all-items">
                <Search className="h-4 w-4 mr-2" />
                View All Items
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Calendar Button */}
          <Button variant="outline" size="icon" data-testid="button-calendar">
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        
        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" alt="User" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>John Doe</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menu-settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
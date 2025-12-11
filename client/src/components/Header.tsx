import { Calendar, User, Settings, LogOut, Building2, Plus, FileText, CheckSquare, Folder, Palette, ChevronDown, Home, MessageSquare, Clock, Calculator, FileBarChart, FileSearch, HelpCircle, File, DollarSign, Receipt, CreditCard, BookOpen, Timer, PiggyBank, FolderOpen, Users, ClipboardList, Sun, Moon, Kanban, Search, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CreateProjectDialog from "./CreateProjectDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ThemeToggle from "./ThemeToggle";
import { TimeClockWidget } from "./TimeClockWidget";
import { UserCalendarDialog } from "./UserCalendarDialog";
import { MessagesDropdown } from "./MessagesDropdown";
import { NotificationBell } from "./NotificationBell";
import { ProjectIcon } from "./ProjectIcon";
import { useProject } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Project, Company } from "@shared/schema";

const SELECTED_PHASE_KEY = "selectedProjectPhase";
const FAVORITE_PROJECTS_KEY = "sidebar_favorite_projects";

type ProjectPhase = "lead" | "pre_construction" | "construction" | "post_construction";

interface FavoriteProject {
  id: string;
  order: number;
}

const phases: { id: ProjectPhase; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "pre_construction", label: "Pre-Con" },
  { id: "construction", label: "Construction" },
  { id: "post_construction", label: "Post-Con" },
];

export default function Header() {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SELECTED_PHASE_KEY);
      const index = saved ? parseInt(saved, 10) : 2;
      return index >= 0 && index < phases.length ? index : 2;
    } catch {
      return 2;
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
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { currentProject, setCurrentProject } = useProject();

  // Fetch company data
  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", user?.companyId],
    enabled: !!user?.companyId,
  });

  // Fetch projects for dropdown
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Filter out archived projects
  const activeProjects = useMemo(() => projects.filter(p => !p.isArchived), [projects]);

  const selectedPhase = phases[selectedPhaseIndex];

  const phaseProjects = useMemo(() => {
    return activeProjects.filter(p => 
      p.currentSystemPhase === selectedPhase.id || 
      (!p.currentSystemPhase && selectedPhase.id === "construction")
    );
  }, [activeProjects, selectedPhase.id]);

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

  const toggleFavoriteProject = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFavoriteProjects(prev => {
      const existingIndex = prev.findIndex(p => p.id === projectId);
      let updated: FavoriteProject[];
      if (existingIndex >= 0) {
        updated = prev.filter(p => p.id !== projectId);
      } else {
        updated = [...prev, { id: projectId, order: prev.length }];
      }
      localStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new StorageEvent('storage', {
        key: FAVORITE_PROJECTS_KEY,
        newValue: JSON.stringify(updated)
      }));
      return updated;
    });
  }, []);

  const isProjectFavorite = useCallback((projectId: string) => {
    return favoriteProjects.some(p => p.id === projectId);
  }, [favoriteProjects]);

  // Listen for favorites changes from sidebar/other components
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
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

  // Sync phase with current project when it changes
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

  // Prioritize: company nickname (Display Name) > company name > fallback
  const companyDisplayName = company?.nickname || company?.name || "BuildPro";

  // Initialize dark mode state on mount
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  // Helper to get user initials
  const getUserInitials = () => {
    if (!user) return "U";
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) return firstName.substring(0, 2).toUpperCase();
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return "U";
  };

  // Helper to get user full name
  const getUserName = () => {
    if (!user) return "User";
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) return firstName;
    return user.email || "User";
  };

  const handleLogout = () => {
    logout();
  };

  const handleNewNote = () => {
    navigate('/notes');
  };

  const handleNewTask = () => {
    navigate('/tasks');
  };

  const handleNewProject = () => {
    setIsCreateProjectOpen(true);
  };

  const handleNewSelection = () => {
    navigate('/selections');
  };

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(document.documentElement.classList.contains('dark'));
  };
  
  return (
    <header className="flex items-center justify-between px-2 py-1 border-b bg-background dark:bg-gray-950 sticky top-0 z-50">
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="flex items-center justify-center w-6 h-6 bg-primary rounded" data-testid="company-logo">
          <Building2 className="h-3.5 w-3.5 text-primary-foreground" />
        </div>

        {/* Business Name Button */}
        <button 
          onClick={() => navigate('/business')} 
          className="h-7 px-3 rounded-md bg-muted/60 hover-elevate active-elevate-2 text-sm font-semibold flex items-center"
          data-testid="business-name-link"
        >
          {companyDisplayName}
        </button>

        {/* Projects Dropdown with Phase Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-header-projects"
              title="Projects"
            >
              <Kanban className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 p-0">
            {/* Phase selector row: [<] Phase [>] */}
            <div className="flex items-center justify-center gap-1 px-2 py-1.5 border-b">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevPhase}
                className="h-5 w-5 flex-shrink-0"
                data-testid="button-header-prev-phase"
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
                data-testid="button-header-next-phase"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>

            {/* Search input */}
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search all projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-7 text-xs"
                  data-testid="input-header-project-search"
                />
              </div>
            </div>

            {/* Project list */}
            <ScrollArea className="max-h-[220px]">
              <div className="p-1">
                {filteredProjects.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    {searchQuery.trim() ? "No projects found" : `No ${selectedPhase.label.toLowerCase()} projects`}
                  </div>
                ) : (
                  filteredProjects.map((project) => {
                    const isFavorite = isProjectFavorite(project.id);
                    return (
                      <div key={project.id} className="group flex items-center">
                        <button
                          onClick={() => {
                            setCurrentProject(project);
                            setSearchQuery("");
                            if (project.isBusiness) {
                              navigate('/business');
                            } else {
                              navigate(`/projects/${project.id}`);
                            }
                          }}
                          className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate transition-colors ${
                            currentProject?.id === project.id 
                              ? "bg-primary/10 text-primary" 
                              : ""
                          }`}
                          data-testid={`header-project-option-${project.id}`}
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
                          data-testid={`button-header-favorite-project-${project.id}`}
                        >
                          <Star className={`h-3 w-3 ${isFavorite ? "fill-current" : ""}`} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Footer actions */}
            <div className="border-t p-1">
              <DropdownMenuItem onClick={() => navigate('/business/projects')} className="text-xs">
                <Kanban className="h-3.5 w-3.5 mr-2" />
                Projects Board
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsCreateProjectOpen(true)} className="text-xs">
                <Plus className="h-3.5 w-3.5 mr-2" />
                Create New Project
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Spacer */}
      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {/* Global Search Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => {
            // TODO: Open global search modal
          }}
          data-testid="button-global-search"
          className="h-7 w-7"
          title="Search (⌘K)"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>

        {/* Contacts Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate("/contacts")}
          data-testid="button-contacts"
          className="h-7 w-7"
        >
          <Users className="h-3.5 w-3.5" />
        </Button>

        {/* Calendar Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsCalendarOpen(true)}
          data-testid="button-calendar"
          className="h-7 w-7"
        >
          <Calendar className="h-3.5 w-3.5" />
        </Button>

        {/* Messages Dropdown */}
        <MessagesDropdown />

        {/* Notifications Bell */}
        <NotificationBell />

        {/* Time Clock Widget */}
        <TimeClockWidget />

        {/* Dark Mode Toggle */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleDarkMode}
          data-testid="button-dark-mode"
          className="h-7 w-7"
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>

        {/* New Button with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" data-testid="button-new" className="h-7 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Create New</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleNewNote} data-testid="menu-new-note">
              <FileText className="h-4 w-4 mr-2" />
              Note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleNewTask} data-testid="menu-new-task">
              <CheckSquare className="h-4 w-4 mr-2" />
              Task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleNewProject} data-testid="menu-new-project">
              <Folder className="h-4 w-4 mr-2" />
              Project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleNewSelection} data-testid="menu-new-selection">
              <Palette className="h-4 w-4 mr-2" />
              Selection
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-7 w-7 rounded-full" data-testid="button-user-menu">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.profileImageUrl || ""} alt={getUserName()} />
                <AvatarFallback className="text-xs">{getUserInitials()}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel data-testid="text-user-name">{getUserName()}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")} data-testid="menu-profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Create Project Dialog */}
      <CreateProjectDialog 
        open={isCreateProjectOpen} 
        onOpenChange={setIsCreateProjectOpen} 
      />

      {/* User Calendar Dialog */}
      <UserCalendarDialog 
        open={isCalendarOpen} 
        onOpenChange={setIsCalendarOpen} 
      />
    </header>
  );
}
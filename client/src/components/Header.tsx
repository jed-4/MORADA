import { Calendar, User, Settings, LogOut, Building2, Plus, FileText, CheckSquare, Folder, Palette, ChevronDown, Home, MessageSquare, Clock, Calculator, FileBarChart, FileSearch, HelpCircle, File, DollarSign, Receipt, CreditCard, BookOpen, Timer, PiggyBank, FolderOpen, Users, ClipboardList, Kanban, Search, ChevronLeft, ChevronRight, Star, GanttChart, HardDrive, Clipboard, LayoutDashboard, Check } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CreateProjectDialog from "./CreateProjectDialog";
import TaskEditModal from "./TaskEditModal";
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
import { GlobalSearch } from "./GlobalSearch";
import { useProject } from "@/contexts/ProjectContext";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useToolbarVisible } from "@/hooks/useToolbarVisible";
import type { Project, Company } from "@shared/schema";

const SELECTED_PHASE_KEY = "selectedProjectPhase_v2";
const FAVORITE_PROJECTS_KEY = "sidebar_favorite_projects";

type ProjectPhase = "all" | "lead" | "pre_construction" | "construction" | "post_construction";

interface FavoriteProject {
  id: string;
  order: number;
}

const phases: { id: ProjectPhase; label: string }[] = [
  { id: "all", label: "All" },
  { id: "post_construction", label: "Post-Con" },
  { id: "construction", label: "Construction" },
  { id: "pre_construction", label: "Pre-Con" },
  { id: "lead", label: "Lead" },
];

export default function Header() {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [isProjectSearchOpen, setIsProjectSearchOpen] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SELECTED_PHASE_KEY);
      if (saved === null) return 0;
      const index = parseInt(saved, 10);
      if (index >= 0 && index < phases.length) return index;
      localStorage.removeItem(SELECTED_PHASE_KEY);
      return 0;
    } catch {
      return 0;
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
  const { toolbarVisible, toggleToolbar } = useToolbarVisible();

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
    if (currentProject && selectedPhaseIndex !== 0) {
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


  // Keyboard shortcut for global search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
    setIsTaskModalOpen(true);
  };

  const handleNewProject = () => {
    setIsCreateProjectOpen(true);
  };

  const handleNewSelection = () => {
    navigate('/selections');
  };

  
  return (
    <header className="flex items-center justify-between px-3 py-1.5 surface-panel sticky top-0 z-50 flex-shrink-0">
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="flex items-center justify-center w-6 h-6 bg-primary rounded" data-testid="company-logo">
          <Building2 className="h-3.5 w-3.5 text-primary-foreground" />
        </div>

        {/* Business Name Button with Dropdown */}
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/business')} 
            className="h-7 px-3 rounded-l-md bg-muted/60 hover-elevate active-elevate-2 text-sm font-semibold flex items-center"
            data-testid="business-name-link"
          >
            {companyDisplayName}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-7 px-1 rounded-r-md bg-muted/60 hover-elevate active-elevate-2 flex items-center justify-center border-l border-border/40"
                data-testid="button-business-dropdown"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Business</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/business')} className="text-xs">
                <Home className="h-3.5 w-3.5 mr-2" />
                Overview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/projects')} className="text-xs">
                <FolderOpen className="h-3.5 w-3.5 mr-2" />
                Projects
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/tasks')} className="text-xs">
                <CheckSquare className="h-3.5 w-3.5 mr-2" />
                Tasks
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/calendar')} className="text-xs">
                <Calendar className="h-3.5 w-3.5 mr-2" />
                Calendar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/schedule')} className="text-xs">
                <GanttChart className="h-3.5 w-3.5 mr-2" />
                Schedule
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/files')} className="text-xs">
                <HardDrive className="h-3.5 w-3.5 mr-2" />
                Files
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/expenses')} className="text-xs">
                <CreditCard className="h-3.5 w-3.5 mr-2" />
                Expenses
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/timesheets')} className="text-xs">
                <Timer className="h-3.5 w-3.5 mr-2" />
                Timesheets
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/messages')} className="text-xs">
                <MessageSquare className="h-3.5 w-3.5 mr-2" />
                Messages
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/minutes')} className="text-xs">
                <ClipboardList className="h-3.5 w-3.5 mr-2" />
                Minutes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/notes')} className="text-xs">
                <FileText className="h-3.5 w-3.5 mr-2" />
                Notes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/bills')} className="text-xs">
                <Receipt className="h-3.5 w-3.5 mr-2" />
                Bills
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business/leave')} className="text-xs">
                <Calendar className="h-3.5 w-3.5 mr-2" />
                Leave
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/business-team')} className="text-xs">
                <Users className="h-3.5 w-3.5 mr-2" />
                Team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Projects Dropdown with Phase Selector */}
        <DropdownMenu open={isProjectDropdownOpen} onOpenChange={setIsProjectDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-header-projects"
              title="Projects"
            >
              <Kanban className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 p-0">
            {/* Phase selector row with search toggle */}
            <div className="flex items-center px-2 py-1.5 border-b">
              <div className="flex-1 flex items-center justify-center gap-1">
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
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setIsProjectSearchOpen(!isProjectSearchOpen);
                  if (!isProjectSearchOpen) {
                    setSearchQuery("");
                  }
                }}
                className={`h-5 w-5 flex-shrink-0 ${isProjectSearchOpen ? "text-primary" : ""}`}
                data-testid="button-header-project-search-toggle"
              >
                <Search className="h-3 w-3" />
              </Button>
            </div>

            {/* Collapsible search input */}
            {isProjectSearchOpen && (
              <div className="p-2 border-b">
                <Input
                  placeholder="Search all projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs"
                  autoFocus
                  data-testid="input-header-project-search"
                />
              </div>
            )}

            {/* Project list */}
            <div className="max-h-[220px] overflow-y-auto">
              <div className="p-1">
                {selectedPhase.id === "all" ? (
                  <>
                    {searchFilteredGrouped.length === 0 ? (
                      <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                        {searchQuery.trim() ? "No projects found" : "No active projects"}
                      </div>
                    ) : (
                      searchFilteredGrouped.map((group) => (
                        <div key={group.phase.id}>
                          <div className="px-2 pt-[0px] pb-[0px]">
                            <span className="text-[8px] font-medium text-muted-foreground uppercase tracking-wider leading-none">
                              {group.phase.label}
                            </span>
                            <span className="text-[8px] text-muted-foreground ml-0.5 leading-none">
                              ({group.projects.length})
                            </span>
                          </div>
                          {group.projects.map((project) => {
                            const isFavorite = isProjectFavorite(project.id);
                            return (
                              <div key={project.id} className="group flex items-center">
                                <button
                                  onClick={() => {
                                    setIsProjectDropdownOpen(false);
                                    setSearchQuery("");
                                    setCurrentProject(project);
                                    navigate(`/projects/${project.id}`);
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
                          })}
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  <>
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
                                setIsProjectDropdownOpen(false);
                                setSearchQuery("");
                                setCurrentProject(project);
                                navigate(`/projects/${project.id}`);
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
                  </>
                )}
              </div>
            </div>

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

        {/* All Items Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-header-all-items"
              title="All Items"
            >
              <Clipboard className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">All Items</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/notes')} className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-2" />
              Notes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/minutes')} className="text-xs">
              <ClipboardList className="h-3.5 w-3.5 mr-2" />
              Minutes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/bills')} className="text-xs">
              <Receipt className="h-3.5 w-3.5 mr-2" />
              Bills
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/tasks')} className="text-xs">
              <CheckSquare className="h-3.5 w-3.5 mr-2" />
              Tasks
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/timesheets')} className="text-xs">
              <Timer className="h-3.5 w-3.5 mr-2" />
              Timesheets
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/estimates')} className="text-xs">
              <FileBarChart className="h-3.5 w-3.5 mr-2" />
              Estimates
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/rfqs')} className="text-xs">
              <FileSearch className="h-3.5 w-3.5 mr-2" />
              RFQs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/rfis')} className="text-xs">
              <HelpCircle className="h-3.5 w-3.5 mr-2" />
              RFIs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/proposals')} className="text-xs">
              <File className="h-3.5 w-3.5 mr-2" />
              Proposals
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/purchase-orders')} className="text-xs">
              <Receipt className="h-3.5 w-3.5 mr-2" />
              Purchase Orders
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/variations')} className="text-xs">
              <FileText className="h-3.5 w-3.5 mr-2" />
              Variations
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/client-invoices')} className="text-xs">
              <Receipt className="h-3.5 w-3.5 mr-2" />
              Client Invoices
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Global Search Bar - Centered */}
      <div className="flex-1 flex justify-center px-4">
        <button 
          onClick={() => setIsGlobalSearchOpen(true)}
          className="flex items-center gap-2 h-7 px-3 w-full max-w-md rounded-md bg-muted/60 hover-elevate active-elevate-2 text-muted-foreground text-xs"
          data-testid="button-global-search"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search...</span>
          <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      </div>
      <div className="flex items-center gap-1">
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
        <ThemeToggle />

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
            <DropdownMenuItem onClick={toggleToolbar} data-testid="menu-toggle-toolbar">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              <span className="flex-1">Show toolbar</span>
              {toolbarVisible && <Check className="h-3.5 w-3.5 ml-2 text-muted-foreground" />}
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
      {/* Global Search Dialog */}
      <GlobalSearch 
        open={isGlobalSearchOpen} 
        onOpenChange={setIsGlobalSearchOpen} 
      />
      {/* Task Creation Modal */}
      <TaskEditModal
        open={isTaskModalOpen}
        onOpenChange={setIsTaskModalOpen}
        defaultScope="personal"
      />
    </header>
  );
}
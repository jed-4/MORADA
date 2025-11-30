import { Calendar, User, Settings, LogOut, Building2, LayoutDashboard, Plus, FileText, CheckSquare, Folder, Palette, ChevronDown, Home, Clipboard, MessageSquare, Clock, Calculator, FileBarChart, FileSearch, HelpCircle, File, DollarSign, Receipt, CreditCard, BookOpen, Timer, PiggyBank, FolderOpen, Users, ClipboardList, Sun, Moon, Kanban } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { Project, CompanySettings, Company } from "@shared/schema";

// Project sections base configuration (from AppSidebar)
const projectItemsBase = [
  { title: "Overview", baseUrl: "", icon: Home },
  { title: "Messages", baseUrl: "/messages", icon: MessageSquare },
  { title: "Notes", baseUrl: "/notes", icon: FileText },
  { title: "Minutes", baseUrl: "/minutes", icon: ClipboardList },
  { title: "Schedule", baseUrl: "/schedule", icon: Clock },
  { title: "Tasks", baseUrl: "/tasks", icon: CheckSquare },
  { title: "Take off", baseUrl: "/takeoff", icon: Calculator },
  { title: "Estimates", baseUrl: "/estimates", icon: FileBarChart },
  { title: "Request For Quotes", baseUrl: "/rfqs", icon: FileSearch },
  { title: "Request For Information", baseUrl: "/rfis", icon: HelpCircle },
  { title: "Proposals", baseUrl: "/proposals", icon: File },
  { title: "Selections", baseUrl: "/selections", icon: CheckSquare },
  { title: "Allowances", baseUrl: "/allowances", icon: DollarSign },
  { title: "Purchase Orders", baseUrl: "/purchase-orders", icon: Receipt },
  { title: "Variations", baseUrl: "/variations", icon: FileText },
  { title: "Bills", baseUrl: "/bills", icon: CreditCard },
  { title: "Client Invoices", baseUrl: "/invoices", icon: Receipt },
  { title: "Site Diary", baseUrl: "/site-diary", icon: BookOpen },
  { title: "Timesheets", baseUrl: "/timesheets", icon: Timer },
  { title: "Budget", baseUrl: "/budget", icon: PiggyBank },
  { title: "Files", baseUrl: "/files", icon: FolderOpen },
  { title: "Team", baseUrl: "/team", icon: Users },
];

// Items to exclude from All Items menu
const excludedItems = new Set([
  "Overview", "Messages", "Schedule", "Take off", 
  "Selections", "Allowances", "Budget", "Files", "Team"
]);

// Filter items for All Items dropdown
const allItemsMenuItems = projectItemsBase.filter(item => !excludedItems.has(item.title));

export default function Header() {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { currentProject, setCurrentProject } = useProject();

  // Fetch company data
  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", user?.companyId],
    enabled: !!user?.companyId,
  });

  // Fetch company settings for company name override
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Fetch projects for dropdown
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Filter out archived projects
  const activeProjects = projects.filter(p => !p.isArchived);

  // Prioritize: companySettings nickname > companySettings name > company nickname > company name > fallback
  const companyName = companySettings?.nickname || companySettings?.companyName || company?.nickname || company?.name || "BuildPro";

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
    <header className="flex items-center justify-between px-2 py-1 border-b bg-white dark:bg-gray-950 sticky top-0 z-50">
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
          {companyName}
        </button>

        {/* Projects Dropdown */}
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
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {activeProjects.length === 0 ? (
              <DropdownMenuItem disabled>
                <span className="text-muted-foreground text-xs">No active projects found</span>
              </DropdownMenuItem>
            ) : (
              activeProjects.map((project) => (
                <DropdownMenuItem 
                  key={project.id} 
                  onClick={() => {
                    setCurrentProject(project);
                    if (project.isBusiness) {
                      navigate('/business');
                    } else {
                      navigate(`/projects/${project.id}`);
                    }
                  }}
                  className={currentProject?.id === project.id ? "bg-accent" : ""}
                >
                  <div className="flex items-center gap-2 w-full">
                    <ProjectIcon 
                      icon={project.icon} 
                      color={project.color} 
                      className="w-3.5 h-3.5 flex-shrink-0" 
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate text-xs">{project.name}</span>
                        {project.isBusiness && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Business
                          </Badge>
                        )}
                      </div>
                      {project.description && (
                        <span className="text-[10px] text-muted-foreground truncate">{project.description}</span>
                      )}
                    </div>
                  </div>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/business/projects')}>
              <Kanban className="h-3.5 w-3.5 mr-2" />
              <span className="text-xs">Projects Board</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsCreateProjectOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-2" />
              <span className="text-xs">Create New Project</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dashboard Button */}
        <Button variant="ghost" size="sm" data-testid="button-dashboard" disabled className="h-7 text-xs">
          <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
          Dashboard
        </Button>

        {/* All Items Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="button-all-items" className="h-7 text-xs">
              <Clipboard className="h-3.5 w-3.5 mr-1.5" />
              All Items
              <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {allItemsMenuItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <DropdownMenuItem 
                  key={item.title}
                  onClick={() => navigate(item.baseUrl)} 
                  data-testid={`menu-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <IconComponent className="h-4 w-4 mr-2" />
                  {item.title}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1">
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
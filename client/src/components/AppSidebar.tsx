import {
  Calendar,
  Home,
  MessageSquare,
  FileText,
  CheckSquare,
  Calculator,
  FileSearch,
  HelpCircle,
  File,
  Clock,
  DollarSign,
  FileBarChart,
  Receipt,
  CreditCard,
  BookOpen,
  Timer,
  PiggyBank,
  FolderOpen,
  Users,
  LayoutTemplate,
  Settings,
  CheckCircle,
  Mail,
  UserPlus,
  Building2,
  ChevronDown,
  ChevronRight,
  Plus,
  Truck,
  Tag,
  Archive,
  AlertCircle,
  ClipboardList,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { Project, CompanySettings } from "@shared/schema";
import { useState, useEffect } from "react";
import CreateProjectDialog from "./CreateProjectDialog";
import { ProjectIcon } from "./ProjectIcon";

// Project sections base configuration
const projectItemsBase = [
  { title: "Overview", baseUrl: "", icon: Home },
  { title: "Messages", baseUrl: "/messages", icon: MessageSquare },
  { title: "Notes", baseUrl: "/notes", icon: FileText },
  { title: "Minutes", baseUrl: "/minutes", icon: ClipboardList },
  { title: "Calendar", baseUrl: "/calendar", icon: Calendar },
  { title: "Schedule", baseUrl: "/schedule", icon: Clock },
  { title: "Tasks", baseUrl: "/tasks", icon: CheckSquare },
  { title: "Take off", baseUrl: "/takeoff", icon: Calculator },
  { title: "Estimates", baseUrl: "/estimates", icon: FileBarChart },
  { title: "Request For Quotes", baseUrl: "/rfq", icon: FileSearch },
  { title: "Request For Information", baseUrl: "/rfi", icon: HelpCircle },
  { title: "Proposals", baseUrl: "/proposals", icon: File },
  { title: "Selections", baseUrl: "/selections", icon: CheckCircle },
  { title: "Allowances", baseUrl: "/allowances", icon: DollarSign },
  { title: "Defects", baseUrl: "/defects", icon: AlertCircle },
  { title: "Purchase Orders", baseUrl: "/purchase-orders", icon: Receipt },
  { title: "Variations", baseUrl: "/variations", icon: FileText },
  { title: "Bills", baseUrl: "/bills", icon: Receipt },
  { title: "Client Invoices", baseUrl: "/client-invoices", icon: Receipt },
  { title: "Site Diary", baseUrl: "/site-diary", icon: BookOpen },
  { title: "Timesheets", baseUrl: "/timesheets", icon: Timer },
  { title: "Budget", baseUrl: "/budget", icon: PiggyBank },
  { title: "Files", baseUrl: "/files", icon: FolderOpen },
  { title: "Team", baseUrl: "/team", icon: Users },
];

// Business sections
const businessItems = [
  { title: "Business Overview", url: "/business", icon: Home },
  { title: "Projects", url: "/business/projects", icon: FolderOpen },
  { title: "Expenses", url: "/business/expenses", icon: CreditCard },
  { title: "Timesheets", url: "/business/timesheets", icon: Timer },
  { title: "Messages", url: "/business/messages", icon: MessageSquare },
  { title: "Minutes", url: "/business/minutes", icon: ClipboardList },
  { title: "Sick Days & Leave", url: "/business/leave", icon: Calendar },
  { title: "Bills", url: "/bills", icon: Receipt },
  { title: "Team", url: "/business-team", icon: Users },
];

// System sections
const systemItems = [
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Cost Codes", url: "/cost-codes", icon: Tag },
  { title: "Archived Projects", url: "/archived-projects", icon: Archive },
  { title: "Emails", url: "/emails", icon: Mail },
  { title: "CRM", url: "/crm", icon: UserPlus },
];

// Settings items
const settingsItems = [
  { title: "Company Settings", url: "/settings", icon: Settings },
  { title: "User Settings", url: "/user-settings", icon: Users },
];

export function AppSidebar() {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const { currentProject, setCurrentProject } = useProject();
  const isBusinessContext = location.startsWith('/business');
  
  // Collapsible states with localStorage persistence
  const [isCompanyOpen, setIsCompanyOpen] = useState(() => {
    const saved = localStorage.getItem("sidebar-company-open");
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  const [isProjectsOpen, setIsProjectsOpen] = useState(() => {
    const saved = localStorage.getItem("sidebar-projects-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isSystemOpen, setIsSystemOpen] = useState(() => {
    const saved = localStorage.getItem("sidebar-system-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(() => {
    const saved = localStorage.getItem("sidebar-settings-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Fetch company settings
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Save collapsible states to localStorage
  useEffect(() => {
    localStorage.setItem("sidebar-company-open", JSON.stringify(isCompanyOpen));
  }, [isCompanyOpen]);

  useEffect(() => {
    localStorage.setItem("sidebar-projects-open", JSON.stringify(isProjectsOpen));
  }, [isProjectsOpen]);

  useEffect(() => {
    localStorage.setItem("sidebar-system-open", JSON.stringify(isSystemOpen));
  }, [isSystemOpen]);

  useEffect(() => {
    localStorage.setItem("sidebar-settings-open", JSON.stringify(isSettingsOpen));
  }, [isSettingsOpen]);

  // Generate project-scoped URLs
  const getProjectItems = () => {
    if (!currentProject || currentProject.isBusiness) {
      // For business projects or no project selected, use global URLs
      return projectItemsBase.map(item => ({
        ...item,
        url: item.baseUrl || "/"
      }));
    }
    
    // For regular projects, use project-scoped URLs
    return projectItemsBase.map(item => {
      return {
        ...item,
        url: item.baseUrl === "" 
          ? `/projects/${currentProject.id}` 
          : `/projects/${currentProject.id}${item.baseUrl}`
      };
    });
  };
  
  const projectItems = getProjectItems();
  
  // Fetch projects from API
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Filter out archived projects
  const activeProjects = projects.filter(p => !p.isArchived);

  // Set first project as current if none selected and projects are available
  useEffect(() => {
    if (!currentProject && activeProjects.length > 0) {
      const savedProjectId = localStorage.getItem("currentProjectId");
      if (savedProjectId) {
        const savedProject = activeProjects.find(p => p.id === savedProjectId);
        if (savedProject) {
          setCurrentProject(savedProject);
        } else {
          // Fallback to first active project if saved project not found
          setCurrentProject(activeProjects[0]);
        }
      } else {
        // Set first active project as default
        setCurrentProject(activeProjects[0]);
      }
    }
  }, [activeProjects, currentProject, setCurrentProject]);

  const handleProjectSelect = (project: Project) => {
    setCurrentProject(project);
    
    // Navigate to appropriate page based on project type
    if (project.isBusiness) {
      navigate('/business');
    } else {
      navigate(`/projects/${project.id}`);
    }
    console.log(`Selected project: ${project.name} (${project.id})`);
  };

  const handleCreateProject = () => {
    setIsCreateProjectOpen(true);
  };

  const companyName = companySettings?.companyName || "Business";
  
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">BuildPro</h2>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        {/* Company Section - Collapsible */}
        <Collapsible
          open={isCompanyOpen}
          onOpenChange={setIsCompanyOpen}
          className="group/collapsible"
        >
          <SidebarGroup className={!isCompanyOpen ? "pb-0" : ""}>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between hover-elevate active-elevate-2 p-2 rounded-md">
                <span className="font-medium">{companyName}</span>
                {isCompanyOpen ? (
                  <ChevronDown className="h-4 w-4 transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 transition-transform" />
                )}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {businessItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild
                        tooltip={item.title}
                        data-testid={`nav-business-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                        data-active={location === item.url}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* Projects Section - Collapsible */}
        <Collapsible
          open={isProjectsOpen}
          onOpenChange={setIsProjectsOpen}
          className="group/collapsible"
        >
          <SidebarGroup className={!isProjectsOpen && !isCompanyOpen ? "pt-0 pb-0" : !isProjectsOpen ? "pb-0" : ""}>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between hover-elevate active-elevate-2 p-2 rounded-md">
                <span className="font-medium">Projects</span>
                {isProjectsOpen ? (
                  <ChevronDown className="h-4 w-4 transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 transition-transform" />
                )}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <div className="px-2 pb-2">
                  {/* Projects Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" data-testid="button-projects-dropdown" disabled={projectsLoading}>
                        <div className="flex items-center gap-2">
                          {currentProject && (
                            <ProjectIcon 
                              icon={currentProject.icon} 
                              color={currentProject.color} 
                              className="w-4 h-4 flex-shrink-0" 
                            />
                          )}
                          <span className="text-sm font-medium truncate">
                            {currentProject ? currentProject.name : (projectsLoading ? "Loading..." : "Select Project")}
                          </span>
                        </div>
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64 z-[60] shadow-lg border-2 bg-background/95 backdrop-blur-sm mt-2">
                      <DropdownMenuLabel>Projects</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {projectsLoading ? (
                        <DropdownMenuItem disabled>
                          <span className="text-muted-foreground">Loading projects...</span>
                        </DropdownMenuItem>
                      ) : activeProjects.length === 0 ? (
                        <DropdownMenuItem disabled>
                          <span className="text-muted-foreground">No active projects found</span>
                        </DropdownMenuItem>
                      ) : (
                        activeProjects.map((project) => (
                          <DropdownMenuItem 
                            key={project.id} 
                            data-testid={`project-${project.id}`}
                            onClick={() => handleProjectSelect(project)}
                            className={currentProject?.id === project.id ? "bg-accent" : ""}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <ProjectIcon 
                                icon={project.icon} 
                                color={project.color} 
                                className="w-4 h-4 flex-shrink-0" 
                              />
                              <div className="flex flex-col flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium truncate">{project.name}</span>
                                  {project.isBusiness && (
                                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 flex-shrink-0">
                                      Business
                                    </Badge>
                                  )}
                                  {currentProject?.id === project.id && (
                                    <Badge variant="outline" className="text-xs ml-auto flex-shrink-0">
                                      Current
                                    </Badge>
                                  )}
                                </div>
                                {project.description && (
                                  <span className="text-sm text-muted-foreground truncate">{project.description}</span>
                                )}
                              </div>
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
                </div>
                
                <SidebarMenu>
                  {projectItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        tooltip={item.title}
                        data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                        data-active={location === item.url}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        {/* System Section - Collapsible */}
        <Collapsible
          open={isSystemOpen}
          onOpenChange={setIsSystemOpen}
          className="group/collapsible"
        >
          <SidebarGroup className={!isSystemOpen && !isProjectsOpen ? "pt-0 pb-0" : !isSystemOpen ? "pb-0" : ""}>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between hover-elevate active-elevate-2 p-2 rounded-md">
                <span className="font-medium">System</span>
                {isSystemOpen ? (
                  <ChevronDown className="h-4 w-4 transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 transition-transform" />
                )}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {systemItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild
                        tooltip={item.title}
                        data-testid={`nav-system-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                        data-active={location === item.url}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      {/* Settings Section - Collapsible */}
      <SidebarFooter className="border-t">
        <Collapsible
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          className="group/collapsible"
        >
          <SidebarGroup className={!isSettingsOpen && !isSystemOpen ? "pt-0" : ""}>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between hover-elevate active-elevate-2 p-2 rounded-md">
                <span className="font-medium">Settings</span>
                {isSettingsOpen ? (
                  <ChevronDown className="h-4 w-4 transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 transition-transform" />
                )}
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {settingsItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild
                        tooltip={item.title}
                        data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                        data-active={location === item.url}
                      >
                        <Link href={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarFooter>
      
      {/* Create Project Dialog */}
      <CreateProjectDialog 
        open={isCreateProjectOpen} 
        onOpenChange={setIsCreateProjectOpen} 
      />
    </Sidebar>
  );
}

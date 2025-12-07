import {
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
  Truck,
  HardHat,
  Tag,
  Archive,
  AlertCircle,
  ClipboardList,
  ListTree,
  User,
  ListChecks,
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { Project } from "@shared/schema";
import { useState, useEffect } from "react";
import { ProjectSwitcher } from "./ProjectSwitcher";

// Project sections base configuration
const projectItemsBase = [
  { title: "Overview", baseUrl: "", icon: Home },
  { title: "Scope", baseUrl: "/scope", icon: ListTree },
  { title: "Messages", baseUrl: "/messages", icon: MessageSquare },
  { title: "Notes", baseUrl: "/notes", icon: FileText },
  { title: "Minutes", baseUrl: "/minutes", icon: ClipboardList },
  { title: "Schedule", baseUrl: "/schedule", icon: Clock },
  { title: "Tasks", baseUrl: "/tasks", icon: CheckSquare },
  { title: "Checklists", baseUrl: "/checklists", icon: ListChecks },
  { title: "Take off", baseUrl: "/takeoff", icon: Calculator },
  { title: "Estimates", baseUrl: "/estimates", icon: FileBarChart },
  { title: "Request For Quotes", baseUrl: "/rfqs", icon: FileSearch },
  { title: "Request For Information", baseUrl: "/rfis", icon: HelpCircle },
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

// System sections
const systemItems = [
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Trades", url: "/trades", icon: HardHat },
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
  const [location] = useLocation();
  const { currentProject, setCurrentProject } = useProject();
  
  // Collapsible states with localStorage persistence
  const [isSystemOpen, setIsSystemOpen] = useState(() => {
    const saved = localStorage.getItem("sidebar-system-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(() => {
    const saved = localStorage.getItem("sidebar-settings-open");
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Save collapsible states to localStorage
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

  // Sync current project with URL when navigating to /projects/{id}
  useEffect(() => {
    if (activeProjects.length === 0) return;
    
    // Check if we're on a project-specific route
    const projectMatch = location.match(/^\/projects\/([^\/]+)/);
    if (projectMatch) {
      const urlProjectId = projectMatch[1];
      // If URL project differs from current, update context
      if (currentProject?.id !== urlProjectId) {
        const urlProject = activeProjects.find(p => p.id === urlProjectId);
        if (urlProject) {
          setCurrentProject(urlProject);
          return;
        }
      }
    }
    
    // Fallback: if no project selected, use localStorage or first project
    if (!currentProject) {
      const savedProjectId = localStorage.getItem("currentProjectId");
      if (savedProjectId) {
        const savedProject = activeProjects.find(p => p.id === savedProjectId);
        if (savedProject) {
          setCurrentProject(savedProject);
        } else {
          setCurrentProject(activeProjects[0]);
        }
      } else {
        setCurrentProject(activeProjects[0]);
      }
    }
  }, [activeProjects, currentProject, setCurrentProject, location]);
  
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2 border-b">
        {isCollapsed ? (
          <div className="flex items-center justify-center py-1">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <ProjectSwitcher />
        )}
      </SidebarHeader>
      
      <SidebarContent>
        {/* Personal Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground">
            Personal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  tooltip="My Workspace"
                  data-testid="nav-my-workspace"
                  data-active={location.startsWith("/me") || location.startsWith("/users/")}
                >
                  <Link href="/me">
                    <User className="h-4 w-4" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      My Workspace
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Project Navigation - shows current project's pages */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
            {currentProject?.name || "Project"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
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
        </SidebarGroup>

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
    </Sidebar>
  );
}

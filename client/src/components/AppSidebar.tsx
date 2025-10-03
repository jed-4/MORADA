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
  Plus,
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
} from "@/components/ui/sidebar";
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
import { Project } from "@shared/schema";
import { useState, useEffect } from "react";
import CreateProjectDialog from "./CreateProjectDialog";

// Coming soon items that should have strikeout styling
const comingSoonItems = new Set([
  "Messages", "Schedule", "Take off", 
  "Request For Quotes", "Request For Information", "Proposal", 
  "Allowances", "Purchase Orders", "Variations", 
  "Bills", "Client Invoices", "Site Diary", "Timesheets", 
  "Budget", "Files", "Team"
]);

// Project sections base configuration
const projectItemsBase = [
  { title: "Overview", baseUrl: "", icon: Home },
  { title: "Messages", baseUrl: "/messages", icon: MessageSquare },
  { title: "Notes", baseUrl: "/notes", icon: FileText },
  { title: "Calendar", baseUrl: "/calendar", icon: Calendar },
  { title: "Schedule", baseUrl: "/schedule", icon: Clock },
  { title: "Tasks", baseUrl: "/tasks", icon: CheckSquare },
  { title: "Take off", baseUrl: "/takeoff", icon: Calculator },
  { title: "Estimates", baseUrl: "/estimates", icon: FileBarChart },
  { title: "Request For Quotes", baseUrl: "/rfq", icon: FileSearch },
  { title: "Request For Information", baseUrl: "/rfi", icon: HelpCircle },
  { title: "Proposal", baseUrl: "/proposal", icon: File },
  { title: "Selections", baseUrl: "/selections", icon: CheckCircle },
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

// Coming soon business items
const comingSoonBusinessItems = new Set([
  "Templates", "Checklists", "Emails", "CRM", "Team",
  "Messages", "Sick Days & Leave"
]);

// Business sections
const businessItems = [
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Checklists", url: "/checklists", icon: CheckCircle },
  { title: "Emails", url: "/emails", icon: Mail },
  { title: "CRM", url: "/crm", icon: UserPlus },
  { title: "Team", url: "/business-team", icon: Users },
];

interface AppSidebarProps {
  sidebarWidth?: number;
}

export function AppSidebar({ sidebarWidth = 320 }: AppSidebarProps) {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const { currentProject, setCurrentProject } = useProject();
  const isBusinessContext = location.startsWith('/business');
  const showComingSoon = sidebarWidth >= 280; // Hide "coming soon" text when sidebar is narrow
  
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
    return projectItemsBase.map(item => ({
      ...item,
      url: item.baseUrl === "" 
        ? `/projects/${currentProject.id}` 
        : `/projects/${currentProject.id}${item.baseUrl}`
    }));
  };
  
  const projectItems = getProjectItems();
  
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
      navigate(`/projects/${project.id}`);
    }
    console.log(`Selected project: ${project.name} (${project.id})`);
  };

  const handleCreateProject = () => {
    setIsCreateProjectOpen(true);
  };
  
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">BuildPro</h2>
          </div>
        </div>
        
        {/* Projects Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid="button-projects-dropdown" disabled={projectsLoading}>
              <span className="text-sm font-medium">
                {currentProject ? currentProject.name : (projectsLoading ? "Loading..." : "Select Project")}
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 z-[60] shadow-lg border-2 bg-background/95 backdrop-blur-sm mt-2">
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
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Project</SidebarGroupLabel>
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
                      <span>{item.title}</span>
                      {showComingSoon && comingSoonItems.has(item.title) && (
                        <span className="text-xs text-muted-foreground/60 ml-2 group-data-[collapsible=icon]:hidden">coming soon</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Business Project</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  tooltip="Business Overview"
                  data-testid="nav-business-overview"
                  data-active={location === '/business'}
                >
                  <Link href="/business">
                    <Home className="h-4 w-4" />
                    <span>Business Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  tooltip="Expenses"
                  data-testid="nav-business-expenses"
                  data-active={location === '/business/expenses'}
                >
                  <Link href="/business/expenses">
                    <CreditCard className="h-4 w-4" />
                    <span>Expenses</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  tooltip="Timesheets"
                  data-testid="nav-business-timesheets"
                  data-active={location === '/business/timesheets'}
                >
                  <Link href="/business/timesheets">
                    <Timer className="h-4 w-4" />
                    <span>Timesheets</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  tooltip="Messages"
                  data-testid="nav-business-messages"
                  data-active={location === '/business/messages'}
                >
                  <Link href="/business/messages">
                    <MessageSquare className="h-4 w-4" />
                    <span>Messages</span>
                    {showComingSoon && comingSoonBusinessItems.has("Messages") && (
                      <span className="text-xs text-muted-foreground/60 ml-2 group-data-[collapsible=icon]:hidden">coming soon</span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  tooltip="Sick Days & Leave"
                  data-testid="nav-business-leave"
                  data-active={location === '/business/leave'}
                >
                  <Link href="/business/leave">
                    <Calendar className="h-4 w-4" />
                    <span>Sick Days & Leave</span>
                    {showComingSoon && comingSoonBusinessItems.has("Sick Days & Leave") && (
                      <span className="text-xs text-muted-foreground/60 ml-2 group-data-[collapsible=icon]:hidden">coming soon</span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
                      <span>{item.title}</span>
                      {showComingSoon && comingSoonBusinessItems.has(item.title) && (
                        <span className="text-xs text-muted-foreground/60 ml-2 group-data-[collapsible=icon]:hidden">coming soon</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      {/* Create Project Dialog */}
      <CreateProjectDialog 
        open={isCreateProjectOpen} 
        onOpenChange={setIsCreateProjectOpen} 
      />
    </Sidebar>
  );
}
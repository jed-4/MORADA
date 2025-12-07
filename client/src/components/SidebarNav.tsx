import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { Project } from "@shared/schema";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  Home,
  MessageSquare,
  ClipboardList,
  FileText,
  Calculator,
  FileBarChart,
  File,
  ListTree,
  Clock,
  ListChecks,
  FileSearch,
  HelpCircle,
  CheckCircle,
  DollarSign,
  Receipt,
  AlertCircle,
  BookOpen,
  Timer,
  FolderOpen,
  Users,
  PiggyBank,
  LayoutTemplate,
  Truck,
  HardHat,
  Archive,
  Mail,
  UserPlus,
  Settings,
  ChevronRight,
  Building2,
  ChevronsLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectSwitcher } from "./ProjectSwitcher";

type SectionId = "user" | "project" | "management" | "finance" | "system";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const sections: Record<SectionId, { label: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[] }> = {
  user: {
    label: "User",
    icon: LayoutDashboard,
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Inbox", url: "/messages", icon: Inbox },
      { title: "My Tasks", url: "/tasks", icon: CheckSquare },
    ],
  },
  project: {
    label: "Project",
    icon: Home,
    items: [
      { title: "Overview", url: "", icon: Home },
      { title: "Messages", url: "/messages", icon: MessageSquare },
      { title: "Minutes", url: "/minutes", icon: ClipboardList },
      { title: "Notes", url: "/notes", icon: FileText },
      { title: "Take off", url: "/takeoff", icon: Calculator },
      { title: "Estimates", url: "/estimates", icon: FileBarChart },
      { title: "Proposals", url: "/proposals", icon: File },
    ],
  },
  management: {
    label: "Management",
    icon: ListTree,
    items: [
      { title: "Scope", url: "/scope", icon: ListTree },
      { title: "Schedule", url: "/schedule", icon: Clock },
      { title: "Tasks", url: "/tasks", icon: CheckSquare },
      { title: "Checklists", url: "/checklists", icon: ListChecks },
      { title: "RFQs", url: "/rfqs", icon: FileSearch },
      { title: "RFIs", url: "/rfis", icon: HelpCircle },
      { title: "Selections", url: "/selections", icon: CheckCircle },
      { title: "Allowances", url: "/allowances", icon: DollarSign },
      { title: "Purchase Orders", url: "/purchase-orders", icon: Receipt },
      { title: "Variations", url: "/variations", icon: FileText },
      { title: "Client Invoices", url: "/client-invoices", icon: Receipt },
      { title: "Defects", url: "/defects", icon: AlertCircle },
      { title: "Site Diary", url: "/site-diary", icon: BookOpen },
      { title: "Timesheets", url: "/timesheets", icon: Timer },
      { title: "Files", url: "/files", icon: FolderOpen },
      { title: "Team", url: "/team", icon: Users },
    ],
  },
  finance: {
    label: "Finance",
    icon: PiggyBank,
    items: [
      { title: "Bills", url: "/bills", icon: Receipt },
      { title: "Budget", url: "/budget", icon: PiggyBank },
    ],
  },
  system: {
    label: "System",
    icon: Settings,
    items: [
      { title: "Templates", url: "/templates", icon: LayoutTemplate },
      { title: "Suppliers", url: "/suppliers", icon: Truck },
      { title: "Trades", url: "/trades", icon: HardHat },
      { title: "Archived Projects", url: "/archived-projects", icon: Archive },
      { title: "Emails", url: "/emails", icon: Mail },
      { title: "CRM", url: "/crm", icon: UserPlus },
    ],
  },
};

const sectionOrder: SectionId[] = ["user", "project", "management", "finance", "system"];

export function SidebarNav() {
  const [location, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { currentProject, setCurrentProject } = useProject();
  
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  
  const activeProjects = projects.filter(p => !p.isArchived);
  
  useEffect(() => {
    if (activeProjects.length === 0) return;
    
    const projectMatch = location.match(/^\/projects\/([^\/]+)/);
    if (projectMatch) {
      const urlProjectId = projectMatch[1];
      if (currentProject?.id !== urlProjectId) {
        const urlProject = activeProjects.find(p => p.id === urlProjectId);
        if (urlProject) {
          setCurrentProject(urlProject);
          return;
        }
      }
    }
    
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

  const getItemUrl = (sectionId: SectionId, item: NavItem): string => {
    if (sectionId === "user" || sectionId === "system") {
      return item.url;
    }
    
    if (!currentProject || currentProject.isBusiness) {
      return item.url || "/";
    }
    
    return item.url === "" 
      ? `/projects/${currentProject.id}` 
      : `/projects/${currentProject.id}${item.url}`;
  };

  const handleSectionClick = (sectionId: SectionId) => {
    if (activeSection === sectionId && isDrawerOpen) {
      setIsDrawerOpen(false);
      setActiveSection(null);
    } else {
      setActiveSection(sectionId);
      setIsDrawerOpen(true);
    }
  };

  const handleMouseEnterRail = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handleMouseLeaveDrawer = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsDrawerOpen(false);
    }, 150);
  };

  const handleMouseEnterDrawer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handleNavClick = (url: string) => {
    navigate(url);
    setIsDrawerOpen(false);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setActiveSection(null);
  };

  return (
    <div className="relative flex h-full">
      {/* Rail - Always visible thin sidebar */}
      <div 
        ref={railRef}
        className="flex flex-col h-full w-14 bg-sidebar border-r border-sidebar-border z-40"
        onMouseEnter={handleMouseEnterRail}
      >
        {/* Logo / Company */}
        <div className="flex items-center justify-center h-14 border-b border-sidebar-border">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        
        {/* Section Icons */}
        <div className="flex-1 flex flex-col py-2 gap-1">
          {sectionOrder.map((sectionId) => {
            const section = sections[sectionId];
            const isActive = activeSection === sectionId;
            
            return (
              <Tooltip key={sectionId} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleSectionClick(sectionId)}
                    className={cn(
                      "flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors",
                      "hover-elevate active-elevate-2",
                      isActive && isDrawerOpen
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    data-testid={`rail-${sectionId}`}
                  >
                    <section.icon className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {section.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        
        {/* Settings at bottom */}
        <div className="pb-2">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link href="/settings">
                <button
                  className={cn(
                    "flex items-center justify-center h-10 w-10 mx-auto rounded-lg transition-colors",
                    "hover-elevate active-elevate-2",
                    "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="rail-settings"
                >
                  <Settings className="h-5 w-5" />
                </button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              Settings
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Drawer - Slides out over content */}
      {isDrawerOpen && (
        <div
          ref={drawerRef}
          className={cn(
            "absolute left-14 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border shadow-xl z-30",
            "transition-transform duration-200 ease-out",
            "translate-x-0"
          )}
          onMouseLeave={handleMouseLeaveDrawer}
          onMouseEnter={handleMouseEnterDrawer}
        >
        {activeSection && (
          <div className="flex flex-col h-full">
            {/* Drawer Header */}
            <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
              <span className="font-semibold text-sm">
                {sections[activeSection].label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeDrawer}
                className="h-8 w-8"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Project Switcher for project-related sections */}
            {(activeSection === "project" || activeSection === "management" || activeSection === "finance") && (
              <div className="px-3 py-2 border-b border-sidebar-border">
                <ProjectSwitcher compact />
              </div>
            )}
            
            {/* Nav Items */}
            <ScrollArea className="flex-1">
              <div className="p-2">
                {sections[activeSection].items.map((item) => {
                  const url = getItemUrl(activeSection, item);
                  const isActive = location === url || 
                    (url !== "/" && location.startsWith(url));
                  
                  return (
                    <button
                      key={item.title}
                      onClick={() => handleNavClick(url)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                        "hover-elevate active-elevate-2",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
        </div>
      )}

      {/* Backdrop when drawer is open */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-20"
          onClick={closeDrawer}
          style={{ left: "calc(3.5rem + 16rem)" }}
        />
      )}
    </div>
  );
}

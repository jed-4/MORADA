import { useState, useRef, useEffect, useCallback } from "react";
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
  Clipboard,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectSwitcher } from "./ProjectSwitcher";

type SectionId = "user" | "project" | "management" | "finance" | "allitems" | "system";

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
  allitems: {
    label: "All Items",
    icon: Clipboard,
    items: [
      { title: "Notes", url: "/notes", icon: FileText },
      { title: "Minutes", url: "/minutes", icon: ClipboardList },
      { title: "Tasks", url: "/tasks", icon: CheckSquare },
      { title: "Estimates", url: "/estimates", icon: FileBarChart },
      { title: "RFQs", url: "/rfqs", icon: FileSearch },
      { title: "RFIs", url: "/rfis", icon: HelpCircle },
      { title: "Proposals", url: "/proposals", icon: File },
      { title: "Purchase Orders", url: "/purchase-orders", icon: Receipt },
      { title: "Variations", url: "/variations", icon: FileText },
      { title: "Client Invoices", url: "/client-invoices", icon: Receipt },
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

const sectionOrder: SectionId[] = ["user", "project", "management", "finance", "allitems", "system"];

const HOVER_DELAY_MS = 300;
const LAST_SECTION_KEY = "sidebar_last_section";
const MOBILE_BREAKPOINT = 1024;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  return isMobile;
}

export function SidebarNav() {
  const [location, navigate] = useLocation();
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState<SectionId | null>(() => {
    const saved = sessionStorage.getItem(LAST_SECTION_KEY);
    return (saved && sectionOrder.includes(saved as SectionId)) ? saved as SectionId : null;
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const drawerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { currentProject, setCurrentProject } = useProject();
  
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  
  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
    refetchInterval: 30000,
  });
  
  const totalUnreadMessages = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  
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

  useEffect(() => {
    if (activeSection) {
      sessionStorage.setItem(LAST_SECTION_KEY, activeSection);
    }
  }, [activeSection]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDrawerOpen || !activeSection) return;
      
      const items = sections[activeSection].items;
      
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeDrawer();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedItemIndex(prev => 
            prev < items.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedItemIndex(prev => 
            prev > 0 ? prev - 1 : items.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (focusedItemIndex >= 0 && focusedItemIndex < items.length) {
            const item = items[focusedItemIndex];
            const url = getItemUrl(activeSection, item);
            handleNavClick(url);
          }
          break;
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen, activeSection, focusedItemIndex]);

  useEffect(() => {
    if (isDrawerOpen) {
      setFocusedItemIndex(-1);
    }
  }, [isDrawerOpen, activeSection]);

  const getItemUrl = (sectionId: SectionId, item: NavItem): string => {
    if (sectionId === "user" || sectionId === "system" || sectionId === "allitems") {
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
    }, HOVER_DELAY_MS);
  };

  const handleMouseEnterDrawer = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handleNavClick = useCallback((url: string) => {
    navigate(url);
    setIsDrawerOpen(false);
  }, [navigate]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setActiveSection(null);
  }, []);

  return (
    <div className="relative flex h-full">
      {/* Rail - Always visible thin sidebar (48px) */}
      <div 
        ref={railRef}
        className="flex flex-col h-full w-12 bg-sidebar border-r border-sidebar-border z-40"
        onMouseEnter={handleMouseEnterRail}
      >
        {/* Logo / Company */}
        <div className="flex items-center justify-center h-10 border-b border-sidebar-border">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        
        {/* Section Icons */}
        <div className="flex-1 flex flex-col py-1 gap-0.5">
          {sectionOrder.map((sectionId) => {
            const section = sections[sectionId];
            const isActive = activeSection === sectionId;
            
            return (
              <Tooltip key={sectionId} delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleSectionClick(sectionId)}
                    className={cn(
                      "flex items-center justify-center h-8 w-8 mx-auto rounded-md transition-colors",
                      "hover-elevate active-elevate-2",
                      isActive && isDrawerOpen
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    data-testid={`rail-${sectionId}`}
                  >
                    <section.icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {section.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        
        {/* Settings at bottom */}
        <div className="pb-1">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link href="/settings">
                <button
                  className={cn(
                    "flex items-center justify-center h-8 w-8 mx-auto rounded-md transition-colors",
                    "hover-elevate active-elevate-2",
                    "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="rail-settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Settings
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Drawer - Side panel on desktop, bottom sheet on mobile */}
      {isDrawerOpen && (
        <div
          ref={drawerRef}
          className={cn(
            "bg-sidebar shadow-xl z-30 transition-all duration-200 ease-out",
            isMobile 
              ? "fixed bottom-0 left-0 right-0 h-[70vh] rounded-t-xl border-t border-sidebar-border"
              : "absolute left-12 top-0 h-full w-48 border-r border-sidebar-border translate-x-0"
          )}
          onMouseLeave={isMobile ? undefined : handleMouseLeaveDrawer}
          onMouseEnter={isMobile ? undefined : handleMouseEnterDrawer}
        >
        {activeSection && (
          <div className="flex flex-col h-full">
            {/* Drawer Header */}
            <div className={cn(
              "flex items-center justify-between px-3 border-b border-sidebar-border",
              isMobile ? "h-12" : "h-10"
            )}>
              {isMobile && (
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto absolute top-2 left-1/2 -translate-x-1/2" />
              )}
              <span className={cn("font-semibold", isMobile ? "text-sm" : "text-xs")}>
                {sections[activeSection].label}
              </span>
              <div className="flex items-center gap-1">
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={isMobile ? "h-8 w-8" : "h-6 w-6"}
                      data-testid="drawer-search"
                    >
                      <Search className={isMobile ? "h-4 w-4" : "h-3 w-3"} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Search</TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeDrawer}
                  className={isMobile ? "h-8 w-8" : "h-6 w-6"}
                >
                  <ChevronsLeft className={isMobile ? "h-4 w-4" : "h-3.5 w-3.5"} />
                </Button>
              </div>
            </div>
            
            {/* Project Switcher for project-related sections */}
            {(activeSection === "project" || activeSection === "management" || activeSection === "finance") && (
              <div className="px-2 py-1.5 border-b border-sidebar-border">
                <ProjectSwitcher compact />
              </div>
            )}
            
            {/* Nav Items */}
            <ScrollArea className="flex-1">
              <div className={isMobile ? "p-2" : "p-1.5"}>
                {sections[activeSection].items.map((item, index) => {
                  const url = getItemUrl(activeSection, item);
                  const isActive = location === url || 
                    (url !== "/" && location.startsWith(url));
                  const isFocused = focusedItemIndex === index;
                  
                  const showBadge = (item.title === "Inbox" || item.title === "Messages") && totalUnreadMessages > 0;
                  
                  return (
                    <button
                      key={item.title}
                      onClick={() => handleNavClick(url)}
                      className={cn(
                        "flex items-center w-full rounded-md transition-colors",
                        "hover-elevate active-elevate-2",
                        isMobile ? "gap-3 px-3 py-3 text-sm" : "gap-2 px-2 py-1.5 text-xs",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground",
                        isFocused && "ring-2 ring-primary/50 bg-muted/50"
                      )}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <item.icon className={isMobile ? "h-5 w-5 flex-shrink-0" : "h-3.5 w-3.5 flex-shrink-0"} />
                      <span className="flex-1 text-left">{item.title}</span>
                      {showBadge && (
                        <Badge 
                          variant="destructive" 
                          className={isMobile ? "h-5 min-w-5 px-1.5 text-xs" : "h-4 min-w-4 px-1 text-[10px]"}
                        >
                          {totalUnreadMessages > 99 ? "99+" : totalUnreadMessages}
                        </Badge>
                      )}
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
          className={cn(
            "fixed z-20",
            isMobile 
              ? "inset-0 bg-black/50" 
              : "inset-0"
          )}
          onClick={closeDrawer}
          style={isMobile ? undefined : { left: "calc(3rem + 12rem)" }}
        />
      )}
    </div>
  );
}

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { Project, User } from "@shared/schema";
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
  Cog,
  Library,
  Sparkles,
  ChevronRight,
  Building2,
  ChevronsLeft,
  Clipboard,
  Search,
  Star,
  ChevronDown,
  GripVertical,
  Calendar,
  Bell,
  User as UserIcon,
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

const getBaseUserItems = (userId?: string): NavItem[] => [
  { title: "Dashboard", url: userId ? `/users/${userId}` : "/", icon: LayoutDashboard },
  { title: "Inbox", url: "/messages", icon: Inbox },
  { title: "My Tasks", url: "/tasks", icon: CheckSquare },
];

const getUserWorkspaceItems = (userId: string): NavItem[] => [
  { title: "My Calendar", url: `/users/${userId}/calendar`, icon: Calendar },
  { title: "My Schedule", url: `/users/${userId}/schedule`, icon: Clock },
  { title: "My Time", url: `/users/${userId}/time`, icon: Timer },
  { title: "My Reminders", url: `/users/${userId}/reminders`, icon: Bell },
  { title: "My Memos", url: `/users/${userId}/notes`, icon: FileText },
];

const sections: Record<SectionId, { label: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[] }> = {
  user: {
    label: "User",
    icon: LayoutDashboard,
    items: getBaseUserItems(),
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
      { title: "Timesheets", url: "/timesheets", icon: Timer },
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
    label: "Resources",
    icon: Library,
    items: [
      { title: "Templates", url: "/templates", icon: LayoutTemplate },
      { title: "Price List", url: "/price-list", icon: DollarSign },
      { title: "AI Price Review", url: "/ai-price-review", icon: Sparkles },
      { title: "Suppliers", url: "/suppliers", icon: Truck },
      { title: "Trades", url: "/trades", icon: HardHat },
      { title: "Archived Projects", url: "/archived-projects", icon: Archive },
      { title: "Emails", url: "/emails", icon: Mail },
      { title: "CRM", url: "/crm", icon: UserPlus },
    ],
  },
};

const sectionOrder: SectionId[] = ["user", "project", "management", "finance", "allitems", "system"];
const favoriteSections: SectionId[] = ["user", "project", "management", "finance"];

const HOVER_DELAY_MS = 300;
const LAST_SECTION_KEY = "sidebar_last_section";
const FAVORITES_KEY = "sidebar_favorites";
const FAVORITE_PROJECTS_KEY = "sidebar_favorite_projects";
const MOBILE_BREAKPOINT = 1024;

interface FavoriteItem {
  id: string;
  section: SectionId;
  title: string;
  url: string;
  fullUrl: string;
  iconName: string;
  channelId?: string;
  projectId?: string;
  order: number;
}

interface FavoriteProject {
  id: string;
  order: number;
}

function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
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
  
  const [expandedGroups, setExpandedGroups] = useState<Record<SectionId, boolean>>({
    user: true,
    project: true,
    management: true,
    finance: true,
    allitems: false,
    system: false,
  });
  
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);
  
  // Track if we triggered the update to prevent feedback loop
  const isLocalFavProjUpdateRef = useRef(false);

  useEffect(() => {
    const newValue = JSON.stringify(favoriteProjects);
    const currentValue = localStorage.getItem(FAVORITE_PROJECTS_KEY);
    
    // Only update if value changed
    if (newValue !== currentValue) {
      isLocalFavProjUpdateRef.current = true;
      localStorage.setItem(FAVORITE_PROJECTS_KEY, newValue);
      // Dispatch storage event to notify ProjectSwitcher
      window.dispatchEvent(new StorageEvent('storage', {
        key: FAVORITE_PROJECTS_KEY,
        newValue
      }));
      // Reset flag after event loop
      setTimeout(() => { isLocalFavProjUpdateRef.current = false; }, 0);
    }
  }, [favoriteProjects]);

  // Listen for changes from other components (e.g., ProjectSwitcher)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Skip if we triggered this update
      if (isLocalFavProjUpdateRef.current) return;
      
      if (e.key === FAVORITE_PROJECTS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          // Only update if actually different
          if (JSON.stringify(parsed) !== JSON.stringify(favoriteProjects)) {
            setFavoriteProjects(parsed);
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [favoriteProjects]);
  
  const toggleFavorite = useCallback((
    section: SectionId, 
    item: NavItem, 
    iconName: string, 
    fullUrl: string,
    projectId?: string,
    channelId?: string
  ) => {
    setFavorites(prev => {
      const existingIndex = prev.findIndex(f => f.fullUrl === fullUrl && f.section === section);
      if (existingIndex >= 0) {
        return prev.filter((_, i) => i !== existingIndex);
      } else {
        const sectionFavorites = prev.filter(f => f.section === section);
        const newFavorite: FavoriteItem = {
          id: `${section}-${item.title}-${Date.now()}`,
          section,
          title: item.title,
          url: item.url,
          fullUrl,
          iconName,
          projectId,
          channelId,
          order: sectionFavorites.length,
        };
        return [...prev, newFavorite];
      }
    });
  }, []);
  
  const isFavorite = useCallback((section: SectionId, fullUrl: string) => {
    return favorites.some(f => f.fullUrl === fullUrl && f.section === section);
  }, [favorites]);
  
  const toggleFavoriteProject = useCallback((projectId: string) => {
    setFavoriteProjects(prev => {
      const existingIndex = prev.findIndex(p => p.id === projectId);
      if (existingIndex >= 0) {
        return prev.filter((_, i) => i !== existingIndex);
      } else {
        return [...prev, { id: projectId, order: prev.length }];
      }
    });
  }, []);
  
  const isProjectFavorite = useCallback((projectId: string) => {
    return favoriteProjects.some(p => p.id === projectId);
  }, [favoriteProjects]);
  
  const toggleGroup = useCallback((section: SectionId) => {
    setExpandedGroups(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);
  
  const reorderFavorites = useCallback((section: SectionId, fromIndex: number, toIndex: number) => {
    setFavorites(prev => {
      const sectionItems = prev.filter(f => f.section === section);
      const otherItems = prev.filter(f => f.section !== section);
      const [moved] = sectionItems.splice(fromIndex, 1);
      sectionItems.splice(toIndex, 0, moved);
      return [...otherItems, ...sectionItems.map((item, i) => ({ ...item, order: i }))];
    });
  }, []);
  
  return {
    favorites,
    favoriteProjects,
    expandedGroups,
    toggleFavorite,
    isFavorite,
    toggleFavoriteProject,
    isProjectFavorite,
    toggleGroup,
    reorderFavorites,
  };
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
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
  Cog,
  Calendar,
  Bell,
  Library,
  Sparkles,
};

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
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [focusedItemIndex, setFocusedItemIndex] = useState<number>(-1);
  const drawerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { currentProject, setCurrentProject } = useProject();
  const {
    favorites,
    favoriteProjects,
    expandedGroups,
    toggleFavorite,
    isFavorite,
    toggleFavoriteProject,
    isProjectFavorite,
    toggleGroup,
  } = useFavorites();
  
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  
  // Use the cached auth user for reliable user ID availability
  const { user: currentUser } = useAuth();
  
  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/channels/unread/counts"],
    refetchInterval: 30000,
  });
  
  const totalUnreadMessages = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
  
  const activeProjects = projects.filter(p => !p.isArchived);
  
  const dynamicSections = useMemo(() => {
    const result = { ...sections };
    if (currentUser?.id) {
      result.user = {
        ...sections.user,
        items: [...getBaseUserItems(currentUser.id), ...getUserWorkspaceItems(currentUser.id)],
      };
    }
    return result;
  }, [currentUser?.id]);
  
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
      
      const items = dynamicSections[activeSection].items;
      
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
    if (sectionId === "user") {
      // For User Dashboard, always route to user workspace when user is available
      if (item.title === "Dashboard" && currentUser?.id) {
        return `/users/${currentUser.id}`;
      }
      return item.url;
    }
    
    if (sectionId === "system" || sectionId === "allitems") {
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
      setIsFavoritesOpen(false); // Close favorites when opening a section
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
    setIsFavoritesOpen(false);
    setActiveSection(null);
  }, []);

  const handleFavoritesClick = useCallback(() => {
    if (isFavoritesOpen) {
      setIsFavoritesOpen(false);
      setIsDrawerOpen(false);
    } else {
      setActiveSection(null);
      setIsFavoritesOpen(true);
      setIsDrawerOpen(true);
    }
  }, [isFavoritesOpen]);

  const handleFavoriteNavClick = useCallback((url: string) => {
    navigate(url);
    setIsDrawerOpen(false);
    setIsFavoritesOpen(false);
  }, [navigate]);

  const getIconName = (item: NavItem): string => {
    const iconStr = item.icon.toString();
    for (const [name, component] of Object.entries(iconMap)) {
      if (component === item.icon) return name;
    }
    return "FileText";
  };

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
        
        {/* Favorites Section */}
        <div className="py-1 border-b border-sidebar-border">
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={handleFavoritesClick}
                className={cn(
                  "flex items-center justify-center h-8 w-8 mx-auto rounded-md transition-colors",
                  "hover-elevate active-elevate-2",
                  isFavoritesOpen
                    ? "bg-primary text-primary-foreground"
                    : "text-yellow-500 hover:text-yellow-400"
                )}
                data-testid="rail-favorites"
              >
                <Star className={cn("h-4 w-4", favorites.length > 0 && "fill-current")} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Favorites
            </TooltipContent>
          </Tooltip>
        </div>
        
        {/* User Dashboard */}
        {currentUser?.id && (
          <div className="py-1 border-b border-sidebar-border">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Link href={`/users/${currentUser.id}`}>
                  <button
                    className={cn(
                      "flex items-center justify-center h-8 w-8 mx-auto rounded-md transition-colors",
                      "hover-elevate active-elevate-2",
                      location.startsWith(`/users/${currentUser.id}`) || location.startsWith('/users/me')
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    data-testid="rail-user-dashboard"
                  >
                    <UserIcon className="h-4 w-4" />
                  </button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                My Workspace
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        
        {/* Section Icons */}
        <div className="flex-1 flex flex-col py-1 gap-0.5">
          {sectionOrder.map((sectionId) => {
            const section = dynamicSections[sectionId];
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
          
          {/* Operations - right below Resources */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link href="/systems">
                <button
                  className={cn(
                    "flex items-center justify-center h-8 w-8 mx-auto rounded-md transition-colors",
                    "hover-elevate active-elevate-2",
                    location.startsWith("/systems")
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="rail-operations"
                >
                  <Cog className="h-4 w-4" />
                </button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Operations
            </TooltipContent>
          </Tooltip>
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
                    location.startsWith("/settings")
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
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
                {dynamicSections[activeSection].label}
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
                {dynamicSections[activeSection].items.map((item, index) => {
                  const url = getItemUrl(activeSection, item);
                  const isActive = location === url || 
                    (url !== "/" && location.startsWith(url));
                  const isFocused = focusedItemIndex === index;
                  const showBadge = (item.title === "Inbox" || item.title === "Messages") && totalUnreadMessages > 0;
                  const itemIsFavorite = favoriteSections.includes(activeSection) && isFavorite(activeSection, url);
                  const projectIdForFav = (activeSection !== "user" && currentProject && !currentProject.isBusiness) 
                    ? currentProject.id 
                    : undefined;
                  
                  return (
                    <div
                      key={item.title}
                      className="group flex items-center"
                    >
                      <button
                        onClick={() => handleNavClick(url)}
                        className={cn(
                          "flex items-center flex-1 rounded-md transition-colors",
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
                      {favoriteSections.includes(activeSection) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(activeSection, item, getIconName(item), url, projectIdForFav);
                          }}
                          className={cn(
                            "p-1 rounded transition-opacity",
                            itemIsFavorite 
                              ? "text-yellow-500 opacity-100" 
                              : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-yellow-500"
                          )}
                          data-testid={`favorite-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <Star className={cn("h-3 w-3", itemIsFavorite && "fill-current")} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
        
        {/* Favorites Drawer Content */}
        {isFavoritesOpen && (
          <div className="flex flex-col h-full">
            {/* Favorites Header */}
            <div className={cn(
              "flex items-center justify-between px-3 border-b border-sidebar-border",
              isMobile ? "h-12" : "h-10"
            )}>
              {isMobile && (
                <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto absolute top-2 left-1/2 -translate-x-1/2" />
              )}
              <span className={cn("font-semibold flex items-center gap-1.5", isMobile ? "text-sm" : "text-xs")}>
                <Star className="h-3.5 w-3.5 text-primary fill-current" />
                Favorites
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeDrawer}
                className={isMobile ? "h-8 w-8" : "h-6 w-6"}
              >
                <ChevronsLeft className={isMobile ? "h-4 w-4" : "h-3.5 w-3.5"} />
              </Button>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-1.5">
                {/* User Section First */}
                {(() => {
                  const userFavorites = favorites
                    .filter(f => f.section === "user")
                    .sort((a, b) => a.order - b.order);
                  
                  if (userFavorites.length === 0) return null;
                  
                  return (
                    <div className="mb-1.5">
                      <button
                        onClick={() => toggleGroup("user")}
                        className="flex items-center gap-1 w-full px-1 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground"
                      >
                        <ChevronDown 
                          className={cn(
                            "h-3 w-3 transition-transform",
                            !expandedGroups["user"] && "-rotate-90"
                          )} 
                        />
                        {dynamicSections["user"].label}
                      </button>
                      
                      {expandedGroups["user"] && (
                        <div className="space-y-0.5">
                          {userFavorites.map((fav) => {
                            const IconComponent = iconMap[fav.iconName] || FileText;
                            let url = fav.fullUrl || fav.url;
                            if (fav.title === "Dashboard" && currentUser?.id) {
                              url = `/users/${currentUser.id}`;
                            }
                            const isActive = location === url || (url !== "/" && location.startsWith(url));
                            
                            return (
                              <div key={fav.id} className="group flex items-center">
                                <button
                                  onClick={() => handleFavoriteNavClick(url)}
                                  className={cn(
                                    "flex items-center gap-2 flex-1 px-2 py-1 rounded-md text-xs transition-colors",
                                    "hover-elevate active-elevate-2",
                                    isActive
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <IconComponent className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span className="flex-1 text-left truncate">{fav.title}</span>
                                </button>
                                <button
                                  onClick={() => toggleFavorite("user", { title: fav.title, url: fav.url, icon: IconComponent }, fav.iconName, fav.fullUrl, fav.projectId)}
                                  className="p-1 rounded text-yellow-500 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                                >
                                  <Star className="h-3 w-3 fill-current" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {/* Favorite Projects */}
                {favoriteProjects.length > 0 && (
                  <div className="mb-1.5">
                    <button
                      onClick={() => toggleGroup("project")}
                      className="flex items-center gap-1 w-full px-1 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground"
                    >
                      <ChevronDown 
                        className={cn(
                          "h-3 w-3 transition-transform",
                          !expandedGroups["project"] && "-rotate-90"
                        )} 
                      />
                      Projects
                    </button>
                    {expandedGroups["project"] && (
                      <div className="space-y-0.5">
                        {favoriteProjects.map((fp) => {
                          const project = activeProjects.find(p => p.id === fp.id);
                          if (!project) return null;
                          return (
                            <button
                              key={fp.id}
                              onClick={() => {
                                setCurrentProject(project);
                                handleFavoriteNavClick(`/projects/${project.id}`);
                              }}
                              className={cn(
                                "flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs transition-colors",
                                "hover-elevate active-elevate-2",
                                currentProject?.id === project.id
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Home className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{project.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Management and Finance Sections */}
                {["management", "finance"].map((sectionId) => {
                  const sectionFavorites = favorites
                    .filter(f => f.section === sectionId)
                    .sort((a, b) => a.order - b.order);
                  
                  if (sectionFavorites.length === 0) return null;
                  
                  return (
                    <div key={sectionId} className="mb-2">
                      <button
                        onClick={() => toggleGroup(sectionId)}
                        className="flex items-center gap-1 w-full px-1 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground"
                      >
                        <ChevronDown 
                          className={cn(
                            "h-3 w-3 transition-transform",
                            !expandedGroups[sectionId] && "-rotate-90"
                          )} 
                        />
                        {dynamicSections[sectionId].label}
                      </button>
                      
                      {expandedGroups[sectionId] && (
                        <div className="space-y-0.5">
                          {sectionFavorites.map((fav) => {
                            const IconComponent = iconMap[fav.iconName] || FileText;
                            // Fix User Dashboard favorite URL to use current user ID
                            let url = fav.fullUrl || fav.url;
                            if (sectionId === "user" && fav.title === "Dashboard" && currentUser?.id) {
                              url = `/users/${currentUser.id}`;
                            }
                            const isActive = location === url || (url !== "/" && location.startsWith(url));
                            
                            return (
                              <div key={fav.id} className="group flex items-center">
                                <button
                                  onClick={() => handleFavoriteNavClick(url)}
                                  className={cn(
                                    "flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-xs transition-colors",
                                    "hover-elevate active-elevate-2",
                                    isActive
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <IconComponent className="h-3.5 w-3.5 flex-shrink-0" />
                                  <span className="flex-1 text-left truncate">{fav.title}</span>
                                </button>
                                <button
                                  onClick={() => toggleFavorite(sectionId, { title: fav.title, url: fav.url, icon: IconComponent }, fav.iconName, fav.fullUrl, fav.projectId)}
                                  className="p-1 rounded text-yellow-500 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                                >
                                  <Star className="h-3 w-3 fill-current" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {favorites.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    <Star className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    <p>No favorites yet</p>
                    <p className="mt-1 text-[10px]">Click the star icon on any menu item to add it here</p>
                  </div>
                )}
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

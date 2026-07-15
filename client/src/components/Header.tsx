import { Calendar, User, Settings, LogOut, Plus, FileText, CheckSquare, Folder, Palette, FileBarChart, FileSearch, HelpCircle, File, Receipt, BookOpen, Timer, ClipboardList, Kanban, Search, Clipboard, LayoutDashboard, Check, Lightbulb, Bug, LifeBuoy, Gift } from "lucide-react";
import moradaLogo from "@assets/icon_1783074833445.png";
import { useLocation } from "wouter";
import { openCrispChat, resetCrispSession } from "@/lib/crisp";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import SuggestionPopover from "./SuggestionPopover";
import ReportIssueModal from "./ReportIssueModal";
import { ReferABuilderDialog } from "./billing/ReferABuilderDialog";
import { TimeClockWidget } from "./TimeClockWidget";
import { UserCalendarDialog } from "./UserCalendarDialog";
import { MessagesDropdown } from "./MessagesDropdown";
import { NotificationBell } from "./NotificationBell";
import { MoradaAI } from "./MoradaAI";
import { GlobalSearch } from "./GlobalSearch";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useClientPortal } from "@/hooks/use-client-portal";
import { useToolbarVisible } from "@/hooks/useToolbarVisible";
import type { Company } from "@shared/schema";

export default function Header() {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [referBuilderOpen, setReferBuilderOpen] = useState(false);

  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { isClient } = useClientPortal();
  const { toolbarVisible, toggleToolbar } = useToolbarVisible();

  // Fetch company data
  const { data: company } = useQuery<Company>({
    queryKey: ["/api/companies", user?.companyId],
    enabled: !!user?.companyId,
  });

  // Prioritize: company nickname (Display Name) > company name > fallback
  const companyDisplayName = company?.nickname || company?.name || "Morada";


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
    resetCrispSession();
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

  const handleChatWithSupport = () => {
    if (!openCrispChat()) {
      toast({
        title: "Support chat unavailable",
        description: "Email us at hello@moradaco.com.au",
      });
    }
  };

  
  return (
    <header className="flex items-center justify-between px-3 py-0 sticky top-0 z-50 flex-shrink-0">
      <div className="flex items-center gap-2">
        {/* Logo */}
        <img src={moradaLogo} alt="Morada" className="w-6 h-6 rounded object-contain" data-testid="company-logo" />

        {/* Business Name Button (link only — section dropdown removed; sections live in the sidebar).
            Clients see the builder's name but can't open business mode. */}
        {isClient ? (
          <span
            className="h-7 px-3 rounded-md text-sm font-semibold hidden md:flex items-center"
            data-testid="business-name-label"
          >
            {companyDisplayName}
          </span>
        ) : (
          <button
            onClick={() => navigate('/business')}
            className="h-7 px-3 rounded-md bg-muted/60 hover-elevate active-elevate-2 text-sm font-semibold hidden md:flex items-center"
            data-testid="business-name-link"
          >
            {companyDisplayName}
          </button>
        )}

        {/* Shared project switcher (same popover as the sidebar) with a compact icon trigger.
            Clients can still switch between their own projects, but can't create one. */}
        <ProjectSwitcher
          trigger={
            <button
              className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-header-projects"
              title="Projects"
            >
              <Kanban className="h-3.5 w-3.5" />
            </button>
          }
          onCreateProject={isClient ? undefined : () => setIsCreateProjectOpen(true)}
        />

        {/* All Items Dropdown — cross-project builder navigation, hidden from clients */}
        {!isClient && (
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
            <DropdownMenuItem onClick={() => navigate('/site-diary')} className="text-xs">
              <BookOpen className="h-3.5 w-3.5 mr-2" />
              Site Diary
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>
      {/* Global Search Bar - Centered (collapses to an icon below md).
          Hidden from clients: it searches across every project and contact. */}
      {!isClient && (
      <div className="flex-1 hidden md:flex justify-center px-4">
        <button
          onClick={() => setIsGlobalSearchOpen(true)}
          className="flex items-center gap-2 h-7 px-3 w-full max-w-md rounded-md bg-muted/60 hover-elevate active-elevate-2 text-muted-foreground text-xs"
          data-testid="button-global-search"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search...</span>
          <kbd className="ml-auto text-data bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      </div>
      )}
      {isClient && <div className="flex-1" />}
      <div className="flex items-center gap-1">
        {/* Mobile-only search icon (opens the same GlobalSearch dialog) */}
        {!isClient && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsGlobalSearchOpen(true)}
          data-testid="button-global-search-mobile"
          className="h-7 w-7 md:hidden"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
        )}

        {/* Calendar Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCalendarOpen(true)}
          data-testid="button-calendar"
          className="h-7 w-7 hidden md:inline-flex"
        >
          <Calendar className="h-3.5 w-3.5" />
        </Button>

        {/* Messages Dropdown */}
        <MessagesDropdown />

        {/* Morada AI (hidden on mobile to reduce crowding) */}
        <div className="hidden md:flex items-center">
          <MoradaAI />
        </div>

        {/* Notifications Bell */}
        <NotificationBell />

        {/* Time Clock Widget (hidden on mobile to reduce crowding) */}
        <div className="hidden md:flex items-center">
          <TimeClockWidget />
        </div>

        {/* Dark Mode Toggle (hidden on mobile to reduce crowding) */}
        <div className="hidden md:flex items-center">
          <ThemeToggle />
        </div>

        {/* New Button with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              data-testid="button-new"
              className="h-5 px-2 text-table rounded-md bg-primary text-primary-foreground hover-elevate active-elevate-2 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>New</span>
            </button>
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
              <span className="flex-1">Show Tabs</span>
              {toolbarVisible && <Check className="h-3.5 w-3.5 ml-2 text-muted-foreground" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {(user as any)?.userCategory === "team" && (
              <DropdownMenuItem onSelect={() => setReferBuilderOpen(true)} data-testid="menu-refer-builder">
                <Gift className="h-4 w-4 mr-2" />
                Refer a Builder
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={handleChatWithSupport} data-testid="menu-chat-support">
              <LifeBuoy className="h-4 w-4 mr-2" />
              Chat with Support
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSuggestionOpen(true)} data-testid="menu-send-suggestion">
              <Lightbulb className="h-4 w-4 mr-2" />
              Send a Suggestion
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setReportIssueOpen(true)} data-testid="menu-report-issue">
              <Bug className="h-4 w-4 mr-2" />
              Report an Issue
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
      {/* Suggestion Box (controlled from the user menu) */}
      <SuggestionPopover open={suggestionOpen} onOpenChange={setSuggestionOpen} />
      {/* Report an Issue Modal (controlled from the user menu) */}
      <ReportIssueModal open={reportIssueOpen} onOpenChange={setReportIssueOpen} />
      <ReferABuilderDialog open={referBuilderOpen} onOpenChange={setReferBuilderOpen} />
    </header>
  );
}
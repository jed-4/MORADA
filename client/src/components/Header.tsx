import { Calendar, User, Settings, LogOut, Building2, LayoutDashboard, Plus, FileText, CheckSquare, Folder, Palette, ChevronDown, Home, Clipboard, MessageSquare, Clock, Calculator, FileBarChart, FileSearch, HelpCircle, File, DollarSign, Receipt, CreditCard, BookOpen, Timer, PiggyBank, FolderOpen, Users, ClipboardList } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
  { title: "Request For Quotes", baseUrl: "/rfq", icon: FileSearch },
  { title: "Request For Information", baseUrl: "/rfi", icon: HelpCircle },
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
  const { toast } = useToast();
  const { user, logout } = useAuth();

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
  
  return (
    <header className="flex items-center justify-between p-4 border-b bg-white dark:bg-gray-950 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center justify-center w-8 h-8 bg-primary rounded" data-testid="company-logo">
          <Building2 className="h-5 w-5 text-primary-foreground" />
        </div>

        {/* Business Name Link */}
        <button 
          onClick={() => navigate('/business')} 
          className="text-lg font-semibold hover:text-primary transition-colors"
          data-testid="business-name-link"
        >
          Lighthouse Projects
        </button>

        {/* Dashboard Button */}
        <Button variant="ghost" size="sm" data-testid="button-dashboard" disabled>
          <LayoutDashboard className="h-4 w-4 mr-2" />
          Dashboard
        </Button>

        {/* All Items Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="button-all-items">
              <Clipboard className="h-4 w-4 mr-2" />
              All Items
              <ChevronDown className="h-4 w-4 ml-2" />
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

      <div className="flex items-center gap-2">
        {/* New Button with Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" data-testid="button-new">
              <Plus className="h-4 w-4 mr-2" />
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

        {/* Contacts Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate("/contacts")}
          data-testid="button-contacts"
        >
          <Users className="h-4 w-4" />
        </Button>

        {/* Calendar Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsCalendarOpen(true)}
          data-testid="button-calendar"
        >
          <Calendar className="h-4 w-4" />
        </Button>

        {/* Messages Dropdown */}
        <MessagesDropdown />

        {/* Time Clock Widget */}
        <TimeClockWidget />

        <ThemeToggle />
        
        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl || ""} alt={getUserName()} />
                <AvatarFallback>{getUserInitials()}</AvatarFallback>
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
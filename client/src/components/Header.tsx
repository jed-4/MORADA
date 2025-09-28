import { Calendar, User, Settings, LogOut, Building2, LayoutDashboard, Plus, FileText, CheckSquare, Folder, Palette, ChevronDown, Home, BarChart3, Clipboard, StickyNote } from "lucide-react";
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
import { SidebarTrigger } from "@/components/ui/sidebar";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const [location, navigate] = useLocation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

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
    <header className="flex items-center justify-between p-4 border-b bg-background sticky top-0 z-50">
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
            <DropdownMenuLabel>Navigate To</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/')} data-testid="menu-home">
              <Home className="h-4 w-4 mr-2" />
              Home
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/projects')} data-testid="menu-projects">
              <Folder className="h-4 w-4 mr-2" />
              Projects
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/estimates')} data-testid="menu-estimates">
              <BarChart3 className="h-4 w-4 mr-2" />
              Estimates
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/tasks')} data-testid="menu-tasks">
              <CheckSquare className="h-4 w-4 mr-2" />
              Tasks
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/notes')} data-testid="menu-notes">
              <StickyNote className="h-4 w-4 mr-2" />
              Notes
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/business')} data-testid="menu-business">
              <Building2 className="h-4 w-4 mr-2" />
              Business
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/selections')} data-testid="menu-selections">
              <Palette className="h-4 w-4 mr-2" />
              Selections
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <SidebarTrigger data-testid="button-sidebar-toggle" />
      </div>

      <div className="flex items-center gap-2">
        {/* Calendar Button */}
        <Button variant="outline" size="icon" data-testid="button-calendar">
          <Calendar className="h-4 w-4" />
        </Button>

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

        <ThemeToggle />
        
        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full" data-testid="button-user-menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src="" alt="User" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>John Doe</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menu-settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menu-logout">
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
    </header>
  );
}
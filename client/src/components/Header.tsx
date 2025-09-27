import { Calendar, User, Settings, LogOut, Building2, LayoutDashboard } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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

        <SidebarTrigger data-testid="button-sidebar-toggle" />
      </div>

      <div className="flex items-center gap-2">
        {/* Calendar Button */}
        <Button variant="outline" size="icon" data-testid="button-calendar">
          <Calendar className="h-4 w-4" />
        </Button>

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
    </header>
  );
}
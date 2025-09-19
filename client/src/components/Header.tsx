import { ChevronDown, Calendar, Search, User, Settings, LogOut } from "lucide-react";
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

// todo: remove mock functionality
const mockProjects = [
  { id: "1", name: "Sunshine Coast Villa", status: "In Progress" },
  { id: "2", name: "Brisbane Townhouse", status: "Planning" },
  { id: "3", name: "Gold Coast Mansion", status: "On Hold" },
];

const mockAllItems = [
  { type: "Task", title: "Foundation Inspection", project: "Sunshine Coast Villa" },
  { type: "RFQ", title: "Electrical Quote", project: "Brisbane Townhouse" },
  { type: "Invoice", title: "Concrete Supplies", project: "Gold Coast Mansion" },
];

export default function Header() {
  return (
    <header className="flex items-center justify-between p-4 border-b bg-background">
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        
        <div className="flex items-center gap-2">
          {/* Projects Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-projects-dropdown">
                Projects <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Current Projects</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {mockProjects.map((project) => (
                <DropdownMenuItem key={project.id} data-testid={`project-${project.id}`}>
                  <div className="flex flex-col">
                    <span className="font-medium">{project.name}</span>
                    <span className="text-sm text-muted-foreground">{project.status}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="button-new-project">
                + Create New Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* All Items Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-all-items-dropdown">
                All Items <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>Recent Items</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {mockAllItems.map((item, index) => (
                <DropdownMenuItem key={index} data-testid={`item-${index}`}>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        {item.type}
                      </span>
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{item.project}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="button-view-all-items">
                <Search className="h-4 w-4 mr-2" />
                View All Items
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Calendar Button */}
          <Button variant="outline" size="icon" data-testid="button-calendar">
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
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
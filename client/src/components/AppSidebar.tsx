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
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

// Coming soon items that should have strikeout styling
const comingSoonItems = new Set([
  "Messages", "Notes", "Schedule", "Take off", "Estimates", 
  "Request For Quotes", "Request For Information", "Proposal", 
  "Selections", "Allowances", "Purchase Orders", "Variations", 
  "Bills", "Client Invoices", "Site Diary", "Timesheets", 
  "Budget", "Files", "Team"
]);

// Project sections
const projectItems = [
  { title: "Overview", url: "/", icon: Home },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Notes", url: "/notes", icon: FileText },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Schedule", url: "/schedule", icon: Clock },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Take off", url: "/takeoff", icon: Calculator },
  { title: "Estimates", url: "/estimates", icon: FileBarChart },
  { title: "Request For Quotes", url: "/rfq", icon: FileSearch },
  { title: "Request For Information", url: "/rfi", icon: HelpCircle },
  { title: "Proposal", url: "/proposal", icon: File },
  { title: "Selections", url: "/selections", icon: CheckCircle },
  { title: "Allowances", url: "/allowances", icon: DollarSign },
  { title: "Purchase Orders", url: "/purchase-orders", icon: Receipt },
  { title: "Variations", url: "/variations", icon: FileText },
  { title: "Bills", url: "/bills", icon: CreditCard },
  { title: "Client Invoices", url: "/invoices", icon: Receipt },
  { title: "Site Diary", url: "/site-diary", icon: BookOpen },
  { title: "Timesheets", url: "/timesheets", icon: Timer },
  { title: "Budget", url: "/budget", icon: PiggyBank },
  { title: "Files", url: "/files", icon: FolderOpen },
  { title: "Team", url: "/team", icon: Users },
];

// Coming soon business items
const comingSoonBusinessItems = new Set([
  "Templates", "Settings", "Checklists", "Emails", "CRM", "Team",
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

export function AppSidebar() {
  const [location] = useLocation();
  const isBusinessContext = location.startsWith('/business');
  
  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">BuildPro</h2>
            <div className="flex items-center gap-2">
              {isBusinessContext ? (
                <>
                  <p className="text-sm text-muted-foreground">Business Project</p>
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Business
                  </Badge>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sunshine Coast Villa</p>
              )}
            </div>
          </div>
        </div>
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
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    data-active={location === item.url}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span className={comingSoonItems.has(item.title) ? "line-through" : ""}>
                        {item.title}
                      </span>
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
                  data-testid="nav-business-messages"
                  data-active={location === '/business/messages'}
                >
                  <Link href="/business/messages">
                    <MessageSquare className="h-4 w-4" />
                    <span className={comingSoonBusinessItems.has("Messages") ? "line-through" : ""}>
                      Messages
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild
                  data-testid="nav-business-leave"
                  data-active={location === '/business/leave'}
                >
                  <Link href="/business/leave">
                    <Calendar className="h-4 w-4" />
                    <span className={comingSoonBusinessItems.has("Sick Days & Leave") ? "line-through" : ""}>
                      Sick Days & Leave
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {businessItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    data-testid={`nav-business-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    data-active={location === item.url}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span className={comingSoonBusinessItems.has(item.title) ? "line-through" : ""}>
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
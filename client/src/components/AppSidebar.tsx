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

// Project sections
const projectItems = [
  { title: "Overview", url: "/", icon: Home },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Notes", url: "/notes", icon: FileText },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Take off", url: "/takeoff", icon: Calculator },
  { title: "Estimates", url: "/estimates", icon: FileBarChart },
  { title: "Request For Quotes", url: "/rfq", icon: FileSearch },
  { title: "Request For Information", url: "/rfi", icon: HelpCircle },
  { title: "Proposal", url: "/proposal", icon: File },
  { title: "Schedule", url: "/schedule", icon: Clock },
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
  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-semibold text-lg">BuildPro</h2>
            <p className="text-sm text-muted-foreground">Sunshine Coast Villa</p>
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
                  >
                    <a href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Business</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {businessItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild
                    data-testid={`nav-business-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <a href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
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
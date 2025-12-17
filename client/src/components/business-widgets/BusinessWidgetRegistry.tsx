import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Activity,
  Building2,
  Clock,
  FileText,
  BarChart3,
  Briefcase,
  AlertCircle,
  LineChart,
  PieChart,
  Gauge
} from "lucide-react";
import { WidgetDefinition } from "@/types/widgets";
import BusinessKPIsWidget from "./BusinessKPIsWidget";
import BusinessActivityWidget from "./BusinessActivityWidget";
import BusinessTeamWidget from "./BusinessTeamWidget";
import BusinessProjectsWidget from "./BusinessProjectsWidget";
import BusinessFinancialsWidget from "./BusinessFinancialsWidget";
import BusinessQuickActionsWidget from "./BusinessQuickActionsWidget";
import BusinessTimesheetsWidget from "./BusinessTimesheetsWidget";
import BusinessAlertsWidget from "./BusinessAlertsWidget";
import BusinessRevenueWidget from "./BusinessRevenueWidget";
import BusinessProfitabilityWidget from "./BusinessProfitabilityWidget";
import BusinessUtilizationWidget from "./BusinessUtilizationWidget";

export const businessWidgetRegistry: Record<string, WidgetDefinition> = {
  businessKPIs: {
    type: "businessKPIs",
    name: "Business KPIs",
    description: "Key metrics: revenue, expenses, active projects, team members",
    icon: BarChart3,
    component: BusinessKPIsWidget,
    defaultSize: "xl",
    configurable: true,
  },
  businessActivity: {
    type: "businessActivity",
    name: "Recent Activity",
    description: "Latest business activities across all projects",
    icon: Activity,
    component: BusinessActivityWidget,
    defaultSize: "md",
    configurable: true,
  },
  businessTeam: {
    type: "businessTeam",
    name: "Team Overview",
    description: "Team members, availability, and workload",
    icon: Users,
    component: BusinessTeamWidget,
    defaultSize: "md",
    configurable: true,
  },
  businessProjects: {
    type: "businessProjects",
    name: "Active Projects",
    description: "Summary of active projects with status and progress",
    icon: Building2,
    component: BusinessProjectsWidget,
    defaultSize: "lg",
    configurable: true,
  },
  businessFinancials: {
    type: "businessFinancials",
    name: "Financial Summary",
    description: "Revenue, expenses, and profit overview",
    icon: DollarSign,
    component: BusinessFinancialsWidget,
    defaultSize: "md",
    configurable: true,
  },
  businessQuickActions: {
    type: "businessQuickActions",
    name: "Quick Actions",
    description: "Submit expense, log time, request leave",
    icon: Briefcase,
    component: BusinessQuickActionsWidget,
    defaultSize: "sm",
    configurable: false,
  },
  businessTimesheets: {
    type: "businessTimesheets",
    name: "Timesheets Summary",
    description: "Recent timesheet entries and approval status",
    icon: Clock,
    component: BusinessTimesheetsWidget,
    defaultSize: "md",
    configurable: true,
  },
  businessAlerts: {
    type: "businessAlerts",
    name: "Alerts & Reminders",
    description: "Important alerts, overdue items, and reminders",
    icon: AlertCircle,
    component: BusinessAlertsWidget,
    defaultSize: "md",
    configurable: true,
  },
  businessRevenue: {
    type: "businessRevenue",
    name: "Revenue Trends",
    description: "6-month revenue and expense trends with profit analysis",
    icon: LineChart,
    component: BusinessRevenueWidget,
    defaultSize: "md",
    configurable: true,
  },
  businessProfitability: {
    type: "businessProfitability",
    name: "Project Profitability",
    description: "Margin analysis and budget variance by project",
    icon: PieChart,
    component: BusinessProfitabilityWidget,
    defaultSize: "md",
    configurable: true,
  },
  businessUtilization: {
    type: "businessUtilization",
    name: "Team Utilization",
    description: "Weekly team capacity and utilization rates",
    icon: Gauge,
    component: BusinessUtilizationWidget,
    defaultSize: "md",
    configurable: true,
  },
};

export function getBusinessWidgetDefinition(type: string): WidgetDefinition | undefined {
  return businessWidgetRegistry[type];
}

export function getAvailableBusinessWidgets(): WidgetDefinition[] {
  return Object.values(businessWidgetRegistry);
}

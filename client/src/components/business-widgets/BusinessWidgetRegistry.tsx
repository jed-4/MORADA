import {
  DollarSign,
  Activity,
  Building2,
  Clock,
  BarChart3,
  Briefcase,
  AlertCircle,
  LineChart,
  PieChart,
  Gauge,
  GitBranch,
  Wallet,
} from "lucide-react";
import { WidgetDefinition } from "@/types/widgets";
import BusinessKPIsWidget from "./BusinessKPIsWidget";
import BusinessCashFlowWidget from "./BusinessCashFlowWidget";
import BusinessActivityWidget from "./BusinessActivityWidget";
import BusinessProjectsWidget from "./BusinessProjectsWidget";
import BusinessFinancialsWidget from "./BusinessFinancialsWidget";
import BusinessQuickActionsWidget from "./BusinessQuickActionsWidget";
import BusinessTimesheetsWidget from "./BusinessTimesheetsWidget";
import BusinessAlertsWidget from "./BusinessAlertsWidget";
import BusinessRevenueWidget from "./BusinessRevenueWidget";
import BusinessProfitabilityWidget from "./BusinessProfitabilityWidget";
import BusinessUtilizationWidget from "./BusinessUtilizationWidget";
import BusinessVariationsPendingWidget from "./BusinessVariationsPendingWidget";
import BusinessPnLWidget from "./BusinessPnLWidget";

export const businessWidgetRegistry: Record<string, WidgetDefinition> = {
  businessKPIs: {
    type: "businessKPIs",
    name: "Business KPIs",
    description: "Configurable KPI strip with period selector",
    icon: BarChart3,
    component: BusinessKPIsWidget,
    defaultSize: "xl",
    configurable: true,
    accent: "purple",
    defaultColumns: 8,
    multiInstance: true,
  },
  businessActivity: {
    type: "businessActivity",
    name: "Recent Activity",
    description: "Timeline of recent activity across all projects",
    icon: Activity,
    component: BusinessActivityWidget,
    defaultSize: "md",
    configurable: false,
    accent: "danger",
    defaultColumns: 3,
    defaultRowSpan: 3,
  },
  businessProjects: {
    type: "businessProjects",
    name: "Active Projects",
    description: "Summary of active projects with status and progress",
    icon: Building2,
    component: BusinessProjectsWidget,
    defaultSize: "lg",
    configurable: true,
    accent: "project",
    defaultColumns: 6,
  },
  businessFinancials: {
    type: "businessFinancials",
    name: "Financial Summary",
    description: "Revenue, expenses, and profit overview",
    icon: DollarSign,
    component: BusinessFinancialsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "financial",
    financialGated: true,
    requiredPermission: { key: "financial.invoices", action: "view" },
    defaultColumns: 4,
    defaultRowSpan: 2,
  },
  businessQuickActions: {
    type: "businessQuickActions",
    name: "Quick Actions",
    description: "Shortcuts for new project, variation, RFI, contact and more",
    icon: Briefcase,
    component: BusinessQuickActionsWidget,
    defaultSize: "sm",
    configurable: false,
    accent: "purple",
    defaultColumns: 3,
    defaultRowSpan: 2,
  },
  businessTimesheets: {
    type: "businessTimesheets",
    name: "Timesheets Summary",
    description: "Recent timesheet entries and approval status",
    icon: Clock,
    component: BusinessTimesheetsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "teal",
    defaultColumns: 4,
  },
  businessAlerts: {
    type: "businessAlerts",
    name: "Alerts & Reminders",
    description: "Important alerts, overdue items, and reminders",
    icon: AlertCircle,
    component: BusinessAlertsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "danger",
    defaultColumns: 4,
  },
  businessRevenue: {
    type: "businessRevenue",
    name: "Revenue Trends",
    description: "Monthly revenue trends and analysis",
    icon: LineChart,
    component: BusinessRevenueWidget,
    defaultSize: "lg",
    configurable: true,
    accent: "schedule",
    financialGated: true,
    requiredPermission: { key: "financial.invoices", action: "view" },
    defaultColumns: 5,
    defaultRowSpan: 2,
  },
  businessProfitability: {
    type: "businessProfitability",
    name: "Project Profitability",
    description: "Margin per project from invoices vs paid bills",
    icon: PieChart,
    component: BusinessProfitabilityWidget,
    defaultSize: "lg",
    configurable: false,
    accent: "financial",
    financialGated: true,
    requiredPermission: { key: "financial.budget_actuals", action: "view" },
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  businessUtilization: {
    type: "businessUtilization",
    name: "Team Utilization",
    description: "Weekly team capacity and utilization rates",
    icon: Gauge,
    component: BusinessUtilizationWidget,
    defaultSize: "md",
    configurable: true,
    accent: "green",
    defaultColumns: 4,
  },
  businessPnL: {
    type: "businessPnL",
    name: "Profit & Loss",
    description: "Live P&L from Xero with GST toggle and period selector",
    icon: LineChart,
    component: BusinessPnLWidget,
    defaultSize: "lg",
    configurable: false,
    accent: "financial",
    financialGated: true,
    requiredPermission: { key: "financial.invoices", action: "view" },
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  businessCashFlow: {
    type: "businessCashFlow",
    name: "Cash Flow",
    description: "Company-wide money in vs money out trend over the last 6 months",
    icon: Wallet,
    component: BusinessCashFlowWidget,
    defaultSize: "lg",
    configurable: false,
    accent: "green",
    financialGated: true,
    requiredPermission: { key: "financial.invoices", action: "view" },
    defaultColumns: 5,
    defaultRowSpan: 2,
  },
  businessVariationsPending: {
    type: "businessVariationsPending",
    name: "Variations Pending",
    description: "Pending variations across all projects with amount + days waiting",
    icon: GitBranch,
    component: BusinessVariationsPendingWidget,
    defaultSize: "md",
    configurable: false,
    accent: "amber",
    defaultColumns: 4,
    defaultRowSpan: 2,
  },
};

export function getBusinessWidgetDefinition(type: string): WidgetDefinition | undefined {
  return businessWidgetRegistry[type];
}

export function getAvailableBusinessWidgets(): WidgetDefinition[] {
  return Object.values(businessWidgetRegistry);
}

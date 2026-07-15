import {
  CheckSquare,
  BarChart3,
  FileText,
  Calendar,
  Activity,
  ListChecks,
  Receipt,
  FileEdit,
  Zap,
  AlertTriangle,
  Sparkles,
  Hammer,
  Inbox,
  Newspaper,
  Wallet,
  GanttChart,
  FolderOpen,
  StickyNote,
  MailCheck,
  Pin,
  Target,
  Bell,
  Sun,
  FileSpreadsheet,
  TrendingUp,
  DollarSign,
  Building2,
  Clock,
  Briefcase,
  AlertCircle,
  LineChart,
  PieChart,
  Gauge,
  GitBranch,
} from "lucide-react";
import { WidgetDefinition } from "@/types/widgets";

// Project dashboard widgets
import TasksWidget from "@/components/widgets/TasksWidget";
import MetricsWidget from "@/components/widgets/MetricsWidget";
import NotesWidget from "@/components/widgets/NotesWidget";
import ScheduleWidget from "@/components/widgets/ScheduleWidget";
import ActivityWidget from "@/components/widgets/ActivityWidget";
import ChecklistWidget from "@/components/widgets/ChecklistWidget";
import BillsSummaryWidget from "@/components/widgets/BillsSummaryWidget";
import VariationsSummaryWidget from "@/components/widgets/VariationsSummaryWidget";
import InvoicesSummaryWidget from "@/components/widgets/InvoicesSummaryWidget";
import QuickActionsWidget from "@/components/widgets/QuickActionsWidget";
import AlertsWidget from "@/components/widgets/AlertsWidget";
import AISummaryWidget from "@/components/widgets/AISummaryWidget";
import SubcontractorsWidget from "@/components/widgets/SubcontractorsWidget";
import OpenItemsWidget from "@/components/widgets/OpenItemsWidget";
import RecentActivityFeedWidget from "@/components/widgets/RecentActivityFeedWidget";
import ProjectBudgetVsActualWidget from "@/components/widgets/ProjectBudgetVsActualWidget";
import ProjectCashFlowWidget from "@/components/widgets/ProjectCashFlowWidget";
import ClientActivityWidget from "@/components/widgets/ClientActivityWidget";
import ProgrammeScheduleWidget from "@/components/widgets/ProgrammeScheduleWidget";
import ProjectDocumentsWidget from "@/components/widgets/ProjectDocumentsWidget";
import QuickNotesWidget from "@/components/widgets/QuickNotesWidget";

// Personal dashboard widgets
import PersonalTasksWidget from "@/components/user-workspace/widgets/PersonalTasksWidget";
import PersonalMetricsWidget from "@/components/user-workspace/widgets/PersonalMetricsWidget";
import CrossProjectDeadlinesWidget from "@/components/user-workspace/widgets/CrossProjectDeadlinesWidget";
import PersonalQuickActionsWidget from "@/components/user-workspace/widgets/PersonalQuickActionsWidget";
import PersonalMemosWidget from "@/components/user-workspace/widgets/PersonalMemosWidget";
import PersonalRemindersWidget from "@/components/user-workspace/widgets/PersonalRemindersWidget";
import MyDayWidget from "@/components/user-workspace/widgets/MyDayWidget";
import PersonalActivityWidget from "@/components/user-workspace/widgets/PersonalActivityWidget";
import PersonalAISummaryWidget from "@/components/user-workspace/widgets/PersonalAISummaryWidget";
import UnifiedCalendarWidget from "@/components/user-workspace/widgets/UnifiedCalendarWidget";
import ActionableItemsWidget from "@/components/user-workspace/widgets/ActionableItemsWidget";
import MyProjectsWidget from "@/components/user-workspace/widgets/MyProjectsWidget";
import PersonalKPIsWidget from "@/components/user-workspace/widgets/PersonalKPIsWidget";

// Business dashboard widgets
import BusinessKPIsWidget from "@/components/business-widgets/BusinessKPIsWidget";
import BusinessCashFlowWidget from "@/components/business-widgets/BusinessCashFlowWidget";
import BusinessActivityWidget from "@/components/business-widgets/BusinessActivityWidget";
import BusinessProjectsWidget from "@/components/business-widgets/BusinessProjectsWidget";
import BusinessFinancialsWidget from "@/components/business-widgets/BusinessFinancialsWidget";
import BusinessQuickActionsWidget from "@/components/business-widgets/BusinessQuickActionsWidget";
import BusinessTimesheetsWidget from "@/components/business-widgets/BusinessTimesheetsWidget";
import BusinessAlertsWidget from "@/components/business-widgets/BusinessAlertsWidget";
import BusinessRevenueWidget from "@/components/business-widgets/BusinessRevenueWidget";
import BusinessProfitabilityWidget from "@/components/business-widgets/BusinessProfitabilityWidget";
import BusinessUtilizationWidget from "@/components/business-widgets/BusinessUtilizationWidget";
import BusinessVariationsPendingWidget from "@/components/business-widgets/BusinessVariationsPendingWidget";
import BusinessPnLWidget from "@/components/business-widgets/BusinessPnLWidget";

// Shared (merged) widgets
import { ProjectPinnedItemsWidget, PersonalPinnedItemsWidget } from "./PinnedItemsWidget";

export type DashboardVariant = "project" | "personal" | "business";

// ---------------------------------------------------------------------------
// Project dashboard registry
// ---------------------------------------------------------------------------

export const projectWidgetRegistry: Record<string, WidgetDefinition> = {
  tasks: {
    type: "tasks",
    name: "Tasks",
    description: "Show upcoming project tasks and assignments",
    icon: CheckSquare,
    component: TasksWidget,
    defaultSize: "md",
    configurable: true,
  },
  metrics: {
    type: "metrics",
    name: "Project Metrics",
    description: "Display project budget, timeline, and completion metrics",
    icon: BarChart3,
    component: MetricsWidget,
    defaultSize: "lg",
    configurable: true,
  },
  notes: {
    type: "notes",
    name: "Project Notes",
    description: "Quick notes and project updates",
    icon: FileText,
    component: NotesWidget,
    defaultSize: "md",
    configurable: true,
  },
  schedule: {
    type: "schedule",
    name: "Schedule",
    description: "Upcoming scheduled events and milestones",
    icon: Calendar,
    component: ScheduleWidget,
    defaultSize: "md",
    configurable: true,
  },
  activity: {
    type: "activity",
    name: "Activity Feed",
    description: "Recent project activity and updates",
    icon: Activity,
    component: ActivityWidget,
    defaultSize: "md",
    configurable: false,
  },
  checklist: {
    type: "checklist",
    name: "Checklists",
    description: "View and access project checklists",
    icon: ListChecks,
    component: ChecklistWidget,
    defaultSize: "md",
    configurable: true,
  },
  bills: {
    type: "bills",
    name: "Bills Summary",
    description: "Overview of project bills with status breakdown and totals",
    icon: Receipt,
    component: BillsSummaryWidget,
    defaultSize: "md",
    configurable: false,
  },
  variations: {
    type: "variations",
    name: "Variations Summary",
    description: "Track change orders and their impact on project value",
    icon: FileEdit,
    component: VariationsSummaryWidget,
    defaultSize: "md",
    configurable: false,
  },
  invoices: {
    type: "invoices",
    name: "Invoices Summary",
    description: "Client invoicing status and collection tracking",
    icon: FileText,
    component: InvoicesSummaryWidget,
    defaultSize: "md",
    configurable: true,
  },
  quickActions: {
    type: "quickActions",
    name: "Quick Actions",
    description: "One-click buttons for common project tasks",
    icon: Zap,
    component: QuickActionsWidget,
    defaultSize: "md",
    configurable: true,
  },
  alerts: {
    type: "alerts",
    name: "Alerts & Warnings",
    description: "Overdue items, budget warnings, and action items",
    icon: AlertTriangle,
    component: AlertsWidget,
    defaultSize: "md",
    configurable: false,
  },
  aiSummary: {
    type: "aiSummary",
    name: "AI Daily Summary",
    description: "AI-powered briefing of today's schedule, action items, and potential issues",
    icon: Sparkles,
    component: AISummaryWidget,
    defaultSize: "md",
    configurable: false,
  },
  subcontractors: {
    type: "subcontractors",
    name: "Subcontractors",
    description: "Trade contacts assigned to this project with click-to-call",
    icon: Hammer,
    component: SubcontractorsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "teal",
    defaultColumns: 3,
    defaultRowSpan: 3,
  },
  openItems: {
    type: "openItems",
    name: "Open Items",
    description: "Counts of open tasks, defects, pending variations, and RFIs",
    icon: Inbox,
    component: OpenItemsWidget,
    defaultSize: "md",
    configurable: false,
    accent: "amber",
    defaultColumns: 3,
    defaultRowSpan: 2,
  },
  recentActivityFeed: {
    type: "recentActivityFeed",
    name: "Recent Activity Feed",
    description: "Latest activity across the project at a glance",
    icon: Newspaper,
    component: RecentActivityFeedWidget,
    defaultSize: "md",
    configurable: true,
    accent: "purple",
    defaultColumns: 3,
    defaultRowSpan: 3,
  },
  budgetVsActual: {
    type: "budgetVsActual",
    name: "Budget vs Actual",
    description: "Spend vs budget with a progress or bullet bar, plus an optional build-progress bar",
    icon: BarChart3,
    component: ProjectBudgetVsActualWidget,
    defaultSize: "md",
    configurable: true,
    accent: "financial",
    financialGated: true,
    requiredPermission: { key: "financial.budget_actuals", action: "view" },
    defaultColumns: 3,
    defaultRowSpan: 2,
  },
  projectCashFlow: {
    type: "projectCashFlow",
    name: "Project Cash Flow",
    description: "Money in vs money out for this project with weekly confirmation",
    icon: Wallet,
    component: ProjectCashFlowWidget,
    defaultSize: "md",
    configurable: true,
    accent: "green",
    financialGated: true,
    requiredPermission: { key: "dashboard.financial", action: "view" },
    defaultColumns: 3,
    defaultRowSpan: 2,
  },
  clientActivity: {
    type: "clientActivity",
    name: "Client Activity",
    description: "Client-portal events: invoices, proposals, variations sent and accepted",
    icon: MailCheck,
    component: ClientActivityWidget,
    defaultSize: "md",
    configurable: true,
    accent: "purple",
    defaultColumns: 3,
    defaultRowSpan: 3,
  },
  programme: {
    type: "programme",
    name: "Schedule",
    description: "Schedule items and tasks in week or Gantt view",
    icon: GanttChart,
    component: ProgrammeScheduleWidget,
    defaultSize: "lg",
    configurable: true,
    accent: "schedule",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  documents: {
    type: "documents",
    name: "Project Documents",
    description: "Files in the linked Google Drive folder for this project",
    icon: FolderOpen,
    component: ProjectDocumentsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "purple",
    defaultColumns: 3,
    defaultRowSpan: 3,
  },
  quickNotes: {
    type: "quickNotes",
    name: "Quick Notes",
    description: "Notion-like quick blocks: heading, text, bullet, and to-do",
    icon: StickyNote,
    component: QuickNotesWidget,
    defaultSize: "md",
    configurable: false,
    accent: "amber",
    defaultColumns: 3,
    defaultRowSpan: 4,
  },
  pinnedItems: {
    type: "pinnedItems",
    name: "Pinned Items",
    description: "Quick access to items you've pinned from across this project",
    icon: Pin,
    component: ProjectPinnedItemsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "purple",
    defaultColumns: 3,
    defaultRowSpan: 3,
  },
};

// ---------------------------------------------------------------------------
// Personal dashboard registry
// ---------------------------------------------------------------------------

export const personalWidgetRegistry: Record<string, WidgetDefinition> = {
  personalTasks: {
    type: "personalTasks",
    name: "My Tasks",
    description: "View and manage your assigned tasks across all projects",
    icon: CheckSquare,
    component: PersonalTasksWidget,
    defaultSize: "md",
    configurable: true,
    accent: "purple",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  personalMetrics: {
    type: "personalMetrics",
    name: "Personal Metrics",
    description: "Track your productivity: tasks completed, hours logged, overdue items",
    icon: BarChart3,
    component: PersonalMetricsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "teal",
    defaultColumns: 4,
    defaultRowSpan: 2,
  },
  personalCalendar: {
    type: "personalCalendar",
    name: "My Calendar",
    description: "View your events in day, week, or list mode with configurable defaults",
    icon: Calendar,
    component: UnifiedCalendarWidget,
    defaultSize: "md",
    configurable: true,
    accent: "schedule",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  crossProjectDeadlines: {
    type: "crossProjectDeadlines",
    name: "Upcoming Deadlines",
    description: "Tasks and milestones due across all your projects",
    icon: Target,
    component: CrossProjectDeadlinesWidget,
    defaultSize: "md",
    configurable: true,
    accent: "amber",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  personalQuickActions: {
    type: "personalQuickActions",
    name: "Quick Actions",
    description: "Clock in/out, log time, create tasks and memos",
    icon: Zap,
    component: PersonalQuickActionsWidget,
    defaultSize: "sm",
    configurable: true,
    accent: "purple",
    defaultColumns: 2,
    defaultRowSpan: 2,
  },
  personalMemos: {
    type: "personalMemos",
    name: "My Memos",
    description: "Quick notes and personal reminders",
    icon: FileText,
    component: PersonalMemosWidget,
    defaultSize: "md",
    configurable: true,
    accent: "amber",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  personalReminders: {
    type: "personalReminders",
    name: "My Reminders",
    description: "Personal reminders and alerts you've set",
    icon: Bell,
    component: PersonalRemindersWidget,
    defaultSize: "md",
    configurable: true,
    accent: "coral",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  myDay: {
    type: "myDay",
    name: "My Day",
    description: "Today's tasks, reminders, and schedule at a glance",
    icon: Sun,
    component: MyDayWidget,
    defaultSize: "md",
    configurable: true,
    accent: "purple",
    defaultColumns: 4,
    defaultRowSpan: 4,
  },
  personalActivity: {
    type: "personalActivity",
    name: "My Activity",
    description: "Activity on your tasks and items you're watching",
    icon: Activity,
    component: PersonalActivityWidget,
    defaultSize: "md",
    configurable: true,
    accent: "teal",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  personalAISummary: {
    type: "personalAISummary",
    name: "AI Summary",
    description: "AI-powered daily summary and productivity insights",
    icon: Sparkles,
    component: PersonalAISummaryWidget,
    defaultSize: "md",
    configurable: true,
    accent: "purple",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  actionableItems: {
    type: "actionableItems",
    name: "Actionable Items",
    description: "Items that need attention: estimates, schedule items, and tasks marked as actionable",
    icon: FileSpreadsheet,
    component: ActionableItemsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "coral",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  pinnedItems: {
    type: "pinnedItems",
    name: "Pinned Items",
    description: "Quick access to your favorite projects, contacts, and pages",
    icon: Pin,
    component: PersonalPinnedItemsWidget,
    defaultSize: "sm",
    configurable: true,
    accent: "green",
    defaultColumns: 2,
    defaultRowSpan: 2,
  },
  myProjects: {
    type: "myProjects",
    name: "My Projects",
    description: "View all projects you are assigned to",
    icon: FolderOpen,
    component: MyProjectsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "project",
    defaultColumns: 4,
    defaultRowSpan: 3,
  },
  personalKPIs: {
    type: "personalKPIs",
    name: "Personal KPIs",
    description: "Track your personal goals and performance metrics (Coming Soon)",
    icon: TrendingUp,
    component: PersonalKPIsWidget,
    defaultSize: "md",
    configurable: true,
    accent: "financial",
    defaultColumns: 4,
    defaultRowSpan: 2,
  },
};

// Legacy widget types that map onto current personal widgets
const personalLegacyWidgetMap: Record<string, string> = {
  dayCalendar: "personalCalendar",
  weekCalendar: "personalCalendar",
};

// ---------------------------------------------------------------------------
// Business dashboard registry
// ---------------------------------------------------------------------------

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
    requiredPermission: { key: "dashboard.financial", action: "view" },
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
    requiredPermission: { key: "dashboard.financial", action: "view" },
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
    requiredPermission: { key: "dashboard.financial", action: "view" },
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
    requiredPermission: { key: "dashboard.financial", action: "view" },
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

// ---------------------------------------------------------------------------
// Per-dashboard config
// ---------------------------------------------------------------------------

/**
 * Persisted-layout keys per dashboard. These are the exact keys/endpoints
 * the dashboards were already using — they MUST NOT change, or users'
 * arranged dashboards would be lost.
 */
export const dashboardPersistence = {
  project: {
    /** Server-side dashboard views (widgets JSON persisted per view). */
    viewsQueryKey: ["/api/dashboard-views"] as const,
    /** The user's active-view preference. */
    preferenceQueryKey: ["/api/dashboard-preference"] as const,
    /** One-time localStorage migration prefix for pre-server layouts. */
    legacyLocalStoragePrefix: "widgets-",
  },
  personal: {
    /** Server-side persisted layout (one row per user). */
    viewsQueryKey: (userId: string) => ["/api/user-workspace/views", userId] as const,
    saveEndpoint: (userId: string) => `/api/user-workspace/views/${userId}`,
    /** One-time localStorage migration keys. */
    legacyWidgetsKey: (userId: string) => `user-workspace-widgets-${userId}`,
    legacyViewsKey: (userId: string) => `user-workspace-views-${userId}`,
    legacyActiveViewKey: (userId: string) => `user-workspace-active-view-${userId}`,
  },
  business: {
    /** Server-side business dashboard views. */
    viewsQueryKey: ["/api/business-dashboard-views"] as const,
    /** localStorage key remembering which view is selected. */
    activeViewStorageKey: (userId: string | undefined) =>
      `business-dashboard-active-view-${userId || "default"}`,
  },
} as const;

export interface DashboardConfig {
  variant: DashboardVariant;
  registry: Record<string, WidgetDefinition>;
  /** Resolve a widget definition, applying any legacy-type mapping. */
  getDefinition: (type: string) => WidgetDefinition | undefined;
}

export const dashboardConfigs: Record<DashboardVariant, DashboardConfig> = {
  project: {
    variant: "project",
    registry: projectWidgetRegistry,
    getDefinition: (type) => projectWidgetRegistry[type],
  },
  personal: {
    variant: "personal",
    registry: personalWidgetRegistry,
    getDefinition: (type) =>
      personalWidgetRegistry[type] || personalWidgetRegistry[personalLegacyWidgetMap[type]],
  },
  business: {
    variant: "business",
    registry: businessWidgetRegistry,
    getDefinition: (type) => businessWidgetRegistry[type],
  },
};

export function getDashboardWidgetDefinition(
  variant: DashboardVariant,
  type: string,
): WidgetDefinition | undefined {
  return dashboardConfigs[variant].getDefinition(type);
}

export function getAvailableWidgets(variant: DashboardVariant): WidgetDefinition[] {
  return Object.values(dashboardConfigs[variant].registry);
}

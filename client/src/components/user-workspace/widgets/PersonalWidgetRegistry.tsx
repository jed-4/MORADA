import { 
  CheckSquare, 
  BarChart3, 
  Calendar, 
  Target,
  Zap,
  FileText,
  Bell,
  Sun,
  Activity,
  Sparkles,
  FileSpreadsheet,
  Pin,
  FolderOpen,
  TrendingUp
} from "lucide-react";
import { WidgetDefinition } from "@/types/widgets";
import PersonalTasksWidget from "./PersonalTasksWidget";
import PersonalMetricsWidget from "./PersonalMetricsWidget";
import CrossProjectDeadlinesWidget from "./CrossProjectDeadlinesWidget";
import PersonalQuickActionsWidget from "./PersonalQuickActionsWidget";
import PersonalMemosWidget from "./PersonalMemosWidget";
import PersonalCalendarWidget from "./PersonalCalendarWidget";
import PersonalRemindersWidget from "./PersonalRemindersWidget";
import MyDayWidget from "./MyDayWidget";
import PersonalActivityWidget from "./PersonalActivityWidget";
import PersonalAISummaryWidget from "./PersonalAISummaryWidget";
import UnifiedCalendarWidget from "./UnifiedCalendarWidget";
import ActionableItemsWidget from "./ActionableItemsWidget";
import PinnedItemsWidget from "./PinnedItemsWidget";
import MyProjectsWidget from "./MyProjectsWidget";
import PersonalKPIsWidget from "./PersonalKPIsWidget";

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
    component: PinnedItemsWidget,
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

const legacyWidgetMap: Record<string, string> = {
  dayCalendar: "personalCalendar",
  weekCalendar: "personalCalendar",
};

export const getPersonalWidgetDefinition = (type: string): WidgetDefinition | undefined => {
  return personalWidgetRegistry[type] || personalWidgetRegistry[legacyWidgetMap[type]];
};

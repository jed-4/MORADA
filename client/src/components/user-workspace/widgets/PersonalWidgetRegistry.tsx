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
  Sparkles
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

export const personalWidgetRegistry: Record<string, WidgetDefinition> = {
  personalTasks: {
    type: "personalTasks",
    name: "My Tasks",
    description: "View and manage your assigned tasks across all projects",
    icon: CheckSquare,
    component: PersonalTasksWidget,
    defaultSize: "md",
    configurable: true,
  },
  personalMetrics: {
    type: "personalMetrics", 
    name: "Personal Metrics",
    description: "Track your productivity: tasks completed, hours logged, overdue items",
    icon: BarChart3,
    component: PersonalMetricsWidget,
    defaultSize: "md",
    configurable: true,
  },
  personalCalendar: {
    type: "personalCalendar",
    name: "My Calendar",
    description: "Upcoming events and appointments",
    icon: Calendar,
    component: PersonalCalendarWidget,
    defaultSize: "md",
    configurable: true,
  },
  crossProjectDeadlines: {
    type: "crossProjectDeadlines",
    name: "Upcoming Deadlines",
    description: "Tasks and milestones due across all your projects",
    icon: Target,
    component: CrossProjectDeadlinesWidget,
    defaultSize: "md",
    configurable: true,
  },
  personalQuickActions: {
    type: "personalQuickActions",
    name: "Quick Actions",
    description: "Clock in/out, log time, create tasks and memos",
    icon: Zap,
    component: PersonalQuickActionsWidget,
    defaultSize: "sm",
    configurable: true,
  },
  personalMemos: {
    type: "personalMemos",
    name: "My Memos",
    description: "Quick notes and personal reminders",
    icon: FileText,
    component: PersonalMemosWidget,
    defaultSize: "md",
    configurable: true,
  },
  personalReminders: {
    type: "personalReminders",
    name: "My Reminders",
    description: "Personal reminders and alerts you've set",
    icon: Bell,
    component: PersonalRemindersWidget,
    defaultSize: "md",
    configurable: true,
  },
  myDay: {
    type: "myDay",
    name: "My Day",
    description: "Today's tasks, reminders, and schedule at a glance",
    icon: Sun,
    component: MyDayWidget,
    defaultSize: "md",
    configurable: true,
  },
  personalActivity: {
    type: "personalActivity",
    name: "My Activity",
    description: "Activity on your tasks and items you're watching",
    icon: Activity,
    component: PersonalActivityWidget,
    defaultSize: "md",
    configurable: true,
  },
  personalAISummary: {
    type: "personalAISummary",
    name: "AI Summary",
    description: "AI-powered daily summary and productivity insights",
    icon: Sparkles,
    component: PersonalAISummaryWidget,
    defaultSize: "md",
    configurable: true,
  },
};

export const getPersonalWidgetDefinition = (type: string): WidgetDefinition | undefined => {
  return personalWidgetRegistry[type];
};

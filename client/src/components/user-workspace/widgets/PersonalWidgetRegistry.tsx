import { 
  CheckSquare, 
  BarChart3, 
  Calendar, 
  Target,
  Zap,
  FileText
} from "lucide-react";
import { WidgetDefinition } from "@/types/widgets";
import PersonalTasksWidget from "./PersonalTasksWidget";
import PersonalMetricsWidget from "./PersonalMetricsWidget";
import CrossProjectDeadlinesWidget from "./CrossProjectDeadlinesWidget";
import PersonalQuickActionsWidget from "./PersonalQuickActionsWidget";
import PersonalMemosWidget from "./PersonalMemosWidget";
import PersonalCalendarWidget from "./PersonalCalendarWidget";

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
};

export const getPersonalWidgetDefinition = (type: string): WidgetDefinition | undefined => {
  return personalWidgetRegistry[type];
};

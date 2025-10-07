import { CheckSquare, BarChart3, FileText, Calendar, Activity } from "lucide-react";
import { WidgetDefinition } from "@/types/widgets";
import TasksWidget from "./TasksWidget";
import MetricsWidget from "./MetricsWidget";
import NotesWidget from "./NotesWidget";
import ScheduleWidget from "./ScheduleWidget";
import ActivityWidget from "./ActivityWidget";

export const widgetRegistry: Record<string, WidgetDefinition> = {
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
};

export const getWidgetDefinition = (type: string): WidgetDefinition | undefined => {
  return widgetRegistry[type];
};
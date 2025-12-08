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
  AlertTriangle
} from "lucide-react";
import { WidgetDefinition } from "@/types/widgets";
import TasksWidget from "./TasksWidget";
import MetricsWidget from "./MetricsWidget";
import NotesWidget from "./NotesWidget";
import ScheduleWidget from "./ScheduleWidget";
import ActivityWidget from "./ActivityWidget";
import ChecklistWidget from "./ChecklistWidget";
import BillsSummaryWidget from "./BillsSummaryWidget";
import VariationsSummaryWidget from "./VariationsSummaryWidget";
import InvoicesSummaryWidget from "./InvoicesSummaryWidget";
import QuickActionsWidget from "./QuickActionsWidget";
import AlertsWidget from "./AlertsWidget";

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
    configurable: false,
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
};

export const getWidgetDefinition = (type: string): WidgetDefinition | undefined => {
  return widgetRegistry[type];
};

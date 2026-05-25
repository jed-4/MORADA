import { Home, FolderOpen, CheckSquare, Calendar as CalendarIcon, Timer, MessageSquare, ClipboardList, Users, FileText, HardDrive, GanttChart, BarChart3 } from "lucide-react";

export const BUSINESS_TABS = [
  { id: "overview", label: "Overview", icon: Home, path: "/business" },
  { id: "projects", label: "Projects", icon: FolderOpen, path: "/business/projects" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, path: "/business/tasks" },
  { id: "calendar", label: "Calendar", icon: CalendarIcon, path: "/business/calendar" },
  { id: "schedule", label: "Schedule", icon: GanttChart, path: "/business/schedule" },
  { id: "files", label: "Files", icon: HardDrive, path: "/business/files" },
  { id: "overheads", label: "Overheads", icon: BarChart3, path: "/business/overheads" },
  { id: "timesheets", label: "Timesheets", icon: Timer, path: "/business/timesheets" },
  { id: "messages", label: "Messages", icon: MessageSquare, path: "/business/messages" },
  { id: "minutes", label: "Minutes", icon: ClipboardList, path: "/business/minutes" },
  { id: "notes", label: "Notes", icon: FileText, path: "/business/notes" },
  { id: "leave", label: "Leave", icon: CalendarIcon, path: "/business/leave" },
  { id: "team", label: "Team", icon: Users, path: "/business-team" },
  { id: "metrics", label: "Metrics", icon: BarChart3, path: "/business/metrics" },
] as const;

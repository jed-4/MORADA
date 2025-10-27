import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  User,
  Filter,
} from "lucide-react";
import type { Task, ScheduleItem, Project, User as UserType, FieldCategoryWithOptions } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    type: "task" | "schedule";
    data: Task | ScheduleItem;
    projectName?: string;
    projectColor?: string | null;
  };
}

const CalendarEventComponent = ({ event }: { event: CalendarEvent }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { resource } = event;

  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: Partial<Task>) => {
      if (resource.type !== "task") return;
      const task = resource.data as Task;
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully.",
      });
    },
  });

  const handleCompleteToggle = (checked: boolean | string) => {
    if (resource.type !== "task" || !completedOption) return;

    const newStatus = checked ? completedOption.key : (defaultOption?.key || "todo");
    updateTaskMutation.mutate({ status: newStatus });
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "high":
        return "bg-red-500/90 border-red-600";
      case "medium":
        return "bg-orange-500/90 border-orange-600";
      case "low":
        return "bg-green-500/90 border-green-600";
      default:
        return "bg-blue-500/90 border-blue-600";
    }
  };

  if (resource.type === "task") {
    const task = resource.data as Task;
    const isCompleted = task.status === completedOption?.key;
    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isCompleted;

    return (
      <div
        className={`
          ${getPriorityColor(task.priority)}
          ${isCompleted ? "opacity-60 line-through" : ""}
          ${isOverdue ? "bg-red-700/90 border-red-800" : ""}
          text-white text-xs p-2 rounded border-l-4 cursor-pointer hover:opacity-80 transition-opacity
        `}
        data-testid={`calendar-event-task-${task.id}`}
      >
        <div className="flex items-start gap-2">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={handleCompleteToggle}
            className="mt-0.5 h-3 w-3 border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
            data-testid={`checkbox-task-${task.id}`}
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{task.title}</div>
            {resource.projectName && (
              <div className="text-xs opacity-90 mt-1">{resource.projectName}</div>
            )}
            {task.assigneeName && (
              <div className="flex items-center gap-1 mt-1 opacity-90">
                <User className="h-3 w-3" />
                <span className="text-xs truncate">{task.assigneeName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Schedule item
  const scheduleItem = resource.data as ScheduleItem;
  const bgColor = scheduleItem.color || getPriorityColor(scheduleItem.priority);

  return (
    <div
      className={`
        ${bgColor}
        text-white text-xs p-2 rounded border-l-4 cursor-pointer hover:opacity-80 transition-opacity
      `}
      data-testid={`calendar-event-schedule-${scheduleItem.id}`}
    >
      <div className="font-medium truncate">{scheduleItem.name}</div>
      {resource.projectName && (
        <div className="text-xs opacity-90 mt-1">{resource.projectName}</div>
      )}
      {scheduleItem.assignedToName && (
        <div className="flex items-center gap-1 mt-1 opacity-90">
          <User className="h-3 w-3" />
          <span className="text-xs truncate">{scheduleItem.assignedToName}</span>
        </div>
      )}
    </div>
  );
};

export default function BusinessCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<any>(Views.WEEK);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Fetch all projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch all tasks across all projects
  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  // Fetch all schedule items
  const { data: allScheduleItems = [] } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedule-items/all"],
  });

  // Fetch team members
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Convert tasks and schedule items to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    const taskEvents: CalendarEvent[] = allTasks
      .filter(task => task.dueDate)
      .filter(task => selectedUser === "all" || task.assigneeId === selectedUser)
      .filter(task => selectedProject === "all" || task.projectId === selectedProject)
      .map(task => {
        const project = projects.find(p => p.id === task.projectId);
        return {
          id: `task-${task.id}`,
          title: task.title,
          start: new Date(task.dueDate!),
          end: new Date(task.dueDate!),
          resource: {
            type: "task" as const,
            data: task,
            projectName: project?.name,
            projectColor: project?.color,
          },
        };
      });

    const scheduleEvents: CalendarEvent[] = allScheduleItems
      .filter(item => selectedUser === "all" || item.assignedToId === selectedUser)
      .filter(item => selectedProject === "all" || item.scheduleId === selectedProject)
      .map(item => {
        const project = projects.find(p => p.id === item.scheduleId);
        return {
          id: `schedule-${item.id}`,
          title: item.name,
          start: new Date(item.startDate),
          end: new Date(item.endDate),
          resource: {
            type: "schedule" as const,
            data: item,
            projectName: project?.name,
            projectColor: project?.color,
          },
        };
      });

    return [...taskEvents, ...scheduleEvents];
  }, [allTasks, allScheduleItems, projects, selectedUser, selectedProject]);

  const CustomToolbar = ({ label, onNavigate, onView }: any) => (
    <div className="flex flex-col gap-4 mb-4 p-4 border-b">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("PREV")}
            data-testid="button-calendar-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("TODAY")}
            data-testid="button-calendar-today"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate("NEXT")}
            data-testid="button-calendar-next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          {label}
        </h2>

        <div className="flex items-center gap-1">
          {[
            { key: "month", value: Views.MONTH },
            { key: "week", value: Views.WEEK },
            { key: "day", value: Views.DAY }
          ].map(({ key, value }) => (
            <Button
              key={key}
              variant={currentView === value ? "default" : "outline"}
              size="sm"
              onClick={() => onView(value)}
              data-testid={`button-view-${key}`}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>

        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-[200px]" data-testid="select-project-filter">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(project => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedUser} onValueChange={setSelectedUser}>
          <SelectTrigger className="w-[200px]" data-testid="select-user-filter">
            <SelectValue placeholder="All Team Members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Team Members</SelectItem>
            {users.map(user => (
              <SelectItem key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="secondary" data-testid="event-count">
          {events.length} events
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" data-testid="business-calendar">
      <div className="flex-1 min-h-0 p-4">
        <Card className="h-full flex flex-col">
          <div className="flex-1 min-h-0">
            <BigCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: "100%" }}
              view={currentView}
              date={currentDate}
              onNavigate={setCurrentDate}
              onView={setCurrentView}
              popup
              components={{
                event: CalendarEventComponent,
                toolbar: CustomToolbar,
              }}
              formats={{
                timeGutterFormat: "HH:mm",
                eventTimeRangeFormat: () => "",
              }}
              step={60}
              timeslots={1}
              defaultView={Views.WEEK}
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              className="rbc-calendar"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

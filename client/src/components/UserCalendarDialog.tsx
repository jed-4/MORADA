import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar as BigCalendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  User,
} from "lucide-react";
import type { Task, ScheduleItem, Project, FieldCategoryWithOptions } from "@shared/schema";
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
    </div>
  );
};

interface UserCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserCalendarDialog({ open, onOpenChange }: UserCalendarDialogProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<any>(Views.WEEK);

  // Fetch all projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  // Fetch all user's tasks across all projects
  const { data: userTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks/user"],
    enabled: open,
  });

  // Convert tasks to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    return userTasks
      .filter(task => task.dueDate)
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
  }, [userTasks, projects]);

  const CustomToolbar = ({ label, onNavigate, onView }: any) => (
    <div className="flex items-center justify-between mb-4 pb-4 border-b">
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

      <h3 className="text-base font-semibold">{label}</h3>

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
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[80vh]" data-testid="user-calendar-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            My Calendar
            <Badge variant="secondary" className="ml-2" data-testid="event-count">
              {events.length} tasks
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <BigCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "calc(80vh - 120px)" }}
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
      </DialogContent>
    </Dialog>
  );
}

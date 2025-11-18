import { Calendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { User } from "lucide-react";
import type { Task, FieldCategoryWithOptions } from "@shared/schema";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Setup the localizer for react-big-calendar
const localizer = momentLocalizer(moment);

interface TaskCalendarProps {
  tasks: Task[];
  projectId: string;
  onTaskClick: (task: Task) => void;
  currentDate: Date;
  currentView: typeof Views[keyof typeof Views];
  onNavigate: (date: Date) => void;
  onViewChange: (view: typeof Views[keyof typeof Views]) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Task;
}

const TaskCalendarEvent = ({ event }: { event: CalendarEvent }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const task = event.resource;

  // Fetch field categories to get completed status option
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });
  
  // Find the task status category and its completed option
  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: Partial<Task>) => {
      return await apiRequest(`/api/tasks/${task.id}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.projectId] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update task status.",
        variant: "destructive",
      });
    },
  });

  const handleCompleteToggle = (checked: boolean | string) => {
    if (!completedOption) {
      toast({
        title: "No completed status configured",
        description: "Please configure a completed status in field settings",
        variant: "destructive",
      });
      return;
    }
    
    // Set status based on checked state
    const newStatus = checked
      ? completedOption.key
      : (defaultOption?.key || "todo");
    
    const updates: Partial<Task> = { status: newStatus };
    updateTaskMutation.mutate(updates);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 dark:bg-red-900/20 text-red-900 dark:text-red-100 border-red-300 dark:border-red-700";
      case "medium":
        return "bg-orange-100 dark:bg-orange-900/20 text-orange-900 dark:text-orange-100 border-orange-300 dark:border-orange-700";
      case "low":
        return "bg-green-100 dark:bg-green-900/20 text-green-900 dark:text-green-100 border-green-300 dark:border-green-700";
      default:
        return "bg-blue-100 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 border-blue-300 dark:border-blue-700";
    }
  };

  const isCompleted = task.status === completedOption?.key;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isCompleted;

  return (
    <div
      className={`
        ${getPriorityColor(task.priority || "medium")}
        ${isCompleted ? "opacity-60 line-through" : ""}
        ${isOverdue ? "bg-red-200 dark:bg-red-900/30 text-red-900 dark:text-red-100 border-red-400 dark:border-red-600" : ""}
        text-xs p-2 rounded border-l-4 cursor-pointer hover:opacity-80 transition-opacity
      `}
      data-testid={`calendar-task-${task.id}`}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={handleCompleteToggle}
          className="mt-0.5 h-3 w-3"
          data-testid={`checkbox-task-${task.id}`}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{task.title}</div>
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
};

export function TaskCalendar({ 
  tasks, 
  projectId, 
  onTaskClick,
  currentDate,
  currentView,
  onNavigate,
  onViewChange,
}: TaskCalendarProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<Task> }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", projectId] });
      toast({
        title: "Task updated",
        description: "Task due date has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update task due date.",
        variant: "destructive",
      });
    },
  });

  // Convert tasks to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    return tasks
      .filter(task => task.dueDate)
      .map(task => ({
        id: task.id,
        title: task.title,
        start: new Date(task.dueDate!),
        end: new Date(task.dueDate!),
        resource: task,
      }));
  }, [tasks]);

  const handleSelectEvent = (event: CalendarEvent) => {
    onTaskClick(event.resource);
  };

  const handleEventDrop = ({ event, start }: { event: CalendarEvent; start: Date }) => {
    // Normalize to end of day to prevent premature overdue states
    const endOfDay = new Date(start);
    endOfDay.setHours(23, 59, 59, 999);
    
    updateTaskMutation.mutate({ 
      taskId: event.id, 
      updates: { dueDate: endOfDay } 
    });
  };

  return (
    <div className="h-full w-full flex flex-col" data-testid="task-calendar">
      <div className="flex-1 min-h-0">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%" }}
          view={currentView}
          date={currentDate}
          onNavigate={onNavigate}
          onView={onViewChange}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop as any}
          onEventResize={handleEventDrop as any}
          draggableAccessor={() => true}
          resizable
          popup
          toolbar={false}
          components={{
            event: TaskCalendarEvent,
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
    </div>
  );
}
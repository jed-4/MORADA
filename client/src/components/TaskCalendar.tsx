import { Calendar, momentLocalizer, Views } from "react-big-calendar";
import moment from "moment";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, User } from "lucide-react";
import type { Task } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Setup the localizer for react-big-calendar
const localizer = momentLocalizer(moment);

interface TaskCalendarProps {
  tasks: Task[];
  projectId: string;
  onTaskClick: (task: Task) => void;
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
    const newStatus = typeof checked === "boolean" && checked ? "done" : task.status === "done" ? "todo" : "done";
    const completedAt = newStatus === "done" ? new Date() : null;
    
    updateTaskMutation.mutate({
      status: newStatus,
      completedAt,
    });
  };

  const getPriorityColor = (priority: string) => {
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

  const isCompleted = task.status === "done";
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isCompleted;

  return (
    <div
      className={`
        ${getPriorityColor(task.priority || "medium")}
        ${isCompleted ? "opacity-60 line-through" : ""}
        ${isOverdue ? "bg-red-700/90 border-red-800" : ""}
        text-white text-xs p-2 rounded border-l-4 cursor-pointer hover:opacity-80 transition-opacity
      `}
      data-testid={`calendar-task-${task.id}`}
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

export function TaskCalendar({ tasks, projectId, onTaskClick }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState(Views.WEEK);
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
      updates: { dueDate: endOfDay },
    });
  };

  const handleNavigate = (date: Date) => {
    setCurrentDate(date);
  };

  const handleViewChange = (view: any) => {
    setCurrentView(view);
  };

  // Custom toolbar
  const CustomToolbar = ({ label, onNavigate, onView }: any) => (
    <div className="flex items-center justify-between mb-4 p-4 border-b">
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

      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          {label}
        </h2>
      </div>

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
          onNavigate={handleNavigate}
          onView={handleViewChange}
          onSelectEvent={handleSelectEvent}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventDrop}
          draggableAccessor={() => true}
          resizable
          popup
          components={{
            event: TaskCalendarEvent,
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
    </div>
  );
}
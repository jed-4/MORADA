import { useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { Task, ScheduleItem, Project, FieldCategoryWithOptions } from "@shared/schema";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UserCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserCalendarDialog({ open, onOpenChange }: UserCalendarDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all projects
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  // Fetch all user's tasks across all projects
  const { data: userTasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks/user"],
    enabled: open,
  });

  // Fetch Google Calendar events
  const { 
    data: googleCalendarEvents = [], 
    isLoading: isLoadingGoogleEvents,
    isError: isGoogleCalendarError,
    error: googleCalendarError,
  } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/google-calendar/events"],
    enabled: open,
  });

  // Fetch field categories for status handling
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
    enabled: open,
  });

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  // Show error toast when Google Calendar fetching fails
  useEffect(() => {
    if (isGoogleCalendarError && open) {
      toast({
        title: "Failed to load Google Calendar",
        description: "Unable to fetch your Google Calendar events. Please try reconnecting in your profile.",
        variant: "destructive",
      });
    }
  }, [isGoogleCalendarError, open, toast]);

  // Update task status mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully.",
      });
    },
  });

  // Reschedule task mutation
  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate }: { taskId: string; dueDate: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { dueDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task rescheduled",
        description: "Task has been moved to the new date.",
      });
    },
  });

  // Convert tasks to calendar events and merge with Google Calendar events
  const events: CalendarEvent[] = useMemo(() => {
    const taskEvents = userTasks
      .filter(task => task.dueDate)
      .map(task => {
        const project = projects.find(p => p.id === task.projectId);
        const isCompleted = task.status === completedOption?.key;
        
        return {
          id: task.id,
          title: task.title,
          startDate: new Date(task.dueDate!),
          endDate: new Date(task.dueDate!),
          startTime: task.startTime,
          endTime: task.endTime,
          color: project?.color,
          projectId: task.projectId,
          projectColor: project?.color,
          type: "task" as const,
          status: task.status,
          isCompleted,
        };
      });

    // Merge with Google Calendar events
    return [...taskEvents, ...googleCalendarEvents];
  }, [userTasks, projects, completedOption, googleCalendarEvents]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    // Don't allow completing Google Calendar events
    if (eventId.startsWith('google-')) {
      return;
    }
    const newStatus = completed 
      ? (completedOption?.key || "done") 
      : (defaultOption?.key || "todo");
    updateTaskMutation.mutate({ taskId: eventId, status: newStatus });
  };

  const handleEventReschedule = (eventId: string, newDate: Date, eventType: CalendarEvent["type"]) => {
    // Don't allow rescheduling Google Calendar events
    if (eventType === "google-calendar") {
      toast({
        title: "Cannot reschedule Google Calendar event",
        description: "Please update this event in Google Calendar directly.",
        variant: "destructive",
      });
      return;
    }
    
    if (eventType === "task") {
      rescheduleTaskMutation.mutate({ 
        taskId: eventId, 
        dueDate: format(newDate, "yyyy-MM-dd")
      });
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    // Could open task detail modal here
    console.log("Event clicked:", event);
  };

  const isLoading = isLoadingTasks || isLoadingGoogleEvents;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[85vh]" data-testid="user-calendar-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              My Calendar
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">Loading calendar...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const taskCount = events.filter(e => e.type === "task").length;
  const googleEventCount = events.filter(e => e.type === "google-calendar").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh]" data-testid="user-calendar-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <CalendarIcon className="h-5 w-5" />
            My Calendar
            <Badge variant="secondary" className="ml-2" data-testid="event-count">
              {taskCount} tasks
            </Badge>
            {googleEventCount > 0 && (
              <Badge variant="outline" className="gap-1" style={{ borderColor: '#4285f4', color: '#4285f4' }}>
                {googleEventCount} from Google
              </Badge>
            )}
            {isGoogleCalendarError && (
              <Badge variant="destructive" className="gap-1" data-testid="google-calendar-error-badge">
                <AlertCircle className="h-3 w-3" />
                Google Calendar error
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <EnhancedCalendar
            events={events}
            onEventClick={handleEventClick}
            onEventComplete={handleEventComplete}
            onEventReschedule={handleEventReschedule}
            showCompletionCheckbox={true}
            initialView="week"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

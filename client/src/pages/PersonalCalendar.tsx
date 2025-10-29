import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, AlertCircle } from "lucide-react";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { CalendarEventDetailDialog } from "@/components/CalendarEventDetailDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PersonalCalendar() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch user's tasks
  const { data: userTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["/api/tasks", "user"],
    queryFn: async () => {
      const allTasks = await apiRequest("/api/tasks", "GET");
      // Filter tasks assigned to current user
      return Array.isArray(allTasks) ? allTasks.filter((task: any) => task.assigneeId === user?.id && task.dueDate) : [];
    },
    enabled: !!user,
  });

  // Fetch projects for color coding
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Fetch Google Calendar events
  const { data: googleCalendarEvents = [], error: googleCalendarError } = useQuery({
    queryKey: ["/api/google-calendar/events"],
    queryFn: async () => {
      try {
        const response = await apiRequest("/api/google-calendar/events", "GET");
        return response || [];
      } catch (error: any) {
        // If not connected or other error, return empty array
        if (error.status === 400 || error.status === 401) {
          return [];
        }
        throw error;
      }
    },
    retry: false,
  });

  // Fetch task status options
  const { data: fieldCategories = [] } = useQuery({
    queryKey: ["/api/field-categories"],
  });

  const taskStatusCategory = fieldCategories.find((cat: any) => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];
  const completedOption = statusOptions.find((opt: any) => opt.key === "done");

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task status updated" });
    },
  });

  // Reschedule task mutation
  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate, startTime }: { taskId: string; dueDate: string; startTime?: string }) => {
      const payload: any = { dueDate };
      if (startTime) {
        payload.startTime = startTime;
      }
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task rescheduled" });
    },
  });

  // Resize task mutation
  const resizeTaskMutation = useMutation({
    mutationFn: async ({ taskId, startTime, endTime }: { taskId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { startTime, endTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task time updated" });
    },
  });

  // Combine tasks and Google Calendar events
  const events = useMemo(() => {
    const taskEvents: CalendarEvent[] = userTasks
      .filter((task: any) => task.dueDate)
      .map((task: any) => {
        const project = projects.find((p: any) => p.id === task.projectId);
        const isCompleted = task.status === completedOption?.key || task.status === "done" || task.status === "completed";
        
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
    const defaultOption = statusOptions.find((opt: any) => opt.key === "todo");
    const newStatus = completed 
      ? (completedOption?.key || "done") 
      : (defaultOption?.key || "todo");
    updateTaskMutation.mutate({ taskId: eventId, status: newStatus });
  };

  const handleEventReschedule = (eventId: string, newDate: Date, eventType: CalendarEvent["type"], newTime?: string) => {
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
      const updatePayload: any = { 
        taskId: eventId, 
        dueDate: format(newDate, "yyyy-MM-dd")
      };
      
      // If time is provided, update startTime
      if (newTime) {
        updatePayload.startTime = newTime;
      }
      
      rescheduleTaskMutation.mutate(updatePayload);
    }
  };

  const handleEventResize = (eventId: string, startTime: string, endTime: string, eventType: CalendarEvent["type"]) => {
    // Don't allow resizing Google Calendar events
    if (eventType === "google-calendar") {
      toast({
        title: "Cannot resize Google Calendar event",
        description: "Please update this event in Google Calendar directly.",
        variant: "destructive",
      });
      return;
    }
    
    if (eventType === "task") {
      resizeTaskMutation.mutate({ taskId: eventId, startTime, endTime });
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDetailDialogOpen(true);
  };

  const isLoading = isLoadingTasks;
  const userName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'My' : 'My';
  const taskCount = events.filter(e => e.type === "task").length;
  const googleEventCount = events.filter(e => e.type === "google-calendar").length;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-6" data-testid="personal-calendar">
        <Card className="h-full flex items-center justify-center">
          <div className="text-muted-foreground">Loading calendar...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-6" data-testid="personal-calendar">
      <Card className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{userName} Calendar</h2>
            <Badge variant="secondary" data-testid="task-count">
              {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </Badge>
            {googleEventCount > 0 && (
              <Badge 
                variant="outline" 
                style={{ borderColor: '#4285f4', color: '#4285f4' }}
                data-testid="google-event-count"
              >
                {googleEventCount} Google {googleEventCount === 1 ? 'event' : 'events'}
              </Badge>
            )}
          </div>
        </div>

        {/* Google Calendar Error Alert */}
        {googleCalendarError && (
          <div className="p-4 border-b">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Failed to load Google Calendar events. Please check your connection in Profile settings.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Calendar */}
        <div className="flex-1 min-h-0">
          <EnhancedCalendar
            events={events}
            onEventClick={handleEventClick}
            onEventComplete={handleEventComplete}
            onEventReschedule={handleEventReschedule}
            onEventResize={handleEventResize}
            showCompletionCheckbox={true}
            initialView="week"
          />
        </div>
      </Card>

      <CalendarEventDetailDialog
        event={selectedEvent}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  );
}

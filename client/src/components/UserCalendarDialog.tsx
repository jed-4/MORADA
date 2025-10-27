import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon } from "lucide-react";
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

  // Fetch field categories for status handling
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
    enabled: open,
  });

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

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

  // Convert tasks to calendar events
  const events: CalendarEvent[] = useMemo(() => {
    return userTasks
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
  }, [userTasks, projects, completedOption]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    const newStatus = completed 
      ? (completedOption?.key || "done") 
      : (defaultOption?.key || "todo");
    updateTaskMutation.mutate({ taskId: eventId, status: newStatus });
  };

  const handleEventReschedule = (eventId: string, newDate: Date, eventType: "task" | "schedule" | "meeting") => {
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

  if (isLoadingTasks) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh]" data-testid="user-calendar-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            My Calendar
            <Badge variant="secondary" className="ml-2" data-testid="event-count">
              {events.length} tasks
            </Badge>
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

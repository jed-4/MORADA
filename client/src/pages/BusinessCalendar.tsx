import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarIcon, Filter } from "lucide-react";
import { format } from "date-fns";
import type { Task, ScheduleItem, Project, User as UserType, FieldCategoryWithOptions, Schedule } from "@shared/schema";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function BusinessCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  // Fetch all schedules to map schedule items to projects
  const { data: schedules = [] } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
  });

  // Fetch team members
  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  // Fetch field categories for status handling
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task updated",
        description: "Task status has been updated successfully.",
      });
    },
  });

  // Reschedule task mutation
  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate, startTime }: { taskId: string; dueDate: string; startTime?: string }) => {
      const payload: any = { dueDate };
      if (startTime !== undefined) {
        payload.startTime = startTime;
      }
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task rescheduled",
        description: "Task has been moved to the new date.",
      });
    },
  });

  // Reschedule schedule item mutation
  const rescheduleScheduleItemMutation = useMutation({
    mutationFn: async ({ itemId, startDate, endDate, startTime, endTime }: { itemId: string; startDate: string; endDate: string; startTime?: string; endTime?: string }) => {
      const payload: any = { startDate, endDate };
      if (startTime !== undefined) {
        payload.startTime = startTime;
      }
      if (endTime !== undefined) {
        payload.endTime = endTime;
      }
      return await apiRequest(`/api/schedule-items/${itemId}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-items/all"] });
      toast({
        title: "Event rescheduled",
        description: "Schedule item has been moved to the new date.",
      });
    },
  });

  // Convert tasks and schedule items to calendar events with filtering
  const events: CalendarEvent[] = useMemo(() => {
    // Filter and convert tasks
    const taskEvents: CalendarEvent[] = allTasks
      .filter(task => task.dueDate)
      .filter(task => selectedUser === "all" || task.assigneeId === selectedUser)
      .filter(task => selectedProject === "all" || task.projectId === selectedProject)
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

    // Filter and convert schedule items
    const scheduleEvents: CalendarEvent[] = allScheduleItems
      .map(item => {
        // Find the schedule to get the project
        const schedule = schedules.find(s => s.id === item.scheduleId);
        const project = schedule ? projects.find(p => p.id === schedule.projectId) : undefined;
        
        return {
          item,
          schedule,
          project,
        };
      })
      .filter(({ item, schedule, project }) => {
        // Filter by user
        if (selectedUser !== "all" && item.assignedToId !== selectedUser) return false;
        // Filter by project
        if (selectedProject !== "all" && schedule?.projectId !== selectedProject) return false;
        return true;
      })
      .map(({ item, project }) => {
        const isCompleted = item.status === "completed";
        
        return {
          id: item.id,
          title: item.name,
          startDate: new Date(item.startDate),
          endDate: new Date(item.endDate),
          startTime: item.startTime,
          endTime: item.endTime,
          color: item.color || project?.color,
          projectId: project?.id,
          projectColor: project?.color,
          type: "schedule" as const,
          status: item.status,
          isCompleted,
        };
      });

    return [...taskEvents, ...scheduleEvents];
  }, [allTasks, allScheduleItems, schedules, projects, selectedUser, selectedProject, completedOption]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    const event = events.find(e => e.id === eventId);
    if (event?.type === "task") {
      const newStatus = completed 
        ? (completedOption?.key || "done") 
        : (defaultOption?.key || "todo");
      updateTaskMutation.mutate({ taskId: eventId, status: newStatus });
    }
  };

  const handleEventReschedule = (eventId: string, newDate: Date, eventType: "task" | "schedule" | "meeting" | "google-calendar", newTime?: string) => {
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
    } else if (eventType === "schedule") {
      const event = allScheduleItems.find(item => item.id === eventId);
      if (event) {
        const oldStart = new Date(event.startDate);
        const oldEnd = new Date(event.endDate);
        const duration = oldEnd.getTime() - oldStart.getTime();
        
        const newStartDate = format(newDate, "yyyy-MM-dd");
        const newEndDate = format(new Date(newDate.getTime() + duration), "yyyy-MM-dd");
        
        const updatePayload: any = {
          itemId: eventId,
          startDate: newStartDate,
          endDate: newEndDate,
        };
        
        // If time is provided, update startTime and calculate endTime
        if (newTime) {
          updatePayload.startTime = newTime;
          // Calculate endTime based on duration if original had times
          if (event.startTime && event.endTime) {
            const [startHour, startMin] = event.startTime.split(':').map(Number);
            const [endHour, endMin] = event.endTime.split(':').map(Number);
            const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
            
            const [newHour, newMin] = newTime.split(':').map(Number);
            const endTotalMinutes = newHour * 60 + newMin + durationMinutes;
            const endH = Math.floor(endTotalMinutes / 60) % 24;
            const endM = endTotalMinutes % 60;
            updatePayload.endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
          }
        }
        
        rescheduleScheduleItemMutation.mutate(updatePayload);
      }
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    console.log("Event clicked:", event);
  };

  return (
    <div className="flex flex-col h-full" data-testid="business-calendar">
      <div className="flex-1 min-h-0 p-6">
        <Card className="h-full flex flex-col">
          {/* Header with filters */}
          <div className="flex flex-col gap-4 p-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                <h2 className="text-lg font-semibold">Business Calendar</h2>
                <Badge variant="secondary" data-testid="event-count">
                  {events.length} events
                </Badge>
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
                  {users.filter(u => u.userCategory === "team").map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Calendar */}
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
        </Card>
      </div>
    </div>
  );
}

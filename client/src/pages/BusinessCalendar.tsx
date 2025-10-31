import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO, isWithinInterval } from "date-fns";
import type { Task, ScheduleItem, Project, User as UserType, FieldCategoryWithOptions, Schedule } from "@shared/schema";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import CalendarFilters, { CalendarFilters as CalendarFiltersType } from "@/components/CalendarFilters";
import SavedViews, { CalendarView } from "@/components/SavedViews";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// Helper function to normalize filter dates from API responses
function normalizeFilterDates(filters: CalendarFiltersType): CalendarFiltersType {
  const normalized = { ...filters };
  
  if (normalized.dateFrom && typeof normalized.dateFrom === 'string') {
    normalized.dateFrom = new Date(normalized.dateFrom);
  }
  if (normalized.dateTo && typeof normalized.dateTo === 'string') {
    normalized.dateTo = new Date(normalized.dateTo);
  }
  
  return normalized;
}

export default function BusinessCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filters, setFilters] = useState<CalendarFiltersType>({});
  const [calendarMode, setCalendarMode] = useState<string>("week");
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>();

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
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  // Create default view on first load
  const { data: views = [] } = useQuery({
    queryKey: ["/api/calendar-views", "business"],
    enabled: !!user,
  });

  const createDefaultViewMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/calendar-views", "POST", {
        name: "All Events",
        calendarType: "business",
        filters: {},
        calendarMode: "week",
        isDefault: true,
        sharedWith: null,
      });
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views"] });
      setSelectedViewId(newView.id);
    },
  });

  // Create default view if none exists
  useEffect(() => {
    if (user && views.length === 0 && !createDefaultViewMutation.isPending) {
      createDefaultViewMutation.mutate();
    }
  }, [user, views.length]);

  // Set selected view to default on load
  useEffect(() => {
    if (views.length > 0 && !selectedViewId) {
      const defaultView = views.find((v: CalendarView) => v.isDefault);
      if (defaultView) {
        setSelectedViewId(defaultView.id);
        setFilters(normalizeFilterDates(defaultView.filters || {}));
        setCalendarMode(defaultView.calendarMode || "week");
      }
    }
  }, [views, selectedViewId]);

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

  // Resize task mutation
  const resizeTaskMutation = useMutation({
    mutationFn: async ({ taskId, startTime, endTime }: { taskId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { startTime, endTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task time updated",
        description: "Task time has been updated successfully.",
      });
    },
  });

  // Resize schedule item mutation
  const resizeScheduleItemMutation = useMutation({
    mutationFn: async ({ itemId, startTime, endTime }: { itemId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/schedule-items/${itemId}`, "PATCH", { startTime, endTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-items/all"] });
      toast({
        title: "Event time updated",
        description: "Schedule item time has been updated successfully.",
      });
    },
  });

  // Convert tasks and schedule items to calendar events with filtering
  const filteredEvents: CalendarEvent[] = useMemo(() => {
    // Convert tasks to calendar events
    const taskEvents: CalendarEvent[] = allTasks
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
          assigneeId: task.assigneeId,
        };
      });

    // Convert schedule items to calendar events
    const scheduleEvents: CalendarEvent[] = allScheduleItems
      .map(item => {
        const schedule = schedules.find(s => s.id === item.scheduleId);
        const project = schedule ? projects.find(p => p.id === schedule.projectId) : undefined;
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
          assigneeId: item.assignedToId,
        };
      });

    const allEvents = [...taskEvents, ...scheduleEvents];

    // Apply filters
    let filtered = allEvents;

    // Event type filter
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      filtered = filtered.filter(event => {
        if (event.type === "schedule") {
          return filters.eventTypes!.includes("schedule-item");
        }
        return filters.eventTypes!.includes(event.type);
      });
    }

    // Project filter
    if (filters.projects && filters.projects.length > 0) {
      filtered = filtered.filter(event => 
        event.projectId && filters.projects!.includes(event.projectId)
      );
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      filtered = filtered.filter(event => 
        event.status && filters.status!.includes(event.status)
      );
    }

    // Assignee filter
    if (filters.assignees && filters.assignees.length > 0) {
      filtered = filtered.filter(event => 
        event.assigneeId && filters.assignees!.includes(event.assigneeId)
      );
    }

    // Date range filter
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(event => {
        const eventDate = event.startDate;
        if (filters.dateFrom && filters.dateTo) {
          return isWithinInterval(eventDate, { start: filters.dateFrom, end: filters.dateTo });
        } else if (filters.dateFrom) {
          return eventDate >= filters.dateFrom;
        } else if (filters.dateTo) {
          return eventDate <= filters.dateTo;
        }
        return true;
      });
    }

    return filtered;
  }, [allTasks, allScheduleItems, schedules, projects, completedOption, filters]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    const event = filteredEvents.find(e => e.id === eventId);
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
        
        if (newTime) {
          updatePayload.startTime = newTime;
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

  const handleEventResize = (eventId: string, startTime: string, endTime: string, eventType: "task" | "schedule" | "meeting" | "google-calendar") => {
    if (eventType === "task") {
      resizeTaskMutation.mutate({ taskId: eventId, startTime, endTime });
    } else if (eventType === "schedule") {
      resizeScheduleItemMutation.mutate({ itemId: eventId, startTime, endTime });
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    console.log("Event clicked:", event);
  };

  const handleViewSelect = (view: CalendarView) => {
    setSelectedViewId(view.id);
    setFilters(normalizeFilterDates(view.filters || {}));
    setCalendarMode(view.calendarMode || "week");
  };

  return (
    <div className="flex flex-col h-full" data-testid="business-calendar">
      {/* Top Bar with Title, Views, and Filters */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Business Calendar</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SavedViews
            calendarType="business"
            currentFilters={filters}
            currentCalendarMode={calendarMode}
            onViewSelect={handleViewSelect}
            selectedViewId={selectedViewId}
          />
          <CalendarFilters
            filters={filters}
            onFiltersChange={setFilters}
            availableProjects={projects.map((p: any) => ({ id: p.id, name: p.name, color: p.color }))}
            availableStatuses={statusOptions.map((s: any) => ({ key: s.key, label: s.name }))}
            availableAssignees={users
              .filter((u: any) => {
                if (u.userCategory !== "team") return false;
                const hasName = (u.firstName && u.firstName.trim()) || (u.lastName && u.lastName.trim());
                const hasEmail = u.email && u.email.trim();
                return hasName || hasEmail;
              })
              .map((u: any) => ({ 
                id: u.id, 
                name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown User'
              }))}
            showEventTypeFilter={true}
            calendarType="business"
          />
        </div>
      </div>

      {/* Calendar Card */}
      <div className="flex-1 min-h-0 p-6">
        <Card className="h-full flex flex-col">
          <div className="flex-1 min-h-0">
            <EnhancedCalendar
              events={filteredEvents}
              onEventClick={handleEventClick}
              onEventComplete={handleEventComplete}
              onEventReschedule={handleEventReschedule}
              onEventResize={handleEventResize}
              showCompletionCheckbox={true}
              initialView={calendarMode as any}
              onViewChange={setCalendarMode}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

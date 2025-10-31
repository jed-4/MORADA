import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isWithinInterval } from "date-fns";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarIcon, AlertCircle, User } from "lucide-react";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { CalendarEventDetailDialog } from "@/components/CalendarEventDetailDialog";
import CalendarFilters, { CalendarFilters as CalendarFiltersType } from "@/components/CalendarFilters";
import SavedViews, { CalendarView } from "@/components/SavedViews";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

export default function PersonalCalendar() {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [filters, setFilters] = useState<CalendarFiltersType>({});
  const [calendarMode, setCalendarMode] = useState<string>("week");
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  const { toast } = useToast();
  const { user } = useAuth();

  // Check if user has "View Team Calendars" permission
  const { data: permissions = [] } = useQuery({
    queryKey: ["/api/user-permissions"],
    enabled: !!user,
  });

  const hasTeamCalendarPermission = permissions.some(
    (p: any) => p.permission?.key === "calendar.view_team_calendars"
  );

  // Fetch team members (other users in company)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: hasTeamCalendarPermission && !!user,
  });

  const displayedUserId = selectedUserId || user?.id;
  const displayedUser = teamMembers.find((u: any) => u.id === displayedUserId) || user;

  // Fetch tasks for displayed user
  const { data: userTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["/api/tasks", displayedUserId],
    queryFn: async () => {
      const allTasks = await apiRequest("/api/tasks", "GET");
      return Array.isArray(allTasks) 
        ? allTasks.filter((task: any) => task.assigneeId === displayedUserId && task.dueDate) 
        : [];
    },
    enabled: !!displayedUserId,
  });

  // Fetch projects for color coding
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Fetch Google Calendar events (only for current user)
  const { data: googleCalendarEvents = [], error: googleCalendarError } = useQuery({
    queryKey: ["/api/google-calendar/events"],
    queryFn: async () => {
      try {
        const response = await apiRequest("/api/google-calendar/events", "GET");
        return response || [];
      } catch (error: any) {
        if (error.status === 400 || error.status === 401) {
          return [];
        }
        throw error;
      }
    },
    retry: false,
    enabled: displayedUserId === user?.id,
  });

  // Fetch task status options
  const { data: fieldCategories = [] } = useQuery({
    queryKey: ["/api/field-categories"],
  });

  const taskStatusCategory = fieldCategories.find((cat: any) => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];
  const completedOption = statusOptions.find((opt: any) => opt.key === "done");

  // Create default view on first load
  const { data: views = [] } = useQuery({
    queryKey: ["/api/calendar-views", "personal"],
    queryFn: async () => {
      return await apiRequest("/api/calendar-views?calendarType=personal", "GET");
    },
    enabled: !!user,
  });

  const createDefaultViewMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/calendar-views", "POST", {
        name: "All Events",
        calendarType: "personal",
        filters: {},
        calendarMode: "week",
        isDefault: true,
      });
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
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

  // Apply filters to events
  const filteredEvents = useMemo(() => {
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
          assigneeId: task.assigneeId,
        };
      });

    // Merge with Google Calendar events (only if viewing own calendar)
    const allEvents = displayedUserId === user?.id 
      ? [...taskEvents, ...googleCalendarEvents]
      : taskEvents;

    // Apply filters
    let filtered = allEvents;

    // Event type filter
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      filtered = filtered.filter(event => filters.eventTypes!.includes(event.type));
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
  }, [userTasks, projects, completedOption, googleCalendarEvents, filters, displayedUserId, user?.id]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
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
      
      if (newTime) {
        updatePayload.startTime = newTime;
      }
      
      rescheduleTaskMutation.mutate(updatePayload);
    }
  };

  const handleEventResize = (eventId: string, startTime: string, endTime: string, eventType: CalendarEvent["type"]) => {
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

  const handleViewSelect = (view: CalendarView) => {
    setSelectedViewId(view.id);
    setFilters(normalizeFilterDates(view.filters || {}));
    setCalendarMode(view.calendarMode || "week");
  };

  const isLoading = isLoadingTasks;
  const userName = displayedUser 
    ? `${displayedUser.firstName || ''} ${displayedUser.lastName || ''}`.trim() || (displayedUserId === user?.id ? 'My' : 'User')
    : (displayedUserId === user?.id ? 'My' : 'User');

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
    <div className="flex flex-col h-full" data-testid="personal-calendar">
      {/* Top Bar with Title, Team Selector, Views, and Filters */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{userName} Calendar</h2>
          </div>

          {/* Team Calendar Selector */}
          {hasTeamCalendarPermission && teamMembers.length > 0 && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <Select 
                value={selectedUserId || user?.id} 
                onValueChange={(value) => setSelectedUserId(value === user?.id ? undefined : value)}
              >
                <SelectTrigger className="w-48" data-testid="select-team-member">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member: any) => (
                    <SelectItem key={member.id} value={member.id}>
                      {`${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email}
                      {member.id === user?.id && " (You)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SavedViews
            calendarType="personal"
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
            showEventTypeFilter={displayedUserId === user?.id}
            calendarType="personal"
          />
        </div>
      </div>

      {/* Google Calendar Error Alert */}
      {googleCalendarError && displayedUserId === user?.id && (
        <div className="px-6 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load Google Calendar events. Please check your connection in Profile settings.
            </AlertDescription>
          </Alert>
        </div>
      )}

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
            />
          </div>
        </Card>
      </div>

      <CalendarEventDetailDialog
        event={selectedEvent}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
    </div>
  );
}

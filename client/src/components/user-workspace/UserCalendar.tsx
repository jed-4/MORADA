import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isWithinInterval } from "date-fns";
import { useTimezone, formatInTimezone, formatDateTimeInTimezone } from "@/hooks/useTimezone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Calendar as CalendarIcon, 
  AlertCircle, 
  User, 
  Plus, 
  X, 
  Filter,
  Settings,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import type { Task } from "@shared/schema";
import { CalendarFilters as CalendarFiltersType } from "@/components/CalendarFilters";
import { CalendarView } from "@/components/SavedViews";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { SiGoogle } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { User as UserType, FieldCategoryWithOptions } from "@shared/schema";

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

interface UserCalendarProps {
  user: UserType;
  isOwnPage: boolean;
}

export default function UserCalendar({ user, isOwnPage }: UserCalendarProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const { effectiveTimezone } = useTimezone();
  
  // Initialize with all event types selected by default (including google-calendar)
  const defaultEventTypes = ["task", "schedule", "google-calendar"];
  
  const [filters, setFilters] = useState<CalendarFiltersType>({
    eventTypes: defaultEventTypes,
  });
  const [calendarMode, setCalendarMode] = useState<string>("week");
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>();
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [viewToDelete, setViewToDelete] = useState<CalendarView | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const { toast } = useToast();
  const defaultViewCreationAttempted = useRef(false);

  const displayedUserId = user.id;

  // Fetch tasks for displayed user
  const { data: userTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["/api/tasks", displayedUserId],
    queryFn: async () => {
      const allTasks = await apiRequest("/api/tasks", "GET");
      return Array.isArray(allTasks) 
        ? allTasks.filter((task: any) => {
            // Check if user is assigned via assigneeId or assignedTo array
            const isAssigned = task.assigneeId === displayedUserId || 
              (Array.isArray(task.assignedTo) && task.assignedTo.includes(displayedUserId));
            return isAssigned && task.dueDate;
          }) 
        : [];
    },
    enabled: !!displayedUserId,
  });

  // Fetch projects for color coding
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
  });

  // Fetch task templates to filter out tasks from inactive templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ["/api/task-templates"],
  });

  // Fetch field categories to get completed status option
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Get the completed status option for tasks
  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusOptions.find(opt => opt.isCompleted);

  // Task completion mutation
  const toggleTaskCompleteMutation = useMutation({
    mutationFn: async ({ taskId, isCompleted }: { taskId: string; isCompleted: boolean }) => {
      const newStatus = isCompleted ? (completedOption?.key || "done") : "todo";
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTask(null);
    },
  });

  // Handler for task completion from calendar
  const handleEventComplete = (eventId: string, isCompleted: boolean) => {
    toggleTaskCompleteMutation.mutate({ taskId: eventId, isCompleted });
  };

  // Task reschedule mutation (for drag-and-drop)
  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, newDate, newTime }: { taskId: string; newDate: Date; newTime?: string }) => {
      const updateData: any = { 
        dueDate: newDate.toISOString(),
        isModified: true, // Mark as moved from original template time
      };
      if (newTime !== undefined) {
        updateData.startTime = newTime;
      }
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task rescheduled" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reschedule task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Task resize mutation (for changing duration)
  const resizeTaskMutation = useMutation({
    mutationFn: async ({ taskId, startTime, endTime }: { taskId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { 
        startTime, 
        endTime,
        isModified: true, // Mark as modified from original template time
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task duration updated" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update task duration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler for task reschedule from calendar drag-and-drop
  const handleEventReschedule = (eventId: string, newDate: Date, eventType: "task" | "schedule" | "meeting" | "google-calendar", newTime?: string) => {
    // Only allow rescheduling of tasks (not Google Calendar events)
    if (eventType === "task") {
      rescheduleTaskMutation.mutate({ taskId: eventId, newDate, newTime });
    }
  };

  // Handler for task resize from calendar
  const handleEventResize = (eventId: string, startTime: string, endTime: string, eventType: "task" | "schedule" | "meeting" | "google-calendar") => {
    if (eventType === "task") {
      resizeTaskMutation.mutate({ taskId: eventId, startTime, endTime });
    }
  };

  // Fetch schedule items for displayed user
  const { data: scheduleItems = [], isLoading: isLoadingSchedule } = useQuery({
    queryKey: ["/api/schedule-items/all", { calendarUser: displayedUserId }],
    queryFn: async () => {
      try {
        const allSchedule = await apiRequest("/api/schedule-items/all", "GET");
        return Array.isArray(allSchedule) ? allSchedule : [];
      } catch {
        return [];
      }
    },
    enabled: !!displayedUserId,
  });

  // Fetch Google Calendar connection status
  const { data: googleCalendarStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["/api/google-calendar/status"],
    queryFn: async () => {
      try {
        return await apiRequest("/api/google-calendar/status", "GET");
      } catch (error) {
        return { connected: false };
      }
    },
  });
  
  const isGoogleCalendarConnected = googleCalendarStatus?.connected ?? false;

  // Fetch Google Calendar events - always try to fetch (API returns empty if not connected)
  // Use same query key as UserCalendarDialog for cache sharing
  const { data: googleCalendarEvents = [] } = useQuery({
    queryKey: ["/api/google-calendar/events"],
    queryFn: async () => {
      try {
        const events = await apiRequest("/api/google-calendar/events", "GET");
        return events || [];
      } catch (error: any) {
        if (error.status === 401 || error.status === 400) {
          return [];
        }
        console.error("Error fetching Google Calendar events:", error);
        return [];
      }
    },
    retry: false,
    staleTime: 60000, // Cache for 1 minute
  });

  // Fetch saved views
  const { data: savedViews = [] } = useQuery<CalendarView[]>({
    queryKey: ["/api/calendar-views", "personal"],
    queryFn: async () => {
      return await apiRequest("/api/calendar-views?calendarType=personal", "GET");
    },
  });

  // Create default view if none exist; auto-select first view on load
  useEffect(() => {
    if (savedViews.length === 0 && !defaultViewCreationAttempted.current) {
      defaultViewCreationAttempted.current = true;
      createDefaultView();
    } else if (savedViews.length > 0 && !selectedViewId) {
      setSelectedViewId(savedViews[0].id);
    }
  }, [savedViews]);

  const createDefaultView = async () => {
    try {
      const newView = await apiRequest("/api/calendar-views", "POST", {
        name: "All Events",
        calendarType: "personal",
        filters: {
          eventTypes: defaultEventTypes,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
      if (newView?.id) {
        setSelectedViewId(newView.id);
      }
    } catch (error) {
      console.error("Failed to create default view:", error);
    }
  };

  // Apply view filters when selected
  useEffect(() => {
    if (selectedViewId) {
      const view = savedViews.find((v: CalendarView) => v.id === selectedViewId);
      if (view && view.filters) {
        const normalizedFilters = normalizeFilterDates(view.filters as CalendarFiltersType);
        // If view doesn't have eventTypes defined, use default (all selected)
        if (!normalizedFilters.eventTypes) {
          normalizedFilters.eventTypes = defaultEventTypes;
        } else {
          if (!normalizedFilters.eventTypes.includes("google-calendar")) {
            // Ensure google-calendar is always included in eventTypes
            normalizedFilters.eventTypes = [...normalizedFilters.eventTypes, "google-calendar"];
          }
          if (!normalizedFilters.eventTypes.includes("schedule")) {
            // Ensure schedule is always included in eventTypes (backward compat for old saved views)
            normalizedFilters.eventTypes = [...normalizedFilters.eventTypes, "schedule"];
          }
        }
        setFilters(normalizedFilters);
      }
    }
  }, [selectedViewId, savedViews, defaultEventTypes]);

  // Convert tasks, schedule items, and Google Calendar events to calendar events
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const events: CalendarEvent[] = [];

    // Add tasks
    userTasks.forEach((task: any) => {
      if (task.dueDate) {
        const project = projects.find((p: any) => p.id === task.projectId);
        const template = taskTemplates.find((t: any) => t.id === task.taskTemplateId);
        
        // Skip if task belongs to an inactive template
        if (template && !template.isActive) return;

        events.push({
          id: task.id,
          title: task.title,
          startDate: new Date(task.dueDate),
          endDate: new Date(task.dueDate),
          startTime: task.startTime,
          endTime: task.endTime,
          type: "task",
          projectId: task.projectId,
          projectColor: project?.color,
          status: task.status,
          isCompleted: task.status === "completed" || task.status === "done",
          description: task.content,
          templateId: task.taskTemplateId,
          isModified: task.isModified,
        });
      }
    });

    // Add schedule items
    scheduleItems.forEach((item: any) => {
      const itemStartDate = item.startDate ? new Date(item.startDate) : null;
      if (!itemStartDate) return;
      events.push({
        id: item.id,
        title: item.name || item.title || "Schedule Item",
        startDate: itemStartDate,
        endDate: item.endDate ? new Date(item.endDate) : itemStartDate,
        startTime: item.startTime,
        endTime: item.endTime,
        type: "schedule",
        description: item.description,
      });
    });

    // Add Google Calendar events (always show when connected - events are from the logged-in user's account)
    if (googleCalendarEvents.length > 0) {
      googleCalendarEvents.forEach((event: any) => {
        // Handle different event formats - API might return pre-formatted events or raw Google API format
        const startStr = event.start?.dateTime || event.start?.date || event.startDate;
        const endStr = event.end?.dateTime || event.end?.date || event.endDate;
        
        // Skip invalid events
        if (!startStr) return;
        
        const startDate = new Date(startStr);
        const endDate = endStr ? new Date(endStr) : startDate;
        const isAllDay = event.allDay || (!event.start?.dateTime && !event.startTime);
        
        events.push({
          id: event.id,
          title: event.summary || event.title || "Untitled Event",
          startDate,
          endDate,
          startTime: event.startTime || (isAllDay ? null : startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })),
          endTime: event.endTime || (isAllDay ? null : endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })),
          type: "google-calendar",
          description: event.description,
          location: event.location,
        });
      });
    }

    return events;
  }, [userTasks, scheduleItems, googleCalendarEvents, projects, taskTemplates]);

  // Apply filters
  const filteredEvents = useMemo(() => {
    return calendarEvents.filter((event) => {
      // Filter by project
      if (filters.projectIds && filters.projectIds.length > 0) {
        if (!event.projectId || !filters.projectIds.includes(event.projectId)) {
          return false;
        }
      }

      // Filter by event type
      if (filters.eventTypes && filters.eventTypes.length > 0) {
        if (!filters.eventTypes.includes(event.type)) {
          return false;
        }
      }

      // Filter by status (for tasks)
      if (filters.statuses && filters.statuses.length > 0 && event.type === "task") {
        if (!event.status || !filters.statuses.includes(event.status)) {
          return false;
        }
      }

      // Filter by date range
      if (filters.dateFrom && filters.dateTo) {
        const eventStart = event.startDate;
        if (!isWithinInterval(eventStart, { start: filters.dateFrom, end: filters.dateTo })) {
          return false;
        }
      }

      return true;
    });
  }, [calendarEvents, filters]);

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDetailDialogOpen(true);
  };

  const handleCloseDetail = () => {
    setSelectedEvent(null);
    setDetailDialogOpen(false);
  };

  // Navigation handlers
  const handleNavigateToday = () => {
    setCurrentDate(new Date());
  };

  const handleNavigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (calendarMode === "day") {
      newDate.setDate(newDate.getDate() - 1);
    } else if (calendarMode === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNavigateNext = () => {
    const newDate = new Date(currentDate);
    if (calendarMode === "day") {
      newDate.setDate(newDate.getDate() + 1);
    } else if (calendarMode === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  // Get status options from field categories instead of hardcoded values
  const filterStatusOptions = (statusCategory?.options || []).map(opt => ({
    key: opt.key,
    label: opt.label,
  }));

  // Event type options for filtering - always show Google Calendar but disable if not connected
  const eventTypeOptions = [
    { key: "task", label: "Tasks", disabled: false },
    { key: "schedule", label: "Schedule Items", disabled: false },
    { key: "google-calendar", label: "Google Calendar", disabled: !isGoogleCalendarConnected },
  ];

  // Count active filters (don't count eventTypes if all are selected - that's the default)
  const allEventTypesSelected = filters.eventTypes?.length === eventTypeOptions.length;
  const activeFilterCount = 
    (filters.projectIds?.length || 0) +
    (filters.statuses?.length || 0) +
    (!allEventTypesSelected && filters.eventTypes?.length ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0);

  // View management
  const currentView = savedViews.find((v: CalendarView) => v.id === selectedViewId);
  const views = savedViews.filter((v: CalendarView) => v.isDefault || v.createdBy === user.id);

  const handleViewSelect = (view: CalendarView) => {
    setSelectedViewId(view.id);
  };

  const handleSaveView = async () => {
    if (!currentView || currentView.isDefault) return;
    
    try {
      await apiRequest(`/api/calendar-views/${currentView.id}`, "PATCH", {
        filters,
        calendarMode,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
      toast({ title: "View Updated", description: "Your view has been saved successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save view.", variant: "destructive" });
    }
  };

  const handleDeleteView = (view: CalendarView) => {
    setViewToDelete(view);
    setShowDeleteViewDialog(true);
  };

  const confirmDeleteView = async () => {
    if (!viewToDelete) return;
    
    try {
      await apiRequest(`/api/calendar-views/${viewToDelete.id}`, "DELETE");
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
      setShowDeleteViewDialog(false);
      setViewToDelete(null);
      if (selectedViewId === viewToDelete.id) {
        setSelectedViewId(undefined);
      }
      toast({ title: "View Deleted", description: "View has been removed." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete view.", variant: "destructive" });
    }
  };

  const createNewView = async () => {
    if (!newViewName.trim()) return;
    
    try {
      const newView = await apiRequest("/api/calendar-views", "POST", {
        name: newViewName,
        calendarType: "personal",
        filters,
        calendarMode,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
      setShowCreateViewDialog(false);
      setNewViewName("");
      if (newView?.id) {
        setSelectedViewId(newView.id);
      }
      toast({ title: "View Created", description: "Your new view has been saved." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create view.", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="user-calendar">
      {/* Header Panel - bordered like Tasks/Time */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
      {/* Row 1 - Saved Views & Settings (36px) */}
      <div className="h-9 flex items-center justify-between px-2 border-b border-border/50">
        <div className="flex items-center gap-1">
          {/* View Tabs */}
          <div className="flex items-center gap-0.5" data-testid="tabs-calendar-views">
            {views.map((view: CalendarView) => (
              <div key={view.id} className="relative group">
                <button
                  onClick={() => handleViewSelect(view)}
                  className={`h-6 w-auto px-2 text-xs border rounded-md ${
                    selectedViewId === view.id
                      ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                      : 'hover-elevate'
                  } active-elevate-2 flex items-center gap-1`}
                  data-testid={`tab-${view.id}`}
                >
                  {view.name}
                </button>
                {!view.isDefault && (
                  <button
                    className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteView(view);
                    }}
                    data-testid={`button-delete-${view.id}`}
                  >
                    <X className="h-2 w-2" />
                  </button>
                )}
              </div>
            ))}
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              onClick={() => {
                if (currentView && !currentView.isDefault) {
                  handleSaveView();
                } else {
                  setShowCreateViewDialog(true);
                }
              }}
              data-testid="button-add-view"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Settings Icon */}
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={() => setShowSettingsDialog(true)}
            data-testid="button-settings"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>

        {/* Google Calendar Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={`relative h-6 w-6 text-xs border rounded-md flex items-center justify-center ${
                isGoogleCalendarConnected ? '' : 'hover-elevate active-elevate-2 cursor-pointer'
              } ${connectingGoogle ? 'opacity-50' : ''}`}
              disabled={connectingGoogle}
              onClick={async () => {
                if (isGoogleCalendarConnected || connectingGoogle) return;
                setConnectingGoogle(true);
                try {
                  const response = await fetch("/api/google-calendar/auth-url");
                  const data = await response.json();
                  if (data.authUrl) {
                    window.location.href = data.authUrl;
                  }
                } catch {
                  toast({ title: "Could not connect", description: "Failed to start Google Calendar connection. Please try again.", variant: "destructive" });
                } finally {
                  setConnectingGoogle(false);
                }
              }}
              data-testid="button-google-calendar-status"
            >
              <SiGoogle className={`h-3 w-3 ${isGoogleCalendarConnected ? 'text-foreground' : 'text-muted-foreground/50'}`} />
              <span
                className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
                  isGoogleCalendarConnected ? 'bg-green-500' : 'bg-muted-foreground/40'
                }`}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isGoogleCalendarConnected ? "Google Calendar connected" : "Click to connect Google Calendar"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Row 2 - Filters & Controls (36px) */}
      <div className="h-9 flex items-center justify-between px-2 gap-1.5">
        {/* Left: Filters */}
        <div className="flex items-center gap-1">
          {/* Projects Filter */}
          {projects.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-filter-projects"
                >
                  <span>Projects</span>
                  {filters.projectIds && filters.projectIds.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {filters.projectIds.length}
                    </Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Projects</div>
                    {filters.projectIds && filters.projectIds.length > 0 && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setFilters({...filters, projectIds: undefined})}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {projects.map((project: any) => (
                      <label key={project.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={filters.projectIds?.includes(project.id) || false}
                          onCheckedChange={() => {
                            const current = filters.projectIds || [];
                            const updated = current.includes(project.id)
                              ? current.filter(p => p !== project.id)
                              : [...current, project.id];
                            setFilters({...filters, projectIds: updated.length > 0 ? updated : undefined});
                          }}
                        />
                        <span className="text-xs">{project.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Status Filter */}
          {filterStatusOptions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-filter-status"
                >
                  <span>Status</span>
                  {filters.statuses && filters.statuses.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {filters.statuses.length}
                    </Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Status</div>
                    {filters.statuses && filters.statuses.length > 0 && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setFilters({...filters, statuses: undefined})}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {filterStatusOptions.map((status: any) => (
                      <label key={status.key} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={filters.statuses?.includes(status.key) || false}
                          onCheckedChange={() => {
                            const current = filters.statuses || [];
                            const updated = current.includes(status.key)
                              ? current.filter(s => s !== status.key)
                              : [...current, status.key];
                            setFilters({...filters, statuses: updated.length > 0 ? updated : undefined});
                          }}
                        />
                        <span className="text-xs">{status.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Event Types Filter */}
          {eventTypeOptions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-filter-event-types"
                >
                  <span>Event Types</span>
                  {!allEventTypesSelected && filters.eventTypes && filters.eventTypes.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {filters.eventTypes.length}
                    </Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Event Types</div>
                    {!allEventTypesSelected && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setFilters({...filters, eventTypes: eventTypeOptions.map(t => t.key)})}
                      >
                        Select All
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {eventTypeOptions.map((type: any) => (
                      <label 
                        key={type.key} 
                        className={`flex items-center gap-2 ${type.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        title={type.disabled && type.key === 'google-calendar' ? 'Connect Google Calendar in Settings to enable' : undefined}
                      >
                        <Checkbox
                          checked={filters.eventTypes?.includes(type.key) || false}
                          disabled={type.disabled}
                          onCheckedChange={() => {
                            if (type.disabled) return;
                            const current = filters.eventTypes || defaultEventTypes;
                            const updated = current.includes(type.key)
                              ? current.filter(t => t !== type.key)
                              : [...current, type.key];
                            setFilters({...filters, eventTypes: updated});
                          }}
                        />
                        <span className="text-xs">{type.label}</span>
                        {type.disabled && type.key === 'google-calendar' && (
                          <span className="text-[10px] text-muted-foreground">(not connected)</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Date Range Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="button-filter-date-range"
              >
                <span>Date Range</span>
                {(filters.dateFrom || filters.dateTo) && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Date Range</div>
                  {(filters.dateFrom || filters.dateTo) && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setFilters({...filters, dateFrom: undefined, dateTo: undefined})}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="w-full h-8 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between">
                        <span>{filters.dateFrom ? formatInTimezone(filters.dateFrom, effectiveTimezone, { month: 'short', day: '2-digit', year: 'numeric' }) : "From date"}</span>
                        <CalendarIcon className="w-3 h-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dateFrom}
                        onSelect={(date) => setFilters({...filters, dateFrom: date || undefined})}
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="w-full h-8 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-between">
                        <span>{filters.dateTo ? formatInTimezone(filters.dateTo, effectiveTimezone, { month: 'short', day: '2-digit', year: 'numeric' }) : "To date"}</span>
                        <CalendarIcon className="w-3 h-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={filters.dateTo}
                        onSelect={(date) => setFilters({...filters, dateTo: date || undefined})}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Clear All Filters */}
          {activeFilterCount > 0 && (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 text-muted-foreground"
              onClick={() => setFilters({})}
              data-testid="button-clear-all-filters"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Right: Navigation & View Controls */}
        <div className="flex items-center gap-1.5">
          {/* Navigation: Previous, Today, Next */}
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={handleNavigatePrevious}
            data-testid="button-previous"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
            onClick={handleNavigateToday}
            data-testid="button-today"
          >
            Today
          </button>
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
            onClick={handleNavigateNext}
            data-testid="button-next"
          >
            <ChevronRight className="w-3 h-3" />
          </button>

          {/* Current Date Display */}
          <span className="text-xs text-muted-foreground px-2" data-testid="text-current-date">
            {formatInTimezone(currentDate, effectiveTimezone, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>

          {/* View Mode Selector */}
          <div className="flex items-center gap-0.5">
            {[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setCalendarMode(mode.value)}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === mode.value
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid={`button-mode-${mode.value}`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Add Event Button */}
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90"
            onClick={() => {
              // TODO: Open event creation dialog
              toast({ title: "Add Event", description: "Event creation coming soon!" });
            }}
            data-testid="button-add-event"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
      </div>

      {/* Calendar Content - No Card Wrapper, Flush with Header */}
      <div className="flex-1 min-h-0">
        <EnhancedCalendar
          events={filteredEvents}
          onEventClick={handleEventClick}
          onEventComplete={handleEventComplete}
          onEventReschedule={handleEventReschedule}
          onEventResize={handleEventResize}
          showCompletionCheckbox={true}
          currentDate={currentDate}
          onCurrentDateChange={setCurrentDate}
          view={calendarMode as any}
          onViewChange={(newView) => setCalendarMode(newView)}
          hideInternalHeader={true}
        />
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        event={selectedEvent}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={(task) => setEditingTask(task)}
      />

      {/* Task Edit Modal */}
      <TaskEditModal
        task={editingTask || undefined}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
        onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
      />

      {/* Create View Dialog */}
      <Dialog open={showCreateViewDialog} onOpenChange={setShowCreateViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Save your current filters and calendar mode as a new view
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="e.g., My Week View"
                data-testid="input-view-name"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              className="h-8 px-3 text-sm border rounded-md hover-elevate active-elevate-2"
              onClick={() => {
                setShowCreateViewDialog(false);
                setNewViewName("");
              }}
            >
              Cancel
            </button>
            <button
              className="h-8 px-3 text-sm rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2"
              onClick={createNewView}
              disabled={!newViewName.trim()}
              data-testid="button-confirm-save-view"
            >
              Save View
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete View Dialog */}
      <Dialog open={showDeleteViewDialog} onOpenChange={setShowDeleteViewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete View</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{viewToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className="h-8 px-3 text-sm border rounded-md hover-elevate active-elevate-2"
              onClick={() => setShowDeleteViewDialog(false)}
            >
              Cancel
            </button>
            <button
              className="h-8 px-3 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 active-elevate-2"
              onClick={confirmDeleteView}
              data-testid="button-confirm-delete-view"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calendar Settings</DialogTitle>
            <DialogDescription>
              Configure your calendar preferences
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {isOwnPage 
                ? "This is your personal calendar. Google Calendar integration is managed in your Profile settings."
                : `Viewing ${user.firstName}'s calendar.`}
            </div>
          </div>
          <DialogFooter>
            <button
              className="h-8 px-3 text-sm border rounded-md hover-elevate active-elevate-2"
              onClick={() => setShowSettingsDialog(false)}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

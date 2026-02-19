import { useState, useMemo, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, isWithinInterval } from "date-fns";
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
import type { Task, CompanySettings } from "@shared/schema";
import { CalendarFilters as CalendarFiltersType } from "@/components/CalendarFilters";
import { CalendarView } from "@/components/SavedViews";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
import { SiGoogle } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

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
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filters, setFilters] = useState<CalendarFiltersType>({});
  const [calendarMode, setCalendarMode] = useState<string>("week");
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>();
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [viewToDelete, setViewToDelete] = useState<CalendarView | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const defaultViewCreationAttempted = useRef(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const displayedUserId = user?.id;

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

  // Fetch company settings for brand colour (used for project-less events)
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Fetch task templates to filter out tasks from inactive templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ["/api/systems/task-templates"],
    enabled: !!user,
  });

  // Fetch Google Calendar connection status
  const { data: googleCalendarStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["/api/google-calendar/status"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const isGoogleCalendarConnected = googleCalendarStatus?.connected === true;

  // Fetch Google Calendar events (only for current user and only if connected)
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
    retry: 2,
    retryDelay: 3000,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: !!user?.id && isGoogleCalendarConnected,
  });

  // Fetch task status options
  const { data: fieldCategories = [] } = useQuery({
    queryKey: ["/api/field-categories"],
  });

  const taskStatusCategory = fieldCategories.find((cat: any) => cat.key === "task.status");
  const statusOptions = taskStatusCategory?.options || [];
  const completedOption = statusOptions.find((opt: any) => opt.key === "done");

  // Create default view on first load
  const { data: views = [], isLoading: isLoadingViews } = useQuery({
    queryKey: ["/api/calendar-views", "personal"],
    queryFn: async () => {
      return await apiRequest("/api/calendar-views?calendarType=personal", "GET");
    },
    enabled: !!user,
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTask(null);
      toast({ title: "Task deleted" });
    },
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

  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; filters: CalendarFiltersType; calendarMode: string }) => {
      return await apiRequest("/api/calendar-views", "POST", {
        name: data.name,
        calendarType: "personal",
        filters: data.filters,
        calendarMode: data.calendarMode,
        isDefault: false,
      });
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
      toast({ title: "View created successfully" });
      setShowCreateViewDialog(false);
      setNewViewName("");
      setSelectedViewId(newView.id);
      setFilters(normalizeFilterDates(newView.filters || {}));
      setCalendarMode(newView.calendarMode || "week");
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: async (data: { id: string; filters: CalendarFiltersType; calendarMode: string }) => {
      return await apiRequest(`/api/calendar-views/${data.id}`, "PATCH", {
        filters: data.filters,
        calendarMode: data.calendarMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
      toast({ title: "View updated" });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/calendar-views/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
      toast({ title: "View deleted" });
      setShowDeleteViewDialog(false);
      setViewToDelete(null);
      if (selectedViewId === viewToDelete?.id) {
        const defaultView = views.find((v: CalendarView) => v.isDefault);
        if (defaultView) {
          setSelectedViewId(defaultView.id);
          setFilters(normalizeFilterDates(defaultView.filters || {}));
          setCalendarMode(defaultView.calendarMode || "week");
        }
      }
    },
  });

  // Generate recurring tasks on load (4-week rolling window)
  useEffect(() => {
    if (!user) return;

    const generateTasks = async () => {
      try {
        await apiRequest("/api/systems/task-templates/generate-recurring", "POST");
        // Refresh tasks after generation
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      } catch (error) {
        // Silently fail - recurring task generation is a background operation
        console.log("Recurring task generation skipped:", error);
      }
    };

    generateTasks();
  }, [user]);

  useEffect(() => {
    if (!user || isLoadingViews || defaultViewCreationAttempted.current) return;
    if (createDefaultViewMutation.isPending) return;
    
    if (views.length === 0) {
      defaultViewCreationAttempted.current = true;
      createDefaultViewMutation.mutate();
    }
  }, [user, isLoadingViews, views.length]);

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

  // Reschedule task mutation with optimistic update
  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate, startTime }: { taskId: string; dueDate: string; startTime?: string }) => {
      const payload: any = { dueDate };
      if (startTime) {
        payload.startTime = startTime;
      }
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", payload);
    },
    onMutate: async ({ taskId, dueDate, startTime }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", displayedUserId] });
      const previousTasks = queryClient.getQueryData(["/api/tasks", displayedUserId]);
      queryClient.setQueryData(["/api/tasks", displayedUserId], (old: any[]) => 
        old?.map((task: any) => 
          task.id === taskId 
            ? { ...task, dueDate, ...(startTime && { startTime }) }
            : task
        ) || []
      );
      return { previousTasks };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["/api/tasks", displayedUserId], context.previousTasks);
      }
    },
    // No onSettled - rely on optimistic update to prevent snap-back during drag-and-drop
  });

  // Resize task mutation with optimistic update
  const resizeTaskMutation = useMutation({
    mutationFn: async ({ taskId, startTime, endTime }: { taskId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { startTime, endTime });
    },
    onMutate: async ({ taskId, startTime, endTime }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks", displayedUserId] });
      const previousTasks = queryClient.getQueryData(["/api/tasks", displayedUserId]);
      queryClient.setQueryData(["/api/tasks", displayedUserId], (old: any[]) => 
        old?.map((task: any) => 
          task.id === taskId 
            ? { ...task, startTime, endTime }
            : task
        ) || []
      );
      return { previousTasks };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["/api/tasks", displayedUserId], context.previousTasks);
      }
    },
    // No onSettled - rely on optimistic update to prevent snap-back during drag-and-drop
  });

  // Apply filters to events
  const filteredEvents = useMemo(() => {
    const taskEvents: CalendarEvent[] = userTasks
      .filter((task: any) => task.dueDate)
      .filter((task: any) => {
        // Filter out tasks from deactivated templates
        if (task.templateId) {
          const template = taskTemplates.find((t: any) => t.id === task.templateId);
          // If template exists and is inactive, exclude this task
          if (template && template.isActive === false) {
            return false;
          }
        }
        return true;
      })
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
          color: project?.color || companySettings?.brandColor || "#3B82F6",
          projectId: task.projectId,
          projectColor: project?.color || companySettings?.brandColor || "#3B82F6",
          type: "task" as const,
          status: task.status,
          isCompleted,
          assigneeId: task.assigneeId,
          tagIds: task.tagIds,
          templateId: task.templateId,
        };
      });

    const allEvents = [...taskEvents, ...googleCalendarEvents];

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
  }, [userTasks, projects, completedOption, googleCalendarEvents, filters, displayedUserId, taskTemplates, companySettings?.brandColor]);

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
      const newDueDate = format(newDate, "yyyy-MM-dd");
      
      // Immediately update cache synchronously to prevent snap-back
      flushSync(() => {
        queryClient.setQueryData(["/api/tasks", displayedUserId], (old: any[]) => 
          old?.map((task: any) => 
            task.id === eventId 
              ? { ...task, dueDate: newDueDate, ...(newTime && { startTime: newTime }) }
              : task
          ) || []
        );
      });
      
      // Then trigger the mutation (will skip onMutate cache update since already done)
      rescheduleTaskMutation.mutate({ 
        taskId: eventId, 
        dueDate: newDueDate,
        ...(newTime && { startTime: newTime })
      });
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
      // Immediately update cache synchronously to prevent snap-back
      flushSync(() => {
        queryClient.setQueryData(["/api/tasks", displayedUserId], (old: any[]) => 
          old?.map((task: any) => 
            task.id === eventId 
              ? { ...task, startTime, endTime }
              : task
          ) || []
        );
      });
      
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

  const handleSaveView = () => {
    const currentView = views.find((v: CalendarView) => v.id === selectedViewId);
    if (currentView && !currentView.isDefault) {
      updateViewMutation.mutate({
        id: currentView.id,
        filters: filters,
        calendarMode: calendarMode,
      });
    } else {
      if (!newViewName.trim()) return;
      createViewMutation.mutate({
        name: newViewName.trim(),
        filters: filters,
        calendarMode: calendarMode,
      });
    }
  };

  const handleDeleteView = (view: CalendarView) => {
    setViewToDelete(view);
    setShowDeleteViewDialog(true);
  };

  const confirmDeleteView = () => {
    if (viewToDelete) {
      deleteViewMutation.mutate(viewToDelete.id);
    }
  };

  const getActiveFilterCount = () => {
    return Object.entries(filters).filter(([_, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null;
    }).length;
  };

  const activeFilterCount = getActiveFilterCount();

  const handleNavigateToday = () => {
    setCurrentDate(new Date());
  };

  const handleNavigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (calendarMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (calendarMode === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const handleNavigateNext = () => {
    const newDate = new Date(currentDate);
    if (calendarMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (calendarMode === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const isLoading = isLoadingTasks;
  const userName = user 
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'My'
    : 'My';

  if (isLoading) {
    return (
      <div className="flex flex-col h-full" data-testid="personal-calendar">
        <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
          <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
          <div className="h-8 flex items-center justify-between px-3">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
        <div className="flex-1 min-h-0 border-x border-b border-border rounded-b-lg bg-card overflow-hidden">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  const currentView = views.find((v: CalendarView) => v.id === selectedViewId);

  return (
    <div className="flex flex-col h-full" data-testid="personal-calendar">
      {/* Header Panel - rounded top, bordered like Tasks */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        {/* Row 1 - Title & Views (32px) */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          {/* Left: Title + View Tabs */}
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" data-testid="text-page-title">
              {userName} Calendar
            </h2>
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
            </div>
          </div>

          {/* Right: Google Status + New View + Settings */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="relative"
                  disabled={isGoogleCalendarConnected || connectingGoogle}
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
                  <SiGoogle className={`h-3 w-3 ${isGoogleCalendarConnected ? 'text-foreground' : 'text-muted-foreground/40'}`} />
                  <span
                    className={`absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full ${
                      isGoogleCalendarConnected ? 'bg-green-500' : 'bg-muted-foreground/30'
                    }`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isGoogleCalendarConnected ? "Google Calendar connected" : "Click to connect Google Calendar"}
              </TooltipContent>
            </Tooltip>
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
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              onClick={() => setShowSettingsDialog(true)}
              data-testid="button-settings"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Row 2 - Filters & Controls (32px) */}
        <div className="h-8 flex items-center justify-between px-3 gap-1.5">
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
                  {filters.projects && filters.projects.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {filters.projects.length}
                    </Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Projects</div>
                    {filters.projects && filters.projects.length > 0 && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setFilters({...filters, projects: undefined})}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {projects.map((project: any) => (
                      <label key={project.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={filters.projects?.includes(project.id) || false}
                          onCheckedChange={() => {
                            const current = filters.projects || [];
                            const updated = current.includes(project.id)
                              ? current.filter(p => p !== project.id)
                              : [...current, project.id];
                            setFilters({...filters, projects: updated.length > 0 ? updated : undefined});
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
          {statusOptions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-filter-status"
                >
                  <span>Status</span>
                  {filters.status && filters.status.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {filters.status.length}
                    </Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Status</div>
                    {filters.status && filters.status.length > 0 && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setFilters({...filters, status: undefined})}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {statusOptions.map((status: any) => (
                      <label key={status.key} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={filters.status?.includes(status.key) || false}
                          onCheckedChange={() => {
                            const current = filters.status || [];
                            const updated = current.includes(status.key)
                              ? current.filter(s => s !== status.key)
                              : [...current, status.key];
                            setFilters({...filters, status: updated.length > 0 ? updated : undefined});
                          }}
                        />
                        <span className="text-xs">{status.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Event Types Filter */}
          {user?.id && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-filter-event-types"
                >
                  <span>Event Types</span>
                  {filters.eventTypes && filters.eventTypes.length > 0 && (
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
                    {filters.eventTypes && filters.eventTypes.length > 0 && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setFilters({...filters, eventTypes: undefined})}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { value: 'task', label: 'Tasks' },
                      { value: 'schedule-item', label: 'Schedule Items' },
                      { value: 'google-calendar', label: 'Google Calendar' },
                    ].map((type) => {
                      const isGoogleOption = type.value === 'google-calendar';
                      const isCurrentlySelected = filters.eventTypes?.includes(type.value) || false;
                      const isNotConnected = isGoogleOption && !isGoogleCalendarConnected;
                      const cannotAddNew = isNotConnected && !isCurrentlySelected;
                      
                      return (
                        <label 
                          key={type.value} 
                          className={`flex items-center gap-2 ${cannotAddNew ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          title={isNotConnected ? 'Connect Google Calendar in Profile settings' : undefined}
                        >
                          <Checkbox
                            checked={isCurrentlySelected}
                            disabled={cannotAddNew}
                            onCheckedChange={() => {
                              if (cannotAddNew) return;
                              const current = filters.eventTypes || [];
                              const updated = current.includes(type.value)
                                ? current.filter(t => t !== type.value)
                                : [...current, type.value];
                              setFilters({...filters, eventTypes: updated.length > 0 ? updated : undefined});
                            }}
                          />
                          <span className="text-xs">{type.label}</span>
                          {isNotConnected && (
                            <span className="text-[10px] text-muted-foreground">(not connected)</span>
                          )}
                        </label>
                      );
                    })}
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
                        <span>{filters.dateFrom ? format(filters.dateFrom, "MMM dd, yyyy") : "From date"}</span>
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
                        <span>{filters.dateTo ? format(filters.dateTo, "MMM dd, yyyy") : "To date"}</span>
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
            {format(currentDate, 'MMM d, yyyy')}
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

      {/* Calendar Content - bordered bottom, rounded bottom like Tasks */}
      <div className="flex-1 min-h-0 border-x border-b border-border rounded-b-lg bg-card overflow-hidden">
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
              onClick={handleSaveView}
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
            {/* Google Calendar Error Alert */}
            {googleCalendarError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to load Google Calendar events. Please check your connection in Profile settings.
                </AlertDescription>
              </Alert>
            )}
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

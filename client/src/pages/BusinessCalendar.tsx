import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  X, 
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths } from "date-fns";
import type { Task, ScheduleItem, Project, User as UserType, FieldCategoryWithOptions, Schedule } from "@shared/schema";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { CalendarFilters as CalendarFiltersType } from "@/components/CalendarFilters";
import { CalendarView } from "@/components/SavedViews";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import TaskEditModal from "@/components/TaskEditModal";

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
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [viewToDelete, setViewToDelete] = useState<CalendarView | null>(null);
  const [newViewName, setNewViewName] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedViewUserId, setSelectedViewUserId] = useState<string>("all");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const defaultViewCreationAttempted = useRef(false);

  // Calculate date range for calendar data fetching (current view +/- 1 month buffer)
  const dateRange = useMemo(() => {
    const bufferMonths = 1;
    const rangeStart = startOfWeek(startOfMonth(subMonths(currentDate, bufferMonths)));
    const rangeEnd = endOfWeek(endOfMonth(addMonths(currentDate, bufferMonths)));
    return {
      startDate: format(rangeStart, 'yyyy-MM-dd'),
      endDate: format(rangeEnd, 'yyyy-MM-dd')
    };
  }, [currentDate]);

  // Fetch all projects
  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch tasks with date range filtering for calendar performance
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { startDate: dateRange.startDate, endDate: dateRange.endDate }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });

  // Fetch schedule items with date range filtering for calendar performance
  const { data: allScheduleItems = [], isLoading: isLoadingSchedule } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedule-items/all", { startDate: dateRange.startDate, endDate: dateRange.endDate }],
    queryFn: async () => {
      const response = await fetch(`/api/schedule-items/all?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
      if (!response.ok) throw new Error('Failed to fetch schedule items');
      return response.json();
    },
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
  const { data: views = [], isLoading: isLoadingViews } = useQuery({
    queryKey: ["/api/calendar-views", "business"],
    queryFn: async () => {
      return await apiRequest("/api/calendar-views?calendarType=business", "GET");
    },
    enabled: !!user,
  });

  const cleanupDuplicatesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/calendar-views/cleanup-duplicates", "POST", {
        calendarType: "business",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
    },
  });

  const createDefaultViewMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/calendar-views", "POST", {
        name: "All Events",
        calendarType: "business",
        filters: {},
        calendarMode: "week",
        isDefault: true,
      });
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
      setSelectedViewId(newView.id);
    },
  });

  // Cleanup duplicates on first load, then create default view if none exists
  useEffect(() => {
    if (!user || isLoadingViews || defaultViewCreationAttempted.current) return;
    
    defaultViewCreationAttempted.current = true;

    // First cleanup any duplicates
    if (views.length > 1) {
      const defaultViews = views.filter((v: CalendarView) => v.isDefault && v.name === "All Events");
      if (defaultViews.length > 1) {
        cleanupDuplicatesMutation.mutate();
        return;
      }
    }

    // Then create default view if none exists
    if (views.length === 0 && !createDefaultViewMutation.isPending) {
      createDefaultViewMutation.mutate();
    }
  }, [user, views, isLoadingViews]);

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
          templateId: task.templateId,
          resource: task,
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

    // Apply "View as User" filter first (separate from assignee multi-select filter)
    if (selectedViewUserId !== "all") {
      filtered = filtered.filter(event => event.assigneeId === selectedViewUserId);
    }

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
  }, [allTasks, allScheduleItems, schedules, projects, completedOption, filters, selectedViewUserId]);

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
    if (event.type === "task") {
      // Find the task from allTasks by ID
      const task = allTasks.find(t => t.id === event.id);
      if (task) {
        setEditingTask(task);
        setShowTaskDialog(true);
      }
    }
  };

  const handleViewSelect = (view: CalendarView) => {
    setSelectedViewId(view.id);
    setFilters(normalizeFilterDates(view.filters || {}));
    setCalendarMode(view.calendarMode || "week");
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

  // Event type options for filtering
  const eventTypeOptions = [
    { key: "task", label: "Tasks" },
    { key: "schedule-item", label: "Schedule Items" },
  ];

  // Available assignees for filtering
  const availableAssignees = users
    .filter((u: any) => {
      if (u.userCategory !== "team") return false;
      const hasName = (u.firstName && u.firstName.trim()) || (u.lastName && u.lastName.trim());
      const hasEmail = u.email && u.email.trim();
      return hasName || hasEmail;
    })
    .map((u: any) => ({ 
      id: u.id, 
      name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown User'
    }));

  // Count active filters
  const activeFilterCount = 
    (filters.projects?.length || 0) +
    (filters.status?.length || 0) +
    (filters.assignees?.length || 0) +
    (filters.eventTypes?.length || 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0);

  // View management
  const currentView = views.find((v: CalendarView) => v.id === selectedViewId);

  const handleSaveView = async () => {
    if (!currentView || currentView.isDefault) return;
    
    try {
      await apiRequest(`/api/calendar-views/${currentView.id}`, "PATCH", {
        filters,
        calendarMode,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
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
      await apiRequest("/api/calendar-views", "POST", {
        name: newViewName,
        calendarType: "business",
        filters,
        calendarMode,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
      setShowCreateViewDialog(false);
      setNewViewName("");
      toast({ title: "View Created", description: "Your new view has been saved." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to create view.", variant: "destructive" });
    }
  };

  const isLoading = isLoadingProjects || isLoadingTasks || isLoadingSchedule;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full" data-testid="business-calendar">
        {/* Skeleton Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 border-b">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 sm:h-6 w-32 sm:w-40" />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-start sm:justify-end flex-wrap">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-28 sm:w-32 rounded-md" />
            <Skeleton className="h-9 w-20 sm:w-24 rounded-md" />
          </div>
        </div>

        {/* Skeleton Calendar */}
        <div className="flex-1 min-h-0 p-3 sm:p-6">
          <Card className="h-full flex flex-col p-3 sm:p-4 gap-3 sm:gap-4">
            {/* Calendar header skeleton */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
              <Skeleton className="h-7 sm:h-8 w-36 sm:w-48" />
              <div className="flex gap-2">
                <Skeleton className="h-7 sm:h-8 w-16 sm:w-20 rounded-md" />
                <Skeleton className="h-7 sm:h-8 w-16 sm:w-20 rounded-md" />
              </div>
            </div>
            {/* Calendar grid skeleton */}
            <div className="flex-1 grid grid-cols-7 gap-2">
              {Array.from({ length: 21 }).map((_, i) => (
                <Skeleton key={i} className="h-full rounded-md" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="business-calendar">
      {/* Row 1 - Saved Views & Settings (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
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

        {/* View as User Dropdown */}
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedViewUserId} onValueChange={setSelectedViewUserId}>
            <SelectTrigger className="h-6 w-44 text-xs" data-testid="select-view-as-user">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {availableAssignees.map((assignee: any) => (
                <SelectItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2 - Filters & Controls (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
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

          {/* Assignees Filter */}
          {availableAssignees.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-filter-assignees"
                >
                  <span>Assignees</span>
                  {filters.assignees && filters.assignees.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                      {filters.assignees.length}
                    </Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Assignees</div>
                    {filters.assignees && filters.assignees.length > 0 && (
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setFilters({...filters, assignees: undefined})}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {availableAssignees.map((assignee: any) => (
                      <label key={assignee.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={filters.assignees?.includes(assignee.id) || false}
                          onCheckedChange={() => {
                            const current = filters.assignees || [];
                            const updated = current.includes(assignee.id)
                              ? current.filter(a => a !== assignee.id)
                              : [...current, assignee.id];
                            setFilters({...filters, assignees: updated.length > 0 ? updated : undefined});
                          }}
                        />
                        <span className="text-xs">{assignee.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Event Types Filter */}
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
                  {eventTypeOptions.map((type: any) => (
                    <label key={type.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={filters.eventTypes?.includes(type.key) || false}
                        onCheckedChange={() => {
                          const current = filters.eventTypes || [];
                          const updated = current.includes(type.key)
                            ? current.filter(t => t !== type.key)
                            : [...current, type.key];
                          setFilters({...filters, eventTypes: updated.length > 0 ? updated : undefined});
                        }}
                      />
                      <span className="text-xs">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

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
              Configure your business calendar preferences
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              This is the business calendar showing all tasks and schedule items across all projects.
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

      {/* Task Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          open={showTaskDialog}
          onOpenChange={(open) => {
            setShowTaskDialog(open);
            if (!open) setEditingTask(null);
          }}
          projectId={editingTask.projectId || ""}
        />
      )}
    </div>
  );
}

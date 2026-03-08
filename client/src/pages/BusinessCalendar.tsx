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
  Clock,
  Briefcase,
  ExternalLink,
  SlidersHorizontal,
  Pencil,
  ChevronDown,
} from "lucide-react";
import { format, isWithinInterval, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths } from "date-fns";
import type { Task, ScheduleItem, Project, User as UserType, FieldCategoryWithOptions, Schedule, CompanySettings } from "@shared/schema";
import { EnhancedCalendar, CalendarEvent, CalendarDisplayOptions } from "@/components/EnhancedCalendar";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";
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
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState<CalendarFiltersType>({});
  const [calendarMode, setCalendarMode] = useState<string>("week");
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>();
  const [showCreateViewDialog, setShowCreateViewDialog] = useState(false);
  const [showDeleteViewDialog, setShowDeleteViewDialog] = useState(false);
  const [showEditViewDialog, setShowEditViewDialog] = useState(false);
  const [viewToDelete, setViewToDelete] = useState<CalendarView | null>(null);
  const [viewToEdit, setViewToEdit] = useState<CalendarView | null>(null);
  const [editViewName, setEditViewName] = useState("");
  const [newViewName, setNewViewName] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [selectedViewUserId, setSelectedViewUserId] = useState<string>("all");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<ScheduleItem | null>(null);
  const [showScheduleItemDialog, setShowScheduleItemDialog] = useState(false);
  const [showParentItems, setShowParentItems] = useState(true);
  const [showChildItems, setShowChildItems] = useState(true);
  const defaultViewCreationAttempted = useRef(false);

  const [displayOptions, setDisplayOptions] = useState<CalendarDisplayOptions>(() => {
    try {
      const saved = localStorage.getItem('businessCalendar_displayOptions');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { showProject: false, showAssignee: false, showTime: true, showStatus: false };
  });

  useEffect(() => {
    localStorage.setItem('businessCalendar_displayOptions', JSON.stringify(displayOptions));
  }, [displayOptions]);

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

  // Fetch company settings for brand colour (used for project-less events)
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
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

  // Update task status mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await apiRequest(`/api/tasks/${taskId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setEditingTask(null);
      setShowTaskDialog(false);
      toast({ title: "Task deleted" });
    },
  });

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

  // Reschedule task mutation with optimistic update
  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate, startTime }: { taskId: string; dueDate: string; startTime?: string }) => {
      const payload: any = { dueDate };
      if (startTime !== undefined) {
        payload.startTime = startTime;
      }
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", payload);
    },
    onMutate: async ({ taskId, dueDate, startTime }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
      const queryKey = ["/api/tasks", { startDate: dateRange.startDate, endDate: dateRange.endDate }];
      const previousTasks = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: Task[] | undefined) => 
        old?.map((task) => 
          task.id === taskId 
            ? { ...task, dueDate, ...(startTime && { startTime }) }
            : task
        ) || []
      );
      return { previousTasks, queryKey };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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

  // Resize task mutation with optimistic update
  const resizeTaskMutation = useMutation({
    mutationFn: async ({ taskId, startTime, endTime }: { taskId: string; startTime: string; endTime: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { startTime, endTime });
    },
    onMutate: async ({ taskId, startTime, endTime }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
      const queryKey = ["/api/tasks", { startDate: dateRange.startDate, endDate: dateRange.endDate }];
      const previousTasks = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: Task[] | undefined) => 
        old?.map((task) => 
          task.id === taskId 
            ? { ...task, startTime, endTime }
            : task
        ) || []
      );
      return { previousTasks, queryKey };
    },
    onError: (err, variables, context) => {
      if (context?.previousTasks && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
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
        const assignee = users.find(u => u.id === task.assigneeId);
        const isCompleted = task.status === completedOption?.key;
        
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
          projectName: project?.name || null,
          assigneeName: assignee ? `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim() || null : null,
          assigneeId: task.assigneeId,
          type: "task" as const,
          status: task.status,
          isCompleted,
          templateId: task.templateId,
          resource: task,
        };
      });

    // Convert schedule items to calendar events with parent/child visibility toggles
    const parentItemIds = new Set(
      allScheduleItems
        .filter((item: any) => item.parentItemId)
        .map((item: any) => item.parentItemId)
    );

    const filteredScheduleItems = allScheduleItems.filter(item => {
      const isParent = parentItemIds.has(item.id);
      const isChild = !!(item as any).parentItemId;
      if (isParent && !showParentItems) return false;
      if (isChild && !showChildItems) return false;
      return true;
    });

    const scheduleEvents: CalendarEvent[] = filteredScheduleItems
      .map(item => {
        const schedule = schedules.find(s => s.id === item.scheduleId);
        const project = schedule ? projects.find(p => p.id === schedule.projectId) : undefined;
        const assignee = item.assignedToId ? users.find(u => u.id === item.assignedToId) : undefined;
        const isCompleted = item.status === "completed";
        const projectColor = project?.color || companySettings?.brandColor || "#3B82F6";
        
        return {
          id: item.id,
          title: item.name,
          startDate: new Date(item.startDate),
          endDate: new Date(item.endDate),
          startTime: item.startTime,
          endTime: item.endTime,
          color: projectColor,
          projectId: project?.id,
          projectColor: projectColor,
          projectName: project?.name || null,
          assigneeName: assignee ? `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim() || null : null,
          assigneeId: item.assignedToId,
          type: "schedule" as const,
          status: item.status,
          isCompleted,
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
  }, [allTasks, allScheduleItems, schedules, projects, users, completedOption, filters, selectedViewUserId, companySettings?.brandColor, showParentItems, showChildItems]);

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
      const task = allTasks.find(t => t.id === event.id);
      if (task) {
        setEditingTask(task);
        setShowTaskDialog(true);
      }
    } else if (event.type === "schedule") {
      const item = allScheduleItems.find(s => s.id === event.id);
      if (item) {
        setSelectedScheduleItem(item);
        setShowScheduleItemDialog(true);
      }
    }
  };

  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return await apiRequest("/api/calendar-views", "POST", {
        name: data.name,
        calendarType: "business",
        filters,
        calendarMode,
      });
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
      setSelectedViewId(newView.id);
      setShowCreateViewDialog(false);
      setNewViewName("");
      toast({ title: "View created", description: `"${newView.name}" has been saved.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create view.", variant: "destructive" });
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; filters?: any; calendarMode?: string }) => {
      return await apiRequest(`/api/calendar-views/${data.id}`, "PATCH", {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.filters !== undefined && { filters: data.filters }),
        ...(data.calendarMode !== undefined && { calendarMode: data.calendarMode }),
      });
    },
    onSuccess: (updatedView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
      setShowCreateViewDialog(false);
      setShowEditViewDialog(false);
      setViewToEdit(null);
      toast({ title: "View saved", description: `"${updatedView.name}" has been updated.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save view.", variant: "destructive" });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (viewId: string) => {
      await apiRequest(`/api/calendar-views/${viewId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "business"] });
      if (viewToDelete && selectedViewId === viewToDelete.id) {
        setSelectedViewId(undefined);
      }
      setShowDeleteViewDialog(false);
      setViewToDelete(null);
      toast({ title: "View deleted", description: `"${viewToDelete?.name}" has been removed.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete view.", variant: "destructive" });
    },
  });

  const handleViewSelect = (view: CalendarView) => {
    setSelectedViewId(view.id);
    setFilters(normalizeFilterDates(view.filters || {}));
    setCalendarMode(view.calendarMode || "week");
  };

  const handleEditView = (view: CalendarView) => {
    setViewToEdit(view);
    setEditViewName(view.name);
    setShowEditViewDialog(true);
  };

  const handleUpdateView = () => {
    if (!viewToEdit || !editViewName.trim()) return;
    updateViewMutation.mutate({ id: viewToEdit.id, name: editViewName, filters, calendarMode });
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

  const handleSaveView = () => {
    if (!currentView) return;
    if (currentView.isDefault) {
      setShowCreateViewDialog(true);
    } else {
      updateViewMutation.mutate({ id: currentView.id, filters, calendarMode });
    }
  };

  const handleDeleteView = (view: CalendarView) => {
    setViewToDelete(view);
    setShowDeleteViewDialog(true);
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
    <div className="flex flex-col h-full p-3 sm:p-4" data-testid="business-calendar">
     <div className="flex flex-col flex-1 min-h-0 border border-border rounded-lg bg-card overflow-hidden">
      {/* Row 1 - Saved Views & Settings (36px) */}
      <div className="h-9 bg-card flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1">
          {/* View Tabs */}
          <div className="flex items-center gap-0.5" data-testid="tabs-calendar-views">
            {views.map((view: CalendarView) => (
              <div key={view.id} className="flex items-center">
                <button
                  onClick={() => handleViewSelect(view)}
                  className={`relative h-9 px-2 text-xs flex items-center gap-1 transition-colors ${
                    selectedViewId === view.id
                      ? 'text-[#bba7db] font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`tab-${view.id}`}
                >
                  <span>{view.name}</span>
                  {selectedViewId === view.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#bba7db] rounded-full" />
                  )}
                </button>
                {selectedViewId === view.id && !view.isDefault && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="h-5 px-0.5 text-[#bba7db] hover:text-[#bba7db]/80 flex items-center"
                        data-testid={`button-view-options-${view.id}`}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onClick={() => handleEditView(view)}
                        data-testid={`menu-edit-${view.id}`}
                      >
                        <Pencil className="h-3 w-3 mr-2" />
                        Edit View
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteView(view)}
                        className="text-destructive"
                        data-testid={`menu-delete-${view.id}`}
                      >
                        <X className="h-3 w-3 mr-2" />
                        Delete View
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              onClick={() => setShowCreateViewDialog(true)}
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
      <div className="h-9 bg-card flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={!filters.eventTypes || filters.eventTypes.includes("task")}
                      onCheckedChange={() => {
                        const allTypes = ["task", "schedule-item"];
                        const current = filters.eventTypes || [...allTypes];
                        const updated = current.includes("task")
                          ? current.filter(t => t !== "task")
                          : [...current, "task"];
                        setFilters({...filters, eventTypes: updated.length === allTypes.length ? undefined : updated});
                      }}
                    />
                    <span className="text-xs">Tasks</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={!filters.eventTypes || filters.eventTypes.includes("schedule-item")}
                      onCheckedChange={() => {
                        const allTypes = ["task", "schedule-item"];
                        const current = filters.eventTypes || [...allTypes];
                        const updated = current.includes("schedule-item")
                          ? current.filter(t => t !== "schedule-item")
                          : [...current, "schedule-item"];
                        setFilters({...filters, eventTypes: updated.length === allTypes.length ? undefined : updated});
                      }}
                    />
                    <span className="text-xs">Schedule Items</span>
                  </label>
                  {(() => {
                    const scheduleDisabled = filters.eventTypes && filters.eventTypes.length > 0 && !filters.eventTypes.includes("schedule-item");
                    return (
                      <>
                        <label className={`flex items-center gap-2 cursor-pointer pl-5 ${scheduleDisabled ? "opacity-40 pointer-events-none" : ""}`}>
                          <Checkbox
                            checked={showParentItems}
                            onCheckedChange={() => setShowParentItems(!showParentItems)}
                            disabled={scheduleDisabled}
                          />
                          <span className="text-xs">Parents</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer pl-5 ${scheduleDisabled ? "opacity-40 pointer-events-none" : ""}`}>
                          <Checkbox
                            checked={showChildItems}
                            onCheckedChange={() => setShowChildItems(!showChildItems)}
                            disabled={scheduleDisabled}
                          />
                          <span className="text-xs">Children</span>
                        </label>
                      </>
                    );
                  })()}
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

        {/* Right: Display, Navigation & View Controls */}
        <div className="flex items-center gap-1.5">
          {/* Display Options */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-display-options"
                title="Display options"
              >
                <SlidersHorizontal className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-3">
              <div className="space-y-3">
                <div className="text-sm font-semibold">Display on Cards</div>
                <div className="space-y-1.5">
                  {[
                    { key: "showTime" as const, label: "Time" },
                    { key: "showProject" as const, label: "Project" },
                    { key: "showAssignee" as const, label: "Assignee" },
                    { key: "showStatus" as const, label: "Status" },
                  ].map((opt) => (
                    <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={displayOptions[opt.key] !== false}
                        onCheckedChange={() => {
                          setDisplayOptions(prev => ({
                            ...prev,
                            [opt.key]: !prev[opt.key],
                          }));
                        }}
                      />
                      <span className="text-xs">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

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
          displayOptions={displayOptions}
          hideInternalHeader={true}
        />
      </div>
     </div>

      {/* Save / Create View Dialog */}
      <Dialog open={showCreateViewDialog} onOpenChange={(open) => { setShowCreateViewDialog(open); if (!open) setNewViewName(""); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save As New View</DialogTitle>
            <DialogDescription>
              Save your current filters and calendar mode as a new view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
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
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreateViewDialog(false); setNewViewName(""); }}
              data-testid="button-cancel-view"
            >
              Cancel
            </Button>
            <Button
              onClick={() => newViewName.trim() && createViewMutation.mutate({ name: newViewName.trim() })}
              disabled={!newViewName.trim() || createViewMutation.isPending}
              data-testid="button-confirm-save-view"
            >
              {createViewMutation.isPending ? "Saving..." : "Save View"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit View Dialog */}
      <Dialog open={showEditViewDialog} onOpenChange={setShowEditViewDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit View</DialogTitle>
            <DialogDescription>
              Update the view name and save current filters to this view.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-view-name">View Name</Label>
              <Input
                id="edit-view-name"
                value={editViewName}
                onChange={(e) => setEditViewName(e.target.value)}
                placeholder="My Custom View"
                data-testid="input-edit-view-name"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEditViewDialog(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateView}
              disabled={!editViewName.trim() || updateViewMutation.isPending}
              data-testid="button-update-view"
            >
              {updateViewMutation.isPending ? "Updating..." : "Update View"}
            </Button>
          </div>
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
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteViewDialog(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => viewToDelete && deleteViewMutation.mutate(viewToDelete.id)}
              disabled={deleteViewMutation.isPending}
              data-testid="button-confirm-delete-view"
            >
              {deleteViewMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
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
          onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
        />
      )}

      {/* Schedule Item Detail Modal */}
      <Dialog open={showScheduleItemDialog} onOpenChange={(open) => {
        setShowScheduleItemDialog(open);
        if (!open) setSelectedScheduleItem(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {selectedScheduleItem?.name}
            </DialogTitle>
            <DialogDescription>Schedule item details</DialogDescription>
          </DialogHeader>
          {selectedScheduleItem && (() => {
            const schedule = schedules.find(s => s.id === selectedScheduleItem.scheduleId);
            const project = schedule ? projects.find(p => p.id === schedule.projectId) : null;
            const assigneeName = selectedScheduleItem.assignedToName || null;
            return (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 text-sm">
                  {project && (
                    <>
                      <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span className="font-medium">{project.name}</span>
                    </>
                  )}
                  {selectedScheduleItem.type && (
                    <>
                      <span className="text-muted-foreground">Type</span>
                      <Badge variant="outline" className="w-fit capitalize">{selectedScheduleItem.type}</Badge>
                    </>
                  )}
                  {selectedScheduleItem.status && (
                    <>
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="secondary" className="w-fit capitalize">{selectedScheduleItem.status.replace(/_/g, ' ')}</Badge>
                    </>
                  )}
                  {selectedScheduleItem.priority && (
                    <>
                      <span className="text-muted-foreground">Priority</span>
                      <Badge variant="outline" className="w-fit capitalize">{selectedScheduleItem.priority}</Badge>
                    </>
                  )}
                  {selectedScheduleItem.startDate && (
                    <>
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span>
                        {format(new Date(selectedScheduleItem.startDate), 'dd MMM yyyy')}
                        {selectedScheduleItem.endDate && String(selectedScheduleItem.endDate) !== String(selectedScheduleItem.startDate) && (
                          <> — {format(new Date(selectedScheduleItem.endDate), 'dd MMM yyyy')}</>
                        )}
                        {selectedScheduleItem.startTime && (
                          <span className="text-muted-foreground ml-2">
                            {selectedScheduleItem.startTime}
                            {selectedScheduleItem.endTime && ` – ${selectedScheduleItem.endTime}`}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                  {selectedScheduleItem.duration != null && selectedScheduleItem.duration > 0 && (
                    <>
                      <span className="text-muted-foreground">Duration</span>
                      <span>{selectedScheduleItem.duration} {selectedScheduleItem.duration === 1 ? 'day' : 'days'}</span>
                    </>
                  )}
                  {assigneeName && (
                    <>
                      <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span>{assigneeName}</span>
                    </>
                  )}
                  {selectedScheduleItem.costCodeTitle && (
                    <>
                      <span className="text-muted-foreground">Cost Code</span>
                      <span>{selectedScheduleItem.costCodeTitle}</span>
                    </>
                  )}
                  {selectedScheduleItem.groupName && (
                    <>
                      <span className="text-muted-foreground">Group</span>
                      <span>{selectedScheduleItem.groupName}</span>
                    </>
                  )}
                  {selectedScheduleItem.progressPercent != null && selectedScheduleItem.progressPercent > 0 && (
                    <>
                      <span className="text-muted-foreground">Progress</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${selectedScheduleItem.progressPercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{selectedScheduleItem.progressPercent}%</span>
                      </div>
                    </>
                  )}
                  {selectedScheduleItem.notes && (
                    <>
                      <span className="text-muted-foreground">Notes</span>
                      <span className="text-muted-foreground">{selectedScheduleItem.notes}</span>
                    </>
                  )}
                </div>
                {project && schedule && (
                  <DialogFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowScheduleItemDialog(false);
                        setSelectedScheduleItem(null);
                        navigate(`/projects/${project.id}/schedule`);
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open in Schedule
                    </Button>
                  </DialogFooter>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths } from "date-fns";
import type { Task, ScheduleItem, Project, User as UserType, FieldCategoryWithOptions, Schedule } from "@shared/schema";
import { buildBusinessCalendarEvents } from "@shared/businessCalendarEvents";
import type { ProjectBand } from "@shared/scheduleVisibility";
import {
  BUSINESS_CALENDAR_LAYERS,
  getLayer,
  type BusinessCalendarLayerEvent,
} from "@shared/businessCalendarLayers";
import { TYPE_COLORS_HEX } from "@/lib/taskColors";
import {
  EnhancedCalendar,
  type CalendarEvent,
  type CalendarDisplayOptions,
  type EnhancedCalendarView,
} from "@/components/EnhancedCalendar";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { CalendarDateJumper } from "@/components/CalendarDateJumper";
import { useCalendarShortcuts } from "@/hooks/useCalendarShortcuts";

import TaskEditModal from "@/components/TaskEditModal";

// Module-level flag — survives component remounts for the full browser session,
// preventing duplicate "All Events" view creation on every navigation.
let defaultBusinessViewCreated = false;

/**
 * `calendar_views.calendar_mode` is free text and holds whatever the page wrote at
 * the time. Rows predating this surface can carry values the calendar no longer
 * has — anything unrecognised falls back to week.
 *
 * Note a legacy `"day"` row used to render as *agenda*, because the previous engine
 * had no day view and mapped everything unknown onto agenda. It now renders as a
 * real day view, which is what it always said it was.
 */
const CALENDAR_VIEWS: EnhancedCalendarView[] = ["month", "week", "day", "agenda", "roster"];
function toCalendarView(mode: string | null | undefined): EnhancedCalendarView {
  return CALENDAR_VIEWS.includes(mode as EnhancedCalendarView)
    ? (mode as EnhancedCalendarView)
    : "week";
}

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
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<CalendarFiltersType>({});
  const [calendarMode, setCalendarMode] = useState<EnhancedCalendarView>("week");
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
  const EMPTY_LEAVE_FORM = {
    userId: "", startDate: "", endDate: "", leaveType: "",
    isHalfDay: false, halfDayPeriod: "am" as "am" | "pm", note: "",
  };
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState(EMPTY_LEAVE_FORM);

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

  // Fetch tasks with date range filtering for calendar performance
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { startDate: dateRange.startDate, endDate: dateRange.endDate }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
  });

  // Schedule items, split by the server into chips and collapsed per-project bands.
  //
  // The whole company's schedule as chips is unreadable — every active job's every
  // work bar competing with the things people actually have to turn up to. `mode=
  // business` keeps milestones, inspections, deliveries, meetings and anything with
  // a clock time on the grid, and collapses the rest into one slim band per project.
  // Opting a project into "Full" sends it through untouched.
  const fullScheduleKey = [...(filters.fullScheduleProjects ?? [])].sort().join(",");
  const { data: scheduleCalendar, isLoading: isLoadingSchedule } = useQuery<{
    events: ScheduleItem[];
    bands: ProjectBand[];
  }>({
    queryKey: ["/api/schedule-items/calendar", { startDate: dateRange.startDate, endDate: dateRange.endDate, fullScheduleKey }],
    queryFn: async () => {
      const qs = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        mode: "business",
      });
      if (fullScheduleKey) qs.set("fullScheduleProjects", fullScheduleKey);
      const response = await fetch(`/api/schedule-items/calendar?${qs}`);
      if (!response.ok) throw new Error('Failed to fetch schedule items');
      const result = await response.json();
      return {
        events: Array.isArray(result?.events) ? result.events : [],
        bands: Array.isArray(result?.bands) ? result.bands : [],
      };
    },
  });
  const allScheduleItems = scheduleCalendar?.events ?? [];
  const projectBands = scheduleCalendar?.bands ?? [];

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
    if (!user || isLoadingViews || defaultBusinessViewCreated) return;
    if (createDefaultViewMutation.isPending) return;
    
    if (views.length === 0) {
      defaultBusinessViewCreated = true;
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
        setCalendarMode(toCalendarView(defaultView.calendarMode));
      }
    }
  }, [views, selectedViewId]);

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

  // Convert tasks and schedule items to calendar events with filtering
  const filteredEvents: CalendarEvent[] = useMemo(
    () =>
      buildBusinessCalendarEvents({
        tasks: allTasks,
        scheduleItems: allScheduleItems,
        schedules,
        projects,
        users,
        completedStatusKey: completedOption?.key,
        filters,
        viewAsUserId: selectedViewUserId,
        showParentItems,
        showChildItems,
      }),
    [allTasks, allScheduleItems, schedules, projects, users, completedOption, filters, selectedViewUserId, showParentItems, showChildItems],
  );

  // Optional layers — off unless switched on, so the default calendar is unchanged
  // and each extra source is a deliberate choice. One request for all of them; see
  // the endpoint's note on why this isn't one query per layer.
  const layerKeys = [...(filters.layers ?? [])].sort();
  const layerKey = layerKeys.join(",");
  const { data: layerData } = useQuery<{ events: BusinessCalendarLayerEvent[]; denied: string[] }>({
    queryKey: ["/api/business-calendar/events", { startDate: dateRange.startDate, endDate: dateRange.endDate, layerKey }],
    queryFn: async () => {
      const response = await fetch(
        `/api/business-calendar/events?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&layers=${encodeURIComponent(layerKey)}`,
      );
      if (!response.ok) throw new Error('Failed to fetch calendar layers');
      const result = await response.json();
      return {
        events: Array.isArray(result?.events) ? result.events : [],
        denied: Array.isArray(result?.denied) ? result.denied : [],
      };
    },
    enabled: layerKeys.length > 0,
  });
  // Layers the server withheld for lack of permission. Shown as a disabled toggle
  // rather than an empty layer, which would read as "nothing due".
  const deniedLayers = new Set(layerData?.denied ?? []);

  const layerEvents: CalendarEvent[] = useMemo(() => {
    const rows = layerData?.events ?? [];
    return rows
      // The project filter applies to layers too. Status and assignee do not: a
      // layer row has no Morada assignee, and each source's statuses are their own
      // vocabulary rather than the task ones the Status filter lists.
      .filter(row => !filters.projects?.length || (row.projectId && filters.projects.includes(row.projectId)))
      .map(row => {
        const layer = getLayer(row.layer);
        const date = new Date(row.date);
        return {
          id: row.id,
          title: row.title,
          startDate: date,
          endDate: date,
          startTime: row.startTime,
          endTime: row.endTime,
          color: layer ? TYPE_COLORS_HEX[layer.colorToken] : null,
          projectId: row.projectId,
          projectColor: layer ? TYPE_COLORS_HEX[layer.colorToken] : null,
          projectName: row.projectName,
          assigneeIds: [],
          type: "layer" as const,
          status: row.status ?? undefined,
          // Lookback layers record what already happened, so they are never
          // outstanding — marking them complete stops them reading as overdue.
          isCompleted: layer?.lookback ?? false,
          resource: row,
        };
      });
  }, [layerData, filters.projects]);

  const eventsWithLayers = useMemo(
    () => [...filteredEvents, ...layerEvents],
    [filteredEvents, layerEvents],
  );

  // Who is away. Leave is duration, like a work bar — five all-day chips per
  // person per week would swamp the grid — so it draws as its own band lane
  // rather than as events.
  const { data: leaveEntries = [] } = useQuery<any[]>({
    queryKey: ["/api/leave-entries", { startDate: dateRange.startDate, endDate: dateRange.endDate }],
    queryFn: async () => {
      const response = await fetch(`/api/leave-entries?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
      if (!response.ok) throw new Error('Failed to fetch leave');
      return response.json();
    },
  });

  const leaveTypeOptions = fieldCategories.find(c => c.key === "leave.type")?.options ?? [];

  const leaveBands: ProjectBand[] = useMemo(() => {
    return leaveEntries.map((entry: any) => {
      const option = leaveTypeOptions.find((o: any) => o.key === entry.leaveType);
      const half = entry.isHalfDay ? ` (${entry.halfDayPeriod === "pm" ? "PM" : "AM"})` : "";
      // Reusing the band shape: `projectId` keys the lane, `projectName` carries
      // the person, and the label carries what kind of leave it is.
      return {
        projectId: entry.id,
        projectName: entry.userName,
        projectColor: option?.color ?? null,
        startDate: String(entry.startDate).slice(0, 10),
        endDate: String(entry.endDate).slice(0, 10),
        label: `${option?.name ?? entry.leaveType}${half}`,
        itemCount: 1,
      };
    });
  }, [leaveEntries, leaveTypeOptions]);

  // Bands respect the project filter as well — filtering to one job should not
  // leave other projects' bands stranded above an empty grid.
  const filteredProjectBands = useMemo(() => {
    if (!filters.projects?.length) return projectBands;
    const wanted = new Set(filters.projects);
    return projectBands.filter((band) => wanted.has(band.projectId));
  }, [projectBands, filters.projects]);

  const resetLeaveForm = () => { setEditingLeaveId(null); setLeaveForm(EMPTY_LEAVE_FORM); };

  const saveLeaveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        userId: leaveForm.userId,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        leaveType: leaveForm.leaveType,
        isHalfDay: leaveForm.isHalfDay,
        // Sent as null rather than omitted: the server's CHECK requires a period
        // exactly when isHalfDay is set, so clearing it has to be explicit.
        halfDayPeriod: leaveForm.isHalfDay ? leaveForm.halfDayPeriod : null,
        note: leaveForm.note || null,
      };
      return editingLeaveId
        ? apiRequest(`/api/leave-entries/${editingLeaveId}`, "PATCH", body)
        : apiRequest("/api/leave-entries", "POST", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-entries"] });
      setLeaveDialogOpen(false);
      resetLeaveForm();
      toast({ title: editingLeaveId ? "Leave updated" : "Leave marked" });
    },
    onError: (e: any) => toast({ title: "Couldn't save leave", description: e?.message, variant: "destructive" }),
  });

  const deleteLeaveMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest(`/api/leave-entries/${id}`, "DELETE"); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-entries"] });
      setLeaveDialogOpen(false);
      resetLeaveForm();
      toast({ title: "Leave removed" });
    },
  });

  // Clicking a band opens it for editing, pre-filled from the entry it drew.
  useEffect(() => {
    if (!editingLeaveId) return;
    const entry = leaveEntries.find((l: any) => l.id === editingLeaveId);
    if (!entry) return;
    setLeaveForm({
      userId: entry.userId,
      startDate: String(entry.startDate).slice(0, 10),
      endDate: String(entry.endDate).slice(0, 10),
      leaveType: entry.leaveType,
      isHalfDay: !!entry.isHalfDay,
      halfDayPeriod: (entry.halfDayPeriod as "am" | "pm") ?? "am",
      note: entry.note ?? "",
    });
    setLeaveDialogOpen(true);
  }, [editingLeaveId, leaveEntries]);

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
    setCalendarMode(toCalendarView(view.calendarMode));
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

  /** Step by whatever the current view shows: a day, a week, or a month. */
  const stepDate = (direction: -1 | 1) => {
    const newDate = new Date(currentDate);
    if (calendarMode === "day") {
      newDate.setDate(newDate.getDate() + direction);
    } else if (calendarMode === "week" || calendarMode === "roster") {
      newDate.setDate(newDate.getDate() + 7 * direction);
    } else {
      newDate.setMonth(newDate.getMonth() + direction);
    }
    setCurrentDate(newDate);
  };

  const handleNavigatePrevious = () => stepDate(-1);
  const handleNavigateNext = () => stepDate(1);

  // `a` for agenda as well, since this surface offers it. Suspended on mobile,
  // where the view is forced to agenda and a keystroke could not change it.
  useCalendarShortcuts({
    onToday: handleNavigateToday,
    onPrevious: handleNavigatePrevious,
    onNext: handleNavigateNext,
    onViewChange: setCalendarMode,
    views: ["day", "week", "month", "agenda"],
    enabled: !isMobile,
  });

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
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid={`tab-${view.id}`}
                >
                  <span>{view.name}</span>
                  {selectedViewId === view.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
                {selectedViewId === view.id && !view.isDefault && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="h-5 px-0.5 text-primary hover:text-primary/80 flex items-center"
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
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-data flex items-center justify-center">
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
                    {projects.map((project: any) => {
                      const showsFullSchedule = filters.fullScheduleProjects?.includes(project.id) || false;
                      return (
                        <div key={project.id} className="flex items-center gap-2">
                          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
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
                            <span className="text-xs truncate">{project.name}</span>
                          </label>
                          {/* Per-project escape hatch from the band: some jobs you do
                              want to see item by item. Persisted in the saved view. */}
                          <button
                            type="button"
                            className="text-2xs px-1.5 py-0.5 rounded border hover-elevate active-elevate-2 flex-shrink-0"
                            title={
                              showsFullSchedule
                                ? "Showing every schedule item for this project"
                                : "Work bars are collapsed into the project band"
                            }
                            onClick={() => {
                              const current = filters.fullScheduleProjects || [];
                              const updated = current.includes(project.id)
                                ? current.filter(p => p !== project.id)
                                : [...current, project.id];
                              setFilters({
                                ...filters,
                                fullScheduleProjects: updated.length > 0 ? updated : undefined,
                              });
                            }}
                            data-testid={`full-schedule-toggle-${project.id}`}
                          >
                            {showsFullSchedule ? "Full" : "Band"}
                          </button>
                        </div>
                      );
                    })}
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
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-data flex items-center justify-center">
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
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-data flex items-center justify-center">
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

          {/* Layers — the optional sources. Off by default; each one is another
              query, and nine at once is a wall rather than a calendar. */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="button-filter-layers"
              >
                <span>Layers</span>
                {filters.layers && filters.layers.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-data flex items-center justify-center">
                    {filters.layers.length}
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Layers</div>
                  {filters.layers && filters.layers.length > 0 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setFilters({ ...filters, layers: undefined })}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {BUSINESS_CALENDAR_LAYERS.map((layer) => {
                    const denied = deniedLayers.has(layer.key);
                    return (
                      <label
                        key={layer.key}
                        className={`flex items-start gap-2 ${denied ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        title={denied ? "You don't have permission to see this layer" : layer.description}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={filters.layers?.includes(layer.key) || false}
                          disabled={denied}
                          onCheckedChange={() => {
                            const current = filters.layers || [];
                            const updated = current.includes(layer.key)
                              ? current.filter(l => l !== layer.key)
                              : [...current, layer.key];
                            setFilters({ ...filters, layers: updated.length > 0 ? updated : undefined });
                          }}
                          data-testid={`layer-toggle-${layer.key}`}
                        />
                        <span className="min-w-0">
                          <span className="text-xs flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: TYPE_COLORS_HEX[layer.colorToken] }}
                            />
                            {layer.label}
                            {denied && <span className="text-data text-muted-foreground">(no access)</span>}
                          </span>
                          <span className="text-data text-muted-foreground block leading-tight">
                            {layer.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Event Types Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="button-filter-event-types"
              >
                <span>Event Types</span>
                {filters.eventTypes && filters.eventTypes.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-data flex items-center justify-center">
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
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-data flex items-center justify-center">
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

          {/* Parent / Child schedule-item toggles — visible pills, ON by default */}
          <button
            onClick={() => setShowParentItems(v => !v)}
            className={`h-6 w-auto px-2 text-xs rounded-md border flex items-center gap-0.5 toggle-elevate ${
              showParentItems
                ? "toggle-elevated text-accent-foreground font-medium"
                : "text-muted-foreground"
            }`}
            data-testid="button-toggle-parent-items"
            title="Show/hide parent schedule items"
          >
            Parents
          </button>
          <button
            onClick={() => setShowChildItems(v => !v)}
            className={`h-6 w-auto px-2 text-xs rounded-md border flex items-center gap-0.5 toggle-elevate ${
              showChildItems
                ? "toggle-elevated text-accent-foreground font-medium"
                : "text-muted-foreground"
            }`}
            data-testid="button-toggle-child-items"
            title="Show/hide child schedule items"
          >
            Children
          </button>

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

          <CalendarDateJumper currentDate={currentDate} onDateChange={setCurrentDate} />

          {/* View Mode Selector — hidden on mobile, where the calendar forces
              agenda and these buttons would do nothing. The chosen view is still
              saved, so it comes back on a wider screen. */}
          {!isMobile && (
          <div className="flex items-center gap-0.5">
            {([
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'agenda', label: 'Agenda' },
            ] as Array<{ value: EnhancedCalendarView; label: string }>).map((mode) => (
              <button
                key={mode.value}
                onClick={() => setCalendarMode(mode.value)}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === mode.value
                    ? 'bg-primary text-white border-primary/20 hover:bg-primary/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid={`button-mode-${mode.value}`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          )}

          {/* Add Event Button */}
          <button
            className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center bg-primary text-white border-primary/20 hover:bg-primary/90"
            onClick={() => { resetLeaveForm(); setLeaveDialogOpen(true); }}
            title="Mark leave"
            data-testid="button-mark-leave"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Calendar Content - No Card Wrapper, Flush with Header */}
      <div className="flex-1 min-h-0">
        {/*
          Read-only on purpose (D6). Dragging someone else's schedule item here
          would cascade the Gantt, and your own tasks are better dragged on your own
          calendar. Click a chip to open it and change the date there.

          `readOnly` rather than just omitting the handlers: without it a chip still
          lifts and follows the cursor before doing nothing on drop, and every task
          carries a completion checkbox that silently no-ops.

          `displayOptions` is a native prop now, so "Show assignee" finally works on
          week-view timed events — the previous engine only rendered those extra
          lines on month and all-day chips.
        */}
        <EnhancedCalendar
          events={eventsWithLayers}
          onEventClick={handleEventClick}
          currentDate={currentDate}
          onCurrentDateChange={setCurrentDate}
          view={calendarMode}
          onViewChange={setCalendarMode}
          displayOptions={displayOptions}
          projectBands={filteredProjectBands}
          leaveBands={leaveBands}
          onLeaveBandClick={(band) => setEditingLeaveId(band.projectId)}
          onProjectBandClick={(band) => navigate(`/projects/${band.projectId}/schedule`)}
          mobileFallbackView="agenda"
          readOnly
          hideInternalHeader
        />
      </div>
     </div>

      {/* Mark leave. Deliberately minimal: who, when, what kind, and a note.
          There is no request or approval step — this records that someone is
          away, which is what the calendar needs. */}
      <Dialog open={leaveDialogOpen} onOpenChange={(open) => { setLeaveDialogOpen(open); if (!open) resetLeaveForm(); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingLeaveId ? "Edit leave" : "Mark leave"}</DialogTitle>
            <DialogDescription>
              Record that someone is away. It shows on the business calendar as a band.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Who</Label>
              <Select value={leaveForm.userId} onValueChange={(v) => setLeaveForm({ ...leaveForm, userId: v })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-leave-user">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {availableAssignees.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={leaveForm.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value;
                    // Keep the range valid as you type rather than rejecting it on save.
                    setLeaveForm(f => ({
                      ...f,
                      startDate,
                      endDate: !f.endDate || f.endDate < startDate ? startDate : f.endDate,
                    }));
                  }}
                  data-testid="input-leave-start"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  min={leaveForm.startDate || undefined}
                  value={leaveForm.endDate}
                  onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value, isHalfDay: false })}
                  data-testid="input-leave-end"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm({ ...leaveForm, leaveType: v })}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-leave-type">
                  <SelectValue placeholder="Select a leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypeOptions.map((o: any) => (
                    <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* A half day only makes sense on a single day — the server enforces
                it too, but offering it on a range would be a trap. */}
            {leaveForm.startDate && leaveForm.startDate === leaveForm.endDate && (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={leaveForm.isHalfDay}
                    onCheckedChange={(c) => setLeaveForm({ ...leaveForm, isHalfDay: !!c })}
                    data-testid="checkbox-leave-half-day"
                  />
                  <span className="text-xs">Half day</span>
                </label>
                {leaveForm.isHalfDay && (
                  <Select
                    value={leaveForm.halfDayPeriod}
                    onValueChange={(v) => setLeaveForm({ ...leaveForm, halfDayPeriod: v as "am" | "pm" })}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs" data-testid="select-leave-period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="am">Morning</SelectItem>
                      <SelectItem value="pm">Afternoon</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label className="text-xs">Note <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                className="h-8 text-xs"
                value={leaveForm.note}
                onChange={(e) => setLeaveForm({ ...leaveForm, note: e.target.value })}
                data-testid="input-leave-note"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editingLeaveId && (
              <Button
                variant="outline"
                className="mr-auto text-destructive"
                onClick={() => deleteLeaveMutation.mutate(editingLeaveId)}
                data-testid="button-delete-leave"
              >
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => { setLeaveDialogOpen(false); resetLeaveForm(); }}>Cancel</Button>
            <Button
              onClick={() => saveLeaveMutation.mutate()}
              disabled={!leaveForm.userId || !leaveForm.startDate || !leaveForm.endDate || !leaveForm.leaveType || saveLeaveMutation.isPending}
              data-testid="button-save-leave"
            >
              {editingLeaveId ? "Save" : "Mark leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

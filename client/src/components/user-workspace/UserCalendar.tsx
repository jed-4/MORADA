import { useState, useMemo, useEffect, useRef } from "react";
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
import { CalendarEventDetailDialog } from "@/components/CalendarEventDetailDialog";
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
import type { User as UserType } from "@shared/schema";

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
  const defaultViewCreationAttempted = useRef(false);

  const displayedUserId = user.id;

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

  // Fetch task templates to filter out tasks from inactive templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ["/api/task-templates"],
  });

  // Fetch schedule items for displayed user
  const { data: scheduleItems = [], isLoading: isLoadingSchedule } = useQuery({
    queryKey: ["/api/schedule", displayedUserId],
    queryFn: async () => {
      const allSchedule = await apiRequest("/api/schedule", "GET");
      return Array.isArray(allSchedule)
        ? allSchedule.filter((item: any) => item.assigneeId === displayedUserId)
        : [];
    },
    enabled: !!displayedUserId,
  });

  // Fetch Google Calendar events
  const { data: googleCalendarEvents = [] } = useQuery({
    queryKey: ["/api/google-calendar/events", displayedUserId],
    queryFn: async () => {
      const response = await fetch("/api/google-calendar/events");
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isOwnPage, // Only fetch for own calendar
  });

  // Fetch saved views
  const { data: savedViews = [] } = useQuery<CalendarView[]>({
    queryKey: ["/api/calendar-views", "personal"],
    queryFn: async () => {
      return await apiRequest("/api/calendar-views?calendarType=personal", "GET");
    },
  });

  // Create default view if none exist
  useEffect(() => {
    if (savedViews.length === 0 && !defaultViewCreationAttempted.current) {
      defaultViewCreationAttempted.current = true;
      createDefaultView();
    }
  }, [savedViews]);

  const createDefaultView = async () => {
    try {
      await apiRequest("/api/calendar-views", "POST", {
        name: "All Events",
        calendarType: "personal",
        filters: {},
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views", "personal"] });
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
        setFilters(normalizedFilters);
      }
    }
  }, [selectedViewId, savedViews]);

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
          start: new Date(task.dueDate),
          end: new Date(task.dueDate),
          type: "task",
          projectId: task.projectId,
          projectName: project?.name,
          projectColor: project?.color,
          status: task.status,
          priority: task.priority,
          resource: task,
        });
      }
    });

    // Add schedule items
    scheduleItems.forEach((item: any) => {
      if (item.date) {
        const project = projects.find((p: any) => p.id === item.projectId);
        events.push({
          id: item.id,
          title: item.title,
          start: new Date(item.date),
          end: new Date(item.date),
          type: "schedule",
          projectId: item.projectId,
          projectName: project?.name,
          projectColor: project?.color,
          resource: item,
        });
      }
    });

    // Add Google Calendar events (only for own calendar)
    if (isOwnPage && googleCalendarEvents.length > 0) {
      googleCalendarEvents.forEach((event: any) => {
        events.push({
          id: event.id,
          title: event.summary || "Untitled Event",
          start: new Date(event.start.dateTime || event.start.date),
          end: new Date(event.end.dateTime || event.end.date),
          type: "google",
          resource: event,
        });
      });
    }

    return events;
  }, [userTasks, scheduleItems, googleCalendarEvents, projects, taskTemplates, isOwnPage]);

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
        const eventStart = event.start;
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

  return (
    <div className="flex flex-col h-full" data-testid="user-calendar">
      <div className="flex-1 min-h-0 p-4">
        <EnhancedCalendar
          events={filteredEvents}
          onEventClick={handleEventClick}
          currentDate={currentDate}
          onNavigate={setCurrentDate}
          view={calendarMode}
          onViewChange={setCalendarMode}
        />
      </div>

      {selectedEvent && (
        <CalendarEventDetailDialog
          event={selectedEvent}
          open={detailDialogOpen}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}

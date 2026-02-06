import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  isWithinInterval,
  parseISO,
  isSameDay
} from "date-fns";

export interface CalendarItem {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  type: "task" | "schedule" | "timesheet" | "google-calendar" | "reminder";
  projectId?: number;
  projectName?: string;
  projectColor?: string;
  status?: string;
  priority?: string;
  description?: string;
  location?: string;
}

interface UsePersonalCalendarEventsOptions {
  userId?: string;
  date?: Date;
  range?: "day" | "week";
  includeTasks?: boolean;
  includeSchedule?: boolean;
  includeTimesheets?: boolean;
  includeGoogleCalendar?: boolean;
  includeReminders?: boolean;
  weekStartDay?: 0 | 1;
}

export function usePersonalCalendarEvents({
  userId,
  date = new Date(),
  range = "day",
  includeTasks = true,
  includeSchedule = true,
  includeTimesheets = true,
  includeGoogleCalendar = true,
  includeReminders = true,
  weekStartDay = 1,
}: UsePersonalCalendarEventsOptions) {
  const rangeStart = range === "day" ? startOfDay(date) : startOfWeek(date, { weekStartsOn: weekStartDay });
  const rangeEnd = range === "day" ? endOfDay(date) : endOfWeek(date, { weekStartsOn: weekStartDay });

  const REFETCH_INTERVAL = 15000; // Refresh every 15 seconds for real-time updates

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId && includeTasks,
    refetchInterval: REFETCH_INTERVAL,
  });

  const { data: scheduleItems = [], isLoading: scheduleLoading } = useQuery<any[]>({
    queryKey: ["/api/schedule", userId],
    queryFn: async () => {
      const allSchedule = await apiRequest("/api/schedule", "GET");
      return Array.isArray(allSchedule)
        ? allSchedule.filter((item: any) => String(item.assigneeId) === String(userId))
        : [];
    },
    enabled: !!userId && includeSchedule,
    refetchInterval: REFETCH_INTERVAL,
  });

  const { data: timesheets = [], isLoading: timesheetsLoading } = useQuery<any[]>({
    queryKey: ["/api/timesheets", { userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/timesheets?userId=${userId}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId && includeTimesheets,
    refetchInterval: REFETCH_INTERVAL,
  });

  const { data: googleCalendarStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/google-calendar/status"],
    queryFn: async () => {
      try {
        return await apiRequest("/api/google-calendar/status", "GET");
      } catch {
        return { connected: false };
      }
    },
    enabled: includeGoogleCalendar,
  });

  // Fetch Google Calendar events directly (like UserCalendarDialog does)
  // The API will return empty array if not connected
  const { data: googleEvents = [], isLoading: googleLoading } = useQuery<any[]>({
    queryKey: ["/api/google-calendar/events"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/google-calendar/events", { credentials: 'include' });
        if (!response.ok) return [];
        return response.json() || [];
      } catch {
        return [];
      }
    },
    enabled: includeGoogleCalendar,
    retry: false,
  });

  const { data: reminders = [], isLoading: remindersLoading } = useQuery<any[]>({
    queryKey: ["/api/users", userId, "reminders"],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/users/${userId}/reminders`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId && includeReminders,
    refetchInterval: REFETCH_INTERVAL,
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const events = useMemo(() => {
    const items: CalendarItem[] = [];

    if (includeTasks) {
      tasks.forEach((task: any) => {
        if (!task.dueDate) return;
        const dueDate = new Date(task.dueDate);
        if (!isWithinInterval(dueDate, { start: rangeStart, end: rangeEnd })) return;
        
        const project = projects.find((p: any) => p.id === task.projectId);
        const hasTime = task.startTime && task.endTime;
        
        items.push({
          id: `task-${task.id}`,
          title: task.title,
          startDate: dueDate,
          endDate: dueDate,
          startTime: task.startTime || null,
          endTime: task.endTime || null,
          allDay: !hasTime,
          type: "task",
          projectId: task.projectId,
          projectName: project?.name,
          projectColor: project?.color,
          status: task.status,
          priority: task.priority,
          description: task.content,
        });
      });
    }

    if (includeSchedule) {
      scheduleItems.forEach((item: any) => {
        if (!item.date) return;
        const itemDate = new Date(item.date);
        if (!isWithinInterval(itemDate, { start: rangeStart, end: rangeEnd })) return;

        const project = projects.find((p: any) => p.id === item.projectId);
        const hasTime = item.startTime && item.endTime;

        items.push({
          id: `schedule-${item.id}`,
          title: item.title,
          startDate: itemDate,
          endDate: itemDate,
          startTime: item.startTime || null,
          endTime: item.endTime || null,
          allDay: !hasTime,
          type: "schedule",
          projectId: item.projectId,
          projectName: project?.name,
          projectColor: project?.color,
          description: item.description,
        });
      });
    }

    if (includeTimesheets) {
      timesheets.forEach((ts: any) => {
        if (!ts.date) return;
        const tsDate = new Date(ts.date);
        if (!isWithinInterval(tsDate, { start: rangeStart, end: rangeEnd })) return;

        const project = projects.find((p: any) => p.id === ts.projectId);

        items.push({
          id: `timesheet-${ts.id}`,
          title: `${ts.hours || 0}h logged${project ? ` - ${project.name}` : ''}`,
          startDate: tsDate,
          endDate: tsDate,
          startTime: ts.startTime || null,
          endTime: ts.endTime || null,
          allDay: !ts.startTime,
          type: "timesheet",
          projectId: ts.projectId,
          projectName: project?.name,
          projectColor: project?.color,
        });
      });
    }

    if (includeGoogleCalendar && googleEvents.length > 0) {
      googleEvents.forEach((event: any) => {
        // Handle different event formats - API might return pre-formatted events
        const startStr = event.start?.dateTime || event.start?.date || event.startDate;
        const endStr = event.end?.dateTime || event.end?.date || event.endDate;
        if (!startStr) return;

        const eventStart = new Date(startStr);
        if (!isWithinInterval(eventStart, { start: rangeStart, end: rangeEnd })) return;

        const isAllDay = event.allDay || (!event.start?.dateTime && !event.startTime);

        items.push({
          id: `google-${event.id}`,
          title: event.summary || event.title || "Untitled Event",
          startDate: eventStart,
          endDate: endStr ? new Date(endStr) : eventStart,
          startTime: event.startTime || (isAllDay ? null : eventStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })),
          endTime: event.endTime || (isAllDay || !endStr ? null : new Date(endStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })),
          allDay: isAllDay,
          type: "google-calendar",
          description: event.description,
          location: event.location,
        });
      });
    }

    if (includeReminders) {
      reminders.forEach((reminder: any) => {
        if (!reminder.triggerAt) return;
        const triggerDate = new Date(reminder.triggerAt);
        if (!isWithinInterval(triggerDate, { start: rangeStart, end: rangeEnd })) return;

        items.push({
          id: `reminder-${reminder.id}`,
          title: reminder.title,
          startDate: triggerDate,
          endDate: triggerDate,
          startTime: triggerDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          endTime: null,
          allDay: false,
          type: "reminder",
          description: reminder.content,
        });
      });
    }

    return items.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return a.startDate.getTime() - b.startDate.getTime();
    });
  }, [tasks, scheduleItems, timesheets, googleEvents, reminders, projects, rangeStart, rangeEnd, includeTasks, includeSchedule, includeTimesheets, includeGoogleCalendar, includeReminders]);

  const isLoading = tasksLoading || scheduleLoading || timesheetsLoading || googleLoading || remindersLoading;

  const allDayEvents = events.filter(e => e.allDay);
  const timedEvents = events.filter(e => !e.allDay);

  return {
    events,
    allDayEvents,
    timedEvents,
    isLoading,
    rangeStart,
    rangeEnd,
    isGoogleConnected: googleCalendarStatus?.connected ?? false,
  };
}

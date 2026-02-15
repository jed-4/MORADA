import { useMemo, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { format, isWithinInterval } from "date-fns";
import type { Task, Project, FieldCategoryWithOptions, CompanySettings } from "@shared/schema";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import TaskEditModal from "@/components/TaskEditModal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface UserCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CalendarFilters {
  projects?: string[];
  status?: string[];
  eventTypes?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

export function UserCalendarDialog({ open, onOpenChange }: UserCalendarDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [calendarMode, setCalendarMode] = useState<string>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filters, setFilters] = useState<CalendarFilters>({});

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const { data: userTasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ["/api/tasks/user"],
    enabled: open,
  });

  const { 
    data: googleCalendarEvents = [], 
    isLoading: isLoadingGoogleEvents,
    isError: isGoogleCalendarError,
  } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/google-calendar/events"],
    enabled: open,
    staleTime: 3 * 60 * 1000,
    retry: 2,
    retryDelay: 3000,
  });

  const { data: googleCalendarStatus } = useQuery<{ connected: boolean; email?: string }>({
    queryKey: ["/api/google-calendar/status"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const isGoogleCalendarConnected = googleCalendarStatus?.connected === true;

  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
    enabled: open,
  });

  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
    enabled: open,
  });

  const { data: taskTemplates = [] } = useQuery({
    queryKey: ["/api/systems/task-templates"],
    enabled: open,
  });

  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  useEffect(() => {
    if (isGoogleCalendarError && open) {
      toast({
        title: "Failed to load Google Calendar",
        description: "Unable to fetch your Google Calendar events. Please try reconnecting in your profile.",
        variant: "destructive",
      });
    }
  }, [isGoogleCalendarError, open, toast]);

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const rescheduleTaskMutation = useMutation({
    mutationFn: async ({ taskId, dueDate, startTime }: { taskId: string; dueDate: string; startTime?: string }) => {
      const payload: any = { dueDate };
      if (startTime) payload.startTime = startTime;
      return await apiRequest(`/api/tasks/${taskId}`, "PATCH", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const filteredEvents: CalendarEvent[] = useMemo(() => {
    const taskEvents = userTasks
      .filter(task => task.dueDate)
      .filter((task: any) => {
        if (task.templateId) {
          const template = (taskTemplates as any[]).find((t: any) => t.id === task.templateId);
          if (template && template.isActive === false) return false;
        }
        return true;
      })
      .map(task => {
        const project = projects.find(p => p.id === task.projectId);
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
        };
      });

    let allEvents = [...taskEvents, ...googleCalendarEvents];

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      allEvents = allEvents.filter(event => filters.eventTypes!.includes(event.type));
    }
    if (filters.projects && filters.projects.length > 0) {
      allEvents = allEvents.filter(event => event.projectId && filters.projects!.includes(event.projectId));
    }
    if (filters.status && filters.status.length > 0) {
      allEvents = allEvents.filter(event => event.status && filters.status!.includes(event.status));
    }
    if (filters.dateFrom || filters.dateTo) {
      allEvents = allEvents.filter(event => {
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

    return allEvents;
  }, [userTasks, projects, completedOption, googleCalendarEvents, companySettings?.brandColor, filters, taskTemplates]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    if (eventId.startsWith('google-')) return;
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
      rescheduleTaskMutation.mutate({ 
        taskId: eventId, 
        dueDate: format(newDate, "yyyy-MM-dd"),
        startTime: newTime,
      });
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDetailDialogOpen(true);
  };

  const handleNavigateToday = () => setCurrentDate(new Date());

  const handleNavigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (calendarMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
    else if (calendarMode === 'week') newDate.setDate(newDate.getDate() - 7);
    else newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNavigateNext = () => {
    const newDate = new Date(currentDate);
    if (calendarMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
    else if (calendarMode === 'week') newDate.setDate(newDate.getDate() + 7);
    else newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const getActiveFilterCount = () => {
    return Object.entries(filters).filter(([key, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null;
    }).length;
  };

  const activeFilterCount = getActiveFilterCount();

  const isLoading = isLoadingTasks || isLoadingGoogleEvents;

  const userName = user 
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'My'
    : 'My';

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl h-[85vh] flex flex-col overflow-hidden p-0" data-testid="user-calendar-dialog">
          <div className="h-10 flex items-center px-4 border-b border-border/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{userName} Calendar</h2>
            </div>
          </div>
          <div className="flex items-center justify-center h-full overflow-hidden">
            <div className="text-muted-foreground text-sm">Loading calendar...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col overflow-hidden p-0" data-testid="user-calendar-dialog">
        {/* Row 1 - Title */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{userName} Calendar</h2>
          </div>
        </div>

        {/* Row 2 - Filters & Navigation */}
        <div className="h-8 flex items-center justify-between px-3 gap-1.5 flex-shrink-0 border-b border-border/50">
          {/* Left: Filters */}
          <div className="flex items-center gap-1 flex-wrap">
            {projects.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
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
                        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFilters({...filters, projects: undefined})}>Clear</button>
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
                                ? current.filter((p: string) => p !== project.id)
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

            {statusOptions.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
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
                        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFilters({...filters, status: undefined})}>Clear</button>
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
                                ? current.filter((s: string) => s !== status.key)
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

            <Popover>
              <PopoverTrigger asChild>
                <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
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
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFilters({...filters, eventTypes: undefined})}>Clear</button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { value: 'task', label: 'Tasks' },
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
                                ? current.filter((t: string) => t !== type.value)
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

            <Popover>
              <PopoverTrigger asChild>
                <button className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                  <span>Date Range</span>
                  {(filters.dateFrom || filters.dateTo) && (
                    <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">1</Badge>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Date Range</div>
                    {(filters.dateFrom || filters.dateTo) && (
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFilters({...filters, dateFrom: undefined, dateTo: undefined})}>Clear</button>
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

            {activeFilterCount > 0 && (
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 text-muted-foreground"
                onClick={() => setFilters({})}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Right: Navigation & View Controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              onClick={handleNavigatePrevious}
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
              onClick={handleNavigateToday}
            >
              Today
            </button>
            <button
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              onClick={handleNavigateNext}
            >
              <ChevronRight className="w-3 h-3" />
            </button>

            <span className="text-xs text-muted-foreground px-2">
              {format(currentDate, 'MMM d, yyyy')}
            </span>

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
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar Content */}
        <div className="flex-1 min-h-0 overflow-hidden px-1 pb-1">
          <EnhancedCalendar
            events={filteredEvents}
            onEventClick={handleEventClick}
            onEventComplete={handleEventComplete}
            onEventReschedule={handleEventReschedule}
            showCompletionCheckbox={true}
            currentDate={currentDate}
            onCurrentDateChange={setCurrentDate}
            view={calendarMode as any}
            onViewChange={(newView) => setCalendarMode(newView)}
            hideInternalHeader={true}
          />
        </div>
      </DialogContent>
      
      <TaskDetailModal
        event={selectedEvent}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onEdit={(task) => setEditingTask(task)}
      />
      
      <TaskEditModal
        task={editingTask || undefined}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
      />
    </Dialog>
  );
}

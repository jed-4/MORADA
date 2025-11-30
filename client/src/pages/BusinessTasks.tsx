import React, { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, MoreHorizontal, X, Search, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import TaskBoard from "@/components/TaskBoard";
import TaskListCompact from "@/components/TaskListCompact";
import TaskModalAsana from "@/components/TaskModalAsana";
import { EnhancedCalendar, CalendarEvent } from "@/components/EnhancedCalendar";
import TaskViewsManager, { type TaskView, type TaskViewFilters } from "@/components/TaskViewsManager";
import { type Task, type FieldCategoryWithOptions, type Project } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { applyTaskFilters, extractFilterOptions } from "@/utils/taskFilters";
import { useToast } from "@/hooks/use-toast";
import { type FilterState } from "@/components/FilterPanel";
import { useTaskPriorityOptions } from "@/hooks/useTaskPriorityOptions";

export default function BusinessTasks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"board" | "list" | "calendar">("board");
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'priority' | 'assignee'>('none');
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>(undefined);
  const [cardDisplaySettings, setCardDisplaySettings] = useState({
    showPriority: true,
    showStatus: true,
    showDescription: true,
    showTags: true,
    showLabels: true,
    showAssignee: true,
    showDueDate: true,
    showSubtasks: true,
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showNavigation, setShowNavigation] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  
  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarMode, setCalendarMode] = useState<string>("week");

  // Scroll navigation functions
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -320,
        behavior: 'smooth'
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 320,
        behavior: 'smooth'
      });
    }
  };

  // Load view preferences from database
  const { data: userPreferences, isError: preferencesError } = useQuery({
    queryKey: ["/api/user-view-preferences", "business_tasks"],
    queryFn: async () => {
      console.log('[BusinessTasks] Fetching user view preferences...');
      const response = await fetch("/api/user-view-preferences/business_tasks", {
        credentials: "include",
      });
      console.log('[BusinessTasks] Preferences fetch response status:', response.status);
      if (!response.ok) {
        if (response.status === 404) {
          console.log('[BusinessTasks] No preferences found (404)');
          return null;
        }
        throw new Error("Failed to fetch view preferences");
      }
      const data = await response.json();
      console.log('[BusinessTasks] Preferences fetched successfully:', data);
      return data;
    },
  });

  // Apply loaded preferences
  useEffect(() => {
    console.log('[BusinessTasks] userPreferences changed:', userPreferences);
    if (userPreferences?.preferences) {
      console.log('[BusinessTasks] Applying loaded preferences');
      if (userPreferences.preferences.cardDisplaySettings) {
        setCardDisplaySettings(userPreferences.preferences.cardDisplaySettings);
      }
      if (userPreferences.preferences.activeTab) {
        setActiveTab(userPreferences.preferences.activeTab);
      }
      if (userPreferences.preferences.groupBy) {
        setGroupBy(userPreferences.preferences.groupBy);
      }
      setPreferencesLoaded(true);
    } else if (userPreferences === null || preferencesError) {
      console.log('[BusinessTasks] No saved preferences, using defaults');
      setPreferencesLoaded(true);
    }
  }, [userPreferences, preferencesError]);

  // Save view preferences mutation
  const savePreferencesMutation = useMutation({
    mutationFn: async (prefs: { cardDisplaySettings: typeof cardDisplaySettings; activeTab: string; groupBy: string }) => {
      console.log('[BusinessTasks] Saving view preferences:', prefs);
      return await apiRequest("/api/user-view-preferences", "POST", {
        viewKey: "business_tasks",
        preferences: prefs,
      });
    },
    onSuccess: () => {
      console.log('[BusinessTasks] Preferences saved successfully');
    },
    onError: (error) => {
      console.error('[BusinessTasks] Error saving preferences:', error);
    },
  });

  // Auto-save preferences when they change (after initial load)
  useEffect(() => {
    if (preferencesLoaded) {
      const timer = setTimeout(() => {
        console.log('[BusinessTasks] Debounced save triggered');
        savePreferencesMutation.mutate({
          cardDisplaySettings,
          activeTab,
          groupBy,
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [cardDisplaySettings, activeTab, groupBy, preferencesLoaded]);

  // Fetch business tasks (tasks without a project)
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { businessTasks: true }], 
    queryFn: async () => {
      const response = await fetch('/api/tasks?businessTasks=true', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch business tasks');
      return response.json();
    },
  });

  // Fetch task status options from field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Fetch task priority options from field categories
  const { priorityOptions: fetchedPriorityOptions } = useTaskPriorityOptions();
  
  // Use fetched priority options or fallback to defaults if none exist
  const priorityOptions = fetchedPriorityOptions.length > 0 ? fetchedPriorityOptions : [
    { key: "low", name: "Low", color: "#10B981" },
    { key: "medium", name: "Medium", color: "#F59E0B" },
    { key: "high", name: "High", color: "#EF4444" },
    { key: "urgent", name: "Urgent", color: "#DC2626" },
  ];

  // Apply filters to get filtered tasks
  const filteredTasks = applyTaskFilters(allTasks, filters);

  // Group tasks based on selected grouping
  const groupedTasks = React.useMemo(() => {
    if (groupBy === 'none' || activeTab !== 'list') {
      return { 'All Tasks': filteredTasks };
    }

    const groups: Record<string, Task[]> = {};
    
    filteredTasks.forEach((task) => {
      let groupKey = 'Ungrouped';
      
      switch (groupBy) {
        case 'status':
          groupKey = task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || 'No Status';
          break;
        case 'priority':
          groupKey = task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1) || 'No Priority';
          break;
        case 'assignee':
          groupKey = task.assignee || 'Unassigned';
          break;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });
    
    // Sort groups by name
    const sortedGroups: Record<string, Task[]> = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });
    
    return sortedGroups;
  }, [filteredTasks, groupBy, activeTab]);

  const { 
    availableAssignees: assigneeOptions = [],
    availableProjects: projectOptions = [],
  } = extractFilterOptions(allTasks);
  
  // Extract status options from field categories
  const statusCategory = fieldCategories.find(cat => cat.key === "task.status");
  const statusOptions = statusCategory?.options || [];
  const completedOption = statusCategory?.options.find(opt => opt.isCompleted);
  const defaultOption = statusCategory?.options.find(opt => opt.isDefault);

  // Extract label options from field categories
  const labelCategory = fieldCategories.find(cat => cat.key === "task.labels");
  const labelOptions = labelCategory?.options?.map(opt => opt.name) || [];

  // Fetch projects for color coding
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Update task mutations
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

  // Convert tasks to calendar events
  const calendarEvents: CalendarEvent[] = React.useMemo(() => {
    return filteredTasks
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
          priority: task.priority,
          resource: task,
        };
      });
  }, [filteredTasks, projects, completedOption]);

  const handleEventComplete = (eventId: string, completed: boolean) => {
    const newStatus = completed 
      ? (completedOption?.key || "done") 
      : (defaultOption?.key || "todo");
    updateTaskMutation.mutate({ taskId: eventId, status: newStatus });
  };

  const handleEventReschedule = (eventId: string, newDate: Date, eventType: "task" | "schedule" | "meeting" | "google-calendar", newTime?: string) => {
    const updatePayload: any = { 
      taskId: eventId, 
      dueDate: new Date(newDate).toISOString().split('T')[0]
    };
    
    if (newTime) {
      updatePayload.startTime = newTime;
    }
    
    rescheduleTaskMutation.mutate(updatePayload);
  };

  const handleEventResize = (eventId: string, startTime: string, endTime: string, eventType: "task" | "schedule" | "meeting" | "google-calendar") => {
    resizeTaskMutation.mutate({ taskId: eventId, startTime, endTime });
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.resource && event.type === "task") {
      setEditingTask(event.resource as Task);
      setShowCreateTaskDialog(true);
    }
  };

  return (
    <div className="flex h-full flex-col" data-testid="business-tasks">
      {/* Row 2 - Views & Options (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-0.5" data-testid="tabs-task-views">
          <button
            onClick={() => setActiveTab("board")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "board" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-board"
          >
            Board
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "list" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-list"
          >
            List
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === "calendar" 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-calendar"
          >
            Calendar
          </button>
        </div>

        {/* Right: Calendar Controls OR Saved Views */}
        {activeTab === "calendar" ? (
          <div className="flex items-center gap-1.5">
            {/* Calendar Navigation */}
            <button
              onClick={() => {
                const newDate = new Date(calendarDate);
                if (calendarMode === "day") {
                  newDate.setDate(newDate.getDate() - 1);
                } else if (calendarMode === "week") {
                  newDate.setDate(newDate.getDate() - 7);
                } else {
                  newDate.setMonth(newDate.getMonth() - 1);
                }
                setCalendarDate(newDate);
              }}
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-calendar-prev"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              onClick={() => setCalendarDate(new Date())}
              className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2"
              data-testid="button-calendar-today"
            >
              Today
            </button>
            <button
              onClick={() => {
                const newDate = new Date(calendarDate);
                if (calendarMode === "day") {
                  newDate.setDate(newDate.getDate() + 1);
                } else if (calendarMode === "week") {
                  newDate.setDate(newDate.getDate() + 7);
                } else {
                  newDate.setMonth(newDate.getMonth() + 1);
                }
                setCalendarDate(newDate);
              }}
              className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
              data-testid="button-calendar-next"
            >
              <ChevronRight className="w-3 h-3" />
            </button>

            {/* View Switcher */}
            <div className="flex items-center gap-0.5 ml-2">
              <button
                onClick={() => setCalendarMode("day")}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === "day"
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-day"
              >
                Day
              </button>
              <button
                onClick={() => setCalendarMode("week")}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === "week"
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-week"
              >
                Week
              </button>
              <button
                onClick={() => setCalendarMode("month")}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarMode === "month"
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-month"
              >
                Month
              </button>
            </div>
          </div>
        ) : (
          <TaskViewsManager 
            currentViewType={activeTab}
            currentFilters={filters as TaskViewFilters}
            currentGroupBy={groupBy}
            onViewSelect={(view: TaskView) => {
              setActiveTab(view.viewType);
              setFilters(view.filters as FilterState);
              setGroupBy(view.groupBy);
              setSelectedViewId(view.id);
            }}
            selectedViewId={selectedViewId}
          />
        )}
      </div>

      {/* Row 3 - Search & Filters (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
        {/* Left: Search + Filter Dropdowns */}
        <div className="flex items-center gap-1.5 flex-1">
          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search..."
              value={filters.search || ""}
              onChange={(e) => setFilters({...filters, search: e.target.value || undefined})}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-tasks"
            />
          </div>

          {/* Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Status</span>
                {filters.status && filters.status.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.status.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {(statusOptions.length > 0 ? statusOptions : [
                { key: "todo", name: "To Do", color: null },
                { key: "in-progress", name: "In Progress", color: null },
                { key: "done", name: "Done", color: null },
              ]).map(option => (
                <DropdownMenuItem key={option.key} className="flex items-center">
                  <Checkbox
                    checked={filters.status?.includes(option.key) || false}
                    onCheckedChange={() => {
                      const currentStatus = filters.status || [];
                      const newStatus = currentStatus.includes(option.key)
                        ? currentStatus.filter(s => s !== option.key)
                        : [...currentStatus, option.key];
                      setFilters({...filters, status: newStatus.length > 0 ? newStatus : undefined});
                    }}
                  />
                  <span className="ml-2">{option.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Priority</span>
                {filters.priority && filters.priority.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.priority.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {priorityOptions.map(option => (
                <DropdownMenuItem key={option.key} className="flex items-center">
                  <Checkbox
                    checked={filters.priority?.includes(option.key) || false}
                    onCheckedChange={() => {
                      const currentPriority = filters.priority || [];
                      const newPriority = currentPriority.includes(option.key)
                        ? currentPriority.filter(p => p !== option.key)
                        : [...currentPriority, option.key];
                      setFilters({...filters, priority: newPriority.length > 0 ? newPriority : undefined});
                    }}
                  />
                  <span className="ml-2">{option.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assignee Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Assignee</span>
                {filters.assignee && filters.assignee.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.assignee.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {assigneeOptions.map(assignee => (
                <DropdownMenuItem key={assignee} className="flex items-center">
                  <Checkbox
                    checked={filters.assignee?.includes(assignee) || false}
                    onCheckedChange={() => {
                      const currentAssignee = filters.assignee || [];
                      const newAssignee = currentAssignee.includes(assignee)
                        ? currentAssignee.filter(a => a !== assignee)
                        : [...currentAssignee, assignee];
                      setFilters({...filters, assignee: newAssignee.length > 0 ? newAssignee : undefined});
                    }}
                  />
                  <span className="ml-2">{assignee}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Labels Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5">
                <span>Labels</span>
                {filters.labels && filters.labels.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    {filters.labels.length}
                  </Badge>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {labelOptions.map(label => (
                <DropdownMenuItem key={label} className="flex items-center">
                  <Checkbox
                    checked={filters.labels?.includes(label) || false}
                    onCheckedChange={() => {
                      const currentLabels = filters.labels || [];
                      const newLabels = currentLabels.includes(label)
                        ? currentLabels.filter(l => l !== label)
                        : [...currentLabels, label];
                      setFilters({...filters, labels: newLabels.length > 0 ? newLabels : undefined});
                    }}
                  />
                  <span className="ml-2">{label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: Navigation + New Task + Settings */}
        <div className="flex items-center gap-1.5">
          {activeTab === "board" && showNavigation && (
            <>
              <button
                onClick={scrollLeft}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-scroll-left"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={scrollRight}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-scroll-right"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </>
          )}
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setShowCreateTaskDialog(true)}
            data-testid="button-new-task-header"
          >
            <Plus className="w-3 h-3" />
            <span>New Task</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-view-menu"
              >
                <Settings className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="menu-manage-views">
                <Settings className="h-4 w-4 mr-2" />
                View Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content Area - Full Height */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "board" && (
          <div className="h-full p-4" data-testid="content-board">
            <TaskBoard
              tasks={filteredTasks}
              isLoading={tasksLoading}
              onTaskClick={(task) => {
                setEditingTask(task);
                setShowCreateTaskDialog(true);
              }}
              displaySettings={cardDisplaySettings}
            />
          </div>
        )}

        {activeTab === "list" && (
          <div className="h-full p-4" data-testid="content-list">
            <TaskListCompact
              groupedTasks={groupedTasks}
              isLoading={tasksLoading}
              onTaskClick={(task) => {
                setEditingTask(task);
                setShowCreateTaskDialog(true);
              }}
            />
          </div>
        )}

        {activeTab === "calendar" && (
          <div className="h-full" data-testid="content-calendar">
            <EnhancedCalendar
              events={calendarEvents}
              onEventClick={handleEventClick}
              onEventComplete={handleEventComplete}
              onEventReschedule={handleEventReschedule}
              onEventResize={handleEventResize}
              showCompletionCheckbox={true}
              currentDate={calendarDate}
              onCurrentDateChange={setCalendarDate}
              view={calendarMode as any}
              onViewChange={(newView) => setCalendarMode(newView)}
              hideInternalHeader={true}
            />
          </div>
        )}
      </div>

      {/* Task Creation Dialog */}
      {!editingTask && (
        <TaskModalAsana 
          open={showCreateTaskDialog}
          onOpenChange={(open) => {
            setShowCreateTaskDialog(open);
            if (!open) setEditingTask(null);
          }}
          projectId=""
        />
      )}

      {/* Task Editing Dialog */}
      {editingTask && (
        <TaskModalAsana
          task={editingTask}
          open={showCreateTaskDialog}
          onOpenChange={(open) => {
            setShowCreateTaskDialog(open);
            if (!open) setEditingTask(null);
          }}
          projectId={editingTask.projectId || ""}
        />
      )}
    </div>
  );
}

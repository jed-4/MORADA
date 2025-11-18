import React, { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
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
import { TaskCalendar } from "@/components/TaskCalendar";
import TaskViewsManager, { type TaskView, type TaskViewFilters } from "@/components/TaskViewsManager";
import { Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { type Task, type FieldCategoryWithOptions } from "@shared/schema";
import { applyTaskFilters, extractFilterOptions } from "@/utils/taskFilters";
import { useToast } from "@/hooks/use-toast";
import { type FilterState } from "@/components/FilterPanel";
import { useTaskPriorityOptions } from "@/hooks/useTaskPriorityOptions";

export default function BusinessTasks() {
  const { toast } = useToast();
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
  
  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<typeof Views[keyof typeof Views]>(Views.WEEK);

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

  // Load card display settings from localStorage
  React.useEffect(() => {
    const savedSettings = localStorage.getItem('cardDisplay_businessTasks');
    if (savedSettings) {
      try {
        setCardDisplaySettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to parse card display settings:', e);
      }
    }
  }, []);

  // Save card display settings to localStorage when they change
  React.useEffect(() => {
    localStorage.setItem('cardDisplay_businessTasks', JSON.stringify(cardDisplaySettings));
  }, [cardDisplaySettings]);

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

  // Extract label options from field categories
  const labelCategory = fieldCategories.find(cat => cat.key === "task.labels");
  const labelOptions = labelCategory?.options?.map(opt => opt.name) || [];

  return (
    <div className="flex h-full flex-col" data-testid="business-tasks">
      {/* Row 2 - Views & Options (36px) */}
      <div className="h-9 bg-white flex items-center justify-between px-2 border-b border-border flex-shrink-0">
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
                if (calendarView === Views.DAY) {
                  newDate.setDate(newDate.getDate() - 1);
                } else if (calendarView === Views.WEEK) {
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
                if (calendarView === Views.DAY) {
                  newDate.setDate(newDate.getDate() + 1);
                } else if (calendarView === Views.WEEK) {
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
                onClick={() => setCalendarView(Views.DAY)}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarView === Views.DAY
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-day"
              >
                Day
              </button>
              <button
                onClick={() => setCalendarView(Views.WEEK)}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarView === Views.WEEK
                    ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90'
                    : 'hover-elevate'
                } active-elevate-2`}
                data-testid="button-view-week"
              >
                Week
              </button>
              <button
                onClick={() => setCalendarView(Views.MONTH)}
                className={`h-6 w-auto px-2 text-xs border rounded-md ${
                  calendarView === Views.MONTH
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
      <div className="h-9 bg-white flex items-center justify-between px-2 gap-1.5 border-b border-border flex-shrink-0">
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
          <div className="h-full p-4" data-testid="content-calendar">
            <TaskCalendar
              tasks={filteredTasks}
              projectId=""
              onTaskClick={(task) => {
                setEditingTask(task);
                setShowCreateTaskDialog(true);
              }}
              currentDate={calendarDate}
              currentView={calendarView}
              onNavigate={setCalendarDate}
              onViewChange={setCalendarView}
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

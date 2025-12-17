import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  Clock, 
  Plus, 
  AlertTriangle, 
  Flag, 
  CheckCircle2, 
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  List,
  CalendarDays,
  LayoutGrid
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  format, 
  addDays, 
  subDays,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  startOfWeek, 
  startOfMonth,
  endOfMonth,
  isToday, 
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
  getDay
} from "date-fns";

type ViewMode = "list" | "day" | "week" | "month";

interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: "task" | "milestone" | "meeting" | "inspection";
  status: "scheduled" | "overdue" | "completed" | "in_progress";
  priority?: "high" | "medium" | "low";
}

const typeColors = {
  task: "bg-blue-500",
  milestone: "bg-purple-500",
  meeting: "bg-green-500",
  inspection: "bg-amber-500",
};

const typeBadgeColors = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  milestone: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  meeting: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  inspection: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const priorityColors = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-blue-500",
};

export default function ScheduleWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const [, navigate] = useLocation();
  
  const viewMode = (widget.config?.viewMode as ViewMode) || "list";
  const maxItems = widget.config?.maxItems || 5;
  const showOverdue = widget.config?.showOverdue !== false;
  const showMilestones = widget.config?.showMilestones !== false;
  const showCompleted = widget.config?.showCompleted || false;
  const showTasks = widget.config?.showTasks !== false;
  const priorityFilter = widget.config?.priorityFilter || "all";
  const statusFilter = widget.config?.statusFilter || "all";
  
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", currentProject?.id, "tasks"],
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/tasks?projectId=${currentProject.id}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentProject,
  });

  const { data: milestones = [], isLoading: milestonesLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", currentProject?.id, "milestones"],
    queryFn: async () => {
      if (!currentProject) return [];
      const response = await fetch(`/api/milestones?projectId=${currentProject.id}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentProject && showMilestones,
  });

  const scheduleItems = useMemo(() => {
    const now = new Date();
    const items: ScheduleItem[] = [];

    if (showTasks) {
      tasks.forEach((task: any) => {
        if (!task.dueDate) return;
        
        const dueDate = new Date(task.dueDate);
        const isOverdue = task.status !== 'completed' && dueDate < now;
        
        if (!showCompleted && task.status === 'completed') return;
        if (!showOverdue && isOverdue) return;
        
        if (priorityFilter !== "all" && task.priority !== priorityFilter) return;
        if (statusFilter !== "all") {
          if (statusFilter === "overdue" && !isOverdue) return;
          if (statusFilter === "in_progress" && task.status !== "in_progress") return;
          if (statusFilter === "scheduled" && (task.status !== "todo" && !isOverdue && task.status !== "in_progress")) return;
        }

        items.push({
          id: task.id,
          title: task.title || task.name,
          date: task.dueDate,
          type: "task",
          status: isOverdue ? "overdue" : task.status === 'completed' ? "completed" : task.status === 'in_progress' ? "in_progress" : "scheduled",
          priority: task.priority,
        });
      });
    }

    if (showMilestones) {
      milestones.forEach((milestone: any) => {
        if (!milestone.targetDate) return;
        
        const targetDate = new Date(milestone.targetDate);
        const isOverdue = !milestone.completed && targetDate < now;
        
        if (!showCompleted && milestone.completed) return;
        if (!showOverdue && isOverdue) return;
        
        // Apply priority filter (milestones are always high priority)
        if (priorityFilter !== "all" && priorityFilter !== "high") return;
        
        // Apply status filter to milestones
        if (statusFilter !== "all") {
          if (statusFilter === "overdue" && !isOverdue) return;
          if (statusFilter === "in_progress") return; // Milestones don't have in_progress
          if (statusFilter === "scheduled" && (milestone.completed || isOverdue)) return;
        }

        items.push({
          id: milestone.id,
          title: milestone.name,
          date: milestone.targetDate,
          type: "milestone",
          status: isOverdue ? "overdue" : milestone.completed ? "completed" : "scheduled",
          priority: "high",
        });
      });
    }

    return items.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [tasks, milestones, showTasks, showMilestones, showCompleted, showOverdue, priorityFilter, statusFilter]);

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view schedule
      </div>
    );
  }

  const isLoading = tasksLoading || milestonesLoading;

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-muted rounded"></div>
        ))}
      </div>
    );
  }

  const overdueCount = scheduleItems.filter(i => i.status === 'overdue').length;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    
    if (dateOnly.getTime() === today.getTime()) return "Today";
    if (dateOnly.getTime() === tomorrow.getTime()) return "Tomorrow";
    if (dateOnly < today) {
      const daysAgo = Math.floor((today.getTime() - dateOnly.getTime()) / 86400000);
      return `${daysAgo}d overdue`;
    }
    return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ ...widget, title: editingTitle });
      }
      onCloseConfig?.();
    };
    
    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      onCloseConfig?.();
    };

    const updateConfig = (key: string, value: any) => {
      onUpdate?.({ ...widget, config: { ...widget.config, [key]: value } });
    };
    
    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Schedule</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">View Mode</Label>
          <Select 
            value={viewMode} 
            onValueChange={(v) => updateConfig("viewMode", v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">List View</SelectItem>
              <SelectItem value="day">Day View</SelectItem>
              <SelectItem value="week">Week View</SelectItem>
              <SelectItem value="month">Month View</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Show Items</Label>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showTasks}
                onCheckedChange={(checked) => updateConfig("showTasks", !!checked)}
              />
              <span className="text-xs">Tasks</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showMilestones}
                onCheckedChange={(checked) => updateConfig("showMilestones", !!checked)}
              />
              <span className="text-xs">Milestones</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showOverdue}
                onCheckedChange={(checked) => updateConfig("showOverdue", !!checked)}
              />
              <span className="text-xs">Overdue items</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showCompleted}
                onCheckedChange={(checked) => updateConfig("showCompleted", !!checked)}
              />
              <span className="text-xs">Completed items</span>
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Priority Filter</Label>
          <Select 
            value={priorityFilter} 
            onValueChange={(v) => updateConfig("priorityFilter", v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High Only</SelectItem>
              <SelectItem value="medium">Medium Only</SelectItem>
              <SelectItem value="low">Low Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Status Filter</Label>
          <Select 
            value={statusFilter} 
            onValueChange={(v) => updateConfig("statusFilter", v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {viewMode === "list" && (
          <div className="space-y-2">
            <Label className="text-xs">Max Items (List View)</Label>
            <Input
              type="number"
              value={maxItems}
              min={1}
              max={20}
              onChange={(e) => updateConfig("maxItems", parseInt(e.target.value) || 5)}
              className="h-7 text-xs w-20"
            />
          </div>
        )}
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  const navigatePrev = () => {
    if (viewMode === "day") setCurrentDate(d => subDays(d, 1));
    else if (viewMode === "week") setCurrentDate(d => subWeeks(d, 1));
    else if (viewMode === "month") setCurrentDate(d => subMonths(d, 1));
  };

  const navigateNext = () => {
    if (viewMode === "day") setCurrentDate(d => addDays(d, 1));
    else if (viewMode === "week") setCurrentDate(d => addWeeks(d, 1));
    else if (viewMode === "month") setCurrentDate(d => addMonths(d, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const setViewMode = (mode: ViewMode) => {
    onUpdate?.({ ...widget, config: { ...widget.config, viewMode: mode } });
  };

  const ViewModeToggle = () => (
    <div className="flex items-center border rounded overflow-hidden">
      <Button
        size="icon"
        variant={viewMode === "list" ? "default" : "ghost"}
        className="h-5 w-5 rounded-none"
        onClick={() => setViewMode("list")}
        title="List View"
      >
        <List className="h-3 w-3" />
      </Button>
      <Button
        size="icon"
        variant={viewMode === "day" ? "default" : "ghost"}
        className="h-5 w-5 rounded-none"
        onClick={() => setViewMode("day")}
        title="Day View"
      >
        <Calendar className="h-3 w-3" />
      </Button>
      <Button
        size="icon"
        variant={viewMode === "week" ? "default" : "ghost"}
        className="h-5 w-5 rounded-none"
        onClick={() => setViewMode("week")}
        title="Week View"
      >
        <CalendarDays className="h-3 w-3" />
      </Button>
      <Button
        size="icon"
        variant={viewMode === "month" ? "default" : "ghost"}
        className="h-5 w-5 rounded-none"
        onClick={() => setViewMode("month")}
        title="Month View"
      >
        <LayoutGrid className="h-3 w-3" />
      </Button>
    </div>
  );

  const renderListView = () => {
    const sortedItems = scheduleItems.slice(0, maxItems);
    
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {overdueCount} overdue
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {sortedItems.length} upcoming
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ViewModeToggle />
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-6 px-2"
              onClick={() => navigate('/tasks')}
              data-testid="schedule-widget-add"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
        
        <div className="space-y-2">
          {sortedItems.map((item) => (
            <div 
              key={item.id}
              className={`p-2.5 border rounded-md hover-elevate cursor-pointer ${
                item.status === 'overdue' 
                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50' 
                  : item.status === 'completed'
                  ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50 opacity-60'
                  : ''
              }`}
              data-testid={`schedule-widget-item-${item.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.type === 'milestone' && (
                      <Flag className="h-3 w-3 text-purple-500 flex-shrink-0" />
                    )}
                    {item.status === 'completed' && (
                      <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                    )}
                    {item.status === 'overdue' && (
                      <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{item.title}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span className={item.status === 'overdue' ? 'text-red-500 font-medium' : ''}>
                        {formatDate(item.date)}
                      </span>
                    </div>
                    {item.priority && (
                      <span className={`text-[10px] ${priorityColors[item.priority]}`}>
                        {item.priority}
                      </span>
                    )}
                  </div>
                </div>
                
                <Badge className={`text-[10px] ${typeBadgeColors[item.type]}`}>
                  {item.type}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        
        {sortedItems.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No scheduled items</p>
            <Button 
              variant="link" 
              size="sm" 
              className="text-xs mt-1"
              onClick={() => navigate('/tasks')}
            >
              Add a task <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}

        {sortedItems.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full h-7 text-xs justify-between"
            onClick={() => navigate('/calendar')}
            data-testid="button-view-calendar"
          >
            <span>View Full Calendar</span>
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  };

  const renderDayView = () => {
    const dayItems = scheduleItems.filter(item => 
      isSameDay(new Date(item.date), currentDate)
    );
    const isPast = isBefore(startOfDay(currentDate), startOfDay(new Date()));

    return (
      <div className="flex flex-col h-full -m-3">
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={navigatePrev}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={goToToday}>
              Today
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={navigateNext}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium hidden sm:inline">
              {format(currentDate, "MMM d")}
            </span>
            <ViewModeToggle />
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto p-3 space-y-1.5 ${isPast ? 'opacity-60' : ''}`}>
          {dayItems.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No items scheduled
            </div>
          ) : (
            dayItems.map(item => (
              <div
                key={item.id}
                className={`flex items-center gap-2 p-2 rounded border hover-elevate cursor-pointer ${
                  item.status === 'overdue' ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : ''
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${typeColors[item.type]}`} />
                <span className="text-sm flex-1 truncate">{item.title}</span>
                {item.priority && (
                  <span className={`text-[10px] ${priorityColors[item.priority]}`}>
                    {item.priority}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
      <div className="flex flex-col h-full -m-3">
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={navigatePrev}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={goToToday}>
              This Week
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={navigateNext}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium hidden sm:inline">
              {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "d")}
            </span>
            <ViewModeToggle />
          </div>
        </div>

        <div className="flex-1 grid grid-cols-7 border-t overflow-hidden">
          {weekDays.map((day, idx) => {
            const dayItems = scheduleItems.filter(item => isSameDay(new Date(item.date), day));
            const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
            const isTodayDate = isToday(day);
            
            return (
              <div 
                key={idx} 
                className={`flex flex-col border-r last:border-r-0 min-w-0 ${isPast ? 'opacity-50' : ''}`}
              >
                <div className={`text-center py-1 border-b flex-shrink-0 ${isTodayDate ? 'bg-primary/10' : ''}`}>
                  <div className="text-[9px] text-muted-foreground uppercase">
                    {format(day, "EEE")}
                  </div>
                  <div className={`text-xs font-medium ${isTodayDate ? 'text-primary' : ''}`}>
                    {format(day, "d")}
                  </div>
                </div>
                
                <div className="flex-1 p-0.5 space-y-0.5 overflow-y-auto">
                  {dayItems.slice(0, 3).map(item => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-0.5 px-0.5 py-0.5 rounded text-[9px] cursor-pointer hover-elevate ${
                        item.status === 'overdue' ? 'bg-red-100 dark:bg-red-950/50' : 'bg-muted'
                      }`}
                      title={item.title}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${typeColors[item.type]}`} />
                      <span className="truncate">{item.title}</span>
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-[8px] text-muted-foreground text-center">
                      +{dayItems.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    
    const weeks: Date[][] = [];
    let day = startDate;
    
    while (day <= monthEnd || weeks.length < 6) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      weeks.push(week);
      if (weeks.length >= 6) break;
    }

    return (
      <div className="flex flex-col h-full -m-3">
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={navigatePrev}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={goToToday}>
              Today
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={navigateNext}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium hidden sm:inline">
              {format(currentDate, "MMM yyyy")}
            </span>
            <ViewModeToggle />
          </div>
        </div>

        <div className="grid grid-cols-7 border-b">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="text-center py-1 text-[9px] text-muted-foreground uppercase border-r last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0" style={{ height: `${100 / weeks.length}%` }}>
              {week.map((day, dayIdx) => {
                const dayItems = scheduleItems.filter(item => isSameDay(new Date(item.date), day));
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDate = isToday(day);
                const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                
                return (
                  <div 
                    key={dayIdx}
                    className={`border-r last:border-r-0 p-0.5 overflow-hidden ${
                      !isCurrentMonth ? 'bg-muted/30' : ''
                    } ${isPast && isCurrentMonth ? 'opacity-60' : ''}`}
                  >
                    <div className={`text-[10px] mb-0.5 ${
                      isTodayDate 
                        ? 'text-primary font-bold' 
                        : !isCurrentMonth 
                        ? 'text-muted-foreground' 
                        : ''
                    }`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {dayItems.slice(0, 2).map(item => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-0.5 px-0.5 rounded text-[8px] cursor-pointer ${
                            item.status === 'overdue' ? 'bg-red-100 dark:bg-red-950/50' : 'bg-muted'
                          }`}
                          title={item.title}
                        >
                          <div className={`w-1 h-1 rounded-full flex-shrink-0 ${typeColors[item.type]}`} />
                          <span className="truncate">{item.title}</span>
                        </div>
                      ))}
                      {dayItems.length > 2 && (
                        <div className="text-[7px] text-muted-foreground">
                          +{dayItems.length - 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (viewMode === "day") return renderDayView();
  if (viewMode === "week") return renderWeekView();
  if (viewMode === "month") return renderMonthView();
  return renderListView();
}

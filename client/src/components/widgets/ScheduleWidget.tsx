import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskTooltip } from "@/components/ui/task-tooltip";
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
import { generateNotionColors } from "@/lib/taskColors";

type ViewMode = "list" | "day" | "week" | "month";

const HOUR_HEIGHT = 40;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: "task" | "milestone" | "meeting" | "inspection";
  status: "scheduled" | "overdue" | "completed" | "in_progress";
  priority?: "high" | "medium" | "low";
}

const typeHexColors: Record<string, string> = {
  task: "#3b82f6",
  milestone: "#a855f7",
  meeting: "#22c55e",
  inspection: "#f59e0b",
};

function getTypeNotionColors(type: string) {
  return generateNotionColors(typeHexColors[type] || "#6b7280");
}

const priorityColors = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-blue-500",
};

function parseTime(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours)) return null;
  return hours + (minutes || 0) / 60;
}

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
  const displayMode = (widget.config?.displayMode as "timeline" | "stacked") || "stacked";
  
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  
  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  // Update current time every minute for timeline views
  useEffect(() => {
    if (viewMode !== "day" && viewMode !== "week") return;
    if (displayMode !== "timeline") return;
    
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
    }, 60000);
    
    return () => clearInterval(interval);
  }, [viewMode, displayMode]);

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

        {(viewMode === "day" || viewMode === "week") && (
          <div className="space-y-2">
            <Label className="text-xs">Display Style</Label>
            <Select 
              value={displayMode} 
              onValueChange={(v) => updateConfig("displayMode", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stacked">Stacked (Simple List)</SelectItem>
                <SelectItem value="timeline">Timeline (Hourly Scale)</SelectItem>
              </SelectContent>
            </Select>
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
                    <TaskTooltip content={item.title}>
                      <span className="text-sm font-medium truncate cursor-default">{item.title}</span>
                    </TaskTooltip>
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
                
                <Badge 
                  className="text-[10px] font-semibold"
                  style={{
                    backgroundColor: getTypeNotionColors(item.type).pastelBg,
                    color: getTypeNotionColors(item.type).darkText,
                    border: `1px solid rgba(0,0,0,0.08)`,
                  }}
                >
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
    
    // Separate all-day items from timed items
    const allDayItems = dayItems.filter(item => !item.time);
    const timedItems = dayItems.filter(item => item.time);

    return (
      <div className="flex flex-col h-full -m-3">
        {/* Header with navigation */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 gap-2 flex-shrink-0">
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
            <span className="text-xs font-medium">
              {format(currentDate, "EEEE, MMM d")}
            </span>
            {isToday(currentDate) && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">Today</Badge>
            )}
          </div>
        </div>

        {/* All-day items section */}
        {allDayItems.length > 0 && (
          <div className="flex-shrink-0 px-3 py-1.5 border-b space-y-1 bg-muted/10 max-h-20 overflow-y-auto">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">All Day</div>
            <div className="flex flex-wrap gap-1">
              {allDayItems.map(item => {
                const notionColors = getTypeNotionColors(item.type);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] cursor-pointer hover-elevate"
                    style={{
                      backgroundColor: item.status === 'overdue' ? '#fee2e2' : notionColors.pastelBg,
                      border: `1px solid rgba(0,0,0,0.08)`,
                    }}
                  >
                    <div 
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: notionColors.originalHex }}
                    />
                    <TaskTooltip content={item.title}>
                      <span 
                        className="truncate max-w-[100px] font-semibold cursor-default"
                        style={{ color: item.status === 'overdue' ? '#b91c1c' : notionColors.darkText }}
                      >
                        {item.title}
                      </span>
                    </TaskTooltip>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline or stacked content */}
        {displayMode === "timeline" ? (
          <div className={`flex-1 overflow-y-auto min-h-0 ${isPast ? 'opacity-60' : ''}`}>
            <div className="relative" style={{ minHeight: `${24 * HOUR_HEIGHT}px`, height: `${24 * HOUR_HEIGHT}px` }}>
              {/* Hour grid lines */}
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-b border-border/50"
                  style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="absolute left-2 top-1 text-[10px] text-muted-foreground">
                    {format(new Date().setHours(hour, 0), "h a")}
                  </span>
                </div>
              ))}

              {/* Current time indicator */}
              {isToday(currentDate) && (
                <div
                  className="absolute left-10 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                  style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px` }}
                >
                  <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                </div>
              )}

              {/* Timed events */}
              {timedItems.map(item => {
                const startHour = parseTime(item.time);
                if (startHour === null) return null;
                const top = startHour * HOUR_HEIGHT;
                const notionColors = getTypeNotionColors(item.type);
                
                return (
                  <div
                    key={item.id}
                    className="absolute left-12 right-2 rounded-md px-2 py-1 cursor-pointer hover-elevate"
                    style={{ 
                      top: `${top}px`, 
                      minHeight: '20px',
                      backgroundColor: item.status === 'overdue' ? '#fee2e2' : notionColors.pastelBg,
                      border: `1px solid rgba(0,0,0,0.08)`,
                      borderLeftWidth: '3px',
                      borderLeftColor: item.status === 'overdue' ? '#ef4444' : notionColors.originalHex,
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <div 
                        className="w-2 h-2 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: notionColors.originalHex }}
                      />
                      <TaskTooltip content={item.title}>
                        <span 
                          className="text-[11px] truncate flex-1 font-semibold cursor-default"
                          style={{ color: item.status === 'overdue' ? '#b91c1c' : notionColors.darkText }}
                        >
                          {item.title}
                        </span>
                      </TaskTooltip>
                      {item.priority && (
                        <span className={`text-[9px] ${priorityColors[item.priority]}`}>
                          {item.priority}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {dayItems.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No items scheduled
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Stacked view (simple list) */
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
                  <TaskTooltip content={item.title}>
                    <span className="text-sm flex-1 truncate cursor-default">{item.title}</span>
                  </TaskTooltip>
                  {item.time && (
                    <span className="text-[10px] text-muted-foreground">{item.time}</span>
                  )}
                  {item.priority && (
                    <span className={`text-[10px] ${priorityColors[item.priority]}`}>
                      {item.priority}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    
    // Get all-day items for the week
    const weekAllDayItems = scheduleItems.filter(item => {
      const itemDate = new Date(item.date);
      return !item.time && weekDays.some(day => isSameDay(itemDate, day));
    });

    return (
      <div className="flex flex-col h-full -m-3">
        {/* Header with navigation */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30 gap-2 flex-shrink-0">
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
          <span className="text-xs font-medium">
            {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d")}
          </span>
        </div>

        {/* Day headers row */}
        <div className="grid grid-cols-7 border-b flex-shrink-0" style={{ marginLeft: displayMode === "timeline" ? "40px" : "0" }}>
          {weekDays.map((day, idx) => {
            const isTodayDate = isToday(day);
            return (
              <div 
                key={idx}
                className={`text-center py-1 border-r last:border-r-0 ${isTodayDate ? 'bg-primary/10' : ''}`}
              >
                <div className="text-[9px] text-muted-foreground uppercase">
                  {format(day, "EEE")}
                </div>
                <div className={`text-xs font-medium ${isTodayDate ? 'text-primary' : ''}`}>
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day items row */}
        {weekAllDayItems.length > 0 && (
          <div className="border-b flex-shrink-0 bg-muted/10" style={{ marginLeft: displayMode === "timeline" ? "40px" : "0" }}>
            <div className="grid grid-cols-7">
              {weekDays.map((day, idx) => {
                const dayAllDayItems = weekAllDayItems.filter(item => isSameDay(new Date(item.date), day));
                return (
                  <div key={idx} className="border-r last:border-r-0 p-0.5 min-h-[20px]">
                    {dayAllDayItems.slice(0, 2).map(item => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-0.5 px-0.5 py-0.5 rounded text-[8px] cursor-pointer hover-elevate mb-0.5 ${
                          item.status === 'overdue' ? 'bg-red-100 dark:bg-red-950/50' : 'bg-muted'
                        }`}
                        title={item.title}
                      >
                        <div className={`w-1 h-1 rounded-full flex-shrink-0 ${typeColors[item.type]}`} />
                        <span className="truncate">{item.title}</span>
                      </div>
                    ))}
                    {dayAllDayItems.length > 2 && (
                      <div className="text-[7px] text-muted-foreground text-center">+{dayAllDayItems.length - 2}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline or stacked content */}
        {displayMode === "timeline" ? (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex" style={{ minHeight: `${24 * HOUR_HEIGHT}px` }}>
              {/* Hour labels column */}
              <div className="flex-shrink-0 w-10 relative">
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-b border-border/30"
                    style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  >
                    <span className="absolute left-1 top-1 text-[9px] text-muted-foreground">
                      {format(new Date().setHours(hour, 0), "ha")}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Day columns with time grid */}
              <div className="flex-1 grid grid-cols-7">
                {weekDays.map((day, idx) => {
                  const dayTimedItems = scheduleItems.filter(item => 
                    item.time && isSameDay(new Date(item.date), day)
                  );
                  const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
                  const isTodayDate = isToday(day);
                  
                  return (
                    <div 
                      key={idx}
                      className={`relative border-r last:border-r-0 ${isPast ? 'opacity-50' : ''}`}
                    >
                      {/* Hour grid lines */}
                      {HOURS.map(hour => (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 border-b border-border/30"
                          style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                        />
                      ))}
                      
                      {/* Current time indicator */}
                      {isTodayDate && (
                        <div
                          className="absolute left-0 right-0 border-t-2 border-red-500 z-20 pointer-events-none"
                          style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px` }}
                        />
                      )}
                      
                      {/* Timed events */}
                      {dayTimedItems.map(item => {
                        const startHour = parseTime(item.time);
                        if (startHour === null) return null;
                        const top = startHour * HOUR_HEIGHT;
                        
                        return (
                          <div
                            key={item.id}
                            className={`absolute left-0.5 right-0.5 rounded border px-0.5 py-0.5 cursor-pointer hover-elevate overflow-hidden ${
                              item.status === 'overdue' ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'bg-card'
                            }`}
                            style={{ top: `${top}px`, minHeight: '16px' }}
                            title={item.title}
                          >
                            <div className="flex items-center gap-0.5">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${typeColors[item.type]}`} />
                              <span className="text-[8px] truncate">{item.title}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Stacked view */
          <div className="flex-1 grid grid-cols-7 overflow-hidden">
            {weekDays.map((day, idx) => {
              const dayItems = scheduleItems.filter(item => isSameDay(new Date(item.date), day));
              const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
              
              return (
                <div 
                  key={idx} 
                  className={`flex flex-col border-r last:border-r-0 min-w-0 ${isPast ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 p-0.5 space-y-0.5 overflow-y-auto">
                    {dayItems.slice(0, 5).map(item => (
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
                    {dayItems.length > 5 && (
                      <div className="text-[8px] text-muted-foreground text-center">
                        +{dayItems.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
          <span className="text-xs font-medium">
            {format(currentDate, "MMMM yyyy")}
          </span>
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

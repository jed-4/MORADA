import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, Clock, Plus, AlertTriangle, Flag, CheckCircle2, ArrowRight } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: "task" | "milestone" | "meeting" | "inspection";
  status: "scheduled" | "overdue" | "completed" | "in_progress";
  priority?: "high" | "medium" | "low";
}

export default function ScheduleWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const [, navigate] = useLocation();
  const maxItems = widget.config?.maxItems || 5;
  const showOverdue = widget.config?.showOverdue !== false;
  const showMilestones = widget.config?.showMilestones !== false;
  const showCompleted = widget.config?.showCompleted || false;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  
  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  // Fetch project tasks
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

  // Fetch project milestones (if available)
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

  // Convert tasks to schedule items
  const now = new Date();
  const scheduleItems: ScheduleItem[] = [];

  // Add tasks with due dates
  tasks.forEach((task: any) => {
    if (!task.dueDate) return;
    
    const dueDate = new Date(task.dueDate);
    const isOverdue = task.status !== 'completed' && dueDate < now;
    
    if (!showCompleted && task.status === 'completed') return;
    if (!showOverdue && isOverdue) return;

    scheduleItems.push({
      id: task.id,
      title: task.title || task.name,
      date: task.dueDate,
      type: "task",
      status: isOverdue ? "overdue" : task.status === 'completed' ? "completed" : task.status === 'in_progress' ? "in_progress" : "scheduled",
      priority: task.priority,
    });
  });

  // Add milestones
  if (showMilestones) {
    milestones.forEach((milestone: any) => {
      if (!milestone.targetDate) return;
      
      const targetDate = new Date(milestone.targetDate);
      const isOverdue = !milestone.completed && targetDate < now;
      
      if (!showCompleted && milestone.completed) return;
      if (!showOverdue && isOverdue) return;

      scheduleItems.push({
        id: milestone.id,
        title: milestone.name,
        date: milestone.targetDate,
        type: "milestone",
        status: isOverdue ? "overdue" : milestone.completed ? "completed" : "scheduled",
        priority: "high",
      });
    });
  }

  // Sort by date and filter
  const sortedItems = scheduleItems
    .sort((a, b) => {
      // Overdue first, then by date
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (b.status === 'overdue' && a.status !== 'overdue') return 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
    .slice(0, maxItems);

  const overdueCount = scheduleItems.filter(i => i.status === 'overdue').length;

  const typeColors = {
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

  // Configuration mode
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
          <label className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={showOverdue}
              onChange={(e) => onUpdate?.({ ...widget, config: { ...widget.config, showOverdue: e.target.checked } })}
              className="rounded"
            />
            Show overdue items
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={showMilestones}
              onChange={(e) => onUpdate?.({ ...widget, config: { ...widget.config, showMilestones: e.target.checked } })}
              className="rounded"
            />
            Show milestones
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={showCompleted}
              onChange={(e) => onUpdate?.({ ...widget, config: { ...widget.config, showCompleted: e.target.checked } })}
              className="rounded"
            />
            Show completed items
          </label>
          <div className="flex items-center gap-2 text-xs">
            <span>Max items:</span>
            <input 
              type="number" 
              value={maxItems}
              min={1}
              max={10}
              onChange={(e) => onUpdate?.({ ...widget, config: { ...widget.config, maxItems: parseInt(e.target.value) || 5 } })}
              className="w-16 h-6 px-2 border rounded text-xs"
            />
          </div>
        </div>
        
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

  return (
    <div className="space-y-3">
      {/* Header with counts */}
      <div className="flex items-center justify-between">
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
      
      {/* Schedule Items */}
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
              
              <Badge className={`text-[10px] ${typeColors[item.type]}`}>
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

      {/* View All Link */}
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
}

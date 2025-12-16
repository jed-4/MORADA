import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckSquare, Clock, AlertCircle, Plus } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { type Task, type Project } from "@shared/schema";
import { useLocation } from "wouter";
import TaskModalAsana from "@/components/TaskModalAsana";

export default function PersonalTasksWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const maxTasks = widget.config?.maxTasks || 8;
  const showFilter = widget.config?.showFilter ?? 'all';
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxTasks, setConfigMaxTasks] = useState(maxTasks);
  const [configShowFilter, setConfigShowFilter] = useState(showFilter);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxTasks(widget.config?.maxTasks || 8);
    setConfigShowFilter(widget.config?.showFilter ?? 'all');
  }, [widget.title, widget.config]);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!userId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectMap = new Map(projects.map(p => [p.id, p]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'complete');
  
  const filteredTasks = activeTasks.filter(task => {
    if (showFilter === 'all') return true;
    if (showFilter === 'overdue') {
      if (!task.dueDate) return false;
      return new Date(task.dueDate) < today;
    }
    if (showFilter === 'today') {
      if (!task.dueDate) return false;
      return new Date(task.dueDate).toDateString() === today.toDateString();
    }
    if (showFilter === 'upcoming') {
      if (!task.dueDate) return false;
      const dueDate = new Date(task.dueDate);
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      return dueDate >= today && dueDate <= weekFromNow;
    }
    return true;
  });

  const displayTasks = filteredTasks.slice(0, maxTasks);

  const getTaskStatus = (task: Task) => {
    if (!task.dueDate) return { color: '', icon: null, label: '' };
    const dueDate = new Date(task.dueDate);
    if (dueDate < today) {
      return { 
        color: 'text-red-600 dark:text-red-400', 
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        icon: <AlertCircle className="h-3 w-3" />,
        label: 'Overdue'
      };
    }
    if (dueDate.toDateString() === today.toDateString()) {
      return { 
        color: 'text-amber-600 dark:text-amber-400', 
        bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        icon: <Clock className="h-3 w-3" />,
        label: 'Today'
      };
    }
    return { color: '', bgColor: '', icon: null, label: '' };
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, maxTasks: configMaxTasks, showFilter: configShowFilter }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxTasks(widget.config?.maxTasks || 8);
      setConfigShowFilter(widget.config?.showFilter ?? 'all');
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure My Tasks</h4>
        
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
          <Label className="text-xs">Filter</Label>
          <select 
            value={configShowFilter}
            onChange={(e) => setConfigShowFilter(e.target.value)}
            className="w-full h-7 text-xs border rounded px-2"
          >
            <option value="all">All Active Tasks</option>
            <option value="overdue">Overdue Only</option>
            <option value="today">Due Today</option>
            <option value="upcoming">Due This Week</option>
          </select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Tasks</Label>
          <Input 
            type="number"
            min={1}
            max={20}
            value={configMaxTasks}
            onChange={(e) => setConfigMaxTasks(parseInt(e.target.value) || 8)}
            className="h-7 text-xs w-20"
          />
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </div>
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-6 w-6"
          onClick={() => setShowCreateDialog(true)}
          data-testid="button-add-task-widget"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      
      <TaskModalAsana
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
      
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-2 border rounded-md">
                <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                <div className="h-2 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          displayTasks.map((task) => {
            const status = getTaskStatus(task);
            const project = task.projectId ? projectMap.get(task.projectId) : null;
            return (
              <div 
                key={task.id}
                className={`p-2 border rounded-md hover-elevate cursor-pointer ${status.bgColor}`}
                onClick={() => setLocation(`/tasks/${task.id}`)}
                data-testid={`personal-task-${task.id}`}
              >
                <div className="flex items-start gap-2">
                  <CheckSquare className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{task.title}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {project && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                          {project.name}
                        </span>
                      )}
                      {status.icon && (
                        <Badge className={`${status.color} text-[10px] px-1 py-0 h-4`}>
                          {status.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {displayTasks.length === 0 && !isLoading && (
        <div className="text-center py-3 text-xs text-muted-foreground">
          No tasks
        </div>
      )}
    </div>
  );
}

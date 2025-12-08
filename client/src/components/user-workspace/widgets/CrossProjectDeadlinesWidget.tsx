import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, AlertCircle } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { type Task, type Project, type Milestone } from "@shared/schema";
import { useLocation } from "wouter";
import { format, differenceInDays } from "date-fns";

interface DeadlineItem {
  id: string;
  title: string;
  dueDate: Date;
  type: 'task' | 'milestone';
  projectId?: string;
  projectName?: string;
  daysUntil: number;
}

export default function CrossProjectDeadlinesWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const maxItems = widget.config?.maxItems || 10;
  const daysAhead = widget.config?.daysAhead || 14;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxItems, setConfigMaxItems] = useState(maxItems);
  const [configDaysAhead, setConfigDaysAhead] = useState(daysAhead);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxItems(widget.config?.maxItems || 10);
    setConfigDaysAhead(widget.config?.daysAhead || 14);
  }, [widget.title, widget.config]);

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/user"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: currentUser?.id }],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const response = await fetch(`/api/tasks?assigneeId=${currentUser.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  const { data: milestones = [] } = useQuery<Milestone[]>({
    queryKey: ["/api/milestones"],
    queryFn: async () => {
      const response = await fetch('/api/milestones', { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectMap = new Map(projects.map(p => [p.id, p]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + daysAhead);

  const deadlines: DeadlineItem[] = [];

  tasks.forEach(task => {
    if (!task.dueDate || task.status === 'done' || task.status === 'complete') return;
    const dueDate = new Date(task.dueDate);
    if (dueDate > futureDate) return;
    
    const project = task.projectId ? projectMap.get(task.projectId) : null;
    deadlines.push({
      id: task.id,
      title: task.title,
      dueDate,
      type: 'task',
      projectId: task.projectId || undefined,
      projectName: project?.name,
      daysUntil: differenceInDays(dueDate, today)
    });
  });

  milestones.forEach(milestone => {
    if (!milestone.dueDate || milestone.status === 'completed') return;
    const dueDate = new Date(milestone.dueDate);
    if (dueDate > futureDate) return;
    
    const project = milestone.projectId ? projectMap.get(milestone.projectId) : null;
    deadlines.push({
      id: milestone.id,
      title: milestone.name,
      dueDate,
      type: 'milestone',
      projectId: milestone.projectId || undefined,
      projectName: project?.name,
      daysUntil: differenceInDays(dueDate, today)
    });
  });

  deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const displayDeadlines = deadlines.slice(0, maxItems);

  const getDaysLabel = (daysUntil: number) => {
    if (daysUntil < 0) return { label: `${Math.abs(daysUntil)}d overdue`, color: 'text-red-600 bg-red-50 dark:bg-red-900/20' };
    if (daysUntil === 0) return { label: 'Today', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' };
    if (daysUntil === 1) return { label: 'Tomorrow', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' };
    return { label: `${daysUntil}d`, color: 'text-muted-foreground bg-muted/50' };
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, maxItems: configMaxItems, daysAhead: configDaysAhead }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxItems(widget.config?.maxItems || 10);
      setConfigDaysAhead(widget.config?.daysAhead || 14);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Deadlines</h4>
        
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
          <Label className="text-xs">Days Ahead</Label>
          <Input 
            type="number"
            min={1}
            max={90}
            value={configDaysAhead}
            onChange={(e) => setConfigDaysAhead(parseInt(e.target.value) || 14)}
            className="h-7 text-xs w-20"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Items</Label>
          <Input 
            type="number"
            min={1}
            max={20}
            value={configMaxItems}
            onChange={(e) => setConfigMaxItems(parseInt(e.target.value) || 10)}
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
          {deadlines.length} upcoming
        </div>
      </div>
      
      <div className="space-y-1">
        {displayDeadlines.length === 0 ? (
          <div className="text-center py-3 text-xs text-muted-foreground">
            No upcoming deadlines
          </div>
        ) : (
          displayDeadlines.map((item) => {
            const daysInfo = getDaysLabel(item.daysUntil);
            return (
              <div 
                key={`${item.type}-${item.id}`}
                className="p-2 border rounded-md hover-elevate cursor-pointer"
                onClick={() => setLocation(item.type === 'task' ? `/tasks/${item.id}` : `/milestones/${item.id}`)}
                data-testid={`deadline-${item.type}-${item.id}`}
              >
                <div className="flex items-start gap-2">
                  {item.daysUntil < 0 ? (
                    <AlertCircle className="h-3 w-3 text-red-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Calendar className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{item.title}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {item.projectName && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                          {item.projectName}
                        </span>
                      )}
                      <Badge className={`${daysInfo.color} text-[10px] px-1 py-0 h-4`}>
                        {daysInfo.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {item.type}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

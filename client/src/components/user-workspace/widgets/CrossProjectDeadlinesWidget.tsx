import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, AlertCircle, Folder } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
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

export default function CrossProjectDeadlinesWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
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

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
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

  const { data: milestones = [], isLoading: milestonesLoading } = useQuery<Milestone[]>({
    queryKey: ["/api/milestones"],
    queryFn: async () => {
      const response = await fetch('/api/milestones', { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!userId,
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

  const isLoading = tasksLoading || milestonesLoading;

  const groupedDeadlines = useMemo(() => {
    const map = new Map<string, { projectName: string; color?: string; items: DeadlineItem[] }>();
    displayDeadlines.forEach(d => {
      const key = d.projectId || 'no-project';
      const project = d.projectId ? projectMap.get(d.projectId) : null;
      if (!map.has(key)) {
        map.set(key, {
          projectName: d.projectName || 'No Project',
          color: project?.color || undefined,
          items: [],
        });
      }
      map.get(key)!.items.push(d);
    });
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  }, [displayDeadlines, projectMap]);

  const getDaysLabel = (daysUntil: number) => {
    if (daysUntil < 0) return { label: `${Math.abs(daysUntil)}d overdue`, color: 'text-bp-coral bg-bp-coral/10' };
    if (daysUntil === 0) return { label: 'Today', color: 'text-bp-amber bg-bp-amber/10' };
    if (daysUntil === 1) return { label: 'Tomorrow', color: 'text-bp-teal bg-bp-teal/10' };
    return { label: `${daysUntil}d`, color: 'text-bp-muted bg-bp-subtle' };
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
        <div className="text-[11px] text-bp-muted">
          {deadlines.length} upcoming
        </div>
      </div>
      
      <div className="space-y-2">
        {isLoading ? (
          <WidgetSkeleton rows={3} />
        ) : displayDeadlines.length === 0 ? (
          <WidgetEmpty icon={Calendar} message="No upcoming deadlines" />
        ) : (
          groupedDeadlines.map((group) => (
            <div key={group.key} className="space-y-1">
              <div className="flex items-center gap-1.5 px-1">
                {group.color ? (
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                ) : (
                  <Folder className="h-3 w-3 text-bp-muted flex-shrink-0" />
                )}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-bp-muted truncate">
                  {group.projectName}
                </span>
                <span className="text-[10px] tabular-nums text-bp-muted opacity-70">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const daysInfo = getDaysLabel(item.daysUntil);
                  return (
                    <div 
                      key={`${item.type}-${item.id}`}
                      className="p-2 border border-bp-border rounded-md hover-elevate cursor-pointer"
                      onClick={() => setLocation(item.type === 'task' ? `/tasks/${item.id}` : `/milestones/${item.id}`)}
                      data-testid={`deadline-${item.type}-${item.id}`}
                    >
                      <div className="flex items-start gap-2">
                        {item.daysUntil < 0 ? (
                          <AlertCircle className="h-3 w-3 text-bp-coral mt-0.5 flex-shrink-0" />
                        ) : (
                          <Calendar className="h-3 w-3 text-bp-muted mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate leading-tight">{item.title}</p>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <Badge className={`${daysInfo.color} text-data px-1 py-0 h-4 border-transparent`}>
                              {daysInfo.label}
                            </Badge>
                            <Badge variant="outline" className="text-data px-1 py-0 h-4">
                              {item.type}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

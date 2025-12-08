import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckSquare, Clock, TrendingUp, Target } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { type Task, type Timesheet } from "@shared/schema";

export default function PersonalMetricsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const weeklyHoursTarget = widget.config?.weeklyHoursTarget || 40;
  const [configWeeklyTarget, setConfigWeeklyTarget] = useState(weeklyHoursTarget);

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigWeeklyTarget(widget.config?.weeklyHoursTarget || 40);
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

  const { data: timesheets = [] } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets", { userId: currentUser?.id }],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const response = await fetch(`/api/timesheets?userId=${currentUser.id}`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'complete');
  const completedThisWeek = tasks.filter(t => {
    if (t.status !== 'done' && t.status !== 'complete') return false;
    if (!t.updatedAt) return false;
    return new Date(t.updatedAt) >= startOfWeek;
  });
  
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate) return false;
    const dueDate = new Date(t.dueDate);
    return dueDate < today && t.status !== 'done' && t.status !== 'complete';
  });

  const weeklyTimesheets = timesheets.filter(t => {
    if (!t.date) return false;
    return new Date(t.date) >= startOfWeek;
  });
  
  const hoursThisWeek = weeklyTimesheets.reduce((sum, t) => sum + (t.hours || 0), 0);
  const hoursProgress = Math.min((hoursThisWeek / weeklyHoursTarget) * 100, 100);

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, weeklyHoursTarget: configWeeklyTarget }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigWeeklyTarget(widget.config?.weeklyHoursTarget || 40);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Metrics</h4>
        
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
          <Label className="text-xs">Weekly Hours Target</Label>
          <Input 
            type="number"
            min={1}
            max={60}
            value={configWeeklyTarget}
            onChange={(e) => setConfigWeeklyTarget(parseInt(e.target.value) || 40)}
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 border rounded-md bg-card/50">
          <div className="flex items-center gap-1 mb-1">
            <CheckSquare className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Active</span>
          </div>
          <p className="text-lg font-bold" data-testid="metric-active-tasks">{activeTasks.length}</p>
        </div>
        
        <div className="p-2 border rounded-md bg-card/50">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-green-600" />
            <span className="text-[10px] text-muted-foreground">Done This Week</span>
          </div>
          <p className="text-lg font-bold text-green-600" data-testid="metric-completed-week">{completedThisWeek.length}</p>
        </div>
        
        <div className="p-2 border rounded-md bg-card/50">
          <div className="flex items-center gap-1 mb-1">
            <Target className="h-3 w-3 text-red-600" />
            <span className="text-[10px] text-muted-foreground">Overdue</span>
          </div>
          <p className={`text-lg font-bold ${overdueTasks.length > 0 ? 'text-red-600' : ''}`} data-testid="metric-overdue">
            {overdueTasks.length}
          </p>
        </div>
        
        <div className="p-2 border rounded-md bg-card/50">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-blue-600" />
            <span className="text-[10px] text-muted-foreground">Hours</span>
          </div>
          <p className="text-lg font-bold text-blue-600" data-testid="metric-hours">{hoursThisWeek.toFixed(1)}</p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Weekly hours progress</span>
          <span className="font-medium">{hoursThisWeek.toFixed(1)}/{weeklyHoursTarget}h</span>
        </div>
        <Progress value={hoursProgress} className="h-1.5" />
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Sun, 
  CheckSquare, 
  Calendar, 
  Bell, 
  Clock,
  ArrowRight,
  Circle,
  CheckCircle2
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, isToday, parseISO, isBefore, startOfDay } from "date-fns";
import { type Task } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TaskModalAsana from "@/components/TaskModalAsana";

interface Reminder {
  id: string;
  title: string;
  triggerAt: string;
  status: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
}

export default function MyDayWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const today = startOfDay(new Date());

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const { data: reminders = [], isLoading: remindersLoading } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders", userId],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch('/api/reminders', { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const todaysTasks = tasks.filter(t => {
    if (t.status === 'done' || t.status === 'complete') return false;
    if (!t.dueDate) return false;
    return isToday(new Date(t.dueDate));
  });

  const overdueTasks = tasks.filter(t => {
    if (t.status === 'done' || t.status === 'complete') return false;
    if (!t.dueDate) return false;
    return isBefore(new Date(t.dueDate), today);
  });

  const todaysReminders = reminders.filter(r => {
    if (r.status === 'dismissed') return false;
    return isToday(new Date(r.triggerAt));
  });

  const completedToday = tasks.filter(t => {
    if (t.status !== 'done' && t.status !== 'complete') return false;
    if (!t.updatedAt) return false;
    return isToday(new Date(t.updatedAt));
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async (task: Task) => {
      const newStatus = task.status === 'done' || task.status === 'complete' ? 'todo' : 'done';
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const totalItems = todaysTasks.length + todaysReminders.length;
  const isLoading = tasksLoading || remindersLoading;

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
        <h4 className="text-sm font-medium">Configure My Day</h4>
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-md bg-muted/50">
          <div className="text-lg font-semibold">{todaysTasks.length}</div>
          <div className="text-[10px] text-muted-foreground">Due Today</div>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <div className="text-lg font-semibold text-red-600 dark:text-red-400">{overdueTasks.length}</div>
          <div className="text-[10px] text-muted-foreground">Overdue</div>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <div className="text-lg font-semibold text-green-600 dark:text-green-400">{completedToday.length}</div>
          <div className="text-[10px] text-muted-foreground">Done Today</div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse p-2 border rounded-md">
              <div className="h-3 bg-muted rounded w-3/4"></div>
            </div>
          ))}
        </div>
      ) : totalItems === 0 && overdueTasks.length === 0 ? (
        <div className="text-center py-4 text-xs text-muted-foreground">
          <Sun className="h-8 w-8 mx-auto mb-2 text-amber-400" />
          <p className="font-medium">All clear for today!</p>
          <p className="text-muted-foreground">No tasks or reminders due</p>
        </div>
      ) : (
        <div className="space-y-2">
          {overdueTasks.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                Overdue
              </div>
              {overdueTasks.slice(0, 3).map(task => (
                <div 
                  key={task.id}
                  className="flex items-center gap-2 p-1.5 rounded-md bg-red-50 dark:bg-red-900/20 hover-elevate cursor-pointer"
                  onClick={() => setSelectedTaskId(task.id)}
                  data-testid={`myday-task-${task.id}`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTaskMutation.mutate(task);
                    }}
                    className="flex-shrink-0"
                  >
                    <Circle className="h-3.5 w-3.5 text-red-500" />
                  </button>
                  <span className="text-xs truncate flex-1">{task.title}</span>
                </div>
              ))}
            </div>
          )}

          {todaysTasks.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Tasks
              </div>
              {todaysTasks.slice(0, 5).map(task => (
                <div 
                  key={task.id}
                  className="flex items-center gap-2 p-1.5 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => setSelectedTaskId(task.id)}
                  data-testid={`myday-task-${task.id}`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTaskMutation.mutate(task);
                    }}
                    className="flex-shrink-0"
                  >
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <span className="text-xs truncate flex-1">{task.title}</span>
                </div>
              ))}
            </div>
          )}

          {todaysReminders.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Reminders
              </div>
              {todaysReminders.slice(0, 3).map(reminder => (
                <div 
                  key={reminder.id}
                  className="flex items-center gap-2 p-1.5 rounded-md border hover-elevate cursor-pointer"
                  onClick={() => setLocation(`/users/${userId}/reminders`)}
                  data-testid={`myday-reminder-${reminder.id}`}
                >
                  <Bell className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                  <span className="text-xs truncate flex-1">{reminder.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(reminder.triggerAt), 'h:mm a')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="w-full h-6 text-xs text-muted-foreground"
        onClick={() => setLocation('/calendar')}
        data-testid="myday-view-calendar"
      >
        View Calendar <ArrowRight className="h-3 w-3 ml-1" />
      </Button>
      
      <TaskModalAsana
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        task={tasks.find(t => t.id === selectedTaskId)}
        taskId={selectedTaskId || undefined}
      />
    </div>
  );
}

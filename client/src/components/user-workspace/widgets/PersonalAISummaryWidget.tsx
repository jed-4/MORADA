import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Calendar,
  Target,
  ArrowRight,
  Clock,
  AlertTriangle,
  Zap,
  ChevronRight
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, startOfDay, subDays, isToday, isTomorrow, isBefore, isWithinInterval, addDays, differenceInDays } from "date-fns";
import { type Task, type Project } from "@shared/schema";
import { useLocation } from "wouter";

interface AISummary {
  summary: string;
  highlights: string[];
  suggestions: string[];
  generatedAt: string;
}

interface SuggestedAction {
  id: string;
  text: string;
  type: "task" | "overdue" | "schedule" | "follow-up";
  priority: "high" | "medium" | "low";
  link?: string;
  taskId?: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  startDate: string;
  startTime?: string;
  projectId?: string;
}

export default function PersonalAISummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const showTaskCounts = widget.config?.showTaskCounts ?? true;
  const showSuggestedActions = widget.config?.showSuggestedActions ?? true;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configShowTaskCounts, setConfigShowTaskCounts] = useState(showTaskCounts);
  const [configShowSuggestedActions, setConfigShowSuggestedActions] = useState(showSuggestedActions);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState<AISummary | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigShowTaskCounts(widget.config?.showTaskCounts ?? true);
    setConfigShowSuggestedActions(widget.config?.showSuggestedActions ?? true);
  }, [widget.title, widget.config]);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { assigneeId: userId }],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/tasks?assigneeId=${userId}`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!userId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: scheduleItems = [] } = useQuery<ScheduleItem[]>({
    queryKey: ["/api/schedule-items", { date: format(new Date(), 'yyyy-MM-dd') }],
    queryFn: async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const response = await fetch(`/api/schedule-items?startDate=${todayStr}&endDate=${todayStr}`, { credentials: 'include' });
      if (!response.ok) return [];
      const items = await response.json();
      return items.filter((item: ScheduleItem) => isToday(new Date(item.startDate)));
    },
    enabled: !!userId,
  });

  const today = startOfDay(new Date());
  const weekAgo = subDays(today, 7);

  const activeTasks = useMemo(() => tasks.filter(t => t.status !== 'done' && t.status !== 'complete'), [tasks]);
  const overdueTasks = useMemo(() => activeTasks.filter(t => t.dueDate && new Date(t.dueDate) < today), [activeTasks, today]);
  const todaysTasks = useMemo(() => activeTasks.filter(t => t.dueDate && isToday(new Date(t.dueDate))), [activeTasks]);
  const tomorrowsTasks = useMemo(() => activeTasks.filter(t => t.dueDate && isTomorrow(new Date(t.dueDate))), [activeTasks]);
  const highPriorityTasks = useMemo(() => activeTasks.filter(t => t.priority === 'high' || t.priority === 'urgent'), [activeTasks]);
  const completedThisWeek = useMemo(() => tasks.filter(t => 
    (t.status === 'done' || t.status === 'complete') &&
    t.updatedAt && new Date(t.updatedAt) >= weekAgo
  ), [tasks, weekAgo]);

  const suggestedActions = useMemo((): SuggestedAction[] => {
    const actions: SuggestedAction[] = [];

    overdueTasks.slice(0, 2).forEach(task => {
      const daysOverdue = differenceInDays(today, new Date(task.dueDate!));
      actions.push({
        id: `overdue-${task.id}`,
        text: `Complete "${task.title}" (${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue)`,
        type: "overdue",
        priority: "high",
        taskId: task.id,
        link: task.projectId ? `/projects/${task.projectId}/tasks` : undefined,
      });
    });

    highPriorityTasks.filter(t => !overdueTasks.includes(t)).slice(0, 2).forEach(task => {
      actions.push({
        id: `priority-${task.id}`,
        text: `Focus on "${task.title}" (high priority)`,
        type: "task",
        priority: "high",
        taskId: task.id,
        link: task.projectId ? `/projects/${task.projectId}/tasks` : undefined,
      });
    });

    todaysTasks.filter(t => !overdueTasks.includes(t) && !highPriorityTasks.includes(t)).slice(0, 2).forEach(task => {
      actions.push({
        id: `today-${task.id}`,
        text: `Complete "${task.title}" today`,
        type: "task",
        priority: "medium",
        taskId: task.id,
        link: task.projectId ? `/projects/${task.projectId}/tasks` : undefined,
      });
    });

    if (tomorrowsTasks.length > 0 && actions.length < 5) {
      actions.push({
        id: "prepare-tomorrow",
        text: `Review ${tomorrowsTasks.length} task${tomorrowsTasks.length > 1 ? 's' : ''} due tomorrow`,
        type: "follow-up",
        priority: "low",
      });
    }

    if (scheduleItems.length > 0 && actions.length < 5) {
      actions.push({
        id: "schedule-today",
        text: `${scheduleItems.length} schedule item${scheduleItems.length > 1 ? 's' : ''} for today`,
        type: "schedule",
        priority: "medium",
      });
    }

    return actions.slice(0, 5);
  }, [overdueTasks, highPriorityTasks, todaysTasks, tomorrowsTasks, scheduleItems, today]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const taskSummary = {
        activeTasks: activeTasks.length,
        overdueTasks: overdueTasks.length,
        completedThisWeek: completedThisWeek.length,
        upcomingTasks: activeTasks.filter(t => t.dueDate).slice(0, 5).map(t => ({
          title: t.title,
          dueDate: t.dueDate,
          projectId: t.projectId
        }))
      };

      const response = await apiRequest("/api/ai/daily-summary", "POST", {
        userId,
        taskSummary,
        date: format(new Date(), 'yyyy-MM-dd')
      });
      return response;
    },
    onSuccess: (data) => {
      setSummary(data);
      setIsGenerating(false);
    },
    onError: () => {
      setIsGenerating(false);
    }
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const getOverviewMessage = () => {
    if (overdueTasks.length > 0) {
      return `You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need attention${todaysTasks.length > 0 ? ` and ${todaysTasks.length} due today` : ''}.`;
    }
    if (todaysTasks.length > 0) {
      return `You have ${todaysTasks.length} task${todaysTasks.length > 1 ? 's' : ''} to focus on today.`;
    }
    if (tomorrowsTasks.length > 0) {
      return `No tasks due today. ${tomorrowsTasks.length} task${tomorrowsTasks.length > 1 ? 's' : ''} coming up tomorrow.`;
    }
    if (activeTasks.length === 0) {
      return "You're all caught up! No active tasks.";
    }
    return `${activeTasks.length} active task${activeTasks.length > 1 ? 's' : ''} in your pipeline.`;
  };

  const handleActionClick = (action: SuggestedAction) => {
    if (action.link) {
      setLocation(action.link);
    }
  };

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ 
          ...widget, 
          title: editingTitle,
          config: { 
            ...widget.config, 
            showTaskCounts: configShowTaskCounts,
            showSuggestedActions: configShowSuggestedActions
          }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigShowTaskCounts(widget.config?.showTaskCounts ?? true);
      setConfigShowSuggestedActions(widget.config?.showSuggestedActions ?? true);
      onCloseConfig?.();
    };

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure AI Summary</h4>
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Task Counts</Label>
          <Switch 
            checked={configShowTaskCounts} 
            onCheckedChange={setConfigShowTaskCounts}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Show Suggested Actions</Label>
          <Switch 
            checked={configShowSuggestedActions} 
            onCheckedChange={setConfigShowSuggestedActions}
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

  const quickStats = [
    { 
      label: "Active", 
      value: activeTasks.length, 
      icon: CheckCircle,
      color: "text-blue-600 dark:text-blue-400" 
    },
    { 
      label: "Overdue", 
      value: overdueTasks.length, 
      icon: AlertCircle,
      color: overdueTasks.length > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
    },
    { 
      label: "Done", 
      value: completedThisWeek.length, 
      icon: TrendingUp,
      color: "text-green-600 dark:text-green-400" 
    },
  ];

  return (
    <ScrollArea className="h-full max-h-[350px]">
      <div className="space-y-3 pr-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(), 'EEEE, MMMM d')}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => generateMutation.mutate()}
            disabled={isGenerating}
            data-testid="generate-ai-summary"
          >
            {isGenerating ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </>
            )}
          </Button>
        </div>

        {showTaskCounts && (
          <div className="grid grid-cols-3 gap-2">
            {quickStats.map((stat, i) => (
              <div key={i} className="text-center p-2 rounded-md bg-muted/50">
                <stat.icon className={`h-3.5 w-3.5 mx-auto mb-0.5 ${stat.color}`} />
                <div className="text-base font-semibold">{stat.value}</div>
                <div className="text-[9px] text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="p-3 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
          <p className="text-xs font-medium mb-0.5">{getGreeting()}!</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{getOverviewMessage()}</p>
        </div>

        {overdueTasks.length > 0 && (
          <div className="py-2 px-3 rounded-md border-l-3 border-l-red-500 bg-red-50/50 dark:bg-red-950/20">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                Needs Attention
              </span>
            </div>
            <p className="text-[11px] text-red-600 dark:text-red-400">
              {overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''} requiring immediate action
            </p>
          </div>
        )}

        {showSuggestedActions && suggestedActions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested Actions
              </span>
            </div>
            <div className="space-y-1">
              {suggestedActions.map((action) => (
                <div
                  key={action.id}
                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer hover-elevate ${
                    action.priority === 'high' 
                      ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10' 
                      : action.priority === 'medium'
                      ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10'
                      : ''
                  }`}
                  onClick={() => handleActionClick(action)}
                  data-testid={`action-${action.id}`}
                >
                  {action.type === 'overdue' && <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                  {action.type === 'task' && <Target className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                  {action.type === 'schedule' && <Clock className="h-3 w-3 text-blue-500 flex-shrink-0" />}
                  {action.type === 'follow-up' && <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                  <span className="text-[11px] flex-1 truncate">{action.text}</span>
                  {action.link && <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {summary && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
                AI Insights
              </span>
            </div>
            <div className="p-2 rounded-md bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
              <p className="text-[11px] leading-relaxed">{summary.summary}</p>
            </div>

            {summary.suggestions?.length > 0 && (
              <div className="space-y-1">
                {summary.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] pl-1">
                    <span className="text-purple-500 mt-0.5">*</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!summary && (
          <div className="text-center pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={() => generateMutation.mutate()}
              disabled={isGenerating}
              data-testid="generate-first-summary"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Get AI Insights
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

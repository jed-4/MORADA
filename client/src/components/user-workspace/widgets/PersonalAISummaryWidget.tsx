import { useState, useEffect, useRef, useMemo } from "react";
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
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, startOfDay, subDays, isToday, isTomorrow, isBefore, isWithinInterval, addDays, differenceInDays } from "date-fns";
import { type Task, type Project } from "@shared/schema";
import { useLocation } from "wouter";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";

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

/**
 * `/api/ai/daily-summary` is an uncached Claude call, so a widget that
 * generated on every mount would bill a request per dashboard load. The
 * summary only describes the day, so one per user per day is enough — kept in
 * localStorage so it survives a reload too.
 */
const summaryCacheKey = (userId?: string) => `ai-daily-summary-${userId ?? "anon"}`;

function readCachedSummary(userId: string | undefined, dayKey: string): AISummary | null {
  try {
    const raw = localStorage.getItem(summaryCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: string; summary?: AISummary };
    return parsed?.date === dayKey && parsed.summary ? parsed.summary : null;
  } catch {
    return null; // private window, cleared storage, or a bad entry
  }
}

function writeCachedSummary(userId: string | undefined, dayKey: string, summary: AISummary) {
  try {
    localStorage.setItem(summaryCacheKey(userId), JSON.stringify({ date: dayKey, summary }));
  } catch {
    /* storage unavailable — the summary just won't survive a reload */
  }
}

export default function PersonalAISummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const { effectiveTimezone } = useTimezone();
  const showSuggestedActions = widget.config?.showSuggestedActions ?? true;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configShowSuggestedActions, setConfigShowSuggestedActions] = useState(showSuggestedActions);
  const [isGenerating, setIsGenerating] = useState(false);
  const dayKey = format(new Date(), "yyyy-MM-dd");
  const [summary, setSummary] = useState<AISummary | null>(() => readCachedSummary(userId, dayKey));
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);    setConfigShowSuggestedActions(widget.config?.showSuggestedActions ?? true);
  }, [widget.title, widget.config]);

  const { isLoading: isLoadingCapabilities } = useQuery<{ dailySummary: boolean }>({
    queryKey: ["/api/ai/capabilities"],
    staleTime: 5 * 60 * 1000,
  });
  const aiAvailable = true;

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
        priority: "low",
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
        priority: "low",
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
      writeCachedSummary(userId, dayKey, data);
      setIsGenerating(false);
    },
    onError: () => {
      setIsGenerating(false);
    }
  });

  // Generate once a day without being asked — the insight was the only part of
  // this widget you could not get elsewhere, and it was hidden behind a button.
  // Guarded by the day cache above, so this is at most one call per user per day.
  const autoRequested = useRef(false);
  useEffect(() => {
    if (autoRequested.current || summary || isGenerating || !aiAvailable || isLoadingCapabilities) return;
    autoRequested.current = true;
    generateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, aiAvailable, isLoadingCapabilities]);


  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
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
            ...widget.config,            showSuggestedActions: configShowSuggestedActions
          }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);      setConfigShowSuggestedActions(widget.config?.showSuggestedActions ?? true);
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


  if (isLoadingCapabilities) {
    return <WidgetSkeleton rows={3} />;
  }

  if (!aiAvailable) {
    return (
      <WidgetEmpty
        icon={Sparkles}
        title="AI Summary unavailable"
        message="AI summaries are not available at this time."
      />
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatInTimezone(new Date(), effectiveTimezone, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
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


        {showSuggestedActions && suggestedActions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-amber" />
              <span className="text-data font-semibold uppercase tracking-wide text-muted-foreground">
                Suggested Actions
              </span>
            </div>
            <div className="space-y-1">
              {suggestedActions.map((action) => (
                <div
                  key={action.id}
                  className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer hover-elevate ${
                    action.priority === 'high'
                      ? 'border-coral/40 bg-coral/5'
                      : action.priority === 'medium'
                      ? 'border-amber/40 bg-amber/5'
                      : ''
                  }`}
                  onClick={() => handleActionClick(action)}
                  data-testid={`action-${action.id}`}
                >
                  {action.type === 'overdue' && <AlertCircle className="h-3 w-3 text-status-danger flex-shrink-0" />}
                  {action.type === 'task' && <Target className="h-3 w-3 text-status-warning flex-shrink-0" />}
                  {action.type === 'schedule' && <Clock className="h-3 w-3 text-status-info flex-shrink-0" />}
                  {action.type === 'follow-up' && <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                  <span className="text-table flex-1 truncate">{action.text}</span>
                  {action.link && <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {summary && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-data font-semibold uppercase tracking-wide text-primary">
                AI Insights
              </span>
            </div>
            <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
              <p className="text-table leading-relaxed">{summary.summary}</p>
            </div>

            {summary.suggestions?.length > 0 && (
              <div className="space-y-1">
                {summary.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-table pl-1">
                    <span className="text-primary mt-0.5">*</span>
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
              className="h-6 text-table"
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

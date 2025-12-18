import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Calendar,
  Clock,
  Target
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, startOfDay, subDays, isToday, isTomorrow, isBefore, isWithinInterval, addDays } from "date-fns";
import { type Task, type Project } from "@shared/schema";

interface AISummary {
  summary: string;
  highlights: string[];
  suggestions: string[];
  generatedAt: string;
}

export default function PersonalAISummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const showTaskCounts = widget.config?.showTaskCounts ?? true;
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configShowTaskCounts, setConfigShowTaskCounts] = useState(showTaskCounts);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState<AISummary | null>(null);
  const [localSummary, setLocalSummary] = useState<{
    greeting: string;
    overview: string;
    highlights: string[];
    concerns: string[];
  } | null>(null);

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigShowTaskCounts(widget.config?.showTaskCounts ?? true);
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

  const today = startOfDay(new Date());
  const weekAgo = subDays(today, 7);

  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'complete');
  const overdueTasks = activeTasks.filter(t => t.dueDate && new Date(t.dueDate) < today);
  const completedThisWeek = tasks.filter(t => 
    (t.status === 'done' || t.status === 'complete') &&
    t.updatedAt && new Date(t.updatedAt) >= weekAgo
  );

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

  const quickStats = [
    { 
      label: "Active Tasks", 
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
      label: "Done This Week", 
      value: completedThisWeek.length, 
      icon: TrendingUp,
      color: "text-green-600 dark:text-green-400" 
    },
  ];

  // Generate local summary based on task data
  useEffect(() => {
    const todaysTasks = activeTasks.filter(t => t.dueDate && isToday(new Date(t.dueDate)));
    const tomorrowsTasks = activeTasks.filter(t => t.dueDate && isTomorrow(new Date(t.dueDate)));
    const thisWeekTasks = activeTasks.filter(t => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      return isWithinInterval(due, { start: today, end: addDays(today, 7) });
    });

    const getGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) return "Good morning";
      if (hour < 17) return "Good afternoon";
      return "Good evening";
    };

    const highlights: string[] = [];
    const concerns: string[] = [];

    if (overdueTasks.length > 0) {
      concerns.push(`You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need attention`);
    }
    if (todaysTasks.length > 0) {
      highlights.push(`${todaysTasks.length} task${todaysTasks.length > 1 ? 's' : ''} due today`);
    }
    if (tomorrowsTasks.length > 0) {
      highlights.push(`${tomorrowsTasks.length} task${tomorrowsTasks.length > 1 ? 's' : ''} coming up tomorrow`);
    }
    if (completedThisWeek.length > 0) {
      highlights.push(`Great work! You've completed ${completedThisWeek.length} task${completedThisWeek.length > 1 ? 's' : ''} this week`);
    }
    if (activeTasks.length === 0) {
      highlights.push("You're all caught up! No active tasks");
    }

    const overview = todaysTasks.length > 0
      ? `You have ${todaysTasks.length} task${todaysTasks.length > 1 ? 's' : ''} to focus on today${overdueTasks.length > 0 ? `, plus ${overdueTasks.length} overdue item${overdueTasks.length > 1 ? 's' : ''} to address` : ''}.`
      : overdueTasks.length > 0
        ? `No tasks due today, but you have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} to catch up on.`
        : thisWeekTasks.length > 0
          ? `No tasks due today. You have ${thisWeekTasks.length} task${thisWeekTasks.length > 1 ? 's' : ''} coming up this week.`
          : "Your schedule is clear for now. Enjoy your day!";

    setLocalSummary({
      greeting: getGreeting(),
      overview,
      highlights,
      concerns,
    });
  }, [tasks, activeTasks, overdueTasks, completedThisWeek, today]);

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ 
          ...widget, 
          title: editingTitle,
          config: { ...widget.config, showTaskCounts: configShowTaskCounts }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigShowTaskCounts(widget.config?.showTaskCounts ?? true);
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
    <ScrollArea className="h-full max-h-[300px]">
      <div className="space-y-3 pr-2">
        {/* Header */}
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

        {/* Task Counts - Optional */}
        {showTaskCounts && (
          <div className="grid grid-cols-3 gap-2">
            {quickStats.map((stat, i) => (
              <div key={i} className="text-center p-2 rounded-md bg-muted/50">
                <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
                <div className="text-lg font-semibold">{stat.value}</div>
                <div className="text-[10px] text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Conversational Summary */}
        {localSummary && (
          <div className="space-y-3">
            {/* Greeting and Overview */}
            <div className="p-3 rounded-lg bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-900/10 dark:to-blue-900/10 border">
              <p className="text-xs font-medium mb-1">{localSummary.greeting}!</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{localSummary.overview}</p>
            </div>

            {/* Concerns (if any) */}
            {localSummary.concerns.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Needs Attention
                </div>
                {localSummary.concerns.map((concern, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs pl-1">
                    <span className="text-amber-500 mt-1">•</span>
                    <span>{concern}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Highlights */}
            {localSummary.highlights.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Today's Focus
                </div>
                {localSummary.highlights.map((highlight, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs pl-1">
                    <span className="text-green-500 mt-1">•</span>
                    <span>{highlight}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Summary (if generated) */}
        {summary && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 uppercase">
              <Sparkles className="h-3 w-3" />
              AI Insights
            </div>
            <div className="p-2 rounded-md bg-muted/30 border">
              <p className="text-xs leading-relaxed">{summary.summary}</p>
            </div>

            {summary.highlights.length > 0 && (
              <div className="space-y-1">
                {summary.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs pl-1">
                    <span className="text-green-500 mt-1">•</span>
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            )}

            {summary.suggestions.length > 0 && (
              <div className="space-y-1">
                {summary.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs pl-1">
                    <span className="text-purple-500 mt-1">•</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Generate AI Button (if no AI summary yet) */}
        {!summary && (
          <div className="text-center pt-2">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs"
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
                  Generate AI Summary
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

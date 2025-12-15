import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Sparkles, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Calendar
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format, startOfDay, subDays } from "date-fns";
import { type Task, type Project } from "@shared/schema";

interface AISummary {
  summary: string;
  highlights: string[];
  suggestions: string[];
  generatedAt: string;
}

export default function PersonalAISummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig, userId }: WidgetProps) {
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [isGenerating, setIsGenerating] = useState(false);
  const [summary, setSummary] = useState<AISummary | null>(null);

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

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
              Refresh
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {quickStats.map((stat, i) => (
          <div key={i} className="text-center p-2 rounded-md bg-muted/50">
            <stat.icon className={`h-4 w-4 mx-auto mb-1 ${stat.color}`} />
            <div className="text-lg font-semibold">{stat.value}</div>
            <div className="text-[10px] text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>

      {summary ? (
        <div className="space-y-2">
          <div className="p-2 rounded-md bg-muted/30 border">
            <p className="text-xs leading-relaxed">{summary.summary}</p>
          </div>

          {summary.highlights.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase">Highlights</div>
              {summary.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{h}</span>
                </div>
              ))}
            </div>
          )}

          {summary.suggestions.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-medium text-muted-foreground uppercase">Suggestions</div>
              {summary.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <Sparkles className="h-3 w-3 text-purple-500 mt-0.5 flex-shrink-0" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-3">
          <div className="p-3 rounded-lg bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
            <Sparkles className="h-6 w-6 mx-auto mb-2 text-purple-500" />
            <p className="text-xs font-medium">AI-Powered Insights</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Get a personalized summary of your work and suggestions
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-6 text-xs"
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
                  Generate Summary
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

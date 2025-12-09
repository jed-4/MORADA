import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, RefreshCw, AlertCircle, CheckCircle2, Clock, Calendar } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useState } from "react";

interface AISummary {
  schedule: string[];
  actionItems: string[];
  issues: string[];
  generatedAt: string;
}

export default function AISummaryWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: summary, isLoading, error, refetch } = useQuery<AISummary | null>({
    queryKey: ["/api/ai-summary", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return null;
      const response = await fetch(`/api/ai-summary/${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Sparkles className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm text-center">Select a project to see AI summary</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <div className="animate-pulse space-y-3 w-full">
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-2/3"></div>
          <div className="h-4 bg-muted rounded w-5/6"></div>
        </div>
        <p className="text-sm text-muted-foreground mt-4">Generating AI summary...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <AlertCircle className="h-8 w-8 mb-2 text-destructive" />
        <p className="text-sm text-center mb-3">Failed to load summary</p>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted-foreground">
            {summary?.generatedAt ? `Updated ${new Date(summary.generatedAt).toLocaleTimeString()}` : "AI-powered insights"}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="h-7 w-7 p-0"
          data-testid="button-refresh-ai-summary"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 text-sm">
        {summary?.schedule && summary.schedule.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Today's Schedule</span>
            </div>
            <ul className="space-y-1.5">
              {summary.schedule.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-foreground">
                  <Clock className="h-3 w-3 mt-1 text-muted-foreground flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary?.actionItems && summary.actionItems.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Action Items</span>
            </div>
            <ul className="space-y-1.5">
              {summary.actionItems.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-foreground">
                  <span className="text-primary">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary?.issues && summary.issues.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Potential Issues</span>
            </div>
            <ul className="space-y-1.5">
              {summary.issues.map((item, index) => (
                <li key={index} className="flex items-start gap-2 text-foreground">
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-200">!</Badge>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(!summary?.schedule?.length && !summary?.actionItems?.length && !summary?.issues?.length) && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Sparkles className="h-6 w-6 mb-2 opacity-50" />
            <p className="text-sm text-center">No insights available</p>
            <Button size="sm" variant="outline" onClick={handleRefresh} className="mt-3">
              Generate Summary
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

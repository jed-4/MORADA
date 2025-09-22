import { TrendingUp, TrendingDown, DollarSign, Calendar, Percent } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";

// Function to generate project-specific mock metrics
const generateProjectMetrics = (projectId: string, projectName: string) => {
  // Use project ID to generate consistent but different metrics per project
  const seed = projectId ? projectId.charCodeAt(0) * 1000 : 1000;
  
  return {
    budget: {
      total: 200000 + (seed % 800000), // Varies between 200k-1M
      spent: 50000 + (seed % 400000), // Varies spending
      variance: -15 + (seed % 30), // -15% to +15%
    },
    timeline: {
      totalDays: 90 + (seed % 180), // 90-270 days
      elapsed: 20 + (seed % 100), // 20-120 days
      onTrack: (seed % 3) !== 0, // 2/3 chance of on track
    },
    completion: {
      percentage: 10 + (seed % 80), // 10-90%
      trend: (seed % 2) ? "up" : "down",
      change: 2 + (seed % 15), // 2-17%
    },
  };
};

export default function MetricsWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const metrics = widget.config?.metrics || ['budget', 'timeline', 'completion'];
  
  // Generate project-specific metrics or show loading/empty state
  const projectMetrics = currentProject 
    ? generateProjectMetrics(currentProject.id, currentProject.name)
    : null;
  
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view metrics
      </div>
    );
  }

  if (!projectMetrics) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Loading project metrics...
      </div>
    );
  }

  const renderMetric = (type: string) => {
    switch (type) {
      case 'budget':
        return (
          <div className="space-y-1" data-testid="metric-budget">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Budget</span>
              <DollarSign className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="text-lg font-bold">{formatCurrency(projectMetrics.budget.total)}</div>
            <div className="text-xs">
              <span className="text-muted-foreground">Spent: </span>
              <span>{formatCurrency(projectMetrics.budget.spent)}</span>
              <span className={`ml-2 ${projectMetrics.budget.variance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {projectMetrics.budget.variance > 0 ? '+' : ''}{projectMetrics.budget.variance}%
              </span>
            </div>
          </div>
        );
        
      case 'timeline':
        return (
          <div className="space-y-1" data-testid="metric-timeline">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Timeline</span>
              <Calendar className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="text-lg font-bold">{projectMetrics.timeline.elapsed} days</div>
            <div className="text-xs">
              <span className="text-muted-foreground">of {projectMetrics.timeline.totalDays} total</span>
              <span className={`ml-2 ${projectMetrics.timeline.onTrack ? 'text-green-500' : 'text-red-500'}`}>
                {projectMetrics.timeline.onTrack ? 'On track' : 'Behind'}
              </span>
            </div>
          </div>
        );
        
      case 'completion':
        return (
          <div className="space-y-1" data-testid="metric-completion">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Completion</span>
              <Percent className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="text-lg font-bold">{projectMetrics.completion.percentage}%</div>
            <div className="flex items-center gap-1 text-xs">
              {projectMetrics.completion.trend === 'up' ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span className={projectMetrics.completion.trend === 'up' ? 'text-green-500' : 'text-red-500'}>
                {projectMetrics.completion.trend === 'up' ? '+' : ''}{projectMetrics.completion.change}% this week
              </span>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {metrics.map((metric: string) => (
        <div key={metric} className="p-3 border rounded">
          {renderMetric(metric)}
        </div>
      ))}
    </div>
  );
}
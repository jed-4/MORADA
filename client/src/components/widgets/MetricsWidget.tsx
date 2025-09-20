import { TrendingUp, TrendingDown, DollarSign, Calendar, Percent } from "lucide-react";
import { WidgetProps } from "@/types/widgets";

// todo: remove mock functionality  
const mockMetrics = {
  budget: {
    total: 750000,
    spent: 315000,
    remaining: 435000,
    variance: 12,
  },
  timeline: {
    totalDays: 180,
    elapsed: 58,
    remaining: 122,
    onTrack: true,
  },
  completion: {
    percentage: 42,
    trend: "up",
    change: 8,
  },
};

export default function MetricsWidget({ widget }: WidgetProps) {
  const metrics = widget.config?.metrics || ['budget', 'timeline', 'completion'];
  
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value);

  const renderMetric = (type: string) => {
    switch (type) {
      case 'budget':
        return (
          <div className="space-y-1" data-testid="metric-budget">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Budget</span>
              <DollarSign className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="text-lg font-bold">{formatCurrency(mockMetrics.budget.total)}</div>
            <div className="text-xs">
              <span className="text-muted-foreground">Spent: </span>
              <span>{formatCurrency(mockMetrics.budget.spent)}</span>
              <span className={`ml-2 ${mockMetrics.budget.variance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                {mockMetrics.budget.variance > 0 ? '+' : ''}{mockMetrics.budget.variance}%
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
            <div className="text-lg font-bold">{mockMetrics.timeline.elapsed} days</div>
            <div className="text-xs">
              <span className="text-muted-foreground">of {mockMetrics.timeline.totalDays} total</span>
              <span className={`ml-2 ${mockMetrics.timeline.onTrack ? 'text-green-500' : 'text-red-500'}`}>
                {mockMetrics.timeline.onTrack ? 'On track' : 'Behind'}
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
            <div className="text-lg font-bold">{mockMetrics.completion.percentage}%</div>
            <div className="flex items-center gap-1 text-xs">
              {mockMetrics.completion.trend === 'up' ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span className="text-green-500">+{mockMetrics.completion.change}% this week</span>
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
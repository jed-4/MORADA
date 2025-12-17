import { useQuery } from "@tanstack/react-query";
import type { WidgetProps } from "@/types/widgets";
import type { Project, Estimate, Bill } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function BusinessProfitabilityWidget({ widget }: WidgetProps) {
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const activeProjects = projects.filter(p => p.status === "active");

  const getProjectProfitability = (projectId: string) => {
    const projectEstimates = estimates.filter(e => e.projectId === projectId);
    const estimatedRevenue = projectEstimates.reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0);
    
    const projectBills = bills.filter(b => 
      b.projectId === projectId && 
      (b.status === "approved" || b.status === "paid")
    );
    const actualCosts = projectBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    
    const budgetVariance = estimatedRevenue > 0 
      ? ((estimatedRevenue - actualCosts) / estimatedRevenue) * 100 
      : 0;
    
    return {
      estimatedRevenue,
      actualCosts,
      grossMargin: estimatedRevenue - actualCosts,
      budgetVariance,
      marginPercent: estimatedRevenue > 0 ? ((estimatedRevenue - actualCosts) / estimatedRevenue) * 100 : 0,
    };
  };

  const formatCurrency = (value: number) => {
    if (isNaN(value) || value === null || value === undefined) return "$0";
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const projectsWithProfitability = activeProjects.map(project => ({
    ...project,
    profitability: getProjectProfitability(project.id),
  })).sort((a, b) => b.profitability.marginPercent - a.profitability.marginPercent);

  const totalEstimated = projectsWithProfitability.reduce(
    (sum, p) => sum + p.profitability.estimatedRevenue, 0
  );
  const totalCosts = projectsWithProfitability.reduce(
    (sum, p) => sum + p.profitability.actualCosts, 0
  );
  const totalMargin = totalEstimated - totalCosts;
  const avgMarginPercent = totalEstimated > 0 ? (totalMargin / totalEstimated) * 100 : 0;

  if (activeProjects.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm" data-testid="widget-profitability-empty">
        No active projects
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="widget-project-profitability">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-2 rounded-md bg-muted/50 text-center">
          <p className="text-lg font-bold">{formatCurrency(totalMargin)}</p>
          <p className="text-[10px] text-muted-foreground">Total Gross Margin</p>
        </div>
        <div className="p-2 rounded-md bg-muted/50 text-center">
          <p className={`text-lg font-bold ${avgMarginPercent >= 20 ? 'text-green-600' : avgMarginPercent >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
            {avgMarginPercent.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">Avg Margin</p>
        </div>
      </div>

      <ScrollArea className="h-[200px]">
        <div className="space-y-2 pr-4">
          <p className="text-xs font-medium text-muted-foreground">Project Margins</p>
          {projectsWithProfitability.map((project) => {
            const { marginPercent, grossMargin, actualCosts, estimatedRevenue } = project.profitability;
            const costPercent = estimatedRevenue > 0 ? (actualCosts / estimatedRevenue) * 100 : 0;
            
            return (
              <div key={project.id} className="p-2 rounded-md border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{project.name}</span>
                  <div className="flex items-center gap-1">
                    {marginPercent >= 20 ? (
                      <TrendingUp className="h-3 w-3 text-green-500" />
                    ) : marginPercent >= 10 ? (
                      <Minus className="h-3 w-3 text-yellow-500" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                    <span className={`text-xs font-medium ${
                      marginPercent >= 20 ? 'text-green-600' : 
                      marginPercent >= 10 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {marginPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <Progress 
                  value={Math.min(100, costPercent)} 
                  className={`h-1.5 ${costPercent > 100 ? '[&>div]:bg-red-500' : '[&>div]:bg-blue-500'}`}
                />
                <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                  <span>Cost: {formatCurrency(actualCosts)}</span>
                  <span>Budget: {formatCurrency(estimatedRevenue)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

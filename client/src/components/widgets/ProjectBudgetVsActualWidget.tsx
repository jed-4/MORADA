import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Budget } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatCurrency } from "@/lib/formatters";
import { Progress } from "@/components/ui/progress";

export default function ProjectBudgetVsActualWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const allowed = useFinancialPermission();

  const { data, isLoading, isError, refetch } = useQuery<Budget>({
    queryKey: ["/api/projects", currentProject?.id, "budget"],
    queryFn: async () => {
      if (!currentProject?.id) throw new Error("no project");
      const r = await fetch(`/api/projects/${currentProject.id}/budget`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id && allowed,
  });

  if (!currentProject) return <WidgetEmpty message="Select a project to view its budget" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;
  if (!data) return <WidgetEmpty message="No budget set up for this project yet" />;

  const budget = data.revisedAmount || 0;
  const actual = data.actualAmount || 0;
  const forecast = data.forecastAmount || 0;
  const variance = data.varianceAmount || 0;
  const pct = budget > 0 ? Math.round((actual / budget) * 100) : 0;
  const overBudget = actual > budget;
  const VarianceIcon = variance >= 0 ? TrendingUp : TrendingDown;
  const varianceTone = variance >= 0 ? "text-bp-green" : "text-bp-coral";

  return (
    <div className="flex flex-col h-full p-4 gap-4" data-testid="widget-budget-vs-actual">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget</p>
          <p className="text-xl font-bold leading-tight" data-testid="text-budget-amount">
            {formatCurrency(budget)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual</p>
          <p
            className={`text-xl font-bold leading-tight ${overBudget ? "text-bp-coral" : ""}`}
            data-testid="text-actual-amount"
          >
            {formatCurrency(actual)}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Spent</span>
          <span className={`font-medium ${overBudget ? "text-bp-coral" : ""}`}>{pct}%</span>
        </div>
        <Progress value={Math.min(100, pct)} className="h-2" />
      </div>
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Forecast</p>
          <p className="text-sm font-semibold">{formatCurrency(forecast)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Variance</p>
          <p className={`text-sm font-semibold flex items-center gap-1 ${varianceTone}`}>
            <VarianceIcon className="h-3 w-3" />
            {formatCurrency(Math.abs(variance))}
          </p>
        </div>
      </div>
    </div>
  );
}

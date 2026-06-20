import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Budget } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";

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

  const hasBudget = budget > 0;
  const remaining = budget - actual;
  const pct = hasBudget ? Math.round((actual / budget) * 100) : 0;
  const overBudget = hasBudget && actual > budget;
  const nearLimit = hasBudget && !overBudget && pct >= 90;
  const barWidth = hasBudget ? Math.min(100, Math.max(0, pct)) : actual > 0 ? 100 : 0;

  const barClass = !hasBudget
    ? actual > 0
      ? "bg-bp-amber"
      : "bg-muted-foreground/20"
    : overBudget
      ? "bg-bp-coral"
      : nearLimit
        ? "bg-bp-amber"
        : "bg-bp-purple";
  const statusLabel = !hasBudget
    ? "No budget set"
    : overBudget
      ? `Over by ${formatCurrency(actual - budget)}`
      : nearLimit
        ? "Near limit"
        : "On track";
  const statusClass = !hasBudget
    ? "bg-bp-amber/15 text-bp-amber border-transparent"
    : overBudget
      ? "bg-bp-coral/15 text-bp-coral border-transparent"
      : nearLimit
        ? "bg-bp-amber/15 text-bp-amber border-transparent"
        : "bg-bp-green/15 text-bp-green border-transparent";

  const VarianceIcon = variance >= 0 ? TrendingUp : TrendingDown;
  const varianceTone = variance >= 0 ? "text-bp-green" : "text-bp-coral";

  return (
    <div className="flex flex-col h-full p-4 gap-3" data-testid="widget-budget-vs-actual">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Budget health
        </span>
        <Badge
          className={`${statusClass} no-default-hover-elevate no-default-active-elevate`}
          data-testid="badge-budget-health"
        >
          {statusLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget</p>
          <p className="text-xl font-bold leading-tight tabular-nums" data-testid="text-budget-amount">
            {formatCurrency(budget)}
          </p>
        </div>
        {hasBudget ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {remaining >= 0 ? "Remaining" : "Over budget"}
            </p>
            <p
              className={`text-xl font-bold leading-tight tabular-nums ${remaining < 0 ? "text-bp-coral" : "text-bp-green"}`}
              data-testid="text-remaining-amount"
            >
              {formatCurrency(Math.abs(remaining))}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Spent</p>
            <p
              className={`text-xl font-bold leading-tight tabular-nums ${actual > 0 ? "text-bp-amber" : ""}`}
              data-testid="text-remaining-amount"
            >
              {formatCurrency(actual)}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${barClass}`}
            style={{ width: `${barWidth}%` }}
            data-testid="bar-spent"
          />
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground" data-testid="text-actual-amount">
            {hasBudget ? `Spent ${formatCurrency(actual)}` : "No budget entered"}
          </span>
          <span
            className={`font-medium ${overBudget ? "text-bp-coral" : "text-foreground"}`}
            data-testid="text-spent-pct"
          >
            {hasBudget ? `${pct}%` : "—"}
          </span>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Forecast</p>
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(forecast)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Variance</p>
          {variance === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">On budget</p>
          ) : (
            <p className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${varianceTone}`}>
              <VarianceIcon className="h-3 w-3" />
              {formatCurrency(Math.abs(variance))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { WidgetProps } from "@/types/widgets";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { WidgetError } from "@/components/ui/WidgetError";

interface ProfitabilityData {
  projects: Array<{
    projectId: string;
    projectName: string;
    revisedAmount: number;
    actualAmount: number;
    profitAmount: number;
    varianceAmount: number;
    marginPercent: number;
  }>;
}

function formatCurrency(value: number): string {
  if (Number.isNaN(value)) return "$0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export default function BusinessProfitabilityWidget({}: WidgetProps) {
  const { data, isLoading, isError, refetch } = useQuery<ProfitabilityData>({
    queryKey: ["/api/business/project-profitability"],
  });

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (isError)
    return <WidgetError onRetry={() => refetch()} message="Couldn't load profitability." />;
  if (!data?.projects?.length) return <WidgetEmpty title="No project budget data yet" />;

  const projects = data.projects;
  const avgMargin = projects.reduce((s, p) => s + p.marginPercent, 0) / projects.length;
  const totalRevenue = projects.reduce((s, p) => s + p.revisedAmount, 0);
  const totalCosts = projects.reduce((s, p) => s + p.actualAmount, 0);

  return (
    <div className="space-y-3" data-testid="widget-project-profitability">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-bp-border p-2">
          <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-bp-muted">Budget</p>
        </div>
        <div className="rounded-md border border-bp-border p-2">
          <p className="text-lg font-bold">{formatCurrency(totalCosts)}</p>
          <p className="text-xs text-bp-muted">Actual</p>
        </div>
        <div className="rounded-md border border-bp-border p-2">
          <p
            className={`text-lg font-bold ${
              avgMargin >= 20 ? "text-status-success" :
              avgMargin >= 10 ? "text-status-warning" :
              "text-status-danger"
            }`}
          >
            {avgMargin.toFixed(1)}%
          </p>
          <p className="text-xs text-bp-muted">Avg Margin</p>
        </div>
      </div>

      <ScrollArea className="h-[200px]">
        <div className="space-y-2 pr-2">
          <p className="text-xs font-medium text-bp-muted">Top Projects by Margin</p>
          {projects.map((p) => {
            const costPercent = p.revisedAmount > 0 ? (p.actualAmount / p.revisedAmount) * 100 : 0;
            return (
              <div
                key={p.projectId}
                className="rounded-md border border-bp-border p-2"
                data-testid={`profitability-${p.projectId}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{p.projectName}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {p.marginPercent >= 20 ? <TrendingUp className="h-3 w-3 text-status-success" /> :
                     p.marginPercent >= 10 ? <Minus className="h-3 w-3 text-status-warning" /> :
                     <TrendingDown className="h-3 w-3 text-status-danger" />}
                    <span
                      className={`text-xs font-medium ${
                        p.marginPercent >= 20 ? "text-status-success" :
                        p.marginPercent >= 10 ? "text-status-warning" :
                        "text-status-danger"
                      }`}
                    >
                      {p.marginPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <Progress value={Math.min(100, costPercent)} className="h-1.5" />
                <div className="flex items-center justify-between mt-1 text-[10px] text-bp-muted">
                  <span>Cost: {formatCurrency(p.actualAmount)}</span>
                  <span>Budget: {formatCurrency(p.revisedAmount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

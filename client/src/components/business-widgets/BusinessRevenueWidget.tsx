import { useQuery } from "@tanstack/react-query";
import type { WidgetProps } from "@/types/widgets";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";

interface RevenueTrends {
  months: Array<{ label: string; key: string; revenue: number; outstanding: number }>;
}

function formatCurrency(value: number): string {
  if (Number.isNaN(value)) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export default function BusinessRevenueWidget({}: WidgetProps) {
  const { data, isLoading, isError, refetch } = useQuery<RevenueTrends>({
    queryKey: ["/api/business/revenue-trends"],
  });

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (isError)
    return <WidgetError onRetry={() => refetch()} message="Couldn't load revenue trends." />;
  if (!data?.months?.length) return <WidgetEmpty title="No revenue data yet" />;

  const months = data.months;
  const current = months[months.length - 1];
  const prev = months[months.length - 2];
  const change = prev && prev.revenue > 0 ? ((current.revenue - prev.revenue) / prev.revenue) * 100 : 0;
  const maxValue = Math.max(...months.map((m) => Math.max(m.revenue, m.outstanding)), 1);

  return (
    <div className="space-y-4" data-testid="widget-revenue-trends">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">{formatCurrency(current.revenue)}</p>
          <p className="text-xs text-bp-muted">Revenue this month</p>
        </div>
        <div
          className={`flex items-center gap-1 text-sm ${change >= 0 ? "text-status-success" : "text-status-danger"}`}
          data-testid="revenue-change"
        >
          {change > 0 ? <TrendingUp className="h-4 w-4" /> :
           change < 0 ? <TrendingDown className="h-4 w-4" /> :
           <Minus className="h-4 w-4" />}
          {Math.abs(change).toFixed(1)}%
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-xs font-medium text-bp-muted">6 Month Trend</p>
        <div className="flex items-end gap-1 h-24">
          {months.map((m) => {
            const revenueHeight = (m.revenue / maxValue) * 100;
            const outstandingHeight = (m.outstanding / maxValue) * 100;
            return (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1" data-testid={`revenue-month-${m.key}`}>
                <div className="flex-1 w-full flex items-end gap-0.5">
                  <div className="flex-1 bg-bp-green/70 rounded-t-sm transition-all" style={{ height: `${revenueHeight}%` }} title={`Revenue: ${formatCurrency(m.revenue)}`} />
                  <div className="flex-1 bg-bp-amber/70 rounded-t-sm transition-all" style={{ height: `${outstandingHeight}%` }} title={`Outstanding: ${formatCurrency(m.outstanding)}`} />
                </div>
                <span className="text-[10px] text-bp-muted">{m.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-bp-muted">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-bp-green/70" />
            Revenue
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-bp-amber/70" />
            Outstanding
          </div>
        </div>
      </div>
    </div>
  );
}

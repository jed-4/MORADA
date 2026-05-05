import { useQuery } from "@tanstack/react-query";
import type { WidgetProps } from "@/types/widgets";
import { TrendingUp, TrendingDown, DollarSign, Wallet } from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { WidgetError } from "@/components/ui/WidgetError";

interface FinancialSummary {
  revenueYtd: number;
  outstanding: number;
  billsPaid: number | null;
  netPosition: number | null;
  recentTransactions: Array<{
    id: string;
    type: "invoice" | "bill";
    name: string;
    amount: number;
    date: string;
    status: string;
  }>;
  canViewBills: boolean;
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export default function BusinessFinancialsWidget({}: WidgetProps) {
  const { data, isLoading, isError, refetch } = useQuery<FinancialSummary>({
    queryKey: ["/api/business/financial-summary"],
  });

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (isError)
    return <WidgetError onRetry={() => refetch()} message="Couldn't load financial summary." />;
  if (!data) return <WidgetEmpty title="No financial data" />;

  const metrics = [
    { label: "Revenue YTD", value: formatCurrency(data.revenueYtd), icon: DollarSign },
    { label: "Outstanding", value: formatCurrency(data.outstanding), icon: TrendingUp },
    { label: "Bills Paid", value: formatCurrency(data.billsPaid), icon: TrendingDown },
    { label: "Net Position", value: formatCurrency(data.netPosition), icon: Wallet },
  ];

  return (
    <div className="space-y-2" data-testid="widget-financial-summary">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex items-center justify-between rounded-md border border-bp-border px-2 py-1.5"
          data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <div className="flex items-center gap-2">
            <metric.icon className="h-3.5 w-3.5 text-bp-muted" />
            <span className="text-sm text-bp-muted">{metric.label}</span>
          </div>
          <span
            className="text-sm font-semibold"
            data-testid={`value-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {metric.value}
          </span>
        </div>
      ))}
    </div>
  );
}

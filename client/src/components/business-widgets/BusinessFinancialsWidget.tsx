import { useQuery } from "@tanstack/react-query";
import type { WidgetProps } from "@/types/widgets";
import type { Bill, Estimate, Variation } from "@shared/schema";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export default function BusinessFinancialsWidget({ widget }: WidgetProps) {
  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

  const { data: variations = [] } = useQuery<Variation[]>({
    queryKey: ["/api/variations"],
  });

  const totalBilled = bills
    .filter(b => b.status === "approved" || b.status === "paid")
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const pendingBills = bills
    .filter(b => b.status === "pending")
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const totalEstimated = estimates.reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0);

  const approvedVariations = variations
    .filter(v => v.status === "approved")
    .reduce((sum, v) => sum + (Number(v.amount) || 0), 0);

  const formatCurrency = (value: number) => {
    if (isNaN(value) || value === null || value === undefined) return "$0";
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  };

  const grossMargin = totalEstimated - totalBilled;

  const metrics = [
    {
      label: "Total Estimated",
      value: formatCurrency(totalEstimated),
      icon: DollarSign,
      color: "text-blue-500",
    },
    {
      label: "Costs (Approved)",
      value: formatCurrency(totalBilled),
      icon: TrendingDown,
      color: "text-orange-500",
    },
    {
      label: "Costs (Pending)",
      value: formatCurrency(pendingBills),
      icon: TrendingDown,
      color: "text-yellow-500",
    },
    {
      label: "Approved Variations",
      value: formatCurrency(approvedVariations),
      icon: TrendingUp,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="space-y-3" data-testid="widget-financial-summary">
      {metrics.map((metric, index) => (
        <div key={index} className="flex items-center justify-between p-2 rounded-md border" data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}>
          <div className="flex items-center gap-2">
            <metric.icon className={`h-4 w-4 ${metric.color}`} />
            <span className="text-sm text-muted-foreground">{metric.label}</span>
          </div>
          <span className="text-sm font-semibold" data-testid={`value-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}>{metric.value}</span>
        </div>
      ))}
      
      <div className="pt-2 border-t mt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Gross Margin</span>
          <span className={`text-sm font-bold ${grossMargin >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="value-gross-margin">
            {formatCurrency(grossMargin)}
          </span>
        </div>
      </div>
    </div>
  );
}

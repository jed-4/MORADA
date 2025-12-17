import { useQuery } from "@tanstack/react-query";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import type { WidgetProps } from "@/types/widgets";
import type { Bill, Estimate } from "@shared/schema";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function BusinessRevenueWidget({ widget }: WidgetProps) {
  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
  });

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(now, 5 - i);
    return {
      label: format(date, "MMM"),
      start: startOfMonth(date),
      end: endOfMonth(date),
    };
  });

  const monthlyData = months.map(month => {
    const revenue = estimates
      .filter(est => {
        const date = new Date(est.createdAt);
        return date >= month.start && date <= month.end;
      })
      .reduce((sum, est) => sum + (Number(est.totalCost) || 0), 0);

    const expenses = bills
      .filter(bill => {
        const date = new Date(bill.createdAt);
        return date >= month.start && date <= month.end && (bill.status === "approved" || bill.status === "paid");
      })
      .reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);

    return {
      label: month.label,
      revenue,
      expenses,
      profit: revenue - expenses,
    };
  });

  const maxValue = Math.max(
    ...monthlyData.map(d => Math.max(d.revenue, d.expenses)),
    1
  );

  const currentMonth = monthlyData[monthlyData.length - 1];
  const prevMonth = monthlyData[monthlyData.length - 2];
  const revenueChange = prevMonth.revenue > 0 
    ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100 
    : 0;

  const formatCurrency = (value: number) => {
    if (isNaN(value) || value === null || value === undefined) return "$0";
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="space-y-4" data-testid="widget-revenue-trends">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold">{formatCurrency(currentMonth.revenue)}</p>
          <p className="text-xs text-muted-foreground">Revenue this month</p>
        </div>
        <div className={`flex items-center gap-1 text-sm ${revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {revenueChange > 0 ? <TrendingUp className="h-4 w-4" /> : 
           revenueChange < 0 ? <TrendingDown className="h-4 w-4" /> : 
           <Minus className="h-4 w-4" />}
          {Math.abs(revenueChange).toFixed(1)}%
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">6 Month Trend</p>
        <div className="flex items-end gap-1 h-24">
          {monthlyData.map((data, index) => {
            const revenueHeight = (data.revenue / maxValue) * 100;
            const expenseHeight = (data.expenses / maxValue) * 100;
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex-1 w-full flex items-end gap-0.5">
                  <div 
                    className="flex-1 bg-green-500/70 rounded-t-sm transition-all"
                    style={{ height: `${revenueHeight}%` }}
                    title={`Revenue: ${formatCurrency(data.revenue)}`}
                  />
                  <div 
                    className="flex-1 bg-orange-500/70 rounded-t-sm transition-all"
                    style={{ height: `${expenseHeight}%` }}
                    title={`Expenses: ${formatCurrency(data.expenses)}`}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{data.label}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500/70 rounded-sm" />
            Revenue
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-orange-500/70 rounded-sm" />
            Expenses
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t">
        <div>
          <p className="text-sm font-semibold text-green-600">{formatCurrency(currentMonth.revenue)}</p>
          <p className="text-[10px] text-muted-foreground">Revenue</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-orange-600">{formatCurrency(currentMonth.expenses)}</p>
          <p className="text-[10px] text-muted-foreground">Expenses</p>
        </div>
        <div>
          <p className={`text-sm font-semibold ${currentMonth.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(currentMonth.profit)}
          </p>
          <p className="text-[10px] text-muted-foreground">Profit</p>
        </div>
      </div>
    </div>
  );
}

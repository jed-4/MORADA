import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { WidgetProps } from "@/types/widgets";
import type { Widget } from "@/types/widgets";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { cn } from "@/lib/utils";

type RevenueRange = "6m" | "12m" | "ytd";

interface RevenueTrendsResponse {
  data: Array<{ month: string; invoiced: number; collected: number }>;
  totals: { invoiced: number; collected: number };
}

const RANGE_OPTIONS: Array<{ value: RevenueRange; label: string }> = [
  { value: "6m", label: "6M" },
  { value: "12m", label: "12M" },
  { value: "ytd", label: "YTD" },
];

function readRange(widget: Widget): RevenueRange {
  const r = (widget.config as any)?.range;
  return r === "12m" || r === "ytd" ? r : "6m";
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function formatCurrencyFull(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PeriodTabsProps {
  widget: Widget;
  onUpdate: (updates: Partial<Widget>) => void;
}

export function BusinessRevenuePeriodTabs({ widget, onUpdate }: PeriodTabsProps) {
  const range = readRange(widget);
  return (
    <div className="flex items-center gap-3" data-testid="revenue-range-tabs">
      {RANGE_OPTIONS.map((opt) => {
        const active = opt.value === range;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onUpdate({ config: { ...(widget.config || {}), range: opt.value } } as Partial<Widget>)}
            className={cn(
              "text-[11px] font-medium pb-0.5 transition-colors",
              active
                ? "text-bp-teal border-b-2 border-bp-teal"
                : "text-bp-muted border-b-2 border-transparent hover:text-bp-card-foreground",
            )}
            data-testid={`button-revenue-range-${opt.value}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { month: string; invoiced: number; collected: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-bp-card border border-bp-border rounded-md shadow-sm p-2 text-[11px]">
      <p className="font-semibold text-bp-card-foreground mb-1">{row.month}</p>
      <p className="text-bp-teal">Invoiced: {formatCurrencyFull(row.invoiced)}</p>
      <p className="text-bp-green">Collected: {formatCurrencyFull(row.collected)}</p>
    </div>
  );
}

export default function BusinessRevenueWidget({ widget }: WidgetProps) {
  const range = readRange(widget);
  const { data, isLoading, isError, refetch } = useQuery<RevenueTrendsResponse>({
    queryKey: ["/api/business/revenue-trends", range],
  });

  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} message="Couldn't load revenue trends." />;
  if (!data?.data?.length) return <WidgetEmpty message="No invoice data yet for this period" />;

  const totals = data.totals || { invoiced: 0, collected: 0 };

  return (
    <div className="flex flex-col h-full" data-testid="widget-revenue-trends">
      {/* Summary stats row */}
      <div className="flex items-center gap-5 px-5 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-bp-muted">Invoiced</p>
          <p className="text-[22px] font-bold text-bp-teal leading-tight">
            {formatCurrency(totals.invoiced)}
          </p>
        </div>
        <div className="w-px self-stretch bg-bp-border" />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-bp-muted">Collected</p>
          <p className="text-[22px] font-bold text-bp-green leading-tight">
            {formatCurrency(totals.collected)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 px-2 pb-4 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={140}>
          <AreaChart data={data.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="bp-revenue-invoiced" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--bp-teal))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--bp-teal))" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="bp-revenue-collected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--bp-green))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--bp-green))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--bp-border))"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--bp-muted))" }}
            />
            <YAxis hide />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "hsl(var(--bp-border))", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="invoiced"
              stroke="hsl(var(--bp-teal))"
              strokeWidth={2}
              fill="url(#bp-revenue-invoiced)"
              activeDot={{ r: 4, fill: "hsl(var(--bp-teal))" }}
            />
            <Area
              type="monotone"
              dataKey="collected"
              stroke="hsl(var(--bp-green))"
              strokeWidth={2}
              fill="url(#bp-revenue-collected)"
              activeDot={{ r: 4, fill: "hsl(var(--bp-green))" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

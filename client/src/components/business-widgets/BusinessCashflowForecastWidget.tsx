import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wallet } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { cn } from "@/lib/utils";
import { forecastKey, money, moneyShort, type ForecastResponse } from "@/components/cashflow/cashflowShared";

/**
 * The next 12 months of the cashflow forecast (Business → Cashflow), in brief:
 * the balance line against the safety buffer, the lowest point and where it
 * ends. Shares its query with the Cashflow page, so opening one warms the other.
 */
export default function BusinessCashflowForecastWidget({ onSetTitleAction }: WidgetProps) {
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = useQuery<ForecastResponse>({ queryKey: forecastKey("month") });

  useEffect(() => {
    onSetTitleAction?.({ label: "Open the cashflow forecast", onClick: () => navigate("/business/cashflow") });
    return () => onSetTitleAction?.(null);
  }, [onSetTitleAction, navigate]);

  if (isLoading) return <WidgetSkeleton />;
  if (error || !data) return <WidgetError onRetry={() => refetch()} />;
  const f = data.forecast;
  if (!f.periods.length) return <WidgetEmpty icon={Wallet} message="No forecast yet." />;

  const last = f.periods.length - 1;
  const below = f.firstBelowBufferIndex;
  const low = f.lowest;
  const rows = f.periods.map((p, i) => ({ label: p.label, balance: f.closingCents[i] }));

  return (
    <div className="flex h-full flex-col gap-2" data-testid="widget-cashflow-forecast">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Bank today</p>
          <p className="text-sm font-semibold tabular-nums">{money(f.openingBalanceCents)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lowest</p>
          <p className={cn("text-sm font-semibold tabular-nums", low.cents < f.bufferCents && "text-destructive")}>
            {money(low.cents)} <span className="text-data font-normal text-muted-foreground">{f.periods[low.periodIndex].label}</span>
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">{f.periods[last].label}</p>
          <p className="text-sm font-semibold tabular-nums">{money(f.closingCents[last])}</p>
        </div>
      </div>
      <div className="flex-1 min-h-[90px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="cf-forecast-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={moneyShort} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: 12 }} />
            <ReferenceLine y={f.bufferCents} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
            <Area dataKey="balance" name="Balance" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cf-forecast-fill)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className={cn("text-xs", below == null ? "text-muted-foreground" : "text-destructive")}>
        {below == null
          ? `Stays above your ${money(f.bufferCents)} buffer for the next 12 months.`
          : `Drops below your ${money(f.bufferCents)} buffer in ${f.periods[below].label}.`}
        {data.whatIfs.some((w) => w.isEnabled) && " Includes what-ifs that are switched on."}
      </p>
    </div>
  );
}

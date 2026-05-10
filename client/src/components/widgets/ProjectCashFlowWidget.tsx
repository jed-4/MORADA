import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WidgetProps, Widget } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type ChartType = "bar" | "scurve";
type GroupBy = "week" | "month";
type RangeOpt = "project" | "last6" | "current6";

interface CashFlowConfig {
  chartType: ChartType;
  groupBy: GroupBy;
  range: RangeOpt;
  showContractCeiling: boolean;
  showVariationsCeiling: boolean;
  showPlannedCurve: boolean;
}

const DEFAULT_CONFIG: CashFlowConfig = {
  chartType: "bar",
  groupBy: "month",
  range: "project",
  showContractCeiling: true,
  showVariationsCeiling: true,
  showPlannedCurve: true,
};

interface PeriodRow {
  label: string;
  periodStart: string;
  moneyIn: number;
  moneyOut: number;
  invoicedNotPaid: number;
  committedNotPaid: number;
  plannedIn: number;
  cumulativeIn: number;
  cumulativeOut: number;
  cumulativePlanned: number;
}

interface UnpaidInvoice {
  id: string;
  invoiceNumber: string | null;
  totalAmount: number;
  paidAmount: number;
  status: string;
  dueDate: string | null;
}

interface CashFlowResponse {
  periods: PeriodRow[];
  contractCeiling: number;
  contractPlusVariationsCeiling: number;
  unpaidInvoices: UnpaidInvoice[];
  summary: {
    totalMoneyIn: number;
    totalMoneyOut: number;
    netPosition: number;
    totalInvoiced: number;
    totalBilled: number;
  };
}

function readConfig(widget?: Widget): CashFlowConfig {
  const c = (widget?.config || {}) as Partial<CashFlowConfig>;
  return {
    chartType: c.chartType === "scurve" ? "scurve" : "bar",
    groupBy: c.groupBy === "week" ? "week" : "month",
    range: c.range === "last6" || c.range === "current6" ? c.range : "project",
    showContractCeiling: c.showContractCeiling !== false,
    showVariationsCeiling: c.showVariationsCeiling !== false,
    showPlannedCurve: c.showPlannedCurve !== false,
  };
}

function formatCurrencyShort(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  const dollars = v / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  return `$${Math.round(dollars)}`;
}

function CashFlowTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row: PeriodRow = payload[0].payload;
  const net = (row.moneyIn || 0) - (row.moneyOut || 0);
  return (
    <div className="bg-[hsl(var(--bp-card))] border border-[hsl(var(--bp-border))] rounded-md p-2 text-xs shadow-sm">
      <p className="font-semibold text-[hsl(var(--bp-card-foreground))] mb-1">{row.label}</p>
      <p className="text-[hsl(var(--bp-green))]">Received: {formatCurrency(row.moneyIn || 0)}</p>
      <p className="text-[hsl(var(--bp-coral))]">Paid out: {formatCurrency(row.moneyOut || 0)}</p>
      <p className={cn("font-medium mt-0.5", net >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]")}>
        Net: {formatCurrency(net)}
      </p>
    </div>
  );
}

function SCurveTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row: PeriodRow = payload[0].payload;
  const gap = (row.cumulativeIn || 0) - (row.cumulativePlanned || 0);
  return (
    <div className="bg-[hsl(var(--bp-card))] border border-[hsl(var(--bp-border))] rounded-md p-2 text-xs shadow-sm">
      <p className="font-semibold text-[hsl(var(--bp-card-foreground))] mb-1">{row.label}</p>
      <p className="text-[hsl(var(--bp-green))]">Cumulative received: {formatCurrency(row.cumulativeIn || 0)}</p>
      <p className="text-[hsl(var(--bp-coral))]">Cumulative paid out: {formatCurrency(row.cumulativeOut || 0)}</p>
      <p className="text-[hsl(var(--bp-purple))]">Planned: {formatCurrency(row.cumulativePlanned || 0)}</p>
      <p className={cn("font-medium mt-0.5", gap >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]")}>
        {gap >= 0 ? "Ahead by " : "Behind by "}
        {formatCurrency(Math.abs(gap))}
      </p>
    </div>
  );
}

export default function ProjectCashFlowWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const allowed = useFinancialPermission();
  const projectId = currentProject?.id;
  const config = useMemo(() => readConfig(widget), [widget]);

  const updateConfig = (patch: Partial<CashFlowConfig>) => {
    if (!onUpdate || !widget) return;
    onUpdate({ ...widget, config: { ...(widget.config || {}), ...patch } } as Widget);
  };

  const { data, isLoading, isError, refetch } = useQuery<CashFlowResponse>({
    queryKey: ["/api/projects", projectId, "cash-flow", config.groupBy, config.range],
    queryFn: () =>
      apiRequest(
        `/api/projects/${projectId}/cash-flow?groupBy=${config.groupBy}&range=${config.range}`,
        "GET",
      ),
    enabled: !!projectId && allowed,
  });

  const totalOutstanding = useMemo(() => {
    if (!data?.unpaidInvoices) return 0;
    return data.unpaidInvoices.reduce(
      (s, i) => s + Math.max(0, (i.totalAmount || 0) - (i.paidAmount || 0)),
      0,
    );
  }, [data]);

  if (isConfiguring) {
    return (
      <div className="space-y-4 p-3">
        <div className="space-y-2">
          <Label className="text-xs">Chart type</Label>
          <Select
            value={config.chartType}
            onValueChange={(v) => updateConfig({ chartType: v as ChartType })}
          >
            <SelectTrigger className="h-8 text-xs" data-testid="select-cashflow-chart-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-xs">Bar chart</SelectItem>
              <SelectItem value="scurve" className="text-xs">S-Curve</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Group by</Label>
          <Select
            value={config.groupBy}
            onValueChange={(v) => updateConfig({ groupBy: v as GroupBy })}
          >
            <SelectTrigger className="h-8 text-xs" data-testid="select-cashflow-group-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week" className="text-xs">Week</SelectItem>
              <SelectItem value="month" className="text-xs">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Date range</Label>
          <Select
            value={config.range}
            onValueChange={(v) => updateConfig({ range: v as RangeOpt })}
          >
            <SelectTrigger className="h-8 text-xs" data-testid="select-cashflow-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project" className="text-xs">Project duration</SelectItem>
              <SelectItem value="last6" className="text-xs">Last 6 months</SelectItem>
              <SelectItem value="current6" className="text-xs">Rolling 6 months</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Overlays
          </Label>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Show contract ceiling</Label>
            <Switch
              checked={config.showContractCeiling}
              onCheckedChange={(v) => updateConfig({ showContractCeiling: !!v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Show contract + variations</Label>
            <Switch
              checked={config.showVariationsCeiling}
              onCheckedChange={(v) => updateConfig({ showVariationsCeiling: !!v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className={cn("text-xs font-normal", config.chartType !== "scurve" && "opacity-50")}>
              Show planned curve
            </Label>
            <Switch
              checked={config.showPlannedCurve}
              disabled={config.chartType !== "scurve"}
              onCheckedChange={(v) => updateConfig({ showPlannedCurve: !!v })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button size="sm" onClick={onCloseConfig} className="h-7 px-3 text-xs">
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view cash flow" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;
  if (!data) return <WidgetEmpty message="No cash flow data" />;

  const net = data.summary.netPosition;
  const showVariationsLine =
    config.showVariationsCeiling && data.contractPlusVariationsCeiling > data.contractCeiling;

  return (
    <div className="flex flex-col h-full" data-testid="widget-project-cash-flow">
      {/* Unpaid invoice warning */}
      {data.unpaidInvoices.length > 0 && (
        <div className="mx-3 mt-2 mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] text-xs font-medium">
          <AlertCircle size={12} />
          {data.unpaidInvoices.length} invoice{data.unpaidInvoices.length > 1 ? "s" : ""} unpaid —{" "}
          {formatCurrency(totalOutstanding)} outstanding
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 px-2 pt-2 min-h-[160px]">
        {data.periods.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[hsl(var(--bp-muted))]">
            No periods to display
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={160}>
            {config.chartType === "bar" ? (
              <ComposedChart data={data.periods} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="bp-cf-gradIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--bp-green))" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="hsl(var(--bp-green))" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="bp-cf-gradOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--bp-coral))" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="hsl(var(--bp-coral))" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--bp-border))" vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--bp-muted))" }}
                />
                <YAxis
                  tickFormatter={formatCurrencyShort}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--bp-muted))" }}
                  width={52}
                />
                <Tooltip content={<CashFlowTooltip />} cursor={{ fill: "hsl(var(--bp-border))", opacity: 0.2 }} />
                <Bar dataKey="moneyIn" name="Received" fill="url(#bp-cf-gradIn)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                <Bar dataKey="moneyOut" name="Paid out" fill="url(#bp-cf-gradOut)" radius={[3, 3, 0, 0]} maxBarSize={32} />
                {config.showContractCeiling && data.contractCeiling > 0 && (
                  <ReferenceLine
                    y={data.contractCeiling}
                    stroke="hsl(var(--bp-muted))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: "Contract", position: "right", fontSize: 9, fill: "hsl(var(--bp-muted))" }}
                  />
                )}
                {showVariationsLine && (
                  <ReferenceLine
                    y={data.contractPlusVariationsCeiling}
                    stroke="hsl(var(--bp-purple))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: "Contract + Vars", position: "right", fontSize: 9, fill: "hsl(var(--bp-purple))" }}
                  />
                )}
              </ComposedChart>
            ) : (
              <ComposedChart data={data.periods} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="bp-cf-gradCumIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--bp-green))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--bp-green))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="bp-cf-gradCumOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--bp-coral))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--bp-coral))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--bp-border))" vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--bp-muted))" }}
                />
                <YAxis
                  tickFormatter={formatCurrencyShort}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--bp-muted))" }}
                  width={52}
                />
                <Tooltip content={<SCurveTooltip />} cursor={{ stroke: "hsl(var(--bp-border))", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="cumulativeOut"
                  name="Cumulative paid out"
                  stroke="hsl(var(--bp-coral))"
                  strokeWidth={2}
                  fill="url(#bp-cf-gradCumOut)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeIn"
                  name="Cumulative received"
                  stroke="hsl(var(--bp-green))"
                  strokeWidth={2}
                  fill="url(#bp-cf-gradCumIn)"
                  dot={false}
                />
                {config.showPlannedCurve && (
                  <Line
                    type="monotone"
                    dataKey="cumulativePlanned"
                    name="Planned"
                    stroke="hsl(var(--bp-purple))"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                  />
                )}
                {config.showContractCeiling && data.contractCeiling > 0 && (
                  <ReferenceLine
                    y={data.contractCeiling}
                    stroke="hsl(var(--bp-muted))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: "Contract", position: "right", fontSize: 9, fill: "hsl(var(--bp-muted))" }}
                  />
                )}
                {showVariationsLine && (
                  <ReferenceLine
                    y={data.contractPlusVariationsCeiling}
                    stroke="hsl(var(--bp-purple))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: "+Variations", position: "right", fontSize: 9, fill: "hsl(var(--bp-purple))" }}
                  />
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer: KPIs left, legend right */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-1 text-[11px]">
        <div className="flex items-center gap-3 mr-auto">
          <div className="flex items-center gap-1">
            <span className="text-[hsl(var(--bp-muted))]">In:</span>
            <span className="font-medium text-[hsl(var(--bp-card-foreground))] tabular-nums">
              {formatCurrency(data.summary.totalMoneyIn)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[hsl(var(--bp-muted))]">Out:</span>
            <span className="font-medium text-[hsl(var(--bp-card-foreground))] tabular-nums">
              {formatCurrency(data.summary.totalMoneyOut)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[hsl(var(--bp-muted))]">Net:</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                net >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]",
              )}
              data-testid="chip-net-position"
            >
              {formatCurrency(net)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 ml-auto text-[10px] text-[hsl(var(--bp-muted))]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-green))]" />
            Received
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-coral))]" />
            Paid out
          </span>
          {config.chartType === "scurve" && config.showPlannedCurve && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-3 border-t border-dashed border-[hsl(var(--bp-purple))]" />
              Planned
            </span>
          )}
          {config.showContractCeiling && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-3 border-t border-dashed border-[hsl(var(--bp-muted))]" />
              Contract
            </span>
          )}
          {showVariationsLine && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-3 border-t border-dashed border-[hsl(var(--bp-purple))]" />
              +Variations
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

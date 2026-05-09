import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  LineChart as LineChartIcon,
  MoreHorizontal,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
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

export default function ProjectCashFlowWidget({ widget, onUpdate }: WidgetProps) {
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
      {/* Header */}
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[hsl(var(--bp-card-foreground))] truncate">
              Project Cash Flow
            </h3>
            <span
              className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                net >= 0
                  ? "text-[hsl(var(--bp-green))] border-[hsl(var(--bp-green))]/40 bg-[hsl(var(--bp-green))]/10"
                  : "text-[hsl(var(--bp-coral))] border-[hsl(var(--bp-coral))]/40 bg-[hsl(var(--bp-coral))]/10",
              )}
              data-testid="chip-net-position"
            >
              Net {formatCurrency(net)}
            </span>
          </div>
          <p className="text-xs text-[hsl(var(--bp-muted))] truncate">
            Money in vs out{config.range === "project" ? " for project duration" : config.range === "last6" ? " last 6 months" : " rolling 6 months"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Inline Bar / S-Curve toggle */}
          <div className="flex items-center rounded-md border border-[hsl(var(--bp-border))] p-0.5 gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-6 px-2 text-[11px]", config.chartType === "bar" && "toggle-elevate toggle-elevated")}
              onClick={() => updateConfig({ chartType: "bar" })}
              data-testid="button-cashflow-chart-bar"
            >
              <BarChart3 className="h-3 w-3 mr-1" />
              Bar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-6 px-2 text-[11px]", config.chartType === "scurve" && "toggle-elevate toggle-elevated")}
              onClick={() => updateConfig({ chartType: "scurve" })}
              data-testid="button-cashflow-chart-scurve"
            >
              <LineChartIcon className="h-3 w-3 mr-1" />
              S-Curve
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                data-testid="button-cashflow-menu"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={config.chartType}
                      onValueChange={(v) => updateConfig({ chartType: v as ChartType })}
                    >
                      <DropdownMenuRadioItem value="bar">Bar chart</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="scurve">S-Curve</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Group by</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={config.groupBy}
                      onValueChange={(v) => updateConfig({ groupBy: v as GroupBy })}
                    >
                      <DropdownMenuRadioItem value="week">Week</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="month">Month</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Date range</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={config.range}
                      onValueChange={(v) => updateConfig({ range: v as RangeOpt })}
                    >
                      <DropdownMenuRadioItem value="project">Project duration</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="last6">Last 6 months</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="current6">Rolling 6 months</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-[hsl(var(--bp-muted))]">
                Overlays
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={config.showContractCeiling}
                onCheckedChange={(v) => updateConfig({ showContractCeiling: !!v })}
              >
                Show contract ceiling
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={config.showVariationsCeiling}
                onCheckedChange={(v) => updateConfig({ showVariationsCeiling: !!v })}
              >
                Show contract + variations
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={config.showPlannedCurve}
                disabled={config.chartType !== "scurve"}
                onCheckedChange={(v) => updateConfig({ showPlannedCurve: !!v })}
              >
                Show planned curve
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Unpaid invoice warning */}
      {data.unpaidInvoices.length > 0 && (
        <div className="mx-3 mb-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] text-xs font-medium">
          <AlertCircle size={12} />
          {data.unpaidInvoices.length} invoice{data.unpaidInvoices.length > 1 ? "s" : ""} unpaid —{" "}
          {formatCurrency(totalOutstanding)} outstanding
        </div>
      )}

      {/* Summary KPI row */}
      <div className="flex items-center gap-4 px-4 pb-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-[hsl(var(--bp-muted))]">Money in:</span>
          <span className="font-medium text-[hsl(var(--bp-card-foreground))]">
            {formatCurrency(data.summary.totalMoneyIn)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[hsl(var(--bp-muted))]">Money out:</span>
          <span className="font-medium text-[hsl(var(--bp-card-foreground))]">
            {formatCurrency(data.summary.totalMoneyOut)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[hsl(var(--bp-muted))]">Net:</span>
          <span
            className={cn(
              "font-semibold",
              net >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]",
            )}
          >
            {formatCurrency(net)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 px-2 min-h-[160px]">
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[10px] text-[hsl(var(--bp-muted))]">
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
        {config.showContractCeiling && data.contractCeiling > 0 && (
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
  );
}

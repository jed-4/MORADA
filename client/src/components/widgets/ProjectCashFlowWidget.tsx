import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { centsToDollars } from "@shared/money";
import { AlertCircle, Rows3 } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WidgetProps, Widget } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useLocation } from "wouter";

type ChartType = "bar" | "scurve";
type GroupBy = "week" | "month";
type RangeOpt = "project" | "last6" | "current6";

interface CashFlowConfig {
  chartType: ChartType;
  groupBy: GroupBy;
  range: RangeOpt;
  splitCosts: boolean;
  showContractCeiling: boolean;
  showVariationsCeiling: boolean;
  showPlannedCurve: boolean;
}

interface PeriodRow {
  label: string;
  periodStart: string;
  moneyIn: number;
  moneyOut: number;
  labourOut: number;
  invoicedNotPaid: number;
  committedNotPaid: number;
  plannedIn: number;
  cumulativeIn: number;
  cumulativeOut: number;
  cumulativeLabour: number;
  cumulativePlanned: number;
}

interface ChartRow extends PeriodRow {
  costsOut: number;
  cumulativeCosts: number;
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
    totalLabour: number;
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
    splitCosts: c.splitCosts !== false,
    showContractCeiling: c.showContractCeiling !== false,
    showVariationsCeiling: c.showVariationsCeiling !== false,
    showPlannedCurve: c.showPlannedCurve !== false,
  };
}

function formatCurrencyShort(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  const dollars = centsToDollars(v);
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(0)}k`;
  return `$${Math.round(dollars)}`;
}

// Build an evenly-spaced ("nice") axis so the scale always reads top-to-bottom
// in consistent steps instead of recharts' uneven auto ticks.
//
// The domain top is decoupled from the tick labels: gridlines stay on clean
// round numbers, but the chart's top edge is only a small headroom above the
// tallest value. That way the highest line (e.g. the contract ceiling) sits
// near the top of the chart rather than stranded mid-height under a coarse,
// rounded-up maximum.
function niceAxis(maxCents: number): { max: number; ticks: number[] } {
  if (!Number.isFinite(maxCents) || maxCents <= 0) return { max: 0, ticks: [0] };
  // Domain top: just above the tallest value so the top line nearly touches it.
  const domainMax = maxCents * 1.06;
  // Pick a clean step targeting ~5 gridlines across the actual data range.
  const rawStep = maxCents / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const stepMul = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = Math.max(1, stepMul * mag);
  // Gridlines from 0 up to the data max only (kept below the headroom top edge,
  // so the top tick label never clips against the top of the chart).
  const count = Math.floor(maxCents / step + 1e-9);
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(Math.round(i * step));
  return { max: Math.round(domainMax), ticks };
}

function CashFlowTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row: ChartRow = payload[0].payload;
  const totalIn = (row.moneyIn || 0) + (row.invoicedNotPaid || 0);
  const totalOut = (row.moneyOut || 0) + (row.labourOut || 0) + (row.committedNotPaid || 0);
  const net = (row.moneyIn || 0) - (row.moneyOut || 0) - (row.labourOut || 0);
  return (
    <div className="bg-[hsl(var(--bp-card))] border border-[hsl(var(--bp-border))] rounded-md p-2 text-xs shadow-sm min-w-[160px]">
      <p className="font-semibold text-[hsl(var(--bp-card-foreground))] mb-1">{row.label}</p>
      {row.moneyIn > 0 && (
        <p className="text-[hsl(var(--bp-green))]">Received: {formatCurrency(row.moneyIn)}</p>
      )}
      {row.invoicedNotPaid > 0 && (
        <p className="text-[hsl(var(--bp-green))] opacity-60">Invoiced (unpaid): {formatCurrency(row.invoicedNotPaid)}</p>
      )}
      {row.moneyOut > 0 && (
        <p className="text-[hsl(var(--bp-coral))]">Bills paid: {formatCurrency(row.moneyOut)}</p>
      )}
      {row.labourOut > 0 && (
        <p className="text-[hsl(var(--bp-teal))]">Labour: {formatCurrency(row.labourOut)}</p>
      )}
      {row.committedNotPaid > 0 && (
        <p className="text-[hsl(var(--bp-coral))] opacity-60">Committed (unpaid): {formatCurrency(row.committedNotPaid)}</p>
      )}
      {(totalIn > 0 || totalOut > 0) && (
        <p className={cn("font-medium mt-1 border-t border-[hsl(var(--bp-border))] pt-1", net >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]")}>
          Cash net: {formatCurrency(net)}
        </p>
      )}
    </div>
  );
}

function SCurveTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row: ChartRow = payload[0].payload;
  const gap = (row.cumulativeIn || 0) - (row.cumulativePlanned || 0);
  return (
    <div className="bg-[hsl(var(--bp-card))] border border-[hsl(var(--bp-border))] rounded-md p-2 text-xs shadow-sm">
      <p className="font-semibold text-[hsl(var(--bp-card-foreground))] mb-1">{row.label}</p>
      <p className="text-[hsl(var(--bp-green))]">Cumulative received: {formatCurrency(row.cumulativeIn || 0)}</p>
      <p className="text-[hsl(var(--bp-coral))]">Cumulative costs: {formatCurrency(row.cumulativeCosts || 0)}</p>
      {row.cumulativeLabour > 0 && (
        <p className="text-[hsl(var(--bp-teal))] opacity-80">of which labour: {formatCurrency(row.cumulativeLabour)}</p>
      )}
      <p className="text-[hsl(var(--bp-purple))]">Planned claims: {formatCurrency(row.cumulativePlanned || 0)}</p>
      <p className={cn("font-medium mt-0.5", gap >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]")}>
        {gap >= 0 ? "Ahead of claims by " : "Behind claims by "}
        {formatCurrency(Math.abs(gap))}
      </p>
    </div>
  );
}

export default function ProjectCashFlowWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetTitleAction }: WidgetProps) {
  const { currentProject } = useProject();
  const allowed = useFinancialPermission();
  const [, navigate] = useLocation();
  const projectId = currentProject?.id;
  const config = useMemo(() => readConfig(widget), [widget]);

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; config: Partial<CashFlowConfig> } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, config: {} });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  const { data, isLoading, isError, refetch } = useQuery<CashFlowResponse>({
    queryKey: ["/api/projects", projectId, "cash-flow", config.groupBy, config.range],
    queryFn: () =>
      apiRequest(
        `/api/projects/${projectId}/cash-flow?groupBy=${config.groupBy}&range=${config.range}`,
        "GET",
      ),
    enabled: !!projectId && allowed,
  });

  // The title itself is the way through to the full page.
  useEffect(() => {
    onSetTitleAction?.(currentProject ? { label: "Client invoices", onClick: () => navigate(`/projects/${currentProject.id}/client-invoices`) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  const rows = useMemo<ChartRow[]>(
    () =>
      (data?.periods ?? []).map((p) => ({
        ...p,
        costsOut: (p.moneyOut || 0) + (p.labourOut || 0),
        cumulativeCosts: (p.cumulativeOut || 0) + (p.cumulativeLabour || 0),
      })),
    [data],
  );

  const totalOutstanding = useMemo(() => {
    if (!data?.unpaidInvoices) return 0;
    return data.unpaidInvoices.reduce(
      (s, i) => s + Math.max(0, (i.totalAmount || 0) - (i.paidAmount || 0)),
      0,
    );
  }, [data]);

  // Even, full-height Y axis: take the tallest value the chart needs to show
  // (stacked bars or cumulative curves, plus the ceiling lines) and round it
  // up to clean, evenly-spaced ticks.
  const axis = useMemo(() => {
    if (!data) return { max: 0, ticks: [0] };
    // Only let overlays that are actually drawn drive the axis height, so
    // toggling Contract/Revised off reclaims the headroom they occupied.
    let m = 0;
    if (config.showContractCeiling) m = Math.max(m, data.contractCeiling || 0);
    if (config.showVariationsCeiling && data.contractPlusVariationsCeiling > data.contractCeiling) {
      m = Math.max(m, data.contractPlusVariationsCeiling || 0);
    }
    for (const p of rows) {
      if (config.chartType === "bar") {
        m = Math.max(
          m,
          (p.moneyIn || 0) + (p.invoicedNotPaid || 0),
          (p.costsOut || 0) + (p.committedNotPaid || 0),
        );
      } else {
        m = Math.max(m, p.cumulativeIn || 0, p.cumulativeCosts || 0, p.cumulativePlanned || 0);
      }
    }
    return niceAxis(m);
  }, [data, rows, config.chartType, config.showContractCeiling, config.showVariationsCeiling]);

  if (isConfiguring && draft) {
    const cfg = { ...config, ...draft.config };
    const stage = (patch: Partial<CashFlowConfig>) =>
      setDraft(prev => prev && { ...prev, config: { ...prev.config, ...patch } });
    const cancelConfig = () => { setDraft(null); onCloseConfig?.(); };
    const saveConfig = () => {
      onUpdate?.({
        ...widget,
        title: draft.title.trim() || widget.title,
        config: { ...(widget.config || {}), ...draft.config },
      } as Widget);
      setDraft(null);
      onCloseConfig?.();
    };

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="cashflow-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={draft.title}
            onChange={e => setDraft(prev => prev && { ...prev, title: e.target.value })}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Chart
          </p>
          <Select value={cfg.chartType} onValueChange={(v) => stage({ chartType: v as ChartType })}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-cashflow-chart-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-xs">Bar chart</SelectItem>
              <SelectItem value="scurve" className="text-xs">S-Curve</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cfg.groupBy} onValueChange={(v) => stage({ groupBy: v as GroupBy })}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-cashflow-group-by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week" className="text-xs">Group by week</SelectItem>
              <SelectItem value="month" className="text-xs">Group by month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cfg.range} onValueChange={(v) => stage({ range: v as RangeOpt })}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-cashflow-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project" className="text-xs">Project duration</SelectItem>
              <SelectItem value="last6" className="text-xs">Last 6 months</SelectItem>
              <SelectItem value="current6" className="text-xs">Rolling 6 months</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Overlays
          </p>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Split costs into bills and labour</Label>
            <Switch
              checked={cfg.splitCosts}
              onCheckedChange={(v) => stage({ splitCosts: !!v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Show contract ceiling</Label>
            <Switch
              checked={cfg.showContractCeiling}
              onCheckedChange={(v) => stage({ showContractCeiling: !!v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs font-normal">Show contract + variations</Label>
            <Switch
              checked={cfg.showVariationsCeiling}
              onCheckedChange={(v) => stage({ showVariationsCeiling: !!v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className={cn("text-xs font-normal", cfg.chartType !== "scurve" && "opacity-50")}>
              Show planned claims curve
            </Label>
            <Switch
              checked={cfg.showPlannedCurve}
              disabled={cfg.chartType !== "scurve"}
              onCheckedChange={(v) => stage({ showPlannedCurve: !!v })}
            />
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="cashflow-config-save">
            Save
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
  // Accrual view: everything invoiced to the client minus all costs incurred
  // (bills inc GST + labour) — a rough job-margin-to-date, cash aside.
  const jobProfit = data.summary.totalInvoiced - data.summary.totalBilled - data.summary.totalLabour;
  const showVariationsLine =
    config.showVariationsCeiling && data.contractPlusVariationsCeiling > data.contractCeiling;

  const legendRows: Array<{ swatch: React.ReactNode; label: string }> = [];
  if (config.chartType === "bar") {
    legendRows.push(
      { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-green))]" />, label: "Received" },
      { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-green))] opacity-30" />, label: "Invoiced (unpaid)" },
    );
    if (config.splitCosts) {
      legendRows.push(
        { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-coral))]" />, label: "Bills paid" },
        { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-teal))]" />, label: "Labour" },
      );
    } else {
      legendRows.push(
        { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-coral))]" />, label: "Costs paid" },
      );
    }
    legendRows.push(
      { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-coral))] opacity-30" />, label: "Committed (unpaid)" },
    );
  } else {
    legendRows.push(
      { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-green))]" />, label: "Cumulative received" },
      { swatch: <span className="inline-block h-2 w-2 rounded-full bg-[hsl(var(--bp-coral))]" />, label: "Cumulative costs" },
    );
    if (config.showPlannedCurve) {
      legendRows.push({
        swatch: <span className="inline-block h-px w-3 border-t border-dashed border-[hsl(var(--bp-purple))]" />,
        label: "Planned claims",
      });
    }
  }
  if (config.showContractCeiling) {
    legendRows.push({
      swatch: <span className="inline-block h-px w-3 border-t border-dashed border-[hsl(var(--bp-muted))]" />,
      label: "Contract",
    });
  }
  if (showVariationsLine) {
    legendRows.push({
      swatch: <span className="inline-block h-px w-3 border-t border-dashed border-[hsl(var(--bp-purple))]" />,
      label: "Revised contract",
    });
  }

  return (
    <div className="flex flex-col h-full" data-testid="widget-project-cash-flow">
      {/* Unpaid invoice warning */}
      {data.unpaidInvoices.length > 0 && (
        <div
          className="mx-3 mt-2 mb-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
          style={{ backgroundColor: "hsl(var(--amber-light))", color: "hsl(42 45% 30%)" }}
        >
          <AlertCircle size={12} style={{ color: "hsl(var(--amber))" }} />
          {data.unpaidInvoices.length} invoice{data.unpaidInvoices.length > 1 ? "s" : ""} unpaid —{" "}
          {formatCurrency(totalOutstanding)} outstanding
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 px-2 pt-2 min-h-[160px]">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[hsl(var(--bp-muted))]">
            No periods to display
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={160}>
            {config.chartType === "bar" ? (
              <ComposedChart data={rows} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
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
                  domain={[0, axis.max > 0 ? axis.max : "auto"]}
                  ticks={axis.max > 0 ? axis.ticks : undefined}
                  allowDecimals={false}
                />
                <ChartTooltip content={<CashFlowTooltip />} cursor={{ fill: "hsl(var(--bp-border))", opacity: 0.2 }} />
                {/* Received (actual) — solid green, stacked below pending */}
                <Bar dataKey="moneyIn" name="Received" stackId="in" fill="hsl(var(--bp-green))" fillOpacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={32} />
                {/* Invoiced but not yet received — lighter green on top */}
                <Bar dataKey="invoicedNotPaid" name="Invoiced (unpaid)" stackId="in" fill="hsl(var(--bp-green))" fillOpacity={0.28} radius={[3, 3, 0, 0]} maxBarSize={32} />
                {config.splitCosts ? (
                  <>
                    {/* Bills paid — solid coral, labour — teal, stacked */}
                    <Bar dataKey="moneyOut" name="Bills paid" stackId="out" fill="hsl(var(--bp-coral))" fillOpacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="labourOut" name="Labour" stackId="out" fill="hsl(var(--bp-teal))" fillOpacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={32} />
                  </>
                ) : (
                  <Bar dataKey="costsOut" name="Costs paid" stackId="out" fill="hsl(var(--bp-coral))" fillOpacity={0.85} radius={[0, 0, 0, 0]} maxBarSize={32} />
                )}
                {/* Committed but not yet paid — lighter coral on top */}
                <Bar dataKey="committedNotPaid" name="Committed (unpaid)" stackId="out" fill="hsl(var(--bp-coral))" fillOpacity={0.28} radius={[3, 3, 0, 0]} maxBarSize={32} />
                {config.showContractCeiling && data.contractCeiling > 0 && (
                  <ReferenceLine
                    y={data.contractCeiling}
                    stroke="hsl(var(--foreground) / 0.55)"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                    label={{ value: "Contract", position: "right", fontSize: 9, fontWeight: 600, fill: "hsl(var(--foreground) / 0.7)" }}
                  />
                )}
                {showVariationsLine && (
                  <ReferenceLine
                    y={data.contractPlusVariationsCeiling}
                    stroke="hsl(var(--bp-purple))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    ifOverflow="extendDomain"
                    label={{ value: "Revised", position: "right", fontSize: 9, fill: "hsl(var(--bp-purple))" }}
                  />
                )}
              </ComposedChart>
            ) : (
              <ComposedChart data={rows} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
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
                  domain={[0, axis.max > 0 ? axis.max : "auto"]}
                  ticks={axis.max > 0 ? axis.ticks : undefined}
                  allowDecimals={false}
                />
                <ChartTooltip content={<SCurveTooltip />} cursor={{ stroke: "hsl(var(--bp-border))", strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="cumulativeCosts"
                  name="Cumulative costs"
                  stroke="hsl(var(--bp-coral))"
                  strokeWidth={2}
                  fill="hsl(var(--bp-coral))"
                  fillOpacity={0.12}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeIn"
                  name="Cumulative received"
                  stroke="hsl(var(--bp-green))"
                  strokeWidth={2}
                  fill="hsl(var(--bp-green))"
                  fillOpacity={0.12}
                  dot={false}
                />
                {config.showPlannedCurve && (
                  <Line
                    type="monotone"
                    dataKey="cumulativePlanned"
                    name="Planned claims"
                    stroke="hsl(var(--bp-purple))"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                  />
                )}
                {config.showContractCeiling && data.contractCeiling > 0 && (
                  <ReferenceLine
                    y={data.contractCeiling}
                    stroke="hsl(var(--foreground) / 0.55)"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                    label={{ value: "Contract", position: "right", fontSize: 9, fontWeight: 600, fill: "hsl(var(--foreground) / 0.7)" }}
                  />
                )}
                {showVariationsLine && (
                  <ReferenceLine
                    y={data.contractPlusVariationsCeiling}
                    stroke="hsl(var(--bp-purple))"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    ifOverflow="extendDomain"
                    label={{ value: "Revised", position: "right", fontSize: 9, fill: "hsl(var(--bp-purple))" }}
                  />
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer: exact KPIs left, legend button + position/profit chips right */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 text-[10px] leading-tight">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mr-auto">
          <div className="flex items-center gap-1">
            <span className="text-[hsl(var(--bp-muted))]">In:</span>
            <span className="font-medium text-[hsl(var(--bp-card-foreground))] tabular-nums">
              {formatCurrency(data.summary.totalMoneyIn)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[hsl(var(--bp-muted))]">Bills:</span>
            <span className="font-medium text-[hsl(var(--bp-card-foreground))] tabular-nums">
              {formatCurrency(data.summary.totalMoneyOut)}
            </span>
          </div>
          {data.summary.totalLabour > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[hsl(var(--bp-muted))]">Labour:</span>
              <span className="font-medium text-[hsl(var(--bp-card-foreground))] tabular-nums">
                {formatCurrency(data.summary.totalLabour)}
              </span>
            </div>
          )}
        </div>

        {/* Legend on demand: hover the button for 1.5s */}
        <Tooltip delayDuration={1500}>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 text-[hsl(var(--bp-muted))]"
              aria-label="Chart legend"
              data-testid="cashflow-legend-button"
            >
              <Rows3 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="p-2">
            <div className="space-y-1 text-[10px]">
              {legendRows.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {r.swatch}
                  <span>{r.label}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>

        <div
          className="flex items-baseline gap-1.5 rounded-md border border-[hsl(var(--bp-border))] bg-[hsl(var(--bp-card))] px-2 py-0.5"
          data-testid="chip-net-position"
          title="Cash position = money received minus bills paid and labour"
        >
          <span className="text-[9px] uppercase tracking-wide text-[hsl(var(--bp-muted))]">Position</span>
          <span
            className={cn(
              "text-xs font-bold tabular-nums",
              net >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]",
            )}
          >
            {(net >= 0 ? "+" : "") + formatCurrency(net)}
          </span>
        </div>
        <div
          className="flex items-baseline gap-1.5 rounded-md border border-[hsl(var(--bp-border))] bg-[hsl(var(--bp-card))] px-2 py-0.5"
          data-testid="chip-job-profit"
          title="Profit to date = everything invoiced to the client minus all bills and labour, regardless of what's been paid yet"
        >
          <span className="text-[9px] uppercase tracking-wide text-[hsl(var(--bp-muted))]">Profit</span>
          <span
            className={cn(
              "text-xs font-bold tabular-nums",
              jobProfit >= 0 ? "text-[hsl(var(--bp-green))]" : "text-[hsl(var(--bp-coral))]",
            )}
          >
            {(jobProfit >= 0 ? "+" : "") + formatCurrency(jobProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { WidgetProps, Widget } from "@/types/widgets";
import { Check, ExternalLink } from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PnLPeriod = "month" | "quarter" | "ytd" | "year";
export type GstMode = "ex" | "inc";

interface PnLResponse {
  period: PnLPeriod;
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null;
  overheads: number;
  netProfit: number;
  netMargin: number | null;
  gstCollected: number | null;
}

const PERIOD_LABEL: Record<PnLPeriod, string> = {
  month: "This month",
  quarter: "This quarter",
  ytd: "Year to date",
  year: "This year",
};

const PERIOD_BADGE: Record<PnLPeriod, string> = {
  month: "Month",
  quarter: "Quarter",
  ytd: "YTD",
  year: "Year",
};

const GST_MULTIPLIER = 1.1;

function readPeriod(widget: Widget): PnLPeriod {
  const p = widget.config?.period;
  if (p === "month" || p === "quarter" || p === "year" || p === "ytd") return p;
  return "ytd";
}

function readGstMode(widget: Widget): GstMode {
  const m = widget.config?.gstMode;
  return m === "inc" ? "inc" : "ex";
}

function fmtCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function BusinessPnLHeaderExtra({
  widget,
  onUpdate,
}: {
  widget: Widget;
  onUpdate: (w: Widget) => void;
}) {
  const period = readPeriod(widget);
  const gst = readGstMode(widget);
  const toggleGst = () => {
    onUpdate({
      ...widget,
      config: { ...(widget.config || {}), gstMode: gst === "ex" ? "inc" : "ex" },
    });
  };
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="bg-bp-amber/15 text-bp-amber text-[11px] font-medium px-2.5 py-0.5 rounded-full"
        data-testid="pnl-period-badge"
      >
        {PERIOD_BADGE[period]}
      </span>
      <button
        type="button"
        onClick={toggleGst}
        className={cn(
          "text-[11px] font-medium px-2.5 py-0.5 rounded-full hover-elevate",
          gst === "inc"
            ? "bg-bp-teal/15 text-bp-teal"
            : "bg-bp-subtle text-bp-muted",
        )}
        data-testid="pnl-gst-toggle"
        title={gst === "ex" ? "Showing ex-GST. Click to add 10% GST." : "Showing inc-GST. Click to remove GST."}
      >
        {gst === "ex" ? "ex GST" : "inc GST"}
      </button>
    </div>
  );
}

export function BusinessPnLMenuItems({
  widget,
  onUpdate,
}: {
  widget: Widget;
  onUpdate: (w: Widget) => void;
}) {
  const period = readPeriod(widget);
  const setPeriod = (p: PnLPeriod) => {
    onUpdate({ ...widget, config: { ...(widget.config || {}), period: p } });
  };
  return (
    <>
      <DropdownMenuLabel className="text-[10px] uppercase text-bp-muted">
        Period
      </DropdownMenuLabel>
      {(["month", "quarter", "ytd", "year"] as PnLPeriod[]).map((p) => (
        <DropdownMenuItem
          key={p}
          onClick={() => setPeriod(p)}
          data-testid={`pnl-period-${p}`}
        >
          <Check className={cn("h-3.5 w-3.5 mr-2", period === p ? "opacity-100" : "opacity-0")} />
          {PERIOD_LABEL[p]}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => window.open("https://go.xero.com/Reports/ReportProfitAndLoss.aspx", "_blank")}
        data-testid="pnl-open-xero"
      >
        <ExternalLink className="h-3.5 w-3.5 mr-2" />
        Open in Xero
      </DropdownMenuItem>
    </>
  );
}

interface RowProps {
  label: string;
  value: string;
  bold?: boolean;
  emphasis?: "income" | "expense" | "summary" | "muted";
  rightExtra?: string | null;
  testId?: string;
}

function LedgerRow({ label, value, bold, emphasis, rightExtra, testId }: RowProps) {
  let labelClass = "text-bp-card-foreground";
  let valueClass = "text-bp-card-foreground";
  if (emphasis === "income") {
    valueClass = "text-bp-green";
  } else if (emphasis === "expense") {
    valueClass = "text-bp-coral";
  } else if (emphasis === "muted") {
    labelClass = "text-bp-muted";
    valueClass = "text-bp-muted";
  }
  return (
    <div
      className="flex items-baseline justify-between py-1.5 border-b border-bp-border/60 gap-2"
      data-testid={testId}
    >
      <span className={cn("text-xs", labelClass, bold && "font-semibold")}>{label}</span>
      <div className="flex items-baseline gap-2">
        {rightExtra && (
          <span className="text-[10px] text-bp-muted tabular-nums">{rightExtra}</span>
        )}
        <span
          className={cn(
            "text-sm tabular-nums",
            valueClass,
            bold && "font-semibold",
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

export default function BusinessPnLWidget({ widget }: WidgetProps) {
  const period = readPeriod(widget);
  const gst = readGstMode(widget);

  const { data, isLoading, isError, error, refetch } = useQuery<PnLResponse>({
    queryKey: ["/api/business/pnl", period],
    queryFn: async () => {
      const r = await fetch(`/api/business/pnl?period=${period}`, { credentials: "include" });
      if (r.status === 503) {
        const body = await r.json().catch(() => ({}));
        const err = new Error(body?.error || "xero_unavailable");
        (err as any).status = 503;
        (err as any).code = body?.error;
        throw err;
      }
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
    retry: (failureCount, err: any) => {
      if (err?.status === 503) return false;
      return failureCount < 2;
    },
  });

  if (isLoading) return <WidgetSkeleton rows={6} />;
  if (isError) {
    const code = (error as any)?.code;
    if (code === "xero_unavailable") {
      return (
        <WidgetEmpty
          title="Xero not connected"
          message="Connect Xero in Settings → Integrations to load your live P&L."
        />
      );
    }
    return <WidgetError onRetry={() => refetch()} message="Couldn't load P&L report." />;
  }
  if (!data) return <WidgetEmpty title="No P&L data" />;

  const multi = gst === "inc" ? GST_MULTIPLIER : 1;
  const revenue = data.revenue * multi;
  const cogs = data.cogs;
  const grossProfit = revenue - cogs;
  const overheads = data.overheads;
  const netProfit = grossProfit - overheads;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : null;

  // Footer: show raw Xero figures only when GST mode shifts the display
  const showFooter = gst === "inc";

  return (
    <div className="flex flex-col h-full" data-testid="widget-pnl">
      <div className="text-[10px] text-bp-muted mb-2">
        {data.from} → {data.to} · {gst === "inc" ? "inc GST" : "ex GST"}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <LedgerRow
          label="Revenue"
          value={fmtCurrency(revenue)}
          emphasis="income"
          bold
          testId="pnl-revenue"
        />
        <LedgerRow
          label="Cost of Goods Sold"
          value={`(${fmtCurrency(cogs)})`}
          emphasis="expense"
          testId="pnl-cogs"
        />
        <LedgerRow
          label="Gross Profit"
          value={fmtCurrency(grossProfit)}
          rightExtra={fmtPercent(grossMargin)}
          bold
          emphasis="summary"
          testId="pnl-gross-profit"
        />
        <LedgerRow
          label="Overheads"
          value={`(${fmtCurrency(overheads)})`}
          emphasis="expense"
          testId="pnl-overheads"
        />
        <LedgerRow
          label="Net Profit"
          value={fmtCurrency(netProfit)}
          rightExtra={fmtPercent(netMargin)}
          bold
          emphasis={netProfit >= 0 ? "income" : "expense"}
          testId="pnl-net-profit"
        />
      </div>

      {showFooter && (
        <div className="mt-2 pt-2 border-t border-bp-border text-[10px] text-bp-muted">
          Xero (raw): Revenue {fmtCurrency(data.revenue)} · Net{" "}
          {fmtCurrency(data.revenue - data.cogs - data.overheads)}
        </div>
      )}
    </div>
  );
}

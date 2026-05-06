import { useQuery } from "@tanstack/react-query";
import type { WidgetProps, Widget } from "@/types/widgets";
import { Check } from "lucide-react";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type FinancialPeriod = "month" | "quarter" | "ytd" | "year";

interface FinancialSummary {
  period: FinancialPeriod;
  revenue: number;
  collected: number;
  wip: number | null;
  billsPaid: number | null;
  outstanding: number;
  overdue: number;
  netPosition: number | null;
  grossMargin: number | null;
  xeroBalance: number | null;
  xeroAccountCount: number;
  xeroError: string | null;
  canViewBills: boolean;
}

const PERIOD_LABEL: Record<FinancialPeriod, string> = {
  month: "This month",
  quarter: "This quarter",
  ytd: "Year to date",
  year: "This year",
};

const PERIOD_BADGE: Record<FinancialPeriod, string> = {
  month: "Month",
  quarter: "Quarter",
  ytd: "YTD",
  year: "Year",
};

function readPeriod(widget: Widget): FinancialPeriod {
  const p = widget.config?.period;
  if (p === "month" || p === "quarter" || p === "year" || p === "ytd") return p;
  return "ytd";
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

interface CellProps {
  label: string;
  value: string;
  subLabel?: string;
  valueColor: string;
  barColor: string;
  rowBg?: string;
  testId?: string;
}

function MetricCell({ label, value, subLabel, valueColor, barColor, rowBg, testId }: CellProps) {
  return (
    <div
      className={cn(
        "relative pl-3 pr-2 py-2 min-h-[64px] flex flex-col justify-center",
        rowBg,
      )}
      data-testid={testId}
    >
      <div className={cn("absolute left-0 top-2 bottom-2 w-[3px] rounded-sm", barColor)} />
      <div className="text-[9px] uppercase font-medium text-bp-muted leading-none tracking-wide">
        {label}
      </div>
      <div className={cn("text-[20px] font-bold leading-tight mt-1 truncate", valueColor)}>
        {value}
      </div>
      {subLabel && (
        <div className="text-[9px] text-bp-muted leading-tight mt-0.5 truncate">{subLabel}</div>
      )}
    </div>
  );
}

export function BusinessFinancialsPeriodBadge({ widget }: { widget: Widget }) {
  const period = readPeriod(widget);
  return (
    <span
      className="bg-bp-amber/15 text-bp-amber text-[11px] font-medium px-2.5 py-0.5 rounded-full"
      data-testid="financial-summary-period-badge"
    >
      {PERIOD_BADGE[period]}
    </span>
  );
}

export function BusinessFinancialsMenuItems({
  widget,
  onUpdate,
}: {
  widget: Widget;
  onUpdate: (w: Widget) => void;
}) {
  const period = readPeriod(widget);
  const setPeriod = (p: FinancialPeriod) => {
    onUpdate({ ...widget, config: { ...(widget.config || {}), period: p } });
  };
  return (
    <>
      <DropdownMenuLabel className="text-[10px] uppercase text-bp-muted">
        Period
      </DropdownMenuLabel>
      {(["month", "quarter", "ytd", "year"] as FinancialPeriod[]).map((p) => (
        <DropdownMenuItem
          key={p}
          onClick={() => setPeriod(p)}
          data-testid={`financial-summary-period-${p}`}
        >
          <Check className={cn("h-3.5 w-3.5 mr-2", period === p ? "opacity-100" : "opacity-0")} />
          {PERIOD_LABEL[p]}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
    </>
  );
}

export default function BusinessFinancialsWidget({ widget }: WidgetProps) {
  const period = readPeriod(widget);
  const { data, isLoading, isError, refetch } = useQuery<FinancialSummary>({
    queryKey: ["/api/business/financial-summary", period],
    queryFn: async () => {
      const r = await fetch(`/api/business/financial-summary?period=${period}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (isError || !data) {
    return <WidgetError onRetry={() => refetch()} message="Couldn't load financial summary." />;
  }
  const d = data;

  // Net Position colors + sign arrow
  const netSign = d.netPosition === null ? "" : d.netPosition >= 0 ? "↑ " : "↓ ";
  const netColor =
    d.netPosition === null ? "text-bp-muted" : d.netPosition >= 0 ? "text-bp-green" : "text-bp-coral";
  const netBar =
    d.netPosition === null ? "bg-bp-border" : d.netPosition >= 0 ? "bg-bp-green" : "bg-bp-coral";
  const netValue =
    d.netPosition === null
      ? "—"
      : `${netSign}${fmtCurrency(Math.abs(d.netPosition))}`;

  // Gross margin tiers: >20% green, 10-20% amber, <10% coral
  let marginColor = "text-bp-muted";
  let marginBar = "bg-bp-border";
  if (d.grossMargin !== null) {
    if (d.grossMargin > 20) {
      marginColor = "text-bp-green";
      marginBar = "bg-bp-green";
    } else if (d.grossMargin >= 10) {
      marginColor = "text-bp-amber";
      marginBar = "bg-bp-amber";
    } else {
      marginColor = "text-bp-coral";
      marginBar = "bg-bp-coral";
    }
  }

  const xeroErr = d.xeroError;
  const xeroSub =
    xeroErr === "not_connected"
      ? "Connect Xero"
      : xeroErr
      ? "Xero unavailable"
      : d.xeroAccountCount > 0
      ? `${d.xeroAccountCount} ${d.xeroAccountCount === 1 ? "account" : "accounts"}`
      : "No accounts";

  return (
    <div
      className="grid grid-cols-3 grid-rows-3 h-full divide-x divide-y divide-bp-border -mx-4 -mb-4"
      data-testid="widget-financial-summary"
    >
      {/* Row 1 - Income */}
      <MetricCell
        label="Revenue"
        value={fmtCurrency(d.revenue)}
        subLabel="Sent + paid"
        valueColor="text-bp-green"
        barColor="bg-bp-green"
        testId="cell-revenue"
      />
      <MetricCell
        label="Collected"
        value={fmtCurrency(d.collected)}
        subLabel="Payments received"
        valueColor="text-bp-teal"
        barColor="bg-bp-teal"
        testId="cell-collected"
      />
      <MetricCell
        label="WIP"
        value={d.wip === null ? "—" : fmtCurrency(d.wip)}
        subLabel={d.wip === null ? "Not configured" : "Unbilled work"}
        valueColor={d.wip === null ? "text-bp-muted" : "text-bp-purple"}
        barColor={d.wip === null ? "bg-bp-border" : "bg-bp-purple"}
        testId="cell-wip"
      />
      {/* Row 2 - Costs */}
      <MetricCell
        label="Bills Paid"
        value={d.billsPaid === null ? "—" : fmtCurrency(d.billsPaid)}
        subLabel={d.billsPaid === null ? "Permission required" : "Suppliers + bills"}
        valueColor={d.billsPaid === null ? "text-bp-muted" : "text-bp-coral"}
        barColor={d.billsPaid === null ? "bg-bp-border" : "bg-bp-coral"}
        testId="cell-bills-paid"
      />
      <MetricCell
        label="Outstanding"
        value={fmtCurrency(d.outstanding)}
        subLabel="Awaiting payment"
        valueColor="text-bp-amber"
        barColor="bg-bp-amber"
        testId="cell-outstanding"
      />
      <MetricCell
        label="Overdue"
        value={fmtCurrency(d.overdue)}
        subLabel="Past due date"
        valueColor="text-bp-coral"
        barColor="bg-bp-coral"
        testId="cell-overdue"
      />
      {/* Row 3 - Summary */}
      <MetricCell
        label="Net Position"
        value={netValue}
        subLabel="Revenue − Bills"
        valueColor={netColor}
        barColor={netBar}
        rowBg="bg-bp-subtle"
        testId="cell-net-position"
      />
      <MetricCell
        label="Gross Margin"
        value={fmtPercent(d.grossMargin)}
        subLabel="(Rev − Bills) ÷ Rev"
        valueColor={marginColor}
        barColor={marginBar}
        rowBg="bg-bp-subtle"
        testId="cell-gross-margin"
      />
      <MetricCell
        label="Xero Balance"
        value={xeroErr ? "—" : fmtCurrency(d.xeroBalance)}
        subLabel={xeroSub}
        valueColor={xeroErr ? "text-bp-muted" : "text-bp-teal"}
        barColor={xeroErr ? "bg-bp-border" : "bg-bp-teal"}
        rowBg="bg-bp-subtle"
        testId="cell-xero-balance"
      />
    </div>
  );
}

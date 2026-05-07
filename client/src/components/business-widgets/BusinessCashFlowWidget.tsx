import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import type { WidgetProps } from "@/types/widgets";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatCurrency } from "@/lib/formatters";

interface BillRow {
  id: string;
  paidAmount?: string | number | null;
  total?: string | number | null;
  billDate?: string | null;
  dueDate?: string | null;
  status?: string | null;
}
interface InvoiceRow {
  id: string;
  paidAmount?: string | number | null;
  totalAmount?: string | number | null;
  invoiceDate?: string | null;
  paidAt?: string | null;
  status?: string | null;
}

function toCents(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleString("en-AU", { month: "short" });
}

function monthBuckets(count: number): { key: string; label: string; date: Date }[] {
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  const buckets: { key: string; label: string; date: Date }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    buckets.push({ key: monthKey(d), label: monthLabel(d), date: d });
  }
  return buckets;
}

function CashFlowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-bp-card border border-bp-border rounded-md shadow-sm p-2 text-[11px]">
      <p className="font-semibold mb-1">{row.label}</p>
      <p className="text-bp-green">In: {formatCurrency(row.inCents)}</p>
      <p className="text-bp-coral">Out: {formatCurrency(row.outCents)}</p>
      <p className="font-medium mt-1">Net: {formatCurrency(row.netCents)}</p>
    </div>
  );
}

export default function BusinessCashFlowWidget(_: WidgetProps) {
  const billsQ = useQuery<BillRow[]>({ queryKey: ["/api/bills"] });
  const invoicesQ = useQuery<InvoiceRow[]>({ queryKey: ["/api/client-invoices"] });

  const chartData = useMemo(() => {
    const buckets = monthBuckets(6);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const rows = buckets.map((b) => ({
      key: b.key,
      label: b.label,
      inCents: 0,
      outCents: 0,
      netCents: 0,
    }));

    for (const inv of invoicesQ.data || []) {
      const d = inv.paidAt ? new Date(inv.paidAt) : inv.invoiceDate ? new Date(inv.invoiceDate) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      const k = monthKey(new Date(d.getFullYear(), d.getMonth(), 1));
      const i = idx.get(k);
      if (i == null) continue;
      rows[i].inCents += toCents(inv.paidAmount);
    }
    for (const bill of billsQ.data || []) {
      const d = bill.billDate ? new Date(bill.billDate) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      const k = monthKey(new Date(d.getFullYear(), d.getMonth(), 1));
      const i = idx.get(k);
      if (i == null) continue;
      rows[i].outCents += toCents(bill.paidAmount);
    }
    rows.forEach((r) => (r.netCents = r.inCents - r.outCents));
    return rows;
  }, [billsQ.data, invoicesQ.data]);

  const totals = useMemo(() => {
    const totalIn = chartData.reduce((s, r) => s + r.inCents, 0);
    const totalOut = chartData.reduce((s, r) => s + r.outCents, 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [chartData]);

  if (billsQ.isLoading || invoicesQ.isLoading) return <WidgetSkeleton />;
  if (billsQ.isError || invoicesQ.isError) {
    return (
      <WidgetError
        onRetry={() => {
          billsQ.refetch();
          invoicesQ.refetch();
        }}
        message="Couldn't load cash flow."
      />
    );
  }
  const hasData = chartData.some((r) => r.inCents > 0 || r.outCents > 0);
  if (!hasData) return <WidgetEmpty message="No cash flow activity in the last 6 months" />;

  return (
    <div className="flex flex-col h-full" data-testid="widget-business-cash-flow">
      <div className="flex items-center gap-5 px-5 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-bp-muted">Money in</p>
          <p className="text-[20px] font-bold text-bp-green leading-tight">
            {formatCurrency(totals.totalIn)}
          </p>
        </div>
        <div className="w-px self-stretch bg-bp-border" />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-bp-muted">Money out</p>
          <p className="text-[20px] font-bold text-bp-coral leading-tight">
            {formatCurrency(totals.totalOut)}
          </p>
        </div>
        <div className="w-px self-stretch bg-bp-border" />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-bp-muted">Net</p>
          <p
            className={`text-[20px] font-bold leading-tight ${totals.net >= 0 ? "text-bp-green" : "text-bp-coral"}`}
          >
            {formatCurrency(totals.net)}
          </p>
        </div>
      </div>
      <div className="flex-1 px-2 pb-4 min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={160}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--bp-border))" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--bp-muted))" }}
            />
            <YAxis hide />
            <Tooltip content={<CashFlowTooltip />} cursor={{ fill: "hsl(var(--bp-border) / 0.2)" }} />
            <ReferenceLine y={0} stroke="hsl(var(--bp-border))" />
            <Bar dataKey="inCents" name="In" fill="hsl(var(--bp-green))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="outCents" name="Out" fill="hsl(var(--bp-coral))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

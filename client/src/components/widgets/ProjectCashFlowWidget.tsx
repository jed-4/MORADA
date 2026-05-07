import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2 } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatCurrency, formatRelativeDistance } from "@/lib/formatters";
import { Button } from "@/components/ui/button";

interface BillRow {
  id: string;
  total?: string | number | null;
  paidAmount?: string | number | null;
  status?: string | null;
}
interface InvoiceRow {
  id: string;
  projectId?: string | null;
  totalAmount?: string | number | null;
  paidAmount?: string | number | null;
  status?: string | null;
}

function toCents(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ProjectCashFlowWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const allowed = useFinancialPermission();
  const projectId = currentProject?.id;
  const freshKey = projectId ? `bp.cashflow.confirmedAt:${projectId}` : null;
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!freshKey) return;
    setConfirmedAt(localStorage.getItem(freshKey));
  }, [freshKey]);

  const billsQ = useQuery<BillRow[]>({
    queryKey: ["/api/bills", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const r = await fetch(`/api/bills?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId && allowed,
  });

  const invoicesQ = useQuery<InvoiceRow[]>({
    queryKey: ["/api/client-invoices", "all"],
    queryFn: async () => {
      const r = await fetch(`/api/client-invoices`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId && allowed,
  });

  if (!currentProject) return <WidgetEmpty message="Select a project to view cash flow" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (billsQ.isLoading || invoicesQ.isLoading) return <WidgetSkeleton />;
  if (billsQ.isError || invoicesQ.isError) {
    return (
      <WidgetError
        onRetry={() => {
          billsQ.refetch();
          invoicesQ.refetch();
        }}
      />
    );
  }

  const projectInvoices = (invoicesQ.data || []).filter((i) => i.projectId === projectId);
  const moneyIn = projectInvoices.reduce((sum, i) => sum + toCents(i.paidAmount), 0);
  const invoicedTotal = projectInvoices.reduce((sum, i) => sum + toCents(i.totalAmount), 0);
  const outstanding = Math.max(0, invoicedTotal - moneyIn);

  const bills = billsQ.data || [];
  const moneyOut = bills.reduce((sum, b) => sum + toCents(b.paidAmount), 0);
  const billsTotal = bills.reduce((sum, b) => sum + toCents(b.total), 0);
  const billsOutstanding = Math.max(0, billsTotal - moneyOut);

  const net = moneyIn - moneyOut;

  const handleConfirm = () => {
    if (!freshKey) return;
    const now = new Date().toISOString();
    localStorage.setItem(freshKey, now);
    setConfirmedAt(now);
  };

  return (
    <div className="flex flex-col h-full p-4 gap-3" data-testid="widget-cash-flow">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <ArrowDownCircle className="h-3 w-3 text-bp-green" /> Money in
          </p>
          <p className="text-xl font-bold text-bp-green leading-tight" data-testid="text-money-in">
            {formatCurrency(moneyIn)}
          </p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(outstanding)} outstanding</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <ArrowUpCircle className="h-3 w-3 text-bp-coral" /> Money out
          </p>
          <p className="text-xl font-bold text-bp-coral leading-tight" data-testid="text-money-out">
            {formatCurrency(moneyOut)}
          </p>
          <p className="text-[10px] text-muted-foreground">{formatCurrency(billsOutstanding)} unpaid</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">Net position</span>
        <span
          className={`text-base font-bold ${net >= 0 ? "text-bp-green" : "text-bp-coral"}`}
          data-testid="text-net-position"
        >
          {formatCurrency(net)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">
          {confirmedAt ? `Confirmed ${formatRelativeDistance(confirmedAt)}` : "Not confirmed yet"}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleConfirm}
          className="h-7 text-xs"
          data-testid="button-confirm-cashflow"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Confirm
        </Button>
      </div>
    </div>
  );
}

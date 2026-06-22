import { useState, useEffect } from "react";
import { FileText, AlertCircle, ArrowRight } from "lucide-react";
import { WidgetProps, Widget } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty } from "@/components/ui/widget-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocation } from "wouter";

type RowKey = "total" | "paid" | "outstanding" | "partial" | "draft" | "remaining";

const ROW_CONFIG: { key: RowKey; configKey: string; label: string }[] = [
  { key: "total", configKey: "showTotal", label: "Total invoiced" },
  { key: "paid", configKey: "showPaid", label: "Paid" },
  { key: "outstanding", configKey: "showOutstanding", label: "Outstanding" },
  { key: "partial", configKey: "showPartial", label: "Partial" },
  { key: "draft", configKey: "showDraft", label: "Draft" },
  { key: "remaining", configKey: "showRemaining", label: "Remaining to invoice" },
];

function AmountRow({
  label,
  value,
  count,
  hint,
  valueClass,
  testId,
}: {
  label: string;
  value: string;
  count?: number;
  hint?: string;
  valueClass?: string;
  testId?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 py-1.5"
      data-testid={testId}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        {count != null && (
          <Badge variant="secondary" className="text-[10px]">
            {count}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {hint && (
          <span className="text-[10px] text-muted-foreground tabular-nums">{hint}</span>
        )}
        <span className={`text-sm font-semibold tabular-nums ${valueClass ?? ""}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

export default function InvoicesSummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, formatCurrency, formatPercentage } = useProjectMetrics();
  const allowed = useFinancialPermission();
  const [, navigate] = useLocation();
  const [editingTitle, setEditingTitle] = useState(widget.title);

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  // Default everything visible when config is absent.
  const isRowVisible = (configKey: string) => widget.config?.[configKey] !== false;
  const showOverdueAlert = widget.config?.showOverdueAlert !== false;

  const updateConfig = (patch: Record<string, unknown>) => {
    if (!onUpdate) return;
    onUpdate({ ...widget, config: { ...(widget.config || {}), ...patch } } as Widget);
  };

  // Configuration mode
  if (isConfiguring) {
    const handleSaveTitle = () => {
      if (onUpdate) onUpdate({ ...widget, title: editingTitle });
    };

    return (
      <div className="space-y-4 p-3">
        <div className="space-y-2">
          <Label className="text-xs">Widget name</Label>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={handleSaveTitle}
            className="h-8 text-xs"
            placeholder="Widget title"
            data-testid="input-invoices-widget-title"
          />
        </div>

        <div className="space-y-1 pt-2 border-t">
          <Label className="text-xs text-muted-foreground">Rows to show</Label>
          {ROW_CONFIG.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-2 py-1">
              <Label className="text-xs font-normal">{row.label}</Label>
              <Switch
                checked={isRowVisible(row.configKey)}
                onCheckedChange={(v) => updateConfig({ [row.configKey]: !!v })}
                aria-label={`Show ${row.label}`}
                data-testid={`switch-invoices-${row.key}`}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Label className="text-xs font-normal">Overdue alert</Label>
          <Switch
            checked={showOverdueAlert}
            onCheckedChange={(v) => updateConfig({ showOverdueAlert: !!v })}
            aria-label="Show overdue alert"
            data-testid="switch-invoices-overdue-alert"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button
            size="sm"
            onClick={() => {
              handleSaveTitle();
              onCloseConfig?.();
            }}
            className="h-7 px-3 text-xs"
            data-testid="button-invoices-config-done"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view invoices" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;

  const invoicesPath = currentProject?.id
    ? `/projects/${currentProject.id}/client-invoices`
    : "/invoices";

  if (metrics.nonCancelledInvoicesCount === 0) {
    return (
      <WidgetEmpty
        message="No invoices on this project yet"
        action={{ label: "Create an invoice", onClick: () => navigate(invoicesPath) }}
      />
    );
  }

  const rows: Record<RowKey, JSX.Element> = {
    total: (
      <AmountRow
        key="total"
        label="Total invoiced"
        value={formatCurrency(metrics.invoicedAmount)}
        count={metrics.nonCancelledInvoicesCount}
        hint={`${formatPercentage(metrics.invoicedPercentage)} of contract`}
        testId="row-invoices-total"
      />
    ),
    paid: (
      <AmountRow
        key="paid"
        label="Paid"
        value={formatCurrency(metrics.paidInvoices)}
        count={metrics.paidInvoicesCount}
        valueClass="text-bp-green"
        testId="row-invoices-paid"
      />
    ),
    outstanding: (
      <AmountRow
        key="outstanding"
        label="Outstanding"
        value={formatCurrency(metrics.sentAmount)}
        count={metrics.sentInvoicesCount}
        valueClass="text-bp-amber"
        testId="row-invoices-outstanding"
      />
    ),
    partial: (
      <AmountRow
        key="partial"
        label="Partial"
        value={formatCurrency(metrics.partialAmount)}
        count={metrics.partialInvoicesCount}
        valueClass="text-bp-teal"
        testId="row-invoices-partial"
      />
    ),
    draft: (
      <AmountRow
        key="draft"
        label="Draft"
        value={formatCurrency(metrics.draftAmount)}
        count={metrics.draftInvoicesCount}
        valueClass="text-muted-foreground"
        testId="row-invoices-draft"
      />
    ),
    remaining: (
      <AmountRow
        key="remaining"
        label="Remaining to invoice"
        value={formatCurrency(metrics.remainingToInvoice)}
        testId="row-invoices-remaining"
      />
    ),
  };

  const visibleRows = ROW_CONFIG.filter((r) => isRowVisible(r.configKey));

  return (
    <div className="flex flex-col h-full p-4 gap-2" data-testid="widget-invoices-summary">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-bp-amber" />
        <span className="font-medium text-sm">{widget.title || "Client Invoices"}</span>
      </div>

      {/* Overdue alert */}
      {showOverdueAlert && metrics.overdueInvoices > 0 && (
        <div
          className="flex items-center gap-2 rounded-md bg-bp-coral/10 px-2.5 py-2"
          data-testid="alert-invoices-overdue"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-bp-coral" />
          <span className="text-xs text-bp-coral">
            {metrics.overdueInvoices} overdue · {formatCurrency(metrics.overdueAmount)} · oldest{" "}
            {metrics.oldestOverdueDays} day{metrics.oldestOverdueDays === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Amount list */}
      <div className="divide-y divide-border">
        {visibleRows.map((r) => rows[r.key])}
      </div>

      {/* View All */}
      <Button
        variant="ghost"
        size="sm"
        className="mt-auto w-full justify-between text-xs"
        onClick={() => navigate(invoicesPath)}
        data-testid="button-view-all-invoices"
      >
        <span>View all invoices</span>
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { LedgerRow, SummaryAlert, DOT, SAGE_TEXT, AMBER_TEXT, TEAL_TEXT, CORAL_TEXT } from "./summary-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

type RowKey = "total" | "paid" | "outstanding" | "partial" | "draft" | "remaining";

const ROW_CONFIG: { key: RowKey; configKey: string; label: string }[] = [
  // "Total invoiced" is ISSUED invoices only — drafts get their own row below.
  { key: "total", configKey: "showTotal", label: "Total invoiced" },
  { key: "paid", configKey: "showPaid", label: "Paid" },
  { key: "outstanding", configKey: "showOutstanding", label: "Outstanding" },
  { key: "partial", configKey: "showPartial", label: "Partial" },
  { key: "draft", configKey: "showDraft", label: "Draft" },
  { key: "remaining", configKey: "showRemaining", label: "Remaining to invoice" },
];

export default function InvoicesSummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, isError, formatCurrency, formatPercentage } = useProjectMetrics();
  const allowed = useFinancialPermission();
  const [, navigate] = useLocation();

  const invoicesPath = currentProject?.id
    ? `/projects/${currentProject.id}/client-invoices`
    : "/invoices";

  // Default everything visible when config is absent.
  const isRowVisible = (configKey: string) => widget.config?.[configKey] !== false;
  const showOverdueAlert = widget.config?.showOverdueAlert !== false;

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; config: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, config: {} });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  // Hover arrow in the widget header → client invoices page
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => navigate(invoicesPath)}
              data-testid="invoices-widget-open-full"
              aria-label="Open invoices"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All invoices</TooltipContent>
        </Tooltip>
      ) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  if (isConfiguring && draft) {
    const cfg = { ...widget.config, ...draft.config } as Record<string, any>;
    const stage = (key: string, value: unknown) =>
      setDraft(prev => prev && { ...prev, config: { ...prev.config, [key]: value } });
    const cancelConfig = () => { setDraft(null); onCloseConfig?.(); };
    const saveConfig = () => {
      onUpdate?.({
        ...widget,
        title: draft.title.trim() || widget.title,
        config: { ...widget.config, ...draft.config },
      });
      setDraft(null);
      onCloseConfig?.();
    };

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="invoices-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={draft.title}
            onChange={e => setDraft(prev => prev && { ...prev, title: e.target.value })}
            className="h-8 text-xs"
            placeholder="Widget title"
            data-testid="input-invoices-widget-title"
          />
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Rows to show
          </p>
          {ROW_CONFIG.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-2">
              <Label className="text-xs font-normal">{row.label}</Label>
              <Switch
                checked={cfg[row.configKey] !== false}
                onCheckedChange={v => stage(row.configKey, !!v)}
                aria-label={`Show ${row.label}`}
                data-testid={`switch-invoices-${row.key}`}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1 border-t">
            <Label className="text-xs font-normal">Overdue alert</Label>
            <Switch
              checked={cfg.showOverdueAlert !== false}
              onCheckedChange={v => stage("showOverdueAlert", !!v)}
              aria-label="Show overdue alert"
              data-testid="switch-invoices-overdue-alert"
            />
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="button-invoices-config-done">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view invoices" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError />;

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
      <LedgerRow
        key="total"
        label="Total invoiced"
        count={metrics.nonCancelledInvoicesCount}
        hint={`${formatPercentage(metrics.invoicedPercentage)} of contract · inc GST`}
        value={formatCurrency(metrics.invoicedAmount)}
        testId="row-invoices-total"
      />
    ),
    paid: (
      <LedgerRow
        key="paid"
        label="Paid"
        count={metrics.paidInvoicesCount}
        value={formatCurrency(metrics.paidInvoices)}
        valueStyle={SAGE_TEXT}
        dot={DOT.sage}
        testId="row-invoices-paid"
      />
    ),
    outstanding: (
      <LedgerRow
        key="outstanding"
        label="Outstanding"
        count={metrics.sentInvoicesCount}
        hint="unpaid balance"
        value={formatCurrency(metrics.sentAmount)}
        valueStyle={AMBER_TEXT}
        dot={DOT.amber}
        testId="row-invoices-outstanding"
      />
    ),
    partial: (
      <LedgerRow
        key="partial"
        label="Partial"
        count={metrics.partialInvoicesCount}
        value={formatCurrency(metrics.partialAmount)}
        valueStyle={TEAL_TEXT}
        dot={DOT.teal}
        testId="row-invoices-partial"
      />
    ),
    draft: (
      <LedgerRow
        key="draft"
        label="Draft"
        count={metrics.draftInvoicesCount}
        value={formatCurrency(metrics.draftAmount)}
        valueStyle={{ color: "hsl(var(--muted-foreground))" }}
        dot={DOT.muted}
        testId="row-invoices-draft"
      />
    ),
    remaining: (
      <LedgerRow
        key="remaining"
        label="Remaining to invoice"
        value={formatCurrency(metrics.remainingToInvoice)}
        valueStyle={metrics.remainingToInvoice < 0 ? CORAL_TEXT : undefined}
        testId="row-invoices-remaining"
      />
    ),
  };

  const visibleRows = ROW_CONFIG.filter((r) => isRowVisible(r.configKey));

  return (
    <div className="flex flex-col h-full gap-2" data-testid="widget-invoices-summary">
      {showOverdueAlert && metrics.overdueInvoices > 0 && (
        <SummaryAlert testId="alert-invoices-overdue">
          {metrics.overdueInvoices} overdue · {formatCurrency(metrics.overdueAmount)} · oldest{" "}
          {metrics.oldestOverdueDays} day{metrics.oldestOverdueDays === 1 ? "" : "s"}
        </SummaryAlert>
      )}

      <div className="border-t-2 border-foreground pt-1 px-0.5">
        {visibleRows.map((r) => rows[r.key])}
      </div>
    </div>
  );
}

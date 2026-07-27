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

type RowKey = "paid" | "pending" | "approved" | "overdue";

const ROW_CONFIG: { key: RowKey; configKey: string; label: string }[] = [
  { key: "paid", configKey: "showPaid", label: "Paid" },
  { key: "pending", configKey: "showPending", label: "Pending" },
  { key: "approved", configKey: "showApproved", label: "Approved" },
  { key: "overdue", configKey: "showOverdue", label: "Overdue" },
];

export default function BillsSummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, isError, formatCurrency } = useProjectMetrics();
  const allowed = useFinancialPermission();
  const [, navigate] = useLocation();

  const billsPath = currentProject?.id ? `/projects/${currentProject.id}/bills` : "/bills";

  const isRowVisible = (configKey: string) => widget.config?.[configKey] !== false;
  const showOverdueAlert = widget.config?.showOverdueAlert !== false;
  const showCounts = widget.config?.showCounts !== false;

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; config: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, config: {} });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  // Hover arrow in the widget header → bills page
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => navigate(billsPath)}
              data-testid="bills-widget-open-full"
              aria-label="Open bills"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All bills</TooltipContent>
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
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="bills-widget-config">
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
            Rows to show
          </p>
          {ROW_CONFIG.map(row => (
            <div key={row.key} className="flex items-center justify-between gap-2">
              <Label className="text-xs font-normal">{row.label}</Label>
              <Switch
                checked={cfg[row.configKey] !== false}
                onCheckedChange={v => stage(row.configKey, !!v)}
                data-testid={`switch-bills-${row.key}`}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1 border-t">
            <Label className="text-xs font-normal">Status counts</Label>
            <Switch
              checked={cfg.showCounts !== false}
              onCheckedChange={v => stage("showCounts", !!v)}
              data-testid="switch-bills-counts"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Overdue alert</Label>
            <Switch
              checked={cfg.showOverdueAlert !== false}
              onCheckedChange={v => stage("showOverdueAlert", !!v)}
              data-testid="switch-bills-overdue-alert"
            />
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="button-save-config">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view bills" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError />;

  if (metrics.totalBills === 0) {
    return (
      <WidgetEmpty
        message="No bills on this project yet"
        action={{ label: "Add a bill", onClick: () => navigate(billsPath) }}
      />
    );
  }

  const rows: Record<RowKey, JSX.Element> = {
    paid: (
      <LedgerRow
        key="paid"
        label="Paid"
        count={showCounts ? metrics.paidBills : undefined}
        value={formatCurrency(metrics.paidBillsIncGst)}
        valueStyle={SAGE_TEXT}
        dot={DOT.sage}
        testId="row-bills-paid"
      />
    ),
    pending: (
      <LedgerRow
        key="pending"
        label="Pending"
        count={showCounts ? metrics.pendingBills : undefined}
        value={formatCurrency(metrics.pendingBillsAmount)}
        valueStyle={AMBER_TEXT}
        dot={DOT.amber}
        testId="row-bills-pending"
      />
    ),
    approved: (
      <LedgerRow
        key="approved"
        label="Approved"
        count={showCounts ? metrics.approvedBills : undefined}
        value={formatCurrency(metrics.approvedBillsAmount)}
        valueStyle={TEAL_TEXT}
        dot={DOT.teal}
        testId="row-bills-approved"
      />
    ),
    overdue: (
      <LedgerRow
        key="overdue"
        label="Overdue"
        count={showCounts ? metrics.overdueBills : undefined}
        value={formatCurrency(metrics.overdueBillsAmount)}
        valueStyle={CORAL_TEXT}
        dot={DOT.coral}
        testId="row-bills-overdue"
      />
    ),
  };

  const visibleRows = ROW_CONFIG.filter(r => isRowVisible(r.configKey));

  return (
    <div className="flex flex-col h-full gap-2" data-testid="widget-bills-summary">
      {/* Overdue alert */}
      {showOverdueAlert && metrics.overdueBills > 0 && (
        <SummaryAlert testId="alert-bills-overdue">
          {metrics.overdueBills} overdue bill{metrics.overdueBills === 1 ? "" : "s"} ·{" "}
          {formatCurrency(metrics.overdueBillsAmount)}
        </SummaryAlert>
      )}

      {/* Headline: total paid on the amber (bills) wash */}
      <div className="p-3 rounded-[10px]" style={{ backgroundColor: "hsl(var(--amber-light))" }}>
        <span className="text-[10px] font-medium uppercase tracking-wide block" style={AMBER_TEXT}>
          Total paid
        </span>
        <div className="text-xl font-semibold tabular-nums leading-tight" data-testid="bills-total-paid">
          {formatCurrency(metrics.paidBillsIncGst)}
        </div>
      </div>

      {/* Status ledger */}
      {visibleRows.length > 0 && (
        <div className="border-t-2 border-foreground pt-1 px-0.5">
          {visibleRows.map(r => rows[r.key])}
        </div>
      )}
    </div>
  );
}

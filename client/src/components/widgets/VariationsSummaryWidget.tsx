import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { LedgerRow, SummaryAlert, DOT, SAGE_TEXT, AMBER_TEXT } from "./summary-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

type RowKey = "total" | "approved" | "pending" | "revised" | "invoiced";

const ROW_CONFIG: { key: RowKey; configKey: string; label: string }[] = [
  { key: "total", configKey: "showTotal", label: "Total variations" },
  { key: "approved", configKey: "showApproved", label: "Approved" },
  { key: "pending", configKey: "showPending", label: "Pending approval" },
  { key: "revised", configKey: "showRevised", label: "Revised contract total" },
  { key: "invoiced", configKey: "showInvoiced", label: "Invoiced" },
];

export default function VariationsSummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, isError, formatCurrency } = useProjectMetrics();
  const allowed = useFinancialPermission();
  const [, navigate] = useLocation();

  const variationsPath = currentProject?.id
    ? `/projects/${currentProject.id}/variations`
    : "/variations";

  // Default everything visible when config is absent.
  const isRowVisible = (configKey: string) => widget.config?.[configKey] !== false;
  const showActionAlert = widget.config?.showActionAlert !== false;

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; config: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, config: {} });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  // Hover arrow in the widget header → variations page
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => navigate(variationsPath)}
              data-testid="variations-widget-open-full"
              aria-label="Open variations"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All variations</TooltipContent>
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
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="variations-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={draft.title}
            onChange={e => setDraft(prev => prev && { ...prev, title: e.target.value })}
            className="h-8 text-xs"
            placeholder="Widget title"
            data-testid="input-variations-widget-title"
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
                data-testid={`switch-variations-${row.key}`}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1 border-t">
            <Label className="text-xs font-normal">Action required alert</Label>
            <Switch
              checked={cfg.showActionAlert !== false}
              onCheckedChange={v => stage("showActionAlert", !!v)}
              aria-label="Show action required alert"
              data-testid="switch-variations-action-alert"
            />
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="button-variations-config-done">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view variations" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError />;

  if (metrics.totalVariations === 0) {
    return (
      <WidgetEmpty
        message="No variations on this project yet"
        action={{ label: "Add a variation", onClick: () => navigate(variationsPath) }}
      />
    );
  }

  const rows: Record<RowKey, JSX.Element> = {
    total: (
      <LedgerRow
        key="total"
        label="Total variations"
        count={metrics.activeVariations}
        value={formatCurrency(metrics.totalVariationValue)}
        testId="row-variations-total"
      />
    ),
    approved: (
      <LedgerRow
        key="approved"
        label="Approved"
        count={metrics.approvedVariations}
        value={formatCurrency(metrics.approvedVariationValue)}
        valueStyle={SAGE_TEXT}
        dot={DOT.sage}
        testId="row-variations-approved"
      />
    ),
    pending: (
      <LedgerRow
        key="pending"
        label="Pending approval"
        count={metrics.pendingVariations}
        value={formatCurrency(metrics.pendingVariationValue)}
        valueStyle={AMBER_TEXT}
        dot={DOT.amber}
        testId="row-variations-pending"
      />
    ),
    revised: (
      <LedgerRow
        key="revised"
        label="Revised contract total"
        value={formatCurrency(metrics.revisedContractPrice)}
        testId="row-variations-revised"
      />
    ),
    invoiced: (
      <LedgerRow
        key="invoiced"
        label="Invoiced"
        value={formatCurrency(metrics.invoicedVariationValue)}
        testId="row-variations-invoiced"
      />
    ),
  };

  const visibleRows = ROW_CONFIG.filter((r) => isRowVisible(r.configKey));

  return (
    <div className="flex flex-col h-full gap-2" data-testid="widget-variations-summary">
      {showActionAlert && metrics.actionRequiredVariations > 0 && (
        <SummaryAlert testId="alert-variations-action-required">
          {metrics.actionRequiredVariations} variation
          {metrics.actionRequiredVariations === 1 ? "" : "s"} need your response
        </SummaryAlert>
      )}

      <div className="border-t-2 border-foreground pt-1 px-0.5">
        {visibleRows.map((r) => rows[r.key])}
      </div>
    </div>
  );
}

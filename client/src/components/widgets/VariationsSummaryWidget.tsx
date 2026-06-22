import { useState, useEffect } from "react";
import { FileEdit, AlertCircle, ArrowRight } from "lucide-react";
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

type RowKey = "total" | "approved" | "pending" | "revised" | "invoiced";

const ROW_CONFIG: { key: RowKey; configKey: string; label: string }[] = [
  { key: "total", configKey: "showTotal", label: "Total variations" },
  { key: "approved", configKey: "showApproved", label: "Approved" },
  { key: "pending", configKey: "showPending", label: "Pending approval" },
  { key: "revised", configKey: "showRevised", label: "Revised contract total" },
  { key: "invoiced", configKey: "showInvoiced", label: "Invoiced" },
];

function AmountRow({
  label,
  value,
  count,
  valueClass,
  testId,
}: {
  label: string;
  value: string;
  count?: number;
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
      <span className={`text-sm font-semibold tabular-nums ${valueClass ?? ""}`}>
        {value}
      </span>
    </div>
  );
}

export default function VariationsSummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, formatCurrency } = useProjectMetrics();
  const allowed = useFinancialPermission();
  const [, navigate] = useLocation();
  const [editingTitle, setEditingTitle] = useState(widget.title);

  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  // Default everything visible when config is absent.
  const isRowVisible = (configKey: string) => widget.config?.[configKey] !== false;
  const showActionAlert = widget.config?.showActionAlert !== false;

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
            data-testid="input-variations-widget-title"
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
                data-testid={`switch-variations-${row.key}`}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Label className="text-xs font-normal">Action required alert</Label>
          <Switch
            checked={showActionAlert}
            onCheckedChange={(v) => updateConfig({ showActionAlert: !!v })}
            aria-label="Show action required alert"
            data-testid="switch-variations-action-alert"
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
            data-testid="button-variations-config-done"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view variations" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;

  const variationsPath = currentProject?.id
    ? `/projects/${currentProject.id}/variations`
    : "/variations";

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
      <AmountRow
        key="total"
        label="Total variations"
        value={formatCurrency(metrics.totalVariationValue)}
        count={metrics.activeVariations}
        testId="row-variations-total"
      />
    ),
    approved: (
      <AmountRow
        key="approved"
        label="Approved"
        value={formatCurrency(metrics.approvedVariationValue)}
        count={metrics.approvedVariations}
        valueClass="text-bp-green"
        testId="row-variations-approved"
      />
    ),
    pending: (
      <AmountRow
        key="pending"
        label="Pending approval"
        value={formatCurrency(metrics.pendingVariationValue)}
        count={metrics.pendingVariations}
        valueClass="text-bp-amber"
        testId="row-variations-pending"
      />
    ),
    revised: (
      <AmountRow
        key="revised"
        label="Revised contract total"
        value={formatCurrency(metrics.revisedContractPrice)}
        testId="row-variations-revised"
      />
    ),
    invoiced: (
      <AmountRow
        key="invoiced"
        label="Invoiced"
        value={formatCurrency(metrics.invoicedVariationValue)}
        testId="row-variations-invoiced"
      />
    ),
  };

  const visibleRows = ROW_CONFIG.filter((r) => isRowVisible(r.configKey));

  return (
    <div className="flex flex-col h-full p-4 gap-2" data-testid="widget-variations-summary">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileEdit className="h-4 w-4 text-bp-purple" />
        <span className="font-medium text-sm">{widget.title || "Variations"}</span>
      </div>

      {/* Action required alert */}
      {showActionAlert && metrics.actionRequiredVariations > 0 && (
        <div
          className="flex items-center gap-2 rounded-md bg-bp-coral/10 px-2.5 py-2"
          data-testid="alert-variations-action-required"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-bp-coral" />
          <span className="text-xs text-bp-coral">
            {metrics.actionRequiredVariations} variation
            {metrics.actionRequiredVariations === 1 ? "" : "s"} need your response
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
        onClick={() => navigate(variationsPath)}
        data-testid="button-view-all-variations"
      >
        <span>View all variations</span>
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { Budget } from "@shared/schema";
import type { WidgetProps, Widget } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatCurrency } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ChartStyle = "bar" | "bullet";

function ProgressBar({
  widthPct,
  colorClass,
  testId,
}: {
  widthPct: number;
  colorClass: string;
  testId?: string;
}) {
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted" data-testid={testId}>
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.min(100, Math.max(0, widthPct))}%` }}
      />
    </div>
  );
}

function BulletBar({
  measurePct,
  targetPct,
  measureClass,
  bands,
}: {
  measurePct: number;
  targetPct: number;
  measureClass: string;
  bands: { widthPct: number; className: string }[];
}) {
  return (
    <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-muted" data-testid="bar-spent">
      <div className="absolute inset-0 flex">
        {bands.map((b, i) => (
          <div key={i} className={b.className} style={{ width: `${b.widthPct}%` }} />
        ))}
      </div>
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full ${measureClass}`}
        style={{ width: `${Math.min(100, Math.max(0, measurePct))}%` }}
        data-testid="bullet-measure"
      />
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-foreground"
        style={{ left: `${Math.min(100, Math.max(0, targetPct))}%` }}
        data-testid="bullet-target"
      />
    </div>
  );
}

export default function ProjectBudgetVsActualWidget({
  widget,
  onUpdate,
  isConfiguring,
  onCloseConfig,
}: WidgetProps) {
  const { currentProject } = useProject();
  const allowed = useFinancialPermission();

  const chartStyle: ChartStyle = widget.config?.chartStyle === "bullet" ? "bullet" : "bar";
  const showCompletion = !!widget.config?.showCompletion;

  const updateConfig = (patch: Record<string, unknown>) => {
    if (!onUpdate) return;
    onUpdate({ ...widget, config: { ...(widget.config || {}), ...patch } } as Widget);
  };

  const { data, isLoading, isError, refetch } = useQuery<Budget>({
    queryKey: ["/api/projects", currentProject?.id, "budget"],
    queryFn: async () => {
      if (!currentProject?.id) throw new Error("no project");
      const r = await fetch(`/api/projects/${currentProject.id}/budget`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id && allowed,
  });

  if (isConfiguring) {
    return (
      <div className="space-y-4 p-3">
        <div className="space-y-2">
          <Label className="text-xs">Budget graph style</Label>
          <Select value={chartStyle} onValueChange={(v) => updateConfig({ chartStyle: v as ChartStyle })}>
            <SelectTrigger
              className="h-8 text-xs"
              aria-label="Budget graph style"
              data-testid="select-budget-chart-style"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-xs">Progress bar</SelectItem>
              <SelectItem value="bullet" className="text-xs">Bullet bar</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <Label className="text-xs font-normal">Show build progress bar</Label>
          <Switch
            checked={showCompletion}
            onCheckedChange={(v) => updateConfig({ showCompletion: !!v })}
            aria-label="Show build progress bar"
            data-testid="switch-show-completion"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button size="sm" onClick={onCloseConfig} className="h-7 px-3 text-xs">
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) return <WidgetEmpty message="Select a project to view its budget" />;
  if (!allowed) return <WidgetEmpty message="You don't have access to financial data" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;
  if (!data) return <WidgetEmpty message="No budget set up for this project yet" />;

  const budget = data.revisedAmount || 0;
  const actual = data.actualAmount || 0;

  const hasBudget = budget > 0;
  const remaining = budget - actual;
  const pct = hasBudget ? Math.round((actual / budget) * 100) : 0;
  const overBudget = hasBudget && actual > budget;
  const nearLimit = hasBudget && !overBudget && pct >= 90;
  const barWidth = hasBudget ? Math.min(100, Math.max(0, pct)) : actual > 0 ? 100 : 0;

  const measureClass = !hasBudget
    ? actual > 0
      ? "bg-bp-amber"
      : "bg-muted-foreground/20"
    : overBudget
      ? "bg-bp-coral"
      : nearLimit
        ? "bg-bp-amber"
        : "bg-bp-purple";
  const statusLabel = !hasBudget
    ? "No budget set"
    : overBudget
      ? `Over by ${formatCurrency(actual - budget)}`
      : nearLimit
        ? "Near limit"
        : "On track";
  const statusClass = !hasBudget
    ? "bg-bp-amber/15 text-bp-amber border-transparent"
    : overBudget
      ? "bg-bp-coral/15 text-bp-coral border-transparent"
      : nearLimit
        ? "bg-bp-amber/15 text-bp-amber border-transparent"
        : "bg-bp-green/15 text-bp-green border-transparent";

  // Bullet-bar scale: leave a little headroom so the budget target tick and the
  // spend bar never sit flush against the right edge (and over-budget is visible).
  const scaleMax = Math.max(budget, actual) * 1.08 || 1;
  const measurePct = (actual / scaleMax) * 100;
  const targetPct = (budget / scaleMax) * 100;
  const safeEndPct = ((budget * 0.9) / scaleMax) * 100;
  const bands = [
    { widthPct: safeEndPct, className: "bg-bp-green/15" },
    { widthPct: Math.max(0, targetPct - safeEndPct), className: "bg-bp-amber/15" },
    { widthPct: Math.max(0, 100 - targetPct), className: "bg-bp-coral/15" },
  ];

  const completionPct = Math.min(100, Math.max(0, currentProject.percentComplete ?? 0));

  const useBullet = chartStyle === "bullet" && hasBudget;

  return (
    <div className="flex flex-col h-full p-4 gap-3" data-testid="widget-budget-vs-actual">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Budget health
        </span>
        <Badge
          className={`${statusClass} no-default-hover-elevate no-default-active-elevate`}
          data-testid="badge-budget-health"
        >
          {statusLabel}
        </Badge>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {hasBudget ? (remaining >= 0 ? "Remaining" : "Over budget") : "Spent"}
        </p>
        <p
          className={`text-2xl font-bold leading-tight tabular-nums ${
            hasBudget
              ? remaining < 0
                ? "text-bp-coral"
                : "text-bp-green"
              : actual > 0
                ? "text-bp-amber"
                : ""
          }`}
          data-testid="text-remaining-amount"
        >
          {formatCurrency(hasBudget ? Math.abs(remaining) : actual)}
        </p>
      </div>

      <div className="space-y-1.5">
        {useBullet ? (
          <BulletBar
            measurePct={measurePct}
            targetPct={targetPct}
            measureClass={measureClass}
            bands={bands}
          />
        ) : (
          <ProgressBar widthPct={barWidth} colorClass={measureClass} testId="bar-spent" />
        )}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-muted-foreground" data-testid="text-actual-amount">
            {hasBudget ? `Spent ${formatCurrency(actual)}` : "No budget entered"}
          </span>
          <span
            className={`font-medium ${overBudget ? "text-bp-coral" : "text-foreground"}`}
            data-testid="text-spent-pct"
          >
            {hasBudget ? `${pct}%` : "—"}
          </span>
        </div>
      </div>

      {showCompletion && (
        <div className="space-y-1.5">
          <ProgressBar widthPct={completionPct} colorClass="bg-bp-teal" testId="bar-completion" />
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground" data-testid="text-completion-label">
              Build progress
            </span>
            <span className="font-medium text-bp-teal" data-testid="text-completion-pct">
              {completionPct}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

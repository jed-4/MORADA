import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { Budget, Project } from "@shared/schema";
import type { WidgetProps, Widget } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useFinancialPermission } from "@/hooks/use-permission";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { formatCurrency } from "@/lib/formatters";
import { LedgerRow, DOT } from "./summary-shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

type ChartStyle = "segments" | "bullet";

type BudgetWithLabour = Budget & { labourActualAmount?: number };

// Spend composition bar: bills (amber) + labour (teal) against the budget.
// When over budget the scale stretches to the spend, the budget tick stays
// where the budget is, and the overage past it gets coral stripes.
function SegmentedBar({
  budget,
  bills,
  labour,
}: {
  budget: number;
  bills: number;
  labour: number;
}) {
  const actual = bills + labour;
  const scale = Math.max(budget, actual) || 1;
  const billsPct = (bills / scale) * 100;
  const labourPct = (labour / scale) * 100;
  const budgetPct = Math.min(100, (budget / scale) * 100);
  const over = actual > budget && budget > 0;

  return (
    <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-muted" data-testid="bar-spent">
      <div className="absolute inset-0 flex">
        <div style={{ width: `${billsPct}%`, backgroundColor: "hsl(var(--amber))" }} />
        <div style={{ width: `${labourPct}%`, backgroundColor: "hsl(var(--teal))" }} />
      </div>
      {over && (
        <div
          className="absolute inset-y-0"
          style={{
            left: `${budgetPct}%`,
            width: `${Math.max(0, (actual / scale) * 100 - budgetPct)}%`,
            backgroundColor: "hsl(var(--coral) / 0.55)",
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0, rgba(255,255,255,0.45) 3px, transparent 3px, transparent 6px)",
          }}
          data-testid="bar-overage"
        />
      )}
      {budget > 0 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-foreground/80"
          style={{ left: `${Math.min(98, Math.max(2, budgetPct))}%` }}
          data-testid="bar-budget-marker"
        />
      )}
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
        className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-foreground"
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
  onSetHeaderActions,
}: WidgetProps) {
  const { currentProject } = useProject();
  const allowed = useFinancialPermission();
  const [, navigate] = useLocation();

  const chartStyle: ChartStyle = widget.config?.chartStyle === "bullet" ? "bullet" : "segments";
  const showCompletion = !!widget.config?.showCompletion;

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; config: Record<string, unknown> } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, config: {} });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  const { data, isLoading, isError, refetch } = useQuery<BudgetWithLabour>({
    queryKey: ["/api/projects", currentProject?.id, "budget"],
    queryFn: async () => {
      if (!currentProject?.id) throw new Error("no project");
      const r = await fetch(`/api/projects/${currentProject.id}/budget`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id && allowed,
  });

  // Header row: hover arrow to the budget page
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={() => navigate(`/projects/${currentProject.id}/budget`)}
              data-testid="budget-widget-open-full"
              aria-label="Open budget"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Budget page</TooltipContent>
        </Tooltip>
      ) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  if (isConfiguring && draft) {
    const cfg = { ...widget.config, ...draft.config } as Record<string, any>;
    const dStyle: ChartStyle = cfg.chartStyle === "bullet" ? "bullet" : "segments";
    const stage = (key: string, value: unknown) =>
      setDraft(prev => prev && { ...prev, config: { ...prev.config, [key]: value } });
    const cancelConfig = () => { setDraft(null); onCloseConfig?.(); };
    const saveConfig = () => {
      onUpdate?.({
        ...widget,
        title: draft.title.trim() || widget.title,
        config: { ...(widget.config || {}), ...draft.config },
      } as Widget);
      setDraft(null);
      onCloseConfig?.();
    };
    const pill = (active: boolean) =>
      cn(
        "px-3 py-1.5 rounded-md border text-[11px] font-medium",
        active
          ? "bg-[hsl(var(--primary))] text-white border-transparent"
          : "border-border text-muted-foreground hover:border-[hsl(var(--primary))]",
      );

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="budget-widget-config">
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

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Graph style
          </p>
          <div className="flex gap-2">
            <button className={pill(dStyle === "segments")} onClick={() => stage("chartStyle", "segments")} data-testid="config-style-segments">
              Spend breakdown
            </button>
            <button className={pill(dStyle === "bullet")} onClick={() => stage("chartStyle", "bullet")} data-testid="config-style-bullet">
              Bullet bar
            </button>
          </div>
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Show
          </p>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Build progress bar</Label>
            <Switch
              checked={cfg.showCompletion === true}
              onCheckedChange={v => stage("showCompletion", !!v)}
              data-testid="switch-show-completion"
            />
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="budget-config-save">
            Save
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
  const labour = Math.min(Math.max(0, data.labourActualAmount || 0), Math.max(0, actual));
  const bills = actual - labour;

  const hasBudget = budget > 0;
  const remaining = budget - actual;
  const pct = hasBudget ? Math.round((actual / budget) * 100) : 0;
  const overBudget = hasBudget && actual > budget;
  const nearLimit = hasBudget && !overBudget && pct >= 90;

  const measureClass = !hasBudget
    ? actual > 0
      ? "bg-bp-amber"
      : "bg-muted-foreground/20"
    : overBudget
      ? "bg-bp-coral"
      : nearLimit
        ? "bg-bp-amber"
        : "bg-bp-purple";
  // Bullet-bar scale: scale to the larger of budget/actual so an over-budget
  // spend bar fills all the way to the right edge. The budget target tick is
  // clamped a hair inside the track so it stays visible on either edge.
  const scaleMax = Math.max(budget, actual) || 1;
  const measurePct = Math.min(100, (actual / scaleMax) * 100);
  const rawTargetPct = Math.min(100, (budget / scaleMax) * 100);
  const targetPct = Math.min(98, Math.max(2, rawTargetPct));
  const safeEndPct = Math.min(100, ((budget * 0.9) / scaleMax) * 100);
  const bands = [
    { widthPct: safeEndPct, className: "bg-bp-green/15" },
    { widthPct: Math.max(0, rawTargetPct - safeEndPct), className: "bg-bp-amber/15" },
    { widthPct: Math.max(0, 100 - rawTargetPct), className: "bg-bp-coral/15" },
  ];

  const scheduleProgress = (currentProject as Project & { progress?: number | null }).progress;
  const completionPct = Math.min(100, Math.max(0, scheduleProgress ?? 0));

  const useBullet = chartStyle === "bullet" && hasBudget;

  return (
    <div className="flex flex-col h-full gap-3" data-testid="widget-budget-vs-actual">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {hasBudget ? (remaining >= 0 ? "Remaining" : "Over budget") : "Spent"}
        </p>
        <div className="flex items-baseline gap-1.5">
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
          {hasBudget && (
            <span className="text-xs text-muted-foreground tabular-nums">
              of {formatCurrency(budget)}
            </span>
          )}
        </div>
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
          <SegmentedBar budget={budget} bills={bills} labour={labour} />
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

      {/* Composition ledger — where the spend actually went */}
      <div className="border-t-2 border-foreground pt-1 px-0.5">
        <LedgerRow label="Budget" value={formatCurrency(budget)} testId="row-budget" />
        <LedgerRow
          label="Bills"
          value={formatCurrency(bills)}
          dot={DOT.amber}
          testId="row-bills"
        />
        <LedgerRow
          label="Labour"
          value={formatCurrency(labour)}
          dot={DOT.teal}
          testId="row-labour"
        />
        <LedgerRow
          label={remaining >= 0 ? "Remaining" : "Over"}
          value={formatCurrency(Math.abs(remaining))}
          valueStyle={remaining < 0 ? { color: "hsl(11 52% 42%)" } : { color: "hsl(147 39% 30%)" }}
          testId="row-remaining"
        />
      </div>

      {showCompletion && (
        <div className="space-y-1.5">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted" data-testid="bar-completion">
            <div
              className="h-full rounded-full bg-bp-teal transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-muted-foreground" data-testid="text-completion-label">
              Build progress
            </span>
            <span className="font-medium text-bp-teal" data-testid="text-completion-pct">
              {scheduleProgress == null ? "—" : `${completionPct}%`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

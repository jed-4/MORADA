import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Settings, ExternalLink, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics, metricDefinitions, metricGroups, type MetricId } from "@/hooks/useProjectMetrics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DisplayStyle = "number" | "comparison" | "progress" | "compact" | "ultra-compact";

interface MetricConfig {
  metricId: MetricId;
  displayStyle: DisplayStyle;
  compareToId?: MetricId;
  tone?: Tone;
  cardWidth?: "tile" | "full";
}

const defaultMetricConfigs: MetricConfig[] = [
  { metricId: "revisedContractPrice", displayStyle: "number" },
  { metricId: "actualCosts", displayStyle: "comparison", compareToId: "totalProjectCosts" },
  { metricId: "completionPercentage", displayStyle: "progress" },
  { metricId: "grossMargin", displayStyle: "number" },
];

const CARD_STYLES: DisplayStyle[] = ["number", "comparison", "progress"];

// Morada colour families (see index.css / CLAUDE.md): wash fill for the card,
// solid for bars, and a darker label shade that reads on the wash.
type ToneKey = "lavender" | "amber" | "teal" | "sage" | "coral" | "grey";
type Tone = "auto" | "none" | ToneKey;

interface ToneFamily { wash: string; solid: string; label: string }
const FAMILIES: Record<ToneKey, ToneFamily> = {
  lavender: { wash: "hsl(var(--primary-light))", solid: "hsl(var(--primary))", label: "hsl(261 25% 45%)" },
  amber: { wash: "hsl(var(--amber-light))", solid: "hsl(var(--amber))", label: "hsl(42 45% 35%)" },
  teal: { wash: "hsl(var(--teal-light))", solid: "hsl(var(--teal))", label: "hsl(184 45% 30%)" },
  sage: { wash: "hsl(var(--sage-light))", solid: "hsl(var(--sage))", label: "hsl(147 35% 33%)" },
  coral: { wash: "hsl(var(--coral-light))", solid: "hsl(var(--coral))", label: "hsl(11 45% 42%)" },
  grey: { wash: "hsl(var(--muted))", solid: "hsl(var(--muted-foreground))", label: "hsl(var(--muted-foreground))" },
};

const CATEGORY_FAMILY: Record<string, ToneKey> = {
  contract: "lavender",
  progress: "lavender",
  costs: "amber",
  billing: "teal",
  margins: "sage",
  counts: "grey",
};

// null = frameless tile (no card)
function resolveFamily(tone: Tone | undefined, category: string): ToneFamily | null {
  if (tone === "none") return null;
  if (tone && tone !== "auto" && FAMILIES[tone as ToneKey]) return FAMILIES[tone as ToneKey];
  return FAMILIES[CATEGORY_FAMILY[category] ?? "lavender"];
}

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: "auto", label: "Auto colour" },
  { value: "none", label: "No card" },
  { value: "lavender", label: "Lavender" },
  { value: "amber", label: "Amber" },
  { value: "teal", label: "Teal" },
  { value: "sage", label: "Sage" },
  { value: "coral", label: "Coral" },
];

const CORAL = "hsl(var(--coral))";
const GOOD_TEXT = "hsl(147 39% 30%)";
const BAD_TEXT = "hsl(11 52% 42%)";

function AccentBar({ pct, color, track, className }: { pct: number; color: string; track?: string; className?: string }) {
  return (
    <div
      className={cn("h-1.5 rounded-full overflow-hidden", !track && "bg-muted", className)}
      style={track ? { backgroundColor: track } : undefined}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function MetricsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, isError, formatCurrency, formatPercentage } = useProjectMetrics();
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  const metricConfigs: MetricConfig[] = widget.config?.metricConfigs || defaultMetricConfigs;

  // Config edits stage into a local draft and only persist on Save
  const [draft, setDraft] = useState<{ title: string; configs: MetricConfig[] } | null>(null);
  useEffect(() => {
    if (isConfiguring) {
      setDraft({ title: widget.title, configs: metricConfigs.map(c => ({ ...c })) });
    } else {
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  const getMetricValue = (id: MetricId): number => {
    return (metrics as any)[id] || 0;
  };

  const getMetricDef = (id: MetricId) => {
    return metricDefinitions.find(m => m.id === id);
  };

  const formatValue = (id: MetricId, value: number): string => {
    const def = getMetricDef(id);
    if (!def) return String(value);

    switch (def.type) {
      case "currency":
        return formatCurrency(value);
      case "percentage":
        return formatPercentage(value);
      case "count":
        return String(Math.round(value));
      default:
        return String(value);
    }
  };

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view metrics
      </div>
    );
  }

  // Configuration mode (staged draft, Morada style)
  if (isConfiguring && draft) {
    const updateDraftConfig = (index: number, updates: Partial<MetricConfig>) => {
      setDraft(prev => prev && {
        ...prev,
        configs: prev.configs.map((c, i) => (i === index ? { ...c, ...updates } : c)),
      });
    };
    const addMetric = () => {
      setDraft(prev => prev && {
        ...prev,
        configs: [...prev.configs, { metricId: "contractPrice" as MetricId, displayStyle: "number" as DisplayStyle }],
      });
    };
    const removeMetric = (index: number) => {
      setDraft(prev => prev && { ...prev, configs: prev.configs.filter((_, i) => i !== index) });
    };
    const moveMetric = (index: number, dir: -1 | 1) => {
      setDraft(prev => {
        if (!prev) return prev;
        const target = index + dir;
        if (target < 0 || target >= prev.configs.length) return prev;
        const configs = [...prev.configs];
        [configs[index], configs[target]] = [configs[target], configs[index]];
        return { ...prev, configs };
      });
    };
    const cancelConfig = () => {
      setDraft(null);
      onCloseConfig?.();
    };
    const saveConfig = () => {
      onUpdate?.({
        ...widget,
        title: draft.title.trim() || widget.title,
        config: { ...widget.config, metricConfigs: draft.configs },
      });
      setDraft(null);
      onCloseConfig?.();
    };

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="metrics-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={draft.title}
            onChange={e => setDraft(prev => prev && { ...prev, title: e.target.value })}
            className="h-8 text-xs"
            placeholder="Widget title"
            data-testid="config-input-title"
          />
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Metrics
          </p>
          <div className="space-y-2">
            {draft.configs.map((config, index) => (
              <div key={index} className="p-2 border border-border rounded-md space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => moveMetric(index, -1)}
                      disabled={index === 0}
                      className={cn("p-0.5 rounded", index === 0 ? "opacity-30" : "hover:bg-muted")}
                      title="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => moveMetric(index, 1)}
                      disabled={index >= draft.configs.length - 1}
                      className={cn("p-0.5 rounded", index >= draft.configs.length - 1 ? "opacity-30" : "hover:bg-muted")}
                      title="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <span className="text-[10px] text-muted-foreground ml-1">#{index + 1}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMetric(index)}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove metric"
                  >
                    ×
                  </Button>
                </div>

                <div className="flex gap-1.5">
                  <Select
                    value={config.metricId}
                    onValueChange={val => updateDraftConfig(index, { metricId: val as MetricId })}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {metricDefinitions.map(def => (
                        <SelectItem key={def.id} value={def.id} className="text-xs">
                          <span className="text-muted-foreground">{def.group}:</span> {def.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={config.displayStyle}
                    onValueChange={val => updateDraftConfig(index, { displayStyle: val as DisplayStyle })}
                  >
                    <SelectTrigger className="h-7 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number" className="text-xs">Number</SelectItem>
                      <SelectItem value="comparison" className="text-xs">Compare</SelectItem>
                      <SelectItem value="progress" className="text-xs">Progress</SelectItem>
                      <SelectItem value="compact" className="text-xs">Ledger row</SelectItem>
                      <SelectItem value="ultra-compact" className="text-xs">Ledger row (small)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {CARD_STYLES.includes(config.displayStyle) && (
                  <div className="flex gap-1.5">
                    <Select
                      value={config.tone || "auto"}
                      onValueChange={val => updateDraftConfig(index, { tone: val as Tone })}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Card colour" />
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map(t => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              {t.value !== "none" && t.value !== "auto" && (
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FAMILIES[t.value as ToneKey].solid }} />
                              )}
                              {t.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={config.cardWidth || "tile"}
                      onValueChange={val => updateDraftConfig(index, { cardWidth: val as "tile" | "full" })}
                    >
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue placeholder="Width" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tile" className="text-xs">Tile</SelectItem>
                        <SelectItem value="full" className="text-xs">Full row</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {config.displayStyle === "comparison" && (
                  <Select
                    value={config.compareToId || ""}
                    onValueChange={val => updateDraftConfig(index, { compareToId: val as MetricId })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Compare to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {metricDefinitions.map(def => (
                        <SelectItem key={def.id} value={def.id} className="text-xs">
                          {def.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={addMetric} className="w-full h-7 text-xs mt-2">
            + Add metric
          </Button>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs" data-testid="button-cancel-config">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="button-save-config">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
      >
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="animate-pulse p-3 rounded-[10px] bg-muted/60 space-y-2">
            <div className="h-2.5 bg-muted rounded w-2/3"></div>
            <div className="h-6 bg-muted rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
        <AlertCircle className="h-4 w-4 text-destructive" />
        Couldn't load project metrics — try refreshing
      </div>
    );
  }

  // Render metric based on display style
  const renderMetric = (config: MetricConfig, index: number) => {
    const def = getMetricDef(config.metricId);
    if (!def) return null;

    const value = getMetricValue(config.metricId);
    const formattedValue = formatValue(config.metricId, value);

    switch (config.displayStyle) {
      case "number": {
        const family = resolveFamily(config.tone, def.category);
        const isNegative = def.type === "currency" && value < 0;
        return (
          <div
            key={index}
            className={cn("p-3 space-y-1", family && "rounded-[10px]")}
            style={family ? { backgroundColor: family.wash } : undefined}
            data-testid={`metric-${config.metricId}`}
          >
            <span
              className="text-[10px] font-medium uppercase tracking-wide block truncate"
              style={{ color: family ? family.label : "hsl(var(--muted-foreground))" }}
            >
              {def.name}
            </span>
            <div className="text-xl font-semibold tabular-nums leading-tight" style={isNegative ? { color: CORAL } : undefined}>
              {formattedValue}
            </div>
            {def.type === "percentage" && (
              <AccentBar
                pct={value}
                color={value > 100 ? CORAL : (family ? family.solid : "hsl(var(--primary))")}
                track={family ? "rgba(255,255,255,0.55)" : undefined}
              />
            )}
          </div>
        );
      }

      case "comparison": {
        const family = resolveFamily(config.tone, def.category);
        const labelColor = family ? family.label : "hsl(var(--muted-foreground))";
        const hasTarget = !!config.compareToId;
        const compareValue = hasTarget ? getMetricValue(config.compareToId!) : 0;
        const compareDef = hasTarget ? getMetricDef(config.compareToId!) : null;
        const percentage = compareValue > 0 ? (value / compareValue) * 100 : 0;
        const isOver = value > compareValue;
        // Direction: exceeding a target is bad for costs, good elsewhere
        const overIsBad = def.category === "costs";
        const isBad = isOver && overIsBad;
        const isGood = (isOver && !overIsBad) || (!isOver && overIsBad);
        const chipStyle = {
          backgroundColor: family ? "rgba(255,255,255,0.65)"
            : isBad ? "hsl(var(--coral-light))"
            : isGood ? "hsl(var(--sage-light))"
            : "hsl(var(--muted))",
          color: isBad ? BAD_TEXT : isGood ? GOOD_TEXT : "hsl(var(--muted-foreground))",
        };

        if (!hasTarget || !compareDef) {
          return (
            <div
              key={index}
              className={cn("p-3 space-y-1", family && "rounded-[10px]")}
              style={family ? { backgroundColor: family.wash } : undefined}
              data-testid={`metric-${config.metricId}`}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide block truncate" style={{ color: labelColor }}>
                {def.name}
              </span>
              <div className="text-xl font-semibold tabular-nums leading-tight">{formattedValue}</div>
              <p className="text-[10px] text-muted-foreground">No comparison set — choose one in settings</p>
            </div>
          );
        }

        return (
          <div
            key={index}
            className={cn("p-3 space-y-1.5", family && "rounded-[10px]")}
            style={family ? { backgroundColor: family.wash } : undefined}
            data-testid={`metric-${config.metricId}`}
          >
            <div className="flex items-start justify-between gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide truncate" style={{ color: labelColor }}>
                {def.name}
              </span>
              <span
                className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 tabular-nums"
                style={chipStyle}
              >
                {isOver
                  ? <TrendingUp className="h-2.5 w-2.5" />
                  : <TrendingDown className="h-2.5 w-2.5" />}
                {percentage.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-xl font-semibold tabular-nums leading-tight">{formattedValue}</span>
              <span className="text-xs text-muted-foreground tabular-nums truncate">
                / {formatValue(config.compareToId!, compareValue)}
              </span>
            </div>
            <AccentBar
              pct={percentage}
              color={isBad ? CORAL : (family ? family.solid : "hsl(var(--primary))")}
              track={family ? "rgba(255,255,255,0.55)" : undefined}
            />
          </div>
        );
      }

      case "progress": {
        const family = resolveFamily(config.tone, def.category);
        const progressValue = def.type === "percentage" ? value : 0;
        return (
          <div
            key={index}
            className={cn("p-3 space-y-2", family && "rounded-[10px]")}
            style={family ? { backgroundColor: family.wash } : undefined}
            data-testid={`metric-${config.metricId}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className="text-[10px] font-medium uppercase tracking-wide truncate"
                style={{ color: family ? family.label : "hsl(var(--muted-foreground))" }}
              >
                {def.name}
              </span>
              <span className="text-sm font-semibold tabular-nums">{formattedValue}</span>
            </div>
            <AccentBar
              pct={progressValue}
              color={progressValue > 100 ? CORAL : (family ? family.solid : "hsl(var(--primary))")}
              track={family ? "rgba(255,255,255,0.55)" : undefined}
              className="h-2"
            />
          </div>
        );
      }

      // Ledger rows: dotted leader between label and value, like an estimate document
      case "compact": {
        const isNegative = def.type === "currency" && value < 0;
        return (
          <div key={index} className="flex items-baseline gap-2 py-[5px]" data-testid={`metric-${config.metricId}`}>
            <span className="text-xs text-foreground flex-shrink-0">{def.name}</span>
            <span className="flex-1 border-b border-dotted border-[hsl(var(--border))] -translate-y-[3px]" style={{ borderBottomColor: "hsl(48 8% 78%)" }} />
            <span className="text-[13px] font-medium tabular-nums flex-shrink-0" style={isNegative ? { color: CORAL } : undefined}>
              {formattedValue}
            </span>
          </div>
        );
      }

      case "ultra-compact": {
        const isNegative = def.type === "currency" && value < 0;
        return (
          <div key={index} className="flex items-baseline gap-2 py-[3px]" data-testid={`metric-${config.metricId}`}>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">{def.name}</span>
            <span className="flex-1 border-b border-dotted -translate-y-[2px]" style={{ borderBottomColor: "hsl(48 8% 82%)" }} />
            <span className="text-xs font-medium tabular-nums flex-shrink-0" style={isNegative ? { color: CORAL } : undefined}>
              {formattedValue}
            </span>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Render in the exact configured order: consecutive card-style metrics
  // group into a grid run, consecutive ledger rows into a ruled block.
  type Run = { kind: "cards" | "rows"; items: Array<{ config: MetricConfig; index: number }> };
  const runs: Run[] = [];
  metricConfigs.forEach((config, index) => {
    const kind = CARD_STYLES.includes(config.displayStyle) ? "cards" : "rows";
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) {
      last.items.push({ config, index });
    } else {
      runs.push({ kind, items: [{ config, index }] });
    }
  });

  return (
    <>
      <div className="space-y-2">
        {runs.map((run, runIndex) =>
          run.kind === "cards" ? (
            <div
              key={runIndex}
              className="grid gap-2"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
            >
              {run.items.map(({ config, index }) => (
                <div
                  key={index}
                  style={config.cardWidth === "full" ? { gridColumn: "1 / -1" } : undefined}
                >
                  {renderMetric(config, index)}
                </div>
              ))}
            </div>
          ) : (
            <div key={runIndex} className="border-t-2 border-foreground pt-1 px-0.5">
              {run.items.map(({ config, index }) => renderMetric(config, index))}
            </div>
          ),
        )}

        {metricConfigs.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No metrics configured</p>
            <p className="text-xs">Click the gear icon to add metrics</p>
          </div>
        )}

        <button
          onClick={() => setShowAllMetrics(true)}
          className="w-full text-data text-primary hover:text-primary/80 flex items-center justify-center gap-1 pt-1"
          data-testid="button-view-all-metrics"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          View All
        </button>
      </div>

      {/* View All Metrics Modal — generated from the metric definitions */}
      <Dialog open={showAllMetrics} onOpenChange={setShowAllMetrics}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Project Metrics</DialogTitle>
            <DialogDescription>
              Complete overview of all available metrics for {currentProject.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {metricGroups.map(group => {
              const defs = metricDefinitions.filter(d => d.group === group);
              if (defs.length === 0) return null;
              const groupFamily = FAMILIES[CATEGORY_FAMILY[defs[0].category] ?? "lavender"];
              return (
                <div key={group} className="space-y-1">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b-2 border-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: groupFamily.solid }} />
                    {group}
                  </h4>
                  <div>
                    {defs.map(def => {
                      const v = getMetricValue(def.id);
                      const neg = def.type === "currency" && v < 0;
                      return (
                        <div key={def.id} className="flex items-baseline gap-2 py-[5px]">
                          <span className="text-xs text-foreground flex-shrink-0">{def.name}</span>
                          <span className="flex-1 border-b border-dotted -translate-y-[3px]" style={{ borderBottomColor: "hsl(48 8% 78%)" }} />
                          <span className="text-[13px] font-medium tabular-nums flex-shrink-0" style={neg ? { color: CORAL } : undefined}>
                            {formatValue(def.id, v)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

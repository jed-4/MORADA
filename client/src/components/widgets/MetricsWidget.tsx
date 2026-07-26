import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, ArrowRight, Settings, ExternalLink, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics, metricDefinitions, metricGroups, type MetricId } from "@/hooks/useProjectMetrics";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
}

const defaultMetricConfigs: MetricConfig[] = [
  { metricId: "revisedContractPrice", displayStyle: "number" },
  { metricId: "actualCosts", displayStyle: "comparison", compareToId: "totalProjectCosts" },
  { metricId: "completionPercentage", displayStyle: "progress" },
  { metricId: "grossMargin", displayStyle: "number" },
];

const CARD_STYLES: DisplayStyle[] = ["number", "comparison", "progress"];

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
                      <SelectItem value="compact" className="text-xs">Compact</SelectItem>
                      <SelectItem value="ultra-compact" className="text-xs">Ultra compact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
            <div className="h-6 bg-muted rounded w-2/3"></div>
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
      case "number":
        return (
          <div key={index} className="p-3 border rounded-md space-y-1" data-testid={`metric-${config.metricId}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{def.name}</span>
              {def.type === "currency" && <DollarSign className="h-3 w-3 text-muted-foreground" />}
              {def.type === "percentage" && <Percent className="h-3 w-3 text-muted-foreground" />}
              {def.type === "count" && <BarChart3 className="h-3 w-3 text-muted-foreground" />}
            </div>
            <div className="text-lg font-bold">{formattedValue}</div>
            {def.type === "percentage" && (
              <Progress value={Math.min(100, Math.max(0, value))} className="h-1.5" />
            )}
          </div>
        );

      case "comparison": {
        const hasTarget = !!config.compareToId;
        const compareValue = hasTarget ? getMetricValue(config.compareToId!) : 0;
        const compareDef = hasTarget ? getMetricDef(config.compareToId!) : null;
        const percentage = compareValue > 0 ? (value / compareValue) * 100 : 0;
        const isOver = value > compareValue;
        // Direction: exceeding a target is bad for costs, good elsewhere
        const overIsBad = def.category === "costs";

        if (!hasTarget || !compareDef) {
          return (
            <div key={index} className="p-3 border rounded-md space-y-1" data-testid={`metric-${config.metricId}`}>
              <span className="text-xs text-muted-foreground">{def.name}</span>
              <div className="text-lg font-bold">{formattedValue}</div>
              <p className="text-[10px] text-muted-foreground">No comparison set — choose one in settings</p>
            </div>
          );
        }

        return (
          <div key={index} className="p-3 border rounded-md space-y-2" data-testid={`metric-${config.metricId}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{def.name}</span>
              {isOver ? (
                <TrendingUp className={cn("h-3 w-3", overIsBad ? "text-red-500" : "text-green-500")} />
              ) : (
                <TrendingDown className={cn("h-3 w-3", overIsBad ? "text-green-500" : "text-muted-foreground")} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{formattedValue}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {formatValue(config.compareToId!, compareValue)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={Math.min(100, percentage)} className="h-1.5 flex-1" />
              <span className={cn(
                "text-xs",
                isOver
                  ? (overIsBad ? "text-red-500" : "text-green-500")
                  : (overIsBad ? "text-green-500" : "text-muted-foreground"),
              )}>
                {percentage.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      }

      case "progress": {
        const progressValue = def.type === "percentage" ? value : 0;
        return (
          <div key={index} className="p-3 border rounded-md space-y-2" data-testid={`metric-${config.metricId}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{def.name}</span>
              <span className="text-sm font-medium">{formattedValue}</span>
            </div>
            <Progress value={Math.min(100, Math.max(0, progressValue))} className="h-2" />
          </div>
        );
      }

      case "compact":
        return (
          <div key={index} className="flex items-center justify-between py-1 border-b last:border-0" data-testid={`metric-${config.metricId}`}>
            <span className="text-xs text-muted-foreground">{def.name}</span>
            <Badge variant="secondary" className="text-xs font-medium h-5">
              {formattedValue}
            </Badge>
          </div>
        );

      case "ultra-compact":
        return (
          <div key={index} className="flex items-center justify-between py-0.5" data-testid={`metric-${config.metricId}`}>
            <span className="text-data text-muted-foreground truncate">{def.name}</span>
            <span className="text-data font-medium ml-1">{formattedValue}</span>
          </div>
        );

      default:
        return null;
    }
  };

  // Cards flow in a responsive grid; compact rows stack in a list below
  const cardConfigs = metricConfigs
    .map((config, index) => ({ config, index }))
    .filter(({ config }) => CARD_STYLES.includes(config.displayStyle));
  const rowConfigs = metricConfigs
    .map((config, index) => ({ config, index }))
    .filter(({ config }) => !CARD_STYLES.includes(config.displayStyle));

  return (
    <>
      <div className="space-y-2">
        {cardConfigs.length > 0 && (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
          >
            {cardConfigs.map(({ config, index }) => renderMetric(config, index))}
          </div>
        )}

        {rowConfigs.length > 0 && (
          <div>
            {rowConfigs.map(({ config, index }) => renderMetric(config, index))}
          </div>
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
              return (
                <div key={group} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{group}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {defs.map(def => (
                      <div key={def.id} className="p-2 border rounded-md">
                        <div className="text-xs text-muted-foreground">{def.name}</div>
                        <div className="text-sm font-medium">{formatValue(def.id, getMetricValue(def.id))}</div>
                      </div>
                    ))}
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

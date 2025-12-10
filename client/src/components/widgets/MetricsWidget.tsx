import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, ArrowRight, Settings, ExternalLink, ChevronUp, ChevronDown } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics, metricDefinitions, type MetricId } from "@/hooks/useProjectMetrics";
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

export default function MetricsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, formatCurrency, formatPercentage } = useProjectMetrics();
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [editingTitle, setEditingTitle] = useState(widget.title);
  
  useEffect(() => {
    if (isConfiguring) {
      setEditingTitle(widget.title);
    }
  }, [isConfiguring, widget.title]);
  
  const metricConfigs: MetricConfig[] = widget.config?.metricConfigs || defaultMetricConfigs;

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

  const updateMetricConfig = (index: number, updates: Partial<MetricConfig>) => {
    if (!onUpdate) return;
    const newConfigs = [...metricConfigs];
    newConfigs[index] = { ...newConfigs[index], ...updates };
    onUpdate({
      ...widget,
      config: { ...widget.config, metricConfigs: newConfigs },
    });
  };

  const addMetric = () => {
    if (!onUpdate) return;
    const newConfigs = [...metricConfigs, { metricId: "contractPrice" as MetricId, displayStyle: "number" as DisplayStyle }];
    onUpdate({
      ...widget,
      config: { ...widget.config, metricConfigs: newConfigs },
    });
  };

  const removeMetric = (index: number) => {
    if (!onUpdate) return;
    const newConfigs = metricConfigs.filter((_, i) => i !== index);
    onUpdate({
      ...widget,
      config: { ...widget.config, metricConfigs: newConfigs },
    });
  };

  const moveMetricUp = (index: number) => {
    if (!onUpdate || index === 0) return;
    const newConfigs = [...metricConfigs];
    [newConfigs[index - 1], newConfigs[index]] = [newConfigs[index], newConfigs[index - 1]];
    onUpdate({
      ...widget,
      config: { ...widget.config, metricConfigs: newConfigs },
    });
  };

  const moveMetricDown = (index: number) => {
    if (!onUpdate || index >= metricConfigs.length - 1) return;
    const newConfigs = [...metricConfigs];
    [newConfigs[index], newConfigs[index + 1]] = [newConfigs[index + 1], newConfigs[index]];
    onUpdate({
      ...widget,
      config: { ...widget.config, metricConfigs: newConfigs },
    });
  };

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view metrics
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

  // Save configuration changes including title
  const saveConfig = () => {
    if (onUpdate && editingTitle !== widget.title) {
      onUpdate({
        ...widget,
        title: editingTitle,
      });
    }
    onCloseConfig?.();
  };

  // Configuration mode
  if (isConfiguring) {
    return (
      <div className="space-y-4 p-2">
        <div className="space-y-2">
          <Label className="text-xs">Widget Title</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {metricConfigs.map((config, index) => (
            <div key={index} className="p-1.5 border rounded space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => moveMetricUp(index)}
                    disabled={index === 0}
                    className={`p-0.5 rounded ${index === 0 ? 'opacity-30' : 'hover:bg-muted'}`}
                    title="Move up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveMetricDown(index)}
                    disabled={index >= metricConfigs.length - 1}
                    className={`p-0.5 rounded ${index >= metricConfigs.length - 1 ? 'opacity-30' : 'hover:bg-muted'}`}
                    title="Move down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <Label className="text-xs ml-1">#{index + 1}</Label>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => removeMetric(index)}
                  className="h-4 w-4 p-0 text-muted-foreground hover:text-destructive"
                >
                  ×
                </Button>
              </div>
              
              <div className="flex gap-1">
                <Select 
                  value={config.metricId} 
                  onValueChange={(val) => updateMetricConfig(index, { metricId: val as MetricId })}
                >
                  <SelectTrigger className="h-6 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {metricDefinitions.map(def => (
                      <SelectItem key={def.id} value={def.id} className="text-xs">
                        <span className="text-muted-foreground text-[10px]">{def.group}:</span> {def.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select 
                  value={config.displayStyle} 
                  onValueChange={(val) => updateMetricConfig(index, { displayStyle: val as DisplayStyle })}
                >
                  <SelectTrigger className="h-6 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number" className="text-xs">Number</SelectItem>
                    <SelectItem value="comparison" className="text-xs">Compare</SelectItem>
                    <SelectItem value="progress" className="text-xs">Progress</SelectItem>
                    <SelectItem value="compact" className="text-xs">Compact</SelectItem>
                    <SelectItem value="ultra-compact" className="text-xs">Ultra Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {config.displayStyle === "comparison" && (
                <Select 
                  value={config.compareToId || ""} 
                  onValueChange={(val) => updateMetricConfig(index, { compareToId: val as MetricId })}
                >
                  <SelectTrigger className="h-6 text-xs">
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
        
        <Button size="sm" variant="outline" onClick={addMetric} className="w-full h-7 text-xs">
          + Add Metric
        </Button>
        
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button size="sm" variant="ghost" onClick={onCloseConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90 text-white">
            Save
          </Button>
        </div>
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

      case "comparison":
        const compareValue = config.compareToId ? getMetricValue(config.compareToId) : 0;
        const compareDef = config.compareToId ? getMetricDef(config.compareToId) : null;
        const percentage = compareValue > 0 ? (value / compareValue) * 100 : 0;
        const isOver = value > compareValue;
        
        return (
          <div key={index} className="p-3 border rounded-md space-y-2" data-testid={`metric-${config.metricId}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{def.name}</span>
              {isOver ? (
                <TrendingUp className="h-3 w-3 text-red-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-green-500" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{formattedValue}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {compareDef ? formatValue(config.compareToId!, compareValue) : "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Progress value={Math.min(100, percentage)} className="h-1.5 flex-1" />
              <span className={`text-xs ${isOver ? 'text-red-500' : 'text-green-500'}`}>
                {percentage.toFixed(0)}%
              </span>
            </div>
          </div>
        );

      case "progress":
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
            <span className="text-[10px] text-muted-foreground truncate">{def.name}</span>
            <span className="text-[10px] font-medium ml-1">{formattedValue}</span>
          </div>
        );

      default:
        return null;
    }
  };

  // Render metrics in configured order (preserving user's ordering)
  return (
    <>
      <div className="space-y-2">
        {/* Render all metrics in the order they were configured */}
        {metricConfigs.map((config, index) => renderMetric(config, index))}
        
        {metricConfigs.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No metrics configured</p>
            <p className="text-xs">Click the gear icon to add metrics</p>
          </div>
        )}
        
        {/* View All Metrics link */}
        <button
          onClick={() => setShowAllMetrics(true)}
          className="w-full text-[10px] text-[#bba7db] hover:text-[#bba7db]/80 flex items-center justify-center gap-1 pt-1"
          data-testid="button-view-all-metrics"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          View All
        </button>
      </div>
      
      {/* View All Metrics Modal */}
      <Dialog open={showAllMetrics} onOpenChange={setShowAllMetrics}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Project Metrics</DialogTitle>
            <DialogDescription>
              Complete overview of all available metrics for {currentProject.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Group by category */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Contract & Revenue</h4>
              <div className="grid grid-cols-2 gap-2">
                {metricDefinitions.filter(d => ["contractPrice", "revisedContractPrice", "variations", "totalApprovedVariations"].includes(d.id)).map(def => (
                  <div key={def.id} className="p-2 border rounded-md">
                    <div className="text-xs text-muted-foreground">{def.name}</div>
                    <div className="text-sm font-medium">{formatValue(def.id, getMetricValue(def.id))}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Costs & Budgets</h4>
              <div className="grid grid-cols-2 gap-2">
                {metricDefinitions.filter(d => ["totalProjectCosts", "actualCosts", "committedCosts", "forecastCosts", "budgetVariance"].includes(d.id)).map(def => (
                  <div key={def.id} className="p-2 border rounded-md">
                    <div className="text-xs text-muted-foreground">{def.name}</div>
                    <div className="text-sm font-medium">{formatValue(def.id, getMetricValue(def.id))}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Profit & Margins</h4>
              <div className="grid grid-cols-2 gap-2">
                {metricDefinitions.filter(d => ["grossProfit", "grossMargin", "forecastGrossProfit", "forecastGrossMargin"].includes(d.id)).map(def => (
                  <div key={def.id} className="p-2 border rounded-md">
                    <div className="text-xs text-muted-foreground">{def.name}</div>
                    <div className="text-sm font-medium">{formatValue(def.id, getMetricValue(def.id))}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Invoicing & WIP</h4>
              <div className="grid grid-cols-2 gap-2">
                {metricDefinitions.filter(d => ["invoicedAmount", "invoicedPercentage", "completionPercentage", "wip", "cashPosition"].includes(d.id)).map(def => (
                  <div key={def.id} className="p-2 border rounded-md">
                    <div className="text-xs text-muted-foreground">{def.name}</div>
                    <div className="text-sm font-medium">{formatValue(def.id, getMetricValue(def.id))}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

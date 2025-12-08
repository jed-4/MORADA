import { TrendingUp, TrendingDown, DollarSign, Percent, BarChart3, ArrowRight, Settings } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type DisplayStyle = "number" | "comparison" | "progress" | "compact";

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

  // Configuration mode
  if (isConfiguring) {
    return (
      <div className="space-y-4 p-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Configure Metrics</h4>
          <Button size="sm" variant="ghost" onClick={onCloseConfig} className="h-6 px-2 text-xs">
            Done
          </Button>
        </div>
        
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {metricConfigs.map((config, index) => (
            <div key={index} className="p-2 border rounded space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Metric {index + 1}</Label>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => removeMetric(index)}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                >
                  ×
                </Button>
              </div>
              
              <Select 
                value={config.metricId} 
                onValueChange={(val) => updateMetricConfig(index, { metricId: val as MetricId })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricDefinitions.map(def => (
                    <SelectItem key={def.id} value={def.id} className="text-xs">
                      {def.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select 
                value={config.displayStyle} 
                onValueChange={(val) => updateMetricConfig(index, { displayStyle: val as DisplayStyle })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number" className="text-xs">Number</SelectItem>
                  <SelectItem value="comparison" className="text-xs">Comparison</SelectItem>
                  <SelectItem value="progress" className="text-xs">Progress Bar</SelectItem>
                  <SelectItem value="compact" className="text-xs">Compact</SelectItem>
                </SelectContent>
              </Select>
              
              {config.displayStyle === "comparison" && (
                <Select 
                  value={config.compareToId || ""} 
                  onValueChange={(val) => updateMetricConfig(index, { compareToId: val as MetricId })}
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
        
        <Button size="sm" variant="outline" onClick={addMetric} className="w-full h-7 text-xs">
          + Add Metric
        </Button>
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
          <div key={index} className="flex items-center justify-between py-1.5 border-b last:border-0" data-testid={`metric-${config.metricId}`}>
            <span className="text-xs text-muted-foreground">{def.name}</span>
            <Badge variant="secondary" className="text-xs font-medium">
              {formattedValue}
            </Badge>
          </div>
        );

      default:
        return null;
    }
  };

  // Group metrics by display style for better layout
  const compactMetrics = metricConfigs.filter(c => c.displayStyle === "compact");
  const otherMetrics = metricConfigs.filter(c => c.displayStyle !== "compact");

  return (
    <div className="space-y-3">
      {/* Non-compact metrics */}
      {otherMetrics.map((config, index) => renderMetric(config, index))}
      
      {/* Compact metrics grouped together */}
      {compactMetrics.length > 0 && (
        <div className="p-2 border rounded-md">
          {compactMetrics.map((config, index) => renderMetric(config, otherMetrics.length + index))}
        </div>
      )}
      
      {metricConfigs.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No metrics configured</p>
          <p className="text-xs">Click the gear icon to add metrics</p>
        </div>
      )}
    </div>
  );
}

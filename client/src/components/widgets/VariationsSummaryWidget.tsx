import { FileEdit, Clock, CheckCircle, AlertCircle, ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function VariationsSummaryWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, formatCurrency } = useProjectMetrics();
  const [, navigate] = useLocation();

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view variations
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/2"></div>
        <div className="h-16 bg-muted rounded"></div>
      </div>
    );
  }

  const netChange = metrics.approvedVariationValue;
  const isPositive = netChange >= 0;

  return (
    <div className="space-y-3">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit className="h-4 w-4 text-[#bba7db]" />
          <span className="font-medium text-sm">Variations</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {metrics.totalVariations} total
        </Badge>
      </div>

      {/* Net Change */}
      <div className="p-3 bg-muted/50 rounded-md">
        <div className="text-xs text-muted-foreground mb-1">Approved Value</div>
        <div className="flex items-center gap-2">
          {isPositive ? (
            <TrendingUp className="h-5 w-5 text-green-500" />
          ) : (
            <TrendingDown className="h-5 w-5 text-red-500" />
          )}
          <span className={`text-xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{formatCurrency(netChange)}
          </span>
        </div>
        {metrics.pendingVariationValue > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            +{formatCurrency(metrics.pendingVariationValue)} pending approval
          </div>
        )}
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 p-2 border rounded-md">
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          <div>
            <div className="text-xs text-muted-foreground">Approved</div>
            <div className="text-sm font-medium">{metrics.approvedVariations}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 border rounded-md">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <div>
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-sm font-medium">{metrics.pendingVariations}</div>
          </div>
        </div>
      </div>

      {/* View All Button */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="w-full h-7 text-xs justify-between"
        onClick={() => navigate('/variations')}
        data-testid="button-view-all-variations"
      >
        <span>View All Variations</span>
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

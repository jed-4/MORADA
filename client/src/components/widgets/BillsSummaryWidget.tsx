import { Receipt, Clock, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation } from "wouter";

export default function BillsSummaryWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, formatCurrency } = useProjectMetrics();
  const [, navigate] = useLocation();

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view bills
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

  const paidPercentage = metrics.totalBills > 0 
    ? (metrics.paidBills / metrics.totalBills) * 100 
    : 0;

  return (
    <div className="space-y-3">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-[#bba7db]" />
          <span className="font-medium text-sm">Bills Overview</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {metrics.totalBills} total
        </Badge>
      </div>

      {/* Actual Costs */}
      <div className="p-3 bg-muted/50 rounded-md">
        <div className="text-xs text-muted-foreground mb-1">Total Paid</div>
        <div className="text-xl font-bold">{formatCurrency(metrics.actualCosts)}</div>
        <div className="flex items-center gap-2 mt-1">
          <Progress value={paidPercentage} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground">{paidPercentage.toFixed(0)}% paid</span>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 p-2 border rounded-md">
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          <div>
            <div className="text-xs text-muted-foreground">Paid</div>
            <div className="text-sm font-medium">{metrics.paidBills}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 border rounded-md">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <div>
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-sm font-medium">{metrics.pendingBills}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 border rounded-md">
          <CheckCircle className="h-3.5 w-3.5 text-blue-500" />
          <div>
            <div className="text-xs text-muted-foreground">Approved</div>
            <div className="text-sm font-medium">{metrics.approvedBills}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 border rounded-md">
          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
          <div>
            <div className="text-xs text-muted-foreground">Overdue</div>
            <div className="text-sm font-medium">{metrics.overdueBills}</div>
          </div>
        </div>
      </div>

      {/* View All Button */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="w-full h-7 text-xs justify-between"
        onClick={() => navigate('/bills')}
        data-testid="button-view-all-bills"
      >
        <span>View All Bills</span>
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

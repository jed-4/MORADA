import { useState, useEffect } from "react";
import { FileText, Clock, CheckCircle, AlertCircle, ArrowRight, DollarSign } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useProjectMetrics } from "@/hooks/useProjectMetrics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";

export default function InvoicesSummaryWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const { currentProject } = useProject();
  const { metrics, isLoading, formatCurrency, formatPercentage } = useProjectMetrics();
  const [, navigate] = useLocation();
  const [editingTitle, setEditingTitle] = useState(widget.title);
  
  useEffect(() => {
    setEditingTitle(widget.title);
  }, [widget.title]);

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view invoices
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

  // Configuration mode
  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ ...widget, title: editingTitle });
      }
      onCloseConfig?.();
    };
    
    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      onCloseConfig?.();
    };
    
    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Invoices Summary</h4>
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#bba7db]" />
          <span className="font-medium text-sm">Client Invoices</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {metrics.totalInvoices} total
        </Badge>
      </div>

      {/* Invoiced & Paid Summary */}
      <div className="space-y-2">
        <div className="p-3 bg-muted/50 rounded-md">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Invoiced</span>
            <span className="text-xs text-muted-foreground">{formatPercentage(metrics.invoicedPercentage)}</span>
          </div>
          <div className="text-lg font-bold">{formatCurrency(metrics.invoicedAmount)}</div>
          <Progress value={metrics.invoicedPercentage} className="h-1.5 mt-1" />
        </div>

        <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-green-700 dark:text-green-300">Collected</span>
            <span className="text-xs text-green-700 dark:text-green-300">{formatPercentage(metrics.paidInvoicesPercentage)}</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-600" />
            <span className="text-lg font-bold text-green-700 dark:text-green-300">
              {formatCurrency(metrics.paidInvoices)}
            </span>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center p-2 border rounded-md">
          <CheckCircle className="h-3.5 w-3.5 text-green-500 mb-1" />
          <div className="text-sm font-medium">{metrics.paidInvoicesCount}</div>
          <div className="text-xs text-muted-foreground">Paid</div>
        </div>
        <div className="flex flex-col items-center p-2 border rounded-md">
          <Clock className="h-3.5 w-3.5 text-amber-500 mb-1" />
          <div className="text-sm font-medium">{metrics.unpaidInvoices}</div>
          <div className="text-xs text-muted-foreground">Unpaid</div>
        </div>
        <div className="flex flex-col items-center p-2 border rounded-md">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 mb-1" />
          <div className="text-sm font-medium">{metrics.overdueInvoices}</div>
          <div className="text-xs text-muted-foreground">Overdue</div>
        </div>
      </div>

      {/* Remaining Balance */}
      {metrics.remainingBalance > 0 && (
        <div className="text-xs text-muted-foreground text-center">
          {formatCurrency(metrics.remainingBalance)} remaining to collect
        </div>
      )}

      {/* View All Button */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="w-full h-7 text-xs justify-between"
        onClick={() => navigate('/invoices')}
        data-testid="button-view-all-invoices"
      >
        <span>View All Invoices</span>
        <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

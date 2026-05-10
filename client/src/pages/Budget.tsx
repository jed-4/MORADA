import { useParams } from "wouter";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, DollarSign, AlertCircle, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Budget, BudgetLineItem, LabourHoursBudget, Project } from "@shared/schema";
import type { ContractMetrics } from "@shared/projectMetrics";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PHASE_LABELS: Record<string, string> = {
  lead: "Lead",
  pre_construction: "Pre-Construction",
  construction: "Construction",
  post_construction: "Post-Construction",
  archive: "Archive",
};

export default function BudgetPage() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Budget" });
  const [activeTab, setActiveTab] = useState<"costs" | "hours">("costs");
  const [hideEmptyCostCodes, setHideEmptyCostCodes] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('budget-hide-empty-cost-codes');
      return saved ? JSON.parse(saved) : false;
    } catch { return false; }
  });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Fetch project to get current phase
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: budget, isLoading: budgetLoading } = useQuery<Budget>({
    queryKey: [`/api/projects/${projectId}/budget`],
    enabled: !!projectId,
  });

  const { data: lineItems = [], isLoading: lineItemsLoading } = useQuery<BudgetLineItem[]>({
    queryKey: [`/api/budgets/${budget?.id}/line-items`],
    enabled: !!budget?.id,
  });

  const { data: labourHours = [], isLoading: labourHoursLoading } = useQuery<LabourHoursBudget[]>({
    queryKey: [`/api/projects/${projectId}/labour-hours-budget`],
    enabled: !!projectId,
  });

  const { data: contractMetrics } = useQuery<ContractMetrics>({
    queryKey: ["/api/projects", projectId, "contract-metrics"],
    queryFn: () => apiRequest(`/api/projects/${projectId}/contract-metrics`, "GET"),
    enabled: !!projectId,
  });

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${projectId}/budget/calculate`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/budget`] });
      toast({
        title: "Budget recalculated",
        description: "Budget has been updated with latest data from estimates and bills.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to recalculate",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  });

  const recalculateLineItemsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/budgets/${budget?.id}/line-items/recalculate`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/budgets/${budget?.id}/line-items`] });
      toast({
        title: "Line items recalculated",
        description: "Budget breakdown has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to recalculate",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  });

  const recalculateLabourHoursMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${projectId}/labour-hours-budget/recalculate`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/labour-hours-budget`] });
      toast({
        title: "Labour hours recalculated",
        description: "Hours budget has been updated from labour estimate items.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to recalculate hours",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  });

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  const formatHours = (hours: string | number) => {
    const numHours = typeof hours === 'string' ? parseFloat(hours) : hours;
    return `${numHours.toFixed(1)}hrs`;
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return "text-[hsl(var(--bp-green))]";
    if (variance < 0) return "text-[hsl(var(--bp-coral))]";
    return "text-muted-foreground";
  };

  const getVarianceBadgeVariant = (variance: number): "default" | "destructive" | "outline" => {
    if (variance > 0) return "default";
    if (variance < 0) return "destructive";
    return "outline";
  };

  const totalBudgetedHours = labourHours.reduce((sum, item) => sum + parseFloat(item.budgetedHours || "0"), 0);
  const totalPendingHours = labourHours.reduce((sum, item) => sum + parseFloat(item.pendingHours || "0"), 0);
  const totalApprovedHours = labourHours.reduce((sum, item) => sum + parseFloat(item.approvedHours || "0"), 0);
  const totalActualHours = totalPendingHours + totalApprovedHours;
  const hoursRemaining = totalBudgetedHours - totalActualHours;
  const hoursPercentUsed = totalBudgetedHours > 0 ? Math.round((totalActualHours / totalBudgetedHours) * 100) : 0;

  type CostRow =
    | { kind: "category"; id: string; categoryTitle: string; count: number; budgeted: number; actual: number; forecast: number; variance: number }
    | { kind: "item"; id: string; item: BudgetLineItem; categoryTitle: string };

  const costRows = useMemo<CostRow[]>(() => {
    const catMap = new Map<string, BudgetLineItem[]>();
    lineItems.forEach((item) => {
      const key = item.categoryTitle || "Uncategorized";
      if (!catMap.has(key)) catMap.set(key, []);
      catMap.get(key)!.push(item);
    });
    const sorted = Array.from(catMap.entries()).sort((a, b) => {
      if (a[0] === "Uncategorized") return 1;
      if (b[0] === "Uncategorized") return -1;
      return a[0].localeCompare(b[0]);
    });
    const rows: CostRow[] = [];
    sorted.forEach(([categoryTitle, catItems]) => {
      const budgeted = catItems.reduce((s, i) => s + i.budgetedAmount, 0);
      const actual = catItems.reduce((s, i) => s + i.actualAmount, 0);
      const forecast = catItems.reduce((s, i) => s + i.forecastAmount, 0);
      const variance = catItems.reduce((s, i) => s + i.variance, 0);
      rows.push({
        kind: "category",
        id: `cat-${categoryTitle}`,
        categoryTitle,
        count: catItems.length,
        budgeted,
        actual,
        forecast,
        variance,
      });
      const isCollapsed = collapsedCategories.has(categoryTitle);
      if (!isCollapsed) {
        catItems.forEach((item) => {
          rows.push({ kind: "item", id: item.id, item, categoryTitle });
        });
      }
    });
    return rows;
  }, [lineItems, collapsedCategories]);

  const costColumns = useMemo<ColumnDef<CostRow, unknown>[]>(() => [
    {
      id: "category",
      header: "Cost Code",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "category") {
          const isCollapsed = collapsedCategories.has(r.categoryTitle);
          return (
            <div className="flex items-center gap-1.5 font-semibold text-xs">
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              )}
              <span>{r.categoryTitle}</span>
              <Badge variant="secondary" className="h-4 px-1.5 text-data">{r.count}</Badge>
            </div>
          );
        }
        return <div className="text-xs pl-5 font-medium">{r.item.costCodeTitle || "—"}</div>;
      },
      size: 280,
      meta: { defaultWidth: 280, headerLabel: "Cost Code" },
    },
    {
      id: "budgeted",
      header: "Budgeted",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const value = r.kind === "category" ? r.budgeted : r.item.budgetedAmount;
        return (
          <span className={cn("text-xs tabular-nums", r.kind === "category" && "font-semibold")} data-testid={r.kind === "item" ? `text-budgeted-${r.id}` : undefined}>
            {formatCurrency(value)}
          </span>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Budgeted" },
    },
    {
      id: "actual",
      header: "Actual",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const value = r.kind === "category" ? r.actual : r.item.actualAmount;
        return (
          <span className={cn("text-xs tabular-nums", r.kind === "category" && "font-semibold")} data-testid={r.kind === "item" ? `text-actual-${r.id}` : undefined}>
            {formatCurrency(value)}
          </span>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Actual" },
    },
    {
      id: "forecast",
      header: "Forecast",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const value = r.kind === "category" ? r.forecast : r.item.forecastAmount;
        return (
          <span className={cn("text-xs tabular-nums", r.kind === "category" && "font-semibold")} data-testid={r.kind === "item" ? `text-forecast-${r.id}` : undefined}>
            {formatCurrency(value)}
          </span>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Forecast" },
    },
    {
      id: "variance",
      header: "Variance",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const value = r.kind === "category" ? r.variance : r.item.variance;
        return (
          <span className={cn("text-xs tabular-nums", r.kind === "category" && "font-semibold", getVarianceColor(value))} data-testid={r.kind === "item" ? `text-variance-${r.id}` : undefined}>
            {formatCurrency(value)}
          </span>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Variance" },
    },
    {
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const value = r.kind === "category" ? r.variance : r.item.variance;
        return (
          <Badge variant={getVarianceBadgeVariant(value)} className="h-4 px-1.5 text-data">
            {value > 0 ? "Under" : value < 0 ? "Over" : "On Track"}
          </Badge>
        );
      },
      size: 90,
      meta: { defaultWidth: 90, align: "right", headerLabel: "Status" },
    },
  ], [collapsedCategories]);

  const filteredLabourHours = hideEmptyCostCodes
    ? labourHours.filter(item => {
        const budgeted = parseFloat(item.budgetedHours || "0");
        const pending = parseFloat(item.pendingHours || "0");
        const approved = parseFloat(item.approvedHours || "0");
        return budgeted !== 0 || pending !== 0 || approved !== 0;
      })
    : labourHours;

  const labourHoursColumns = useMemo<ColumnDef<LabourHoursBudget, unknown>[]>(() => [
    {
      id: "costCode",
      header: "Cost Code",
      accessorFn: (item) => item.costCodeTitle || "Uncategorized",
      cell: ({ row }) => (
        <span className="font-medium text-xs">{row.original.costCodeTitle || "Uncategorized"}</span>
      ),
      size: 220,
      meta: { defaultWidth: 220, headerLabel: "Cost Code" },
    },
    {
      id: "budgeted",
      header: "Budgeted",
      accessorFn: (item) => parseFloat(item.budgetedHours || "0"),
      cell: ({ row }) => (
        <span className="text-xs tabular-nums" data-testid={`text-budgeted-${row.original.id}`}>
          {formatHours(parseFloat(row.original.budgetedHours || "0"))}
        </span>
      ),
      size: 100,
      meta: { defaultWidth: 100, align: "right", headerLabel: "Budgeted" },
    },
    {
      id: "pending",
      header: "Pending",
      accessorFn: (item) => parseFloat(item.pendingHours || "0"),
      cell: ({ row }) => (
        <span className="text-xs tabular-nums text-[hsl(var(--bp-amber))]" data-testid={`text-pending-${row.original.id}`}>
          {formatHours(parseFloat(row.original.pendingHours || "0"))}
        </span>
      ),
      size: 100,
      meta: { defaultWidth: 100, align: "right", headerLabel: "Pending" },
    },
    {
      id: "approved",
      header: "Approved",
      accessorFn: (item) => parseFloat(item.approvedHours || "0"),
      cell: ({ row }) => (
        <span className="text-xs tabular-nums" data-testid={`text-approved-${row.original.id}`}>
          {formatHours(parseFloat(row.original.approvedHours || "0"))}
        </span>
      ),
      size: 100,
      meta: { defaultWidth: 100, align: "right", headerLabel: "Approved" },
    },
    {
      id: "total",
      header: "Total",
      accessorFn: (item) => parseFloat(item.pendingHours || "0") + parseFloat(item.approvedHours || "0"),
      cell: ({ row }) => {
        const total = parseFloat(row.original.pendingHours || "0") + parseFloat(row.original.approvedHours || "0");
        return (
          <span className="text-xs tabular-nums font-medium" data-testid={`text-total-${row.original.id}`}>
            {formatHours(total)}
          </span>
        );
      },
      size: 100,
      meta: { defaultWidth: 100, align: "right", headerLabel: "Total" },
    },
    {
      id: "variance",
      header: "Variance",
      accessorFn: (item) => parseFloat(item.budgetedHours || "0") - (parseFloat(item.pendingHours || "0") + parseFloat(item.approvedHours || "0")),
      cell: ({ row }) => {
        const budgeted = parseFloat(row.original.budgetedHours || "0");
        const total = parseFloat(row.original.pendingHours || "0") + parseFloat(row.original.approvedHours || "0");
        const variance = budgeted - total;
        return (
          <span className={cn("text-xs tabular-nums", getVarianceColor(variance))} data-testid={`text-variance-${row.original.id}`}>
            {formatHours(variance)}
          </span>
        );
      },
      size: 100,
      meta: { defaultWidth: 100, align: "right", headerLabel: "Variance" },
    },
    {
      id: "percentUsed",
      header: "% Used",
      accessorFn: (item) => {
        const budgeted = parseFloat(item.budgetedHours || "0");
        const total = parseFloat(item.pendingHours || "0") + parseFloat(item.approvedHours || "0");
        return budgeted > 0 ? Math.round((total / budgeted) * 100) : 0;
      },
      cell: ({ row }) => {
        const budgeted = parseFloat(row.original.budgetedHours || "0");
        const total = parseFloat(row.original.pendingHours || "0") + parseFloat(row.original.approvedHours || "0");
        const percentUsed = budgeted > 0 ? Math.round((total / budgeted) * 100) : 0;
        return (
          <div className="flex items-center justify-end gap-1">
            <span className="text-xs tabular-nums">{percentUsed}%</span>
            <Progress value={percentUsed} className="w-12 h-1.5" />
          </div>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "% Used" },
    } satisfies ColumnDef<LabourHoursBudget, unknown> & { meta: DataTableColumnMeta },
  ], []);

  const handleToggleEmpty = (checked: boolean) => {
    setHideEmptyCostCodes(checked);
    try { localStorage.setItem('budget-hide-empty-cost-codes', JSON.stringify(checked)); } catch {}
  };

  const handleRecalculate = () => {
    if (activeTab === "costs") {
      recalculateMutation.mutate();
      if (budget?.id) {
        recalculateLineItemsMutation.mutate();
      }
    } else {
      recalculateLabourHoursMutation.mutate();
    }
  };

  const isRecalculating = activeTab === "costs" 
    ? (recalculateMutation.isPending || recalculateLineItemsMutation.isPending)
    : recalculateLabourHoursMutation.isPending;

  if (budgetLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-9 bg-background flex items-center px-2 gap-4 flex-shrink-0">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="h-9 bg-background flex items-center px-2 border-b border-border flex-shrink-0">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="p-2 space-y-2">
          <div className="grid gap-2 grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const budgetData = budget || {
    baselineAmount: 0,
    revisedAmount: 0,
    actualAmount: 0,
    forecastAmount: 0,
    varianceAmount: 0,
    profitPercent: 0,
  };

  return (
    <div className="flex flex-col h-full" data-testid="page-budget">
      {/* SUB-HEADER */}
      <div className="flex items-center justify-between px-4 h-[52px] bg-background border-b border-border flex-shrink-0">
        {/* Left — three contract chips (inc + ex GST) */}
        <div className="flex items-center gap-2">
          {[
            {
              label: "Contract",
              inc:
                contractMetrics?.originalContractPriceIncGstCents ??
                budgetData.baselineAmount ??
                0,
              ex: contractMetrics?.originalContractPriceExGstCents ?? 0,
              testid: "chip-contract-original",
            },
            {
              label: "Variations",
              inc: contractMetrics?.approvedVariationsIncGstCents ?? 0,
              ex: contractMetrics?.approvedVariationsExGstCents ?? 0,
              testid: "chip-contract-variations",
            },
            {
              label: "Revised",
              inc:
                contractMetrics?.revisedContractPriceIncGstCents ??
                budgetData.revisedAmount ??
                0,
              ex: contractMetrics?.revisedContractPriceExGstCents ?? 0,
              testid: "chip-contract-revised",
            },
          ].map((chip) => (
            <div
              key={chip.label}
              className="flex flex-col px-3 py-1 rounded-md border border-border bg-[hsl(var(--bp-subtle))] min-w-[140px]"
              data-testid={chip.testid}
            >
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide leading-tight">
                {chip.label}
              </span>
              <span className="text-[12px] font-semibold text-foreground leading-tight tabular-nums">
                {formatCurrency(chip.inc)}{" "}
                <span className="text-[9px] font-normal text-muted-foreground">inc GST</span>
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight tabular-nums">
                {formatCurrency(chip.ex)} ex GST
              </span>
            </div>
          ))}
        </div>

        {/* Right — recalculate */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="h-7 px-3 text-[11px] bg-[hsl(var(--bp-purple))] hover:bg-[hsl(var(--bp-purple)/0.9)] text-white"
            data-testid="button-recalculate"
          >
            <RefreshCw size={11} className={cn("mr-1", isRecalculating && "animate-spin")} />
            Recalculate
          </Button>
        </div>
      </div>

      {/* TAB ROW */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-stretch h-full">
          <button
            onClick={() => setActiveTab("costs")}
            className={cn(
              "relative h-full px-3 text-[12px] font-medium transition-colors flex items-center gap-1",
              activeTab === "costs"
                ? "text-[hsl(var(--bp-purple))]"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-costs"
          >
            <DollarSign className="w-3 h-3" />
            <span>Costs</span>
            {activeTab === "costs" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--bp-purple))] rounded-t-sm" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("hours")}
            className={cn(
              "relative h-full px-3 text-[12px] font-medium transition-colors flex items-center gap-1",
              activeTab === "hours"
                ? "text-[hsl(var(--bp-purple))]"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid="tab-labour-hours"
          >
            <Clock className="w-3 h-3" />
            <span>Labour Hours</span>
            {activeTab === "hours" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--bp-purple))] rounded-t-sm" />
            )}
          </button>
        </div>

        {activeTab === "costs" && budgetData && (
          <div className="flex items-center gap-0 text-[11px]">
            {[
              { label: "Budget", value: budgetData.baselineAmount, color: "text-foreground" },
              { label: "Spent", value: budgetData.actualAmount, color: "text-muted-foreground" },
              {
                label: "Remaining",
                value: (budgetData.revisedAmount ?? 0) - (budgetData.actualAmount ?? 0),
                color: getVarianceColor((budgetData.revisedAmount ?? 0) - (budgetData.actualAmount ?? 0)),
              },
              { label: "Forecast", value: budgetData.forecastAmount, color: "text-foreground" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={cn("flex flex-col px-3", i > 0 && "border-l border-border")}
                data-testid={`stat-${stat.label.toLowerCase()}`}
              >
                <span className="text-[9px] text-muted-foreground leading-tight">{stat.label}</span>
                <span className={cn("font-semibold leading-snug tabular-nums", stat.color)}>
                  {formatCurrency(stat.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "hours" && (
          <div className="flex items-center gap-0 text-[11px]">
            {[
              { label: "Budgeted", value: formatHours(totalBudgetedHours), color: "text-foreground" },
              { label: "Pending", value: formatHours(totalPendingHours), color: "text-[hsl(var(--bp-amber))]" },
              { label: "Approved", value: formatHours(totalApprovedHours), color: "text-foreground" },
              {
                label: "Remaining",
                value: formatHours(hoursRemaining),
                color: getVarianceColor(hoursRemaining),
              },
              { label: "Efficiency", value: `${hoursPercentUsed}%`, color: "text-foreground" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={cn("flex flex-col px-3", i > 0 && "border-l border-border")}
                data-testid={`stat-hours-${stat.label.toLowerCase()}`}
              >
                <span className="text-[9px] text-muted-foreground leading-tight">{stat.label}</span>
                <span className={cn("font-semibold leading-snug tabular-nums", stat.color)}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {activeTab === "costs" && (
          <>
            {/* Cost Code Breakdown Table */}
            <Card className="flex flex-col h-full">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">Cost Code Breakdown</CardTitle>
                <CardDescription className="text-xs">Budget vs actual costs by cost code</CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                {lineItemsLoading ? (
                  <div className="p-3 space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : lineItems.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-sm font-semibold mb-1">No budget breakdown available</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Click "Recalculate" to generate budget breakdown from your estimates and bills.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0">
                    <DataTable
                      data={costRows}
                      columns={costColumns}
                      storageKey="budget-costs"
                      legacyConfigKey="budget-column-config-v1"
                      rowKey={(row) => row.id}
                      onRowClick={(row) => {
                        if (row.kind === "category") {
                          setCollapsedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.categoryTitle)) next.delete(row.categoryTitle);
                            else next.add(row.categoryTitle);
                            return next;
                          });
                        }
                      }}
                      rowClassName={(row) => row.kind === "category" ? "bg-muted/40" : ""}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "hours" && (
          <>
            {/* Labour Hours Breakdown Table */}
            <Card className="flex flex-col h-full">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-sm">Hours by Cost Code</CardTitle>
                    <CardDescription className="text-xs">Labour hours budget vs actual by cost code</CardDescription>
                  </div>
                  {labourHours.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="hide-empty"
                        checked={hideEmptyCostCodes}
                        onCheckedChange={handleToggleEmpty}
                      />
                      <Label htmlFor="hide-empty" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                        Hide empty
                      </Label>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                {labourHoursLoading ? (
                  <div className="p-3 space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : labourHours.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-sm font-semibold mb-1">No labour hours budget</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Click "Recalculate" to generate hours budget from estimates and timesheets.
                    </p>
                  </div>
                ) : filteredLabourHours.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    {hideEmptyCostCodes
                      ? "All cost codes have zero hours. Turn off \"Hide empty\" to see all."
                      : "No labour hours data available."}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0">
                    <DataTable
                      data={filteredLabourHours}
                      columns={labourHoursColumns}
                      storageKey="budget-hours"
                      legacyConfigKey="budget-column-config-v1"
                      rowKey={(row) => row.id}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

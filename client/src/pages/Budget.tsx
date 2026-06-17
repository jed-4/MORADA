import { useParams, Link } from "wouter";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, DollarSign, AlertCircle, Clock, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Budget, BudgetLineItem, LabourHoursBudget, Project } from "@shared/schema";
import type { ContractMetrics } from "@shared/projectMetrics";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePermission } from "@/hooks/use-permission";

const PHASE_LABELS: Record<string, string> = {
  lead: "Lead",
  pre_construction: "Pre-Construction",
  construction: "Construction",
  post_construction: "Post-Construction",
  archive: "Archive",
};

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export default function BudgetPage() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Budget" });
  const canViewLabour = usePermission("financial.budget_labour", "view");
  const canViewActuals = usePermission("financial.budget_actuals", "view");
  const isDark = useIsDark();

  const [activeTab, setActiveTab] = useState<"costs" | "hours">("costs");

  // If the currently active tab is not accessible, switch to the first accessible one.
  // This also handles the initial render where permissions load asynchronously.
  useEffect(() => {
    if (activeTab === "costs" && !canViewActuals && canViewLabour) {
      setActiveTab("hours");
    } else if (activeTab === "hours" && !canViewLabour && canViewActuals) {
      setActiveTab("costs");
    }
  }, [canViewActuals, canViewLabour, activeTab]);

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
    enabled: !!projectId && canViewActuals,
  });

  const { data: lineItems = [], isLoading: lineItemsLoading } = useQuery<BudgetLineItem[]>({
    queryKey: [`/api/budgets/${budget?.id}/line-items`],
    enabled: !!budget?.id && canViewActuals,
  });

  const { data: labourHours = [], isLoading: labourHoursLoading } = useQuery<LabourHoursBudget[]>({
    queryKey: [`/api/projects/${projectId}/labour-hours-budget`],
    enabled: !!projectId && canViewLabour,
  });

  const { data: contractMetrics } = useQuery<ContractMetrics>({
    queryKey: ["/api/projects", projectId, "contract-metrics"],
    queryFn: () => apiRequest(`/api/projects/${projectId}/contract-metrics`, "GET"),
    enabled: !!projectId && canViewActuals,
  });

  // Actual costs to date (ex-GST, cents): bills + labour (timesheets) + internal (future).
  // Powers the ACTUAL gross-margin bar below.
  const { data: actualCosts } = useQuery<{
    billsCostExGstCents: number;
    timesheetCostCents: number;
    internalCostCents: number;
    actualCostExGstCents: number;
  }>({
    queryKey: ["/api/projects", projectId, "actual-costs"],
    queryFn: () => apiRequest(`/api/projects/${projectId}/actual-costs`, "GET"),
    enabled: !!projectId && canViewActuals,
  });

  // Drill-down: which cost code's Actual is being inspected (null = closed).
  const [actualDrill, setActualDrill] = useState<{ costCodeId: string | null; title: string } | null>(null);
  const { data: drillData, isLoading: drillLoading } = useQuery<{
    total: number;
    bills: Array<{
      billId: string;
      billNumber: string | null;
      billType: string | null;
      status: string | null;
      billDate: string | null;
      supplierName: string;
      lineTotal: number;
      lines: Array<{ id: string; description: string; total: number }>;
    }>;
  }>({
    queryKey: ["/api/projects", projectId, "budget-actuals", actualDrill?.costCodeId ?? "uncategorized"],
    queryFn: () =>
      apiRequest(
        `/api/projects/${projectId}/budget-actuals${actualDrill?.costCodeId ? `?costCodeId=${actualDrill.costCodeId}` : ""}`,
        "GET",
      ),
    enabled: !!projectId && !!actualDrill,
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

  const renderStatusChip = (value: number) => {
    const label = value > 0 ? "Under" : value < 0 ? "Over" : "On Track";
    const tone =
      value > 0
        ? "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]"
        : value < 0
          ? "bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))]"
          : "bg-muted text-muted-foreground";
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-[68px] h-5 rounded-md text-[10px] font-medium",
          tone,
        )}
      >
        {label}
      </span>
    );
  };

  const renderCategoryAmountChip = (value: number, variance = false) => {
    const tone = variance
      ? value > 0
        ? "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]"
        : value < 0
          ? "bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))]"
          : "bg-muted text-muted-foreground"
      : "bg-[hsl(var(--bp-subtle))] text-foreground";
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center px-2 h-5 rounded-md text-xs font-semibold tabular-nums",
          tone,
        )}
      >
        {formatCurrency(value)}
      </span>
    );
  };

  const totalBudgetedHours = labourHours.reduce((sum, item) => sum + parseFloat(item.budgetedHours || "0"), 0);
  const totalPendingHours = labourHours.reduce((sum, item) => sum + parseFloat(item.pendingHours || "0"), 0);
  const totalApprovedHours = labourHours.reduce((sum, item) => sum + parseFloat(item.approvedHours || "0"), 0);
  const totalActualHours = totalPendingHours + totalApprovedHours;
  const hoursRemaining = totalBudgetedHours - totalActualHours;
  const hoursPercentUsed = totalBudgetedHours > 0 ? Math.round((totalActualHours / totalBudgetedHours) * 100) : 0;

  type CostRow =
    | { kind: "category"; id: string; categoryTitle: string; count: number; budgeted: number; actual: number }
    | { kind: "item"; id: string; item: BudgetLineItem; categoryTitle: string; zebra: boolean };

  const costRows = useMemo<CostRow[]>(() => {
    const catMap = new Map<string, BudgetLineItem[]>();
    lineItems.forEach((item) => {
      const key = item.categoryTitle || "Uncategorized";
      if (!catMap.has(key)) catMap.set(key, []);
      catMap.get(key)!.push(item);
    });
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const sorted = Array.from(catMap.entries()).sort((a, b) => {
      if (a[0] === "Uncategorized") return 1;
      if (b[0] === "Uncategorized") return -1;
      return collator.compare(a[0], b[0]);
    });
    const rows: CostRow[] = [];
    let itemIdx = 0;
    sorted.forEach(([categoryTitle, catItems]) => {
      const items = [...catItems].sort((a, b) =>
        collator.compare(a.costCodeTitle || "", b.costCodeTitle || ""),
      );
      const budgeted = items.reduce((s, i) => s + i.budgetedAmount, 0);
      const actual = items.reduce((s, i) => s + i.actualAmount, 0);
      rows.push({
        kind: "category",
        id: `cat-${categoryTitle}`,
        categoryTitle,
        count: items.length,
        budgeted,
        actual,
      });
      const isCollapsed = collapsedCategories.has(categoryTitle);
      if (!isCollapsed) {
        items.forEach((item) => {
          rows.push({ kind: "item", id: item.id, item, categoryTitle, zebra: itemIdx % 2 === 1 });
          itemIdx++;
        });
      }
    });
    return rows;
  }, [lineItems, collapsedCategories]);

  const costTotals = useMemo(() => {
    const budgeted = lineItems.reduce((s, i) => s + i.budgetedAmount, 0);
    const actual = lineItems.reduce((s, i) => s + i.actualAmount, 0);
    return { budgeted, actual, difference: budgeted - actual };
  }, [lineItems]);

  const allCategoryTitles = useMemo(() => {
    const set = new Set<string>();
    lineItems.forEach((item) => set.add(item.categoryTitle || "Uncategorized"));
    return Array.from(set);
  }, [lineItems]);

  const allCollapsed = allCategoryTitles.length > 0 && allCategoryTitles.every((t) => collapsedCategories.has(t));

  const toggleCollapseAll = () => {
    setCollapsedCategories(allCollapsed ? new Set() : new Set(allCategoryTitles));
  };

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
        if (r.kind === "category") return renderCategoryAmountChip(value);
        return (
          <span className="text-xs tabular-nums" data-testid={`text-budgeted-${r.id}`}>
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
        if (r.kind === "category") return renderCategoryAmountChip(value);
        if (value === 0) {
          return (
            <span className="text-xs tabular-nums text-muted-foreground" data-testid={`text-actual-${r.id}`}>
              {formatCurrency(value)}
            </span>
          );
        }
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActualDrill({
                costCodeId: r.item.costCodeId,
                title: r.item.costCodeTitle || "Uncategorized",
              });
            }}
            className="text-xs tabular-nums text-[hsl(var(--bp-purple))] underline-offset-2 hover:underline"
            data-testid={`button-actual-${r.id}`}
          >
            {formatCurrency(value)}
          </button>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Actual" },
    },
    {
      id: "variance",
      header: "Difference",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const value = r.kind === "category" ? r.budgeted - r.actual : r.item.budgetedAmount - r.item.actualAmount;
        if (r.kind === "category") return renderCategoryAmountChip(value, true);
        return (
          <span className={cn("text-xs tabular-nums", getVarianceColor(value))} data-testid={`text-difference-${r.id}`}>
            {formatCurrency(value)}
          </span>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Difference" },
    },
    {
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const value = r.kind === "category" ? r.budgeted - r.actual : r.item.budgetedAmount - r.item.actualAmount;
        return renderStatusChip(value);
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
    if (activeTab === "costs" && canViewActuals) {
      recalculateMutation.mutate();
      if (budget?.id) {
        recalculateLineItemsMutation.mutate();
      }
    } else if (activeTab === "hours" && canViewLabour) {
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

  if (!canViewActuals && !canViewLabour) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-center p-8" data-testid="page-budget-no-access">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <h3 className="text-sm font-semibold">No budget access</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          You don't have permission to view the budget. Contact your administrator to request access.
        </p>
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

  // Row banding tints — warm muted in light mode, subtle foreground overlay in
  // dark mode (where --muted ≈ --card). Mirrors the Monthly Actuals approach.
  const rowTints = {
    zebra: isDark ? "hsl(var(--foreground) / 0.05)" : "hsl(var(--muted) / 0.5)",
    category: isDark ? "hsl(var(--foreground) / 0.09)" : "hsl(var(--muted) / 0.85)",
  };

  // Builds the row style. `--dt-row-bg` is composited over the card so the
  // sticky first column stays opaque (no bleed-through on horizontal scroll).
  const rowBgStyle = (tint: string | null): React.CSSProperties => {
    if (!tint) {
      return { ["--dt-row-bg"]: "hsl(var(--card))" } as React.CSSProperties;
    }
    return {
      backgroundColor: tint,
      ["--dt-row-bg"]: `linear-gradient(${tint}, ${tint}), hsl(var(--card))`,
    } as React.CSSProperties;
  };

  const renderTotalsBar = (
    segments: { label: string; value: string; color?: string }[],
  ) => (
    <div
      className="flex-shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 border-t-2 border-border bg-[hsl(var(--muted)/0.7)] dark:bg-[hsl(var(--foreground)/0.07)]"
      data-testid="budget-totals-bar"
    >
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Total
      </span>
      <div className="flex items-center flex-wrap justify-end gap-y-1">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className={cn("flex flex-col items-end px-3", i > 0 && "border-l border-border/60")}
            data-testid={`total-${seg.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          >
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">
              {seg.label}
            </span>
            <span className={cn("text-sm font-bold tabular-nums leading-snug", seg.color ?? "text-foreground")}>
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderLegend = () => (
    <div className="flex-shrink-0 flex items-center flex-wrap gap-x-5 gap-y-1 px-3 py-1.5 border-t border-border/50">
      {[
        { color: "hsl(var(--bp-green))", label: "Under" },
        { color: "hsl(var(--muted-foreground) / 0.4)", label: "On Track" },
        { color: "hsl(var(--bp-coral))", label: "Over" },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full" data-testid="page-budget">
      {/* TAB ROW */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-stretch h-full">
          {canViewActuals && (
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
          )}
          {canViewLabour && (
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
          )}
        </div>

        <div className="flex items-center gap-2">
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
        <Button
          size="icon"
          variant="ghost"
          onClick={handleRecalculate}
          disabled={isRecalculating}
          className="h-7 w-7 text-[hsl(var(--bp-purple))]"
          data-testid="button-recalculate"
          title="Recalculate"
          aria-label="Recalculate"
        >
          <RefreshCw size={14} className={cn(isRecalculating && "animate-spin")} />
        </Button>
        </div>
      </div>

      {/* CONTRACT CHIPS (ex GST) — only visible to users with financial.budget_actuals */}
      {canViewActuals && (
        <div className="flex items-center gap-2 px-2 py-2 bg-background border-b border-border flex-shrink-0">
          {[
            {
              label: "Contract",
              ex:
                contractMetrics?.originalContractPriceExGstCents ??
                budgetData.baselineAmount ??
                0,
              testid: "chip-contract-original",
            },
            {
              label: "Variations",
              ex: contractMetrics?.approvedVariationsExGstCents ?? 0,
              testid: "chip-contract-variations",
            },
            {
              label: "Revised",
              ex:
                contractMetrics?.revisedContractPriceExGstCents ??
                budgetData.revisedAmount ??
                0,
              testid: "chip-contract-revised",
            },
          ].map((chip) => (
            <div
              key={chip.label}
              className="flex items-baseline gap-2 px-3 py-1 rounded-md border border-border bg-[hsl(var(--bp-subtle))]"
              data-testid={chip.testid}
            >
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                {chip.label}
              </span>
              <span className="text-[12px] font-semibold text-foreground tabular-nums">
                {formatCurrency(chip.ex)}
              </span>
              <span className="text-[9px] font-normal text-muted-foreground">ex GST</span>
            </div>
          ))}
        </div>
      )}

      {/* GROSS MARGIN BAR (ex GST) — costs tab only. Shows the ACTUAL gross margin
          to date: revised contract (ex GST) minus actual costs incurred so far
          (bills + labour). Note: mid-project this margin looks high because revenue
          is the full contract while costs are only what has been incurred. */}
      {activeTab === "costs" && canViewActuals && (() => {
        const revisedCents =
          contractMetrics?.revisedContractPriceExGstCents ?? budgetData.revisedAmount ?? 0;
        const billsCents = actualCosts?.billsCostExGstCents ?? 0;
        const labourCents = actualCosts?.timesheetCostCents ?? 0;
        const actualCostCents = actualCosts?.actualCostExGstCents ?? 0;
        const grossProfitCents = revisedCents - actualCostCents;
        const marginPct = revisedCents > 0 ? (grossProfitCents / revisedCents) * 100 : 0;
        const costBreakdown = `Bills: ${formatCurrency(billsCents)}  •  Labour: ${formatCurrency(labourCents)}`;
        return (
          <div
            className="flex items-center gap-x-4 gap-y-1 px-3 py-1.5 bg-[hsl(var(--bp-subtle))] border-b border-border flex-shrink-0 flex-wrap text-[11px]"
            data-testid="bar-gross-margin"
          >
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
              Gross Margin (ex GST) · to date
            </span>
            <div className="flex items-center gap-1.5" data-testid="margin-revised">
              <span className="text-muted-foreground">Revised Contract</span>
              <span className="font-semibold tabular-nums text-foreground">{formatCurrency(revisedCents)}</span>
            </div>
            <span className="text-muted-foreground">−</span>
            <div
              className="flex items-center gap-1.5"
              data-testid="margin-actual-cost"
              title={`${costBreakdown}  •  Internal costs not yet included`}
            >
              <span className="text-muted-foreground">Actual Costs</span>
              <span className="font-semibold tabular-nums text-foreground">{formatCurrency(actualCostCents)}</span>
            </div>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-1.5" data-testid="margin-gross-profit">
              <span className="text-muted-foreground">Gross Profit</span>
              <span className={cn("font-semibold tabular-nums", getVarianceColor(grossProfitCents))}>
                {formatCurrency(grossProfitCents)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto" data-testid="margin-percent">
              <span className="text-muted-foreground">Margin</span>
              <span className={cn("font-semibold tabular-nums", getVarianceColor(grossProfitCents))}>
                {marginPct.toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })()}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {activeTab === "costs" && canViewActuals && (
          <>
            {/* Cost Code Breakdown Table */}
            <Card className="flex flex-col h-full">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-sm">Cost Code Breakdown</CardTitle>
                    <CardDescription className="text-xs">Budget vs actual costs by cost code</CardDescription>
                  </div>
                  {allCategoryTitles.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={toggleCollapseAll}
                      className="text-xs gap-1"
                      data-testid="button-collapse-all"
                    >
                      {allCollapsed ? (
                        <ChevronsUpDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronsDownUp className="h-3.5 w-3.5" />
                      )}
                      {allCollapsed ? "Expand all" : "Collapse all"}
                    </Button>
                  )}
                </div>
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
                  <>
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
                        rowStyle={(row) =>
                          row.kind === "category"
                            ? rowBgStyle(rowTints.category)
                            : rowBgStyle(row.zebra ? rowTints.zebra : null)
                        }
                      />
                    </div>
                    {renderTotalsBar([
                      { label: "Budgeted", value: formatCurrency(costTotals.budgeted) },
                      { label: "Actual", value: formatCurrency(costTotals.actual) },
                      {
                        label: "Difference",
                        value: formatCurrency(costTotals.difference),
                        color: getVarianceColor(costTotals.difference),
                      },
                    ])}
                    {renderLegend()}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {activeTab === "hours" && canViewLabour && (
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
                  <>
                    <div className="flex-1 min-h-0">
                      <DataTable
                        data={filteredLabourHours}
                        columns={labourHoursColumns}
                        storageKey="budget-hours"
                        legacyConfigKey="budget-column-config-v1"
                        rowKey={(row) => row.id}
                        rowStyle={(_row, index) =>
                          rowBgStyle(index % 2 === 1 ? rowTints.zebra : null)
                        }
                      />
                    </div>
                    {renderTotalsBar([
                      { label: "Budgeted", value: formatHours(totalBudgetedHours) },
                      { label: "Pending", value: formatHours(totalPendingHours), color: "text-[hsl(var(--bp-amber))]" },
                      { label: "Approved", value: formatHours(totalApprovedHours) },
                      { label: "Total", value: formatHours(totalActualHours) },
                      {
                        label: "Variance",
                        value: formatHours(hoursRemaining),
                        color: getVarianceColor(hoursRemaining),
                      },
                      { label: "% Used", value: `${hoursPercentUsed}%` },
                    ])}
                    {renderLegend()}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!actualDrill} onOpenChange={(o) => { if (!o) setActualDrill(null); }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-actual-drill">
          <DialogHeader>
            <DialogTitle>Actual costs — {actualDrill?.title}</DialogTitle>
            <DialogDescription>
              Bills contributing to this cost code's actual spend.
            </DialogDescription>
          </DialogHeader>
          {drillLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !drillData || drillData.bills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No bills found for this cost code.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {drillData.bills.map((b) => (
                <Link
                  key={b.billId}
                  href={`/projects/${projectId}/bills/${b.billId}`}
                  onClick={() => setActualDrill(null)}
                  className="block p-2.5 border rounded-md hover-elevate"
                  data-testid={`drill-bill-${b.billId}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{b.billNumber || "Bill"}</span>
                        {b.billType === "credit" && (
                          <Badge variant="secondary" className="text-data">Credit</Badge>
                        )}
                        {b.status && (
                          <Badge variant="outline" className="text-data">{b.status}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {b.supplierName || "—"}
                        {b.billDate ? ` · ${new Date(b.billDate).toLocaleDateString("en-AU")}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        b.lineTotal < 0 && "text-[hsl(var(--bp-coral))]",
                      )}
                    >
                      {formatCurrency(b.lineTotal)}
                    </span>
                  </div>
                </Link>
              ))}
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold tabular-nums" data-testid="text-drill-total">
                  {formatCurrency(drillData.total)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

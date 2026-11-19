import { useParams, Link } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnPicker, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsDark, financialRowTints, financialRowBgStyle, FinancialTotalsBar, FinancialTableLegend } from "@/components/data-table/financialTableChrome";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RefreshCw, DollarSign, AlertCircle, Clock, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Columns3, Eye, EyeOff, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CostCategory, CostCode, LabourHoursBudget, Project } from "@shared/schema";
import type { ContractMetrics } from "@shared/projectMetrics";
import type { ProjectCostRow, ProjectCostTotals, ProjectCostSummaryOnly, BudgetTone as SharedBudgetTone } from "@shared/projectCost";
import { budgetTone as sharedBudgetTone } from "@shared/projectCost";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { usePermission, useBudgetAccess } from "@/hooks/use-permission";
import { useAuth } from "@/hooks/use-auth";

type BudgetTone = SharedBudgetTone;

type HoursSort = { id: string; dir: "asc" | "desc" } | null;

/**
 * Grouping the hours table cost tanstack's built-in sorting, which would
 * reorder the flat row list and scatter the category headers. This sorts
 * within each group instead, so clicking a header still works.
 */
function HoursSortHeader({
  label,
  id,
  sort,
  onSort,
  align,
}: {
  label: string;
  id: string;
  sort: HoursSort;
  onSort: (id: string) => void;
  align?: "right";
}) {
  const dir = sort?.id === id ? sort.dir : null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSort(id);
      }}
      data-sort-state={dir ?? "none"}
      className={cn(
        "group/sort flex items-center gap-1 w-full min-w-0 uppercase tracking-wide",
        align === "right" && "justify-end",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="flex-shrink-0">
        {dir === "asc" && <ArrowUp className="w-3 h-3 text-primary" />}
        {dir === "desc" && <ArrowDown className="w-3 h-3 text-primary" />}
        {!dir && <ArrowUpDown className="w-3 h-3 opacity-0 group-hover/sort:opacity-40" />}
      </span>
    </button>
  );
}

/**
 * A run of labelled figures joined by operators ("Original + Variations =
 * Revised"), so each header line reads as a sum that visibly adds up.
 */
function HeaderSum({
  parts,
}: {
  parts: Array<{
    op?: string;
    label: string;
    value: string;
    note?: string;
    color?: string;
    strong?: boolean;
    testid?: string;
  }>;
}) {
  return (
    <>
      {parts.map((p) => (
        <span key={p.label} className="contents">
          {p.op && <span className="text-muted-foreground">{p.op}</span>}
          <span className="flex items-center gap-1.5" data-testid={p.testid}>
            <span className="text-muted-foreground">{p.label}</span>
            <span className={cn("tabular-nums", p.strong ? "font-bold" : "font-semibold", p.color ?? "text-foreground")}>
              {p.value}
            </span>
            {p.note && <span className="text-[10px] text-muted-foreground">({p.note})</span>}
          </span>
        </span>
      ))}
    </>
  );
}

const PHASE_LABELS: Record<string, string> = {
  lead: "Lead",
  pre_construction: "Pre-Construction",
  construction: "Construction",
  post_construction: "Post-Construction",
  archive: "Archive",
};

export default function BudgetPage() {
  const { projectId } = useParams();
  const pageTitle = usePageTitle({ pageName: "Budget" });
  const { isLoading: authLoading } = useAuth();
  const canViewLabour = usePermission("financial.budget_labour", "view");
  // "Summary Only" on the cost budget is a restriction: the server answers
  // cost-summary with % used and status per category, and refuses every
  // dollar route. The page follows what the server sent (costSummary.access),
  // so the tick is enforced there, not here.
  const budgetAccess = useBudgetAccess();
  const canViewActuals = budgetAccess !== "none";
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
  // Whether the financial header is expanded to show full detail. Persisted in
  // localStorage, mirroring the "hide empty cost codes" toggle.
  const [headerExpanded, setHeaderExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('budget-header-expanded');
      return saved ? JSON.parse(saved) : false;
    } catch { return false; }
  });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  // Kept separate from the costs tab so collapsing a category on one tab does
  // not silently reshape the other.
  const [collapsedHourCategories, setCollapsedHourCategories] = useState<Set<string>>(new Set());
  // Sorting applies within each category; null falls back to cost code order.
  const [hoursSort, setHoursSort] = useState<HoursSort>(null);

  // Cycles asc → desc → back to cost code order.
  const toggleHoursSort = (id: string) =>
    setHoursSort((prev) => {
      if (prev?.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return null;
    });

  // Fetch project to get current phase
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // The project's cost, row by row, from the one server calculation
  // (shared/projectCost.ts). Every cost figure on this page comes from here, and
  // the totals are the sum of the rows. Ex GST cents, cost only.
  const { data: costSummary, isLoading: costLoading } = useQuery<
    | {
        access: "full";
        rows: ProjectCostRow[];
        totals: ProjectCostTotals;
        billsWithoutLines: { billId: string; cents: number }[];
      }
    | ProjectCostSummaryOnly
  >({
    queryKey: ["/api/projects", projectId, "cost-summary"],
    queryFn: () => apiRequest(`/api/projects/${projectId}/cost-summary`, "GET"),
    enabled: !!projectId && canViewActuals,
  });
  const summaryOnly = costSummary?.access === "summary";
  const fullCost = costSummary && costSummary.access !== "summary" ? costSummary : undefined;

  const { data: labourHours = [], isLoading: labourHoursLoading } = useQuery<LabourHoursBudget[]>({
    queryKey: [`/api/projects/${projectId}/labour-hours-budget`],
    enabled: !!projectId && canViewLabour,
  });

  const { data: allCostCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
    enabled: canViewLabour || canViewActuals,
  });

  const { data: allCostCategories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
    enabled: canViewLabour || canViewActuals,
  });

  const { data: contractMetrics } = useQuery<ContractMetrics>({
    queryKey: ["/api/projects", projectId, "contract-metrics"],
    queryFn: () => apiRequest(`/api/projects/${projectId}/contract-metrics`, "GET"),
    // The contract price is only shown beside the margin, which Summary Only hides.
    enabled: !!projectId && canViewActuals && budgetAccess === "full" && !summaryOnly,
  });

  // Drill-down: which cost code's Bills are being inspected (null = closed).
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
      /** No line items yet — counted at its ex-GST subtotal under Uncategorized. */
      noLineItems?: boolean;
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

  // Drill-down: which cost code's Labour is being inspected (null = closed).
  const [labourDrill, setLabourDrill] = useState<{ costCodeId: string | null; title: string } | null>(null);
  const { data: labourDrillData, isLoading: labourDrillLoading } = useQuery<{
    total: number;
    entries: Array<{
      timesheetId: string;
      workerName: string;
      date: string;
      hours: number;
      rateCents: number;
      costCents: number;
      status: string;
    }>;
  }>({
    queryKey: ["/api/projects", projectId, "labour-actuals", labourDrill?.costCodeId ?? "uncategorized"],
    queryFn: () =>
      apiRequest(
        `/api/projects/${projectId}/labour-actuals${labourDrill?.costCodeId ? `?costCodeId=${labourDrill.costCodeId}` : ""}`,
        "GET",
      ),
    enabled: !!projectId && !!labourDrill,
  });

  // Drill-down: which row's Variations are being inspected (null = closed).
  // `key` is the cost-summary row key (a cost code id, or "variations").
  const [variationDrill, setVariationDrill] = useState<{ key: string; title: string } | null>(null);
  const { data: variationDrillData, isLoading: variationDrillLoading } = useQuery<{
    total: number;
    lines: Array<{
      id: string;
      variationId: string;
      variationNumber: string;
      variationName: string;
      name: string | null;
      description: string;
      quantity: number;
      unitType: string;
      unitCostExTax: number;
      costCents: number;
    }>;
  }>({
    queryKey: ["/api/projects", projectId, "variation-costs", variationDrill?.key],
    queryFn: () =>
      apiRequest(`/api/projects/${projectId}/variation-costs?key=${encodeURIComponent(variationDrill!.key)}`, "GET"),
    enabled: !!projectId && !!variationDrill,
  });

  const recalculateLabourHoursMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${projectId}/labour-hours-budget/recalculate`, 'POST', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/labour-hours-budget`] });
    },
    onError: () => {},
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

  // How much of the budget has been consumed, banded:
  //   <95% under · 95–99% nearly there · 100–105% just over · >105% over.
  // Spend against no budget is its own state, not "over": most projects carry
  // unbudgeted cost codes, and colouring them all red makes the page read as
  // one solid wall of failure and stops meaning anything.
  // Banding lives in shared/projectCost.ts so the Summary Only view agrees.
  const budgetTone = sharedBudgetTone;

  const TONE_CLASS: Record<BudgetTone, string> = {
    under: "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]",
    near: "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]",
    at: "bg-[hsl(var(--status-caution-bg))] text-[hsl(var(--status-caution-fg))]",
    over: "bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))]",
    unbudgeted: "bg-[hsl(var(--status-info-bg))] text-[hsl(var(--status-info-fg))]",
    neutral: "bg-muted text-muted-foreground",
  };

  // Solid fill for the % Used bar, so the bar agrees with its row's chips.
  const TONE_BAR: Record<BudgetTone, string> = {
    under: "[&>div]:bg-[hsl(var(--status-success-fg))]",
    near: "[&>div]:bg-[hsl(var(--status-warning-fg))]",
    at: "[&>div]:bg-[hsl(var(--status-caution-fg))]",
    over: "[&>div]:bg-[hsl(var(--status-danger-fg))]",
    unbudgeted: "[&>div]:bg-[hsl(var(--status-info-fg))]",
    neutral: "",
  };

  const TONE_LABEL: Record<BudgetTone, string> = {
    under: "Under",
    near: "Near",
    at: "At limit",
    over: "Over",
    unbudgeted: "Unbudgeted",
    neutral: "—",
  };

  const renderVarianceChip = (value: string, budgeted: number, used: number) => (
    <span
      className={cn(
        "inline-flex items-center justify-end px-2 h-5 rounded-md text-xs font-semibold tabular-nums",
        TONE_CLASS[budgetTone(budgeted, used)],
      )}
    >
      {value}
    </span>
  );

  // The drill-down previously printed the raw enum ("awaiting_payment") in a
  // plain outline badge. Paid is the state people scan for, so it carries the
  // only solid tone.
  const BILL_STATUS: Record<string, { label: string; tone: string }> = {
    paid: { label: "Paid", tone: "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]" },
    awaiting_payment: { label: "Unpaid", tone: "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]" },
    awaiting_approval: { label: "Approval", tone: "bg-muted text-muted-foreground" },
    needs_review: { label: "Review", tone: "bg-muted text-muted-foreground" },
    draft: { label: "Draft", tone: "bg-muted text-muted-foreground" },
  };

  const renderBillStatusChip = (status: string) => {
    const meta = BILL_STATUS[status] ?? {
      label: status.replace(/_/g, " "),
      tone: "bg-muted text-muted-foreground",
    };
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-full h-5 rounded-md text-[10px] font-medium capitalize",
          meta.tone,
        )}
      >
        {meta.label}
      </span>
    );
  };

  const renderStatusChip = (budgeted: number, used: number) => {
    const tone = budgetTone(budgeted, used);
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-[68px] h-5 rounded-md text-[10px] font-medium",
          TONE_CLASS[tone],
        )}
      >
        {TONE_LABEL[tone]}
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

  // ── Cost table ─────────────────────────────────────────────────────────────
  // Rows come straight from the server (one per cost code, plus category-only,
  // uncoded-variation and Uncategorized rows), already labelled. The page only
  // groups them — by category ID, never by a label it builds itself.
  const costItems = fullCost?.rows ?? [];
  const costTotals: ProjectCostTotals = fullCost?.totals ?? {
    originalBudgetCents: 0,
    variationsCents: 0,
    revisedBudgetCents: 0,
    billsCents: 0,
    labourCents: 0,
    spentCents: 0,
    committedCents: 0,
    remainingCents: 0,
    forecastFinalCents: 0,
  };

  /** Group key + label for a row. Rows with no category share one "Other" group, listed last. */
  const NO_CATEGORY = "none";
  const groupOf = (r: ProjectCostRow) =>
    r.categoryId ? { key: r.categoryId, label: r.categoryLabel || "Unknown category" } : { key: NO_CATEGORY, label: "Other" };

  type CostSums = Pick<
    ProjectCostRow,
    "originalBudgetCents" | "variationsCents" | "revisedBudgetCents" | "billsCents" | "labourCents" | "spentCents" | "committedCents" | "remainingCents"
  >;
  type CostRow =
    | ({ kind: "category"; id: string; groupKey: string; label: string; count: number } & CostSums)
    | { kind: "item"; id: string; item: ProjectCostRow; zebra: boolean };

  const costRows = useMemo<CostRow[]>(() => {
    const groups = new Map<string, { label: string; items: ProjectCostRow[] }>();
    costItems.forEach((item) => {
      const g = groupOf(item);
      if (!groups.has(g.key)) groups.set(g.key, { label: g.label, items: [] });
      groups.get(g.key)!.items.push(item);
    });
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const sorted = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === NO_CATEGORY) return 1;
      if (b[0] === NO_CATEGORY) return -1;
      return collator.compare(a[1].label, b[1].label);
    });
    const sum = (items: ProjectCostRow[], k: keyof CostSums) => items.reduce((s, i) => s + i[k], 0);
    const rows: CostRow[] = [];
    let itemIdx = 0;
    sorted.forEach(([groupKey, { label, items }]) => {
      // Server order within a group: cost codes by code, then the fixed rows.
      rows.push({
        kind: "category",
        id: `cat-${groupKey}`,
        groupKey,
        label,
        count: items.length,
        originalBudgetCents: sum(items, "originalBudgetCents"),
        variationsCents: sum(items, "variationsCents"),
        revisedBudgetCents: sum(items, "revisedBudgetCents"),
        billsCents: sum(items, "billsCents"),
        labourCents: sum(items, "labourCents"),
        spentCents: sum(items, "spentCents"),
        committedCents: sum(items, "committedCents"),
        remainingCents: sum(items, "remainingCents"),
      });
      if (!collapsedCategories.has(groupKey)) {
        items.forEach((item) => {
          rows.push({ kind: "item", id: item.key, item, zebra: itemIdx % 2 === 1 });
          itemIdx++;
        });
      }
    });
    return rows;
  }, [costItems, collapsedCategories]);

  const allCategoryKeys = useMemo(
    () => Array.from(new Set(costItems.map((r) => groupOf(r).key))),
    [costItems],
  );

  const allCollapsed = allCategoryKeys.length > 0 && allCategoryKeys.every((k) => collapsedCategories.has(k));

  const toggleCollapseAll = () => {
    setCollapsedCategories(allCollapsed ? new Set() : new Set(allCategoryKeys));
  };

  /** A row's figure, whether it is a category subtotal or a single row. */
  const sumsOf = (r: CostRow): CostSums => (r.kind === "category" ? r : r.item);

  /** A money cell. Category rows show a chip; item rows show plain text, or a drill-down link when `onDrill` is given and the value isn't zero. */
  const moneyColumn = (
    id: string,
    label: string,
    field: keyof CostSums,
    opts: { width?: number; strong?: boolean; tone?: string; onDrill?: (item: ProjectCostRow) => void } = {},
  ): ColumnDef<CostRow, unknown> => ({
    id,
    header: label,
    enableSorting: false,
    cell: ({ row }) => {
      const r = row.original;
      const value = sumsOf(r)[field];
      if (r.kind === "category") return renderCategoryAmountChip(value);
      if (opts.onDrill && value !== 0) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              opts.onDrill!(r.item);
            }}
            className="text-xs tabular-nums text-[hsl(var(--bp-purple))] underline-offset-2 hover:underline"
            data-testid={`button-${id}-${r.id}`}
          >
            {formatCurrency(value)}
          </button>
        );
      }
      return (
        <span
          className={cn(
            "text-xs tabular-nums",
            value === 0 ? "text-muted-foreground" : opts.tone,
            opts.strong && value !== 0 && "font-semibold",
          )}
          data-testid={`text-${id}-${r.id}`}
        >
          {formatCurrency(value)}
        </span>
      );
    },
    size: opts.width ?? 110,
    meta: { defaultWidth: opts.width ?? 110, align: "right", headerLabel: label },
  });

  const costColumns = useMemo<ColumnDef<CostRow, unknown>[]>(() => [
    {
      id: "category",
      header: "Cost Code",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "category") {
          const isCollapsed = collapsedCategories.has(r.groupKey);
          return (
            <div className="flex items-center gap-1.5 text-xs">
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--bp-purple))]" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--bp-purple))]" />
              )}
              <span className="font-semibold uppercase tracking-wide">{r.label}</span>
              <Badge variant="secondary" className="h-4 px-1.5 text-data">{r.count}</Badge>
            </div>
          );
        }
        return <div className="text-xs pl-5 font-medium">{r.item.label}</div>;
      },
      size: 260,
      meta: { defaultWidth: 260, flex: true, headerLabel: "Cost Code" },
    },
    moneyColumn("original", "Original", "originalBudgetCents"),
    moneyColumn("variations", "Variations", "variationsCents", {
      onDrill: (item) => setVariationDrill({ key: item.key, title: item.label }),
    }),
    moneyColumn("revised", "Revised", "revisedBudgetCents", { strong: true }),
    moneyColumn("bills", "Bills", "billsCents", {
      // Bills sit on a cost code, or on Uncategorized (no code / no lines yet).
      onDrill: (item) =>
        (item.kind === "costCode" || item.kind === "uncategorised") &&
        setActualDrill({ costCodeId: item.costCodeId, title: item.label }),
    }),
    moneyColumn("labour", "Labour", "labourCents", {
      onDrill: (item) =>
        (item.kind === "costCode" || item.kind === "uncategorised") &&
        setLabourDrill({ costCodeId: item.costCodeId, title: item.label }),
    }),
    moneyColumn("spent", "Spent", "spentCents", { width: 120, strong: true }),
    // Open POs not yet billed + subbie hours waiting for a PO. Promised, not
    // spent, so it sits beside Spent rather than inside it.
    moneyColumn("committed", "Committed", "committedCents", { tone: "text-[hsl(var(--amber))] font-medium" }),
    {
      id: "remaining",
      header: "Remaining",
      enableSorting: false,
      cell: ({ row }) => {
        const s = sumsOf(row.original);
        // Revised budget − spent − committed: what's left to spend on this code.
        return (
          <span data-testid={`text-remaining-${row.original.id}`}>
            {renderVarianceChip(formatCurrency(s.remainingCents), s.revisedBudgetCents, s.spentCents + s.committedCents)}
          </span>
        );
      },
      size: 110,
      meta: { defaultWidth: 110, align: "right", headerLabel: "Remaining" },
    },
    {
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => {
        const s = sumsOf(row.original);
        return renderStatusChip(s.revisedBudgetCents, s.spentCents + s.committedCents);
      },
      size: 90,
      meta: { defaultWidth: 90, align: "right", headerLabel: "Status" },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [collapsedCategories]);

  const filteredLabourHours = hideEmptyCostCodes
    ? labourHours.filter(item => {
        const budgeted = parseFloat(item.budgetedHours || "0");
        const pending = parseFloat(item.pendingHours || "0");
        const approved = parseFloat(item.approvedHours || "0");
        return budgeted !== 0 || pending !== 0 || approved !== 0;
      })
    : labourHours;

  // labour_hours_budget caches the cost code title but not its number, so the
  // code (and its category) has to be looked up to order rows the way the cost
  // codes page does.
  const costCodeMeta = useMemo(() => {
    const categoryById = new Map(allCostCategories.map((c) => [c.id, c]));
    const meta = new Map<string, { code: string; categoryCode: string; categoryTitle: string }>();
    allCostCodes.forEach((cc) => {
      const category = cc.categoryId ? categoryById.get(cc.categoryId) : undefined;
      meta.set(cc.id, {
        code: cc.code,
        categoryCode: category?.code ?? "",
        categoryTitle: category?.title ?? "Uncategorized",
      });
    });
    return meta;
  }, [allCostCodes, allCostCategories]);

  // Codes read as numbers ("100", "119"); anything else falls back to lexical.
  const compareCode = (a: string, b: string) => {
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  };

  type HoursRow =
    | {
        kind: "category";
        id: string;
        categoryTitle: string;
        count: number;
        budgeted: number;
        pending: number;
        approved: number;
      }
    | { kind: "item"; id: string; item: LabourHoursBudget; code: string; zebra: boolean };

  const hoursSortValue = (
    e: { item: LabourHoursBudget; code: string },
    id: string,
  ): number | string => {
    const budgeted = parseFloat(e.item.budgetedHours || "0");
    const pending = parseFloat(e.item.pendingHours || "0");
    const approved = parseFloat(e.item.approvedHours || "0");
    const total = pending + approved;
    switch (id) {
      case "budgeted": return budgeted;
      case "pending": return pending;
      case "approved": return approved;
      case "total": return total;
      case "variance": return budgeted - total;
      case "percentUsed": return budgeted > 0 ? (total / budgeted) * 100 : 0;
      default: {
        const code = parseFloat(e.code);
        return isNaN(code) ? (e.item.costCodeTitle || "") : code;
      }
    }
  };

  const hoursRows = useMemo<HoursRow[]>(() => {
    type Entry = { item: LabourHoursBudget; code: string; categoryCode: string; categoryTitle: string };
    const groups = new Map<string, { categoryCode: string; entries: Entry[] }>();

    filteredLabourHours.forEach((item) => {
      const meta = item.costCodeId ? costCodeMeta.get(item.costCodeId) : undefined;
      // Fall back to the cached category title when the code has since been
      // deleted, so the row still lands in a sensible group.
      const categoryTitle = meta?.categoryTitle ?? item.categoryTitle ?? "Uncategorized";
      const entry: Entry = {
        item,
        code: meta?.code ?? "",
        categoryCode: meta?.categoryCode ?? "",
        categoryTitle,
      };
      if (!groups.has(categoryTitle)) {
        groups.set(categoryTitle, { categoryCode: entry.categoryCode, entries: [] });
      }
      const group = groups.get(categoryTitle)!;
      if (!group.categoryCode && entry.categoryCode) group.categoryCode = entry.categoryCode;
      group.entries.push(entry);
    });

    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      // Uncategorized has no code to sort on, so it sits at the bottom.
      if (a[0] === "Uncategorized") return 1;
      if (b[0] === "Uncategorized") return -1;
      if (a[1].categoryCode && b[1].categoryCode) return compareCode(a[1].categoryCode, b[1].categoryCode);
      return a[0].localeCompare(b[0]);
    });

    const rows: HoursRow[] = [];
    let itemIdx = 0;
    sortedGroups.forEach(([categoryTitle, group]) => {
      const byCostCode = (a: Entry, b: Entry) => {
        if (a.code && b.code) return compareCode(a.code, b.code);
        if (a.code) return -1;
        if (b.code) return 1;
        return (a.item.costCodeTitle || "").localeCompare(b.item.costCodeTitle || "");
      };
      const entries = [...group.entries].sort((a, b) => {
        if (!hoursSort) return byCostCode(a, b);
        const av = hoursSortValue(a, hoursSort.id);
        const bv = hoursSortValue(b, hoursSort.id);
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        // Ties keep cost code order so the list never jumps around.
        return (hoursSort.dir === "asc" ? cmp : -cmp) || byCostCode(a, b);
      });
      rows.push({
        kind: "category",
        id: `hours-cat-${categoryTitle}`,
        categoryTitle,
        count: entries.length,
        budgeted: entries.reduce((sum, e) => sum + parseFloat(e.item.budgetedHours || "0"), 0),
        pending: entries.reduce((sum, e) => sum + parseFloat(e.item.pendingHours || "0"), 0),
        approved: entries.reduce((sum, e) => sum + parseFloat(e.item.approvedHours || "0"), 0),
      });
      if (collapsedHourCategories.has(categoryTitle)) return;
      entries.forEach((e) => {
        rows.push({ kind: "item", id: e.item.id, item: e.item, code: e.code, zebra: itemIdx % 2 === 1 });
        itemIdx++;
      });
    });
    return rows;
  }, [filteredLabourHours, costCodeMeta, collapsedHourCategories, hoursSort]);

  const hourCategoryTitles = useMemo(
    () => hoursRows.filter((r) => r.kind === "category").map((r) => (r as { categoryTitle: string }).categoryTitle),
    [hoursRows],
  );
  const allHourCategoriesCollapsed =
    hourCategoryTitles.length > 0 && hourCategoryTitles.every((t) => collapsedHourCategories.has(t));

  const toggleHoursCollapseAll = () => {
    setCollapsedHourCategories(allHourCategoriesCollapsed ? new Set() : new Set(hourCategoryTitles));
  };

  const renderHoursChip = (value: number, variance = false) => {
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
        {formatHours(value)}
      </span>
    );
  };

  const labourHoursColumns = useMemo<ColumnDef<HoursRow, unknown>[]>(() => {
    const hoursOf = (r: HoursRow, field: "budgetedHours" | "pendingHours" | "approvedHours") =>
      r.kind === "category"
        ? field === "budgetedHours"
          ? r.budgeted
          : field === "pendingHours"
            ? r.pending
            : r.approved
        : parseFloat(r.item[field] || "0");
    const totalOf = (r: HoursRow) => hoursOf(r, "pendingHours") + hoursOf(r, "approvedHours");
    const varianceOf = (r: HoursRow) => hoursOf(r, "budgetedHours") - totalOf(r);

    return [
      {
        id: "costCode",
        header: () => (
          <HoursSortHeader
            label="Cost Code"
            id="costCode"
            sort={hoursSort}
            onSort={toggleHoursSort}
            
          />
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.kind === "category") {
            const isCollapsed = collapsedHourCategories.has(r.categoryTitle);
            return (
              <div className="flex items-center gap-1.5 text-xs">
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--bp-purple))]" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--bp-purple))]" />
                )}
                <span className="font-semibold uppercase tracking-wide truncate">{r.categoryTitle}</span>
                <Badge variant="secondary" className="h-4 px-1.5 text-data">{r.count}</Badge>
              </div>
            );
          }
          const title = r.item.costCodeTitle || "Uncategorized";
          // budget_line_items stores titles as "121 - Cleaning & Handover"; if
          // hours rows ever do the same, don't print the code twice.
          const titleHasCode = !!r.code && title.trimStart().startsWith(r.code);
          return (
            <div className="flex items-center gap-2 pl-5 min-w-0">
              {r.code && !titleHasCode && (
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">{r.code}</span>
              )}
              <span className="text-xs font-medium truncate">{title}</span>
            </div>
          );
        },
        size: 260,
        meta: { defaultWidth: 260, flex: true, headerLabel: "Cost Code" },
      },
      {
        id: "budgeted",
        header: () => (
          <HoursSortHeader
            label="Budgeted"
            id="budgeted"
            sort={hoursSort}
            onSort={toggleHoursSort}
            align="right"
          />
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const value = hoursOf(r, "budgetedHours");
          if (r.kind === "category") return renderHoursChip(value);
          return (
            <span className="text-xs tabular-nums" data-testid={`text-budgeted-${r.id}`}>
              {formatHours(value)}
            </span>
          );
        },
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Budgeted" },
      },
      {
        id: "pending",
        header: () => (
          <HoursSortHeader
            label="Pending"
            id="pending"
            sort={hoursSort}
            onSort={toggleHoursSort}
            align="right"
          />
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const value = hoursOf(r, "pendingHours");
          if (r.kind === "category") return renderHoursChip(value);
          return (
            <span
              className="text-xs tabular-nums text-[hsl(var(--bp-amber))]"
              data-testid={`text-pending-${r.id}`}
            >
              {formatHours(value)}
            </span>
          );
        },
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Pending" },
      },
      {
        id: "approved",
        header: () => (
          <HoursSortHeader
            label="Approved"
            id="approved"
            sort={hoursSort}
            onSort={toggleHoursSort}
            align="right"
          />
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const value = hoursOf(r, "approvedHours");
          if (r.kind === "category") return renderHoursChip(value);
          return (
            <span className="text-xs tabular-nums" data-testid={`text-approved-${r.id}`}>
              {formatHours(value)}
            </span>
          );
        },
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Approved" },
      },
      {
        id: "total",
        header: () => (
          <HoursSortHeader
            label="Total"
            id="total"
            sort={hoursSort}
            onSort={toggleHoursSort}
            align="right"
          />
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const value = totalOf(r);
          if (r.kind === "category") return renderHoursChip(value);
          return (
            <span className="text-xs tabular-nums font-medium" data-testid={`text-total-${r.id}`}>
              {formatHours(value)}
            </span>
          );
        },
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Total" },
      },
      {
        id: "variance",
        header: () => (
          <HoursSortHeader
            label="Variance"
            id="variance"
            sort={hoursSort}
            onSort={toggleHoursSort}
            align="right"
          />
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const budgeted = hoursOf(r, "budgetedHours");
          const total = totalOf(r);
          return (
            <span data-testid={`text-variance-${r.id}`}>
              {renderVarianceChip(formatHours(budgeted - total), budgeted, total)}
            </span>
          );
        },
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Variance" },
      },
      {
        id: "percentUsed",
        header: () => (
          <HoursSortHeader
            label="% Used"
            id="percentUsed"
            sort={hoursSort}
            onSort={toggleHoursSort}
            align="right"
          />
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const budgeted = hoursOf(r, "budgetedHours");
          const percentUsed = budgeted > 0 ? Math.round((totalOf(r) / budgeted) * 100) : 0;
          const tone = budgetTone(budgeted, totalOf(r));
          return (
            // The bar fills whatever room the column is given, so widening the
            // column widens the bar. Progress clamps at 100, so the number
            // beside it carries the overrun.
            <div className="flex items-center gap-2 w-full min-w-0">
              <Progress
                value={percentUsed}
                className={cn("flex-1 min-w-0 h-1.5", TONE_BAR[tone])}
              />
              <span className="text-xs tabular-nums shrink-0 w-9 text-right">{percentUsed}%</span>
            </div>
          );
        },
        size: 140,
        meta: { defaultWidth: 140, align: "right", headerLabel: "% Used" },
      } satisfies ColumnDef<HoursRow, unknown> & { meta: DataTableColumnMeta },
    ];
  }, [collapsedHourCategories, hoursSort]);

  const handleToggleEmpty = (checked: boolean) => {
    setHideEmptyCostCodes(checked);
    try { localStorage.setItem('budget-hide-empty-cost-codes', JSON.stringify(checked)); } catch {}
  };

  const toggleHeaderExpanded = () => {
    setHeaderExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem('budget-header-expanded', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Always-live figures without a manual Recalculate button.
  //
  // The costs side needs nothing here: GET /projects/:id/budget already runs
  // calculateBudget (which creates one when absent) and
  // recalculateBudgetLineItems on every read. This effect used to POST both of
  // those as well, and each POST invalidated the budget query, triggering
  // another recomputing GET — so opening the page recomputed the whole budget
  // three times before it could paint. Labour hours have no read-time
  // recompute, so that one still runs.
  //
  // Keyed by projectId rather than a boolean so switching projects re-triggers,
  // and so an early render with permissions unresolved can't permanently
  // suppress it.
  const autoRecalcProjectId = useRef<string | null>(null);
  useEffect(() => {
    // Wait for auth, or the first render runs with the permission flags false
    // and marks this project done without ever recalculating.
    if (authLoading) return;
    if (!projectId) return;
    if (autoRecalcProjectId.current === projectId) return;
    if (!canViewLabour) return;

    recalculateLabourHoursMutation.mutate();
    autoRecalcProjectId.current = projectId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, projectId, canViewLabour]);

  const isRecalculating = recalculateLabourHoursMutation.isPending;

  if (canViewActuals && costLoading) {
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
      <EmptyState
        icon={AlertCircle}
        title="No budget access"
        description="You don't have permission to view the budget. Contact your administrator to request access."
        variant="inline"
        className="h-full"
        data-testid="page-budget-no-access"
      />
    );
  }

  // Row banding tints — warm muted in light mode, subtle foreground overlay in
  // dark mode (where --muted ≈ --card). Shared with the Monthly Actuals view.
  const rowTints = financialRowTints(isDark);

  // ── Financial header figures (ex GST) ──────────────────────────────────────
  // Two bands that never mix: COST (budget vs spend, no margin anywhere) and
  // MARGIN (the client's contract price against cost). Cost figures are the
  // table totals, so the header always equals the sum of the table.
  //
  // The contract comes only from contract-metrics. If that hasn't loaded (or
  // failed) the margin shows "—" rather than quietly using a cost figure as if
  // it were the client's price.
  const contractKnown = !!contractMetrics;
  const originalContractCents = contractMetrics?.originalContractPriceExGstCents ?? 0;
  const contractVariationsCents = contractMetrics?.approvedVariationsExGstCents ?? 0;
  const revisedContractCents = contractMetrics?.revisedContractPriceExGstCents ?? 0;
  // Planned: the margin priced in — contract less the cost budget.
  const plannedMarginCents = revisedContractCents - costTotals.revisedBudgetCents;
  // Forecast: contract less what the job looks like costing. Per row, the
  // larger of its budget and spent + committed — overruns cut margin, rows
  // still under budget assume the budget gets spent.
  const forecastMarginCents = revisedContractCents - costTotals.forecastFinalCents;
  const pctOfContract = (cents: number) =>
    contractKnown && revisedContractCents > 0 ? (cents / revisedContractCents) * 100 : null;
  const plannedMarginPct = pctOfContract(plannedMarginCents);
  const forecastMarginPct = pctOfContract(forecastMarginCents);
  const money = (cents: number, known = true) => (known ? formatCurrency(cents) : "—");
  const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);

  return (
    <div className="flex flex-col h-full" data-testid="page-budget">
      {/* TAB ROW */}
      <div className="bg-background border-b border-border flex-shrink-0">
        <div className="flex h-10 items-stretch justify-between gap-2 px-2">
          {/* LEFT: tabs */}
          <div className="flex items-stretch">
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

          {/* RIGHT: refresh indicator + columns picker */}
          <div className="flex items-center gap-2">
            {isRecalculating && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" data-testid="indicator-recalculating" />
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  data-testid="button-columns"
                  title="Show or hide columns"
                  aria-label="Show or hide columns"
                >
                  <Columns3 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                {activeTab === "costs" && summaryOnly ? (
                  <div className="p-3 text-xs text-muted-foreground">No columns in the budget summary.</div>
                ) : activeTab === "costs" ? (
                  <DataTableColumnPicker
                    storageKey="budget-costs-v3"
                    columns={[
                      { id: "category", label: "Cost Code", pinned: true },
                      { id: "original", label: "Original" },
                      { id: "variations", label: "Variations" },
                      { id: "revised", label: "Revised" },
                      { id: "bills", label: "Bills" },
                      { id: "labour", label: "Labour" },
                      { id: "spent", label: "Spent" },
                      { id: "committed", label: "Committed" },
                      { id: "remaining", label: "Remaining" },
                      { id: "status", label: "Status" },
                    ]}
                  />
                ) : (
                  <DataTableColumnPicker
                    storageKey="budget-hours"
                    columns={[
                      { id: "costCode", label: "Cost Code", pinned: true },
                      { id: "budgeted", label: "Budgeted" },
                      { id: "pending", label: "Pending" },
                      { id: "approved", label: "Approved" },
                      { id: "total", label: "Total" },
                      { id: "variance", label: "Variance" },
                      { id: "percentUsed", label: "% Used" },
                    ]}
                  />
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* HERO SUMMARY — the headline figure gets the size, the rest support it.
            Previously all four sat at 12px inside the 40px tab row, so nothing
            read as the number that matters. Doubles as the expand affordance. */}
        <button
          type="button"
          onClick={toggleHeaderExpanded}
          className="w-full flex items-center gap-5 px-4 py-2.5 border-b border-border bg-[hsl(var(--bp-subtle))] hover-elevate text-left"
          data-testid="button-header-toggle"
          aria-expanded={headerExpanded}
          title={headerExpanded ? "Hide detail" : "Show detail"}
        >
          {activeTab === "costs" && summaryOnly && costSummary?.access === "summary" && (
            <div className="flex flex-col leading-none">
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">Budget used</span>
              <span className="text-3xl font-bold tabular-nums leading-none text-foreground" data-testid="header-summary-used">
                {costSummary.total.usedPct === null ? "—" : `${costSummary.total.usedPct}%`}
              </span>
            </div>
          )}
          {activeTab === "costs" && canViewActuals && !summaryOnly && (
            <>
              <div className="flex flex-col leading-none">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">Forecast margin</span>
                <span
                  className={cn(
                    "text-3xl font-bold tabular-nums leading-none",
                    contractKnown ? getVarianceColor(forecastMarginCents) : "text-muted-foreground",
                  )}
                  data-testid="header-margin-percent"
                >
                  {pct(forecastMarginPct)}
                </span>
              </div>
              <div className="h-8 w-px bg-border flex-shrink-0" />
              <div className="flex items-center gap-6 min-w-0 flex-wrap">
                {[
                  { label: "Revised Contract", value: money(revisedContractCents, contractKnown), color: "text-foreground" },
                  { label: "Revised Budget", value: formatCurrency(costTotals.revisedBudgetCents), color: "text-foreground" },
                  { label: "Spent", value: formatCurrency(costTotals.spentCents), color: "text-foreground" },
                  { label: "Committed", value: formatCurrency(costTotals.committedCents), color: "text-foreground" },
                  {
                    label: "Forecast Margin",
                    value: money(forecastMarginCents, contractKnown),
                    color: contractKnown ? getVarianceColor(forecastMarginCents) : "text-muted-foreground",
                  },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col leading-tight">
                    {/* Every figure on the Budget page is ex GST. It is stated on
                        each one because the same labels appear inc GST on the
                        CASH dashboard, and an unlabelled pair looks like a bug. */}
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      {stat.label} <span className="normal-case font-normal">ex GST</span>
                    </span>
                    <span className={cn("text-sm font-semibold tabular-nums", stat.color)}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "hours" && canViewLabour && (
            <>
              <div className="flex flex-col leading-none">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">Efficiency</span>
                <span
                  className="text-3xl font-bold tabular-nums leading-none text-foreground"
                  data-testid="header-efficiency-percent"
                >
                  {hoursPercentUsed}%
                </span>
              </div>
              <div className="h-8 w-px bg-border flex-shrink-0" />
              <div className="flex items-center gap-6 min-w-0 flex-wrap">
                {[
                  { label: "Budgeted", value: formatHours(totalBudgetedHours), color: "text-foreground" },
                  { label: "Approved", value: formatHours(totalApprovedHours), color: "text-foreground" },
                  { label: "Remaining", value: formatHours(hoursRemaining), color: getVarianceColor(hoursRemaining) },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col leading-tight">
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{stat.label}</span>
                    <span className={cn("text-sm font-semibold tabular-nums", stat.color)}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ml-auto",
              headerExpanded && "rotate-180",
            )}
          />
        </button>

        {/* EXPANDED DETAIL — Costs. Three lines, each a sum that adds up. */}
        {headerExpanded && activeTab === "costs" && canViewActuals && !summaryOnly && (
          <div
            className="px-3 pb-2.5 pt-1.5 flex flex-col gap-2 text-[11px] bg-[hsl(var(--bp-subtle))] border-t border-border"
            data-testid="header-detail-costs"
          >
            {/* Contract — the client's price, ex GST */}
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap" data-testid="band-contract">
              <span className="w-16 flex-shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                Contract
                <span className="block normal-case font-normal">ex GST</span>
              </span>
              <HeaderSum
                parts={[
                  { label: "Original", value: money(originalContractCents, contractKnown), testid: "chip-contract-original" },
                  { op: "+", label: "Variations", value: money(contractVariationsCents, contractKnown), testid: "chip-contract-variations" },
                  { op: "=", label: "Revised contract", value: money(revisedContractCents, contractKnown), strong: true, testid: "chip-contract-revised" },
                ]}
              />
              {!contractKnown && (
                <span className="text-muted-foreground italic">Contract price unavailable</span>
              )}
            </div>

            {/* Cost — budget against spend. Cost only: no markup, no margin. */}
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap" data-testid="band-cost">
              <span className="w-16 flex-shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                Cost
                <span className="block normal-case font-normal">ex GST</span>
              </span>
              <HeaderSum
                parts={[
                  { label: "Original budget", value: formatCurrency(costTotals.originalBudgetCents), testid: "stat-budget-original" },
                  { op: "+", label: "Variations", value: formatCurrency(costTotals.variationsCents), testid: "stat-budget-variations" },
                  { op: "=", label: "Revised budget", value: formatCurrency(costTotals.revisedBudgetCents), strong: true, testid: "stat-budget" },
                ]}
              />
              <span className="text-muted-foreground">·</span>
              <HeaderSum
                parts={[
                  {
                    label: "Spent",
                    value: formatCurrency(costTotals.spentCents),
                    note: `Bills ${formatCurrency(costTotals.billsCents)} · Labour ${formatCurrency(costTotals.labourCents)}`,
                    testid: "stat-spent",
                  },
                  { op: "·", label: "Committed", value: formatCurrency(costTotals.committedCents), testid: "stat-committed" },
                  {
                    op: "·",
                    label: "Remaining",
                    value: formatCurrency(costTotals.remainingCents),
                    color: getVarianceColor(costTotals.remainingCents),
                    strong: true,
                    testid: "stat-remaining",
                  },
                ]}
              />
            </div>

            {/* Margin — contract against cost */}
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap" data-testid="bar-gross-margin">
              <span className="w-16 flex-shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                Margin
                <span className="block normal-case font-normal">ex GST</span>
              </span>
              <div
                className="flex items-center gap-1.5"
                data-testid="margin-planned"
                title="Revised contract less revised budget — the margin priced into the job"
              >
                <span className="text-muted-foreground">Planned</span>
                <span className={cn("font-semibold tabular-nums", contractKnown ? getVarianceColor(plannedMarginCents) : "text-muted-foreground")}>
                  {money(plannedMarginCents, contractKnown)}
                </span>
                <span className="text-muted-foreground tabular-nums">({pct(plannedMarginPct)})</span>
              </div>
              <span className="text-muted-foreground">·</span>
              <div
                className="flex items-center gap-1.5"
                data-testid="margin-forecast"
                title="Revised contract less forecast final cost. Each cost code is forecast at the larger of its budget and spent + committed."
              >
                <span className="text-muted-foreground">Forecast</span>
                <span className={cn("font-semibold tabular-nums", contractKnown ? getVarianceColor(forecastMarginCents) : "text-muted-foreground")}>
                  {money(forecastMarginCents, contractKnown)}
                </span>
                <span className="text-muted-foreground tabular-nums">({pct(forecastMarginPct)})</span>
                <span className="text-[10px] text-muted-foreground">
                  on forecast cost {formatCurrency(costTotals.forecastFinalCents)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* EXPANDED DETAIL — Labour Hours */}
        {headerExpanded && activeTab === "hours" && canViewLabour && (
          <div
            className="px-3 pb-2.5 pt-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] bg-[hsl(var(--bp-subtle))] border-t border-border"
            data-testid="header-detail-hours"
          >
            <span className="w-16 flex-shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
              Hours
            </span>
            {[
              { label: "Budgeted", value: formatHours(totalBudgetedHours), color: "text-foreground", testid: "stat-hours-budgeted" },
              { label: "Pending", value: formatHours(totalPendingHours), color: "text-[hsl(var(--bp-amber))]", testid: "stat-hours-pending" },
              { label: "Approved", value: formatHours(totalApprovedHours), color: "text-foreground", testid: "stat-hours-approved" },
              { label: "Remaining", value: formatHours(hoursRemaining), color: getVarianceColor(hoursRemaining), testid: "stat-hours-remaining" },
              { label: "Efficiency", value: `${hoursPercentUsed}%`, color: "text-foreground", testid: "stat-hours-efficiency" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-1.5" data-testid={stat.testid}>
                <span className="text-muted-foreground">{stat.label}</span>
                <span className={cn("font-semibold tabular-nums", stat.color)}>{stat.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {activeTab === "costs" && costSummary?.access === "summary" && (
          <Card className="flex flex-col h-full" data-testid="card-budget-summary">
            <CardHeader className="py-1.5 px-3">
              <CardTitle className="text-sm">Budget Summary</CardTitle>
              <p className="text-xs text-muted-foreground">
                How far through its budget each category is, counting spent and committed cost. Your role shows the summary only.
              </p>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-y-auto">
              {costSummary.categories.length === 0 ? (
                <EmptyState
                  icon={AlertCircle}
                  title="No budget breakdown available"
                  description="The budget is built automatically from the Contract estimate, approved variations, bills and timesheets."
                  variant="inline"
                  className="py-8"
                />
              ) : (
                <div className="divide-y divide-border">
                  {costSummary.categories.map((c) => (
                    <div key={c.key} className="flex items-center gap-3 px-3 py-2" data-testid={`summary-row-${c.key}`}>
                      <span className="text-sm flex-1 min-w-0 truncate">{c.label}</span>
                      <Progress
                        value={Math.min(c.usedPct ?? 0, 100)}
                        className={cn("h-1.5 w-32 flex-shrink-0", TONE_BAR[c.tone])}
                      />
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                        {c.usedPct === null ? "—" : `${c.usedPct}%`}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-[68px] h-5 rounded-md text-[10px] font-medium flex-shrink-0",
                          TONE_CLASS[c.tone],
                        )}
                      >
                        {TONE_LABEL[c.tone]}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 px-3 py-2 font-semibold" data-testid="summary-row-total">
                    <span className="text-sm flex-1">Whole project</span>
                    <Progress
                      value={Math.min(costSummary.total.usedPct ?? 0, 100)}
                      className={cn("h-1.5 w-32 flex-shrink-0", TONE_BAR[costSummary.total.tone])}
                    />
                    <span className="w-12 text-right text-xs tabular-nums">
                      {costSummary.total.usedPct === null ? "—" : `${costSummary.total.usedPct}%`}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center justify-center w-[68px] h-5 rounded-md text-[10px] font-medium flex-shrink-0",
                        TONE_CLASS[costSummary.total.tone],
                      )}
                    >
                      {TONE_LABEL[costSummary.total.tone]}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {activeTab === "costs" && canViewActuals && !summaryOnly && (
          <>
            {/* Cost Code Breakdown Table */}
            <Card className="flex flex-col h-full">
              <CardHeader className="py-1.5 px-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm">Cost Code Breakdown</CardTitle>
                  {allCategoryKeys.length > 0 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={toggleCollapseAll}
                      className="h-7 w-7"
                      title={allCollapsed ? "Expand all" : "Collapse all"}
                      aria-label={allCollapsed ? "Expand all" : "Collapse all"}
                      data-testid="button-collapse-all"
                    >
                      {allCollapsed ? (
                        <ChevronsUpDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronsDownUp className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
                {costLoading ? (
                  <div className="p-3 space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : costItems.length === 0 ? (
                  <EmptyState
                    icon={AlertCircle}
                    title="No budget breakdown available"
                    description="The budget breakdown is built automatically from the Contract estimate, approved variations, bills and timesheets."
                    variant="inline"
                    className="py-8"
                  />
                ) : (
                  <>
                    <div className="flex-1 min-h-0">
                      <DataTable
                        data={costRows}
                        columns={costColumns}
                        headerVariant="plain"
                        storageKey="budget-costs-v3"
                        rowKey={(row) => row.id}
                        onRowClick={(row) => {
                          if (row.kind === "category") {
                            setCollapsedCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.groupKey)) next.delete(row.groupKey);
                              else next.add(row.groupKey);
                              return next;
                            });
                          }
                        }}
                        rowStyle={(row) =>
                          row.kind === "category"
                            ? financialRowBgStyle(rowTints.category)
                            : financialRowBgStyle(row.zebra ? rowTints.zebra : null)
                        }
                      />
                    </div>
                    <FinancialTotalsBar
                      segments={[
                        { label: "Original", value: formatCurrency(costTotals.originalBudgetCents) },
                        { label: "Variations", value: formatCurrency(costTotals.variationsCents) },
                        { label: "Revised", value: formatCurrency(costTotals.revisedBudgetCents) },
                        { label: "Bills", value: formatCurrency(costTotals.billsCents) },
                        { label: "Labour", value: formatCurrency(costTotals.labourCents) },
                        { label: "Spent", value: formatCurrency(costTotals.spentCents) },
                        { label: "Committed", value: formatCurrency(costTotals.committedCents) },
                        {
                          label: "Remaining",
                          value: formatCurrency(costTotals.remainingCents),
                          color: getVarianceColor(costTotals.remainingCents),
                        },
                      ]}
                    />
                    <FinancialTableLegend />
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
              <CardHeader className="py-1.5 px-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm">Hours by Cost Code</CardTitle>
                  {labourHours.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleHoursCollapseAll}
                        className="h-7 w-7"
                        title={allHourCategoriesCollapsed ? "Expand all" : "Collapse all"}
                        aria-label={allHourCategoriesCollapsed ? "Expand all" : "Collapse all"}
                        data-testid="button-hours-collapse-all"
                      >
                        {allHourCategoriesCollapsed ? (
                          <ChevronsUpDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronsDownUp className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleEmpty(!hideEmptyCostCodes)}
                        aria-pressed={hideEmptyCostCodes}
                        className={cn("h-7 w-7", hideEmptyCostCodes && "bg-muted text-foreground")}
                        title={hideEmptyCostCodes ? "Show empty cost codes" : "Hide empty cost codes"}
                        aria-label={hideEmptyCostCodes ? "Show empty cost codes" : "Hide empty cost codes"}
                        data-testid="button-hide-empty"
                      >
                        {hideEmptyCostCodes ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
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
                  <EmptyState
                    icon={Clock}
                    title="No labour hours budget"
                    description="The hours budget is generated automatically from estimates and timesheets."
                    variant="inline"
                    className="py-8"
                  />
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
                        data={hoursRows}
                        columns={labourHoursColumns}
                        headerVariant="plain"
                        storageKey="budget-hours-v2"
                        rowKey={(row) => row.id}
                        onRowClick={(row) => {
                          if (row.kind === "category") {
                            setCollapsedHourCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.categoryTitle)) next.delete(row.categoryTitle);
                              else next.add(row.categoryTitle);
                              return next;
                            });
                          }
                        }}
                        rowStyle={(row) =>
                          row.kind === "category"
                            ? financialRowBgStyle(rowTints.category)
                            : financialRowBgStyle(row.zebra ? rowTints.zebra : null)
                        }
                      />
                    </div>
                    <FinancialTotalsBar
                      segments={[
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
                      ]}
                    />
                    <FinancialTableLegend />
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!actualDrill} onOpenChange={(o) => { if (!o) setActualDrill(null); }}>
        <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden" data-testid="dialog-actual-drill">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="text-sm font-semibold">{actualDrill?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              Bills contributing to this cost code
            </DialogDescription>
          </DialogHeader>

          {drillLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : !drillData || drillData.bills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              No bills found for this cost code.
            </p>
          ) : (
            <>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
                {drillData.bills.map((b) => (
                  <Link
                    key={b.billId}
                    href={`/projects/${projectId}/bills/${b.billId}`}
                    onClick={() => setActualDrill(null)}
                    className="flex items-center gap-3 px-4 py-2.5 hover-elevate"
                    data-testid={`drill-bill-${b.billId}`}
                  >
                    {/* Supplier leads: it is what identifies the row. */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium truncate">{b.supplierName || "—"}</span>
                        {b.billType === "credit" && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-data flex-shrink-0">Credit</Badge>
                        )}
                        {b.noLineItems && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 text-data flex-shrink-0"
                            title="This bill has no line items yet, so it's counted at its total (ex GST) until it's coded"
                          >
                            No lines yet
                          </Badge>
                        )}
                      </div>
                      {b.billDate && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(b.billDate).toLocaleDateString("en-AU")}
                        </p>
                      )}
                    </div>

                    {/* Status gets its own column so the chips line up down the
                        list instead of floating after variable-length text. */}
                    <div className="w-20 flex-shrink-0 flex justify-end">
                      {b.status && renderBillStatusChip(b.status)}
                    </div>

                    <span
                      className={cn(
                        "w-24 flex-shrink-0 text-right text-sm font-semibold tabular-nums",
                        b.lineTotal < 0 && "text-[hsl(var(--status-danger-fg))]",
                      )}
                    >
                      {formatCurrency(b.lineTotal)}
                    </span>
                  </Link>
                ))}
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-[hsl(var(--bp-subtle))]">
                <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Total</span>
                <span className="text-sm font-bold tabular-nums" data-testid="text-drill-total">
                  {formatCurrency(drillData.total)}
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!labourDrill} onOpenChange={(o) => { if (!o) setLabourDrill(null); }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-labour-drill">
          <DialogHeader>
            <DialogTitle>Labour costs — {labourDrill?.title}</DialogTitle>
            <DialogDescription>
              Timesheets contributing to this cost code's labour spend.
            </DialogDescription>
          </DialogHeader>
          {labourDrillLoading ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !labourDrillData || labourDrillData.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No timesheets found for this cost code.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {labourDrillData.entries.map((e, idx) => (
                <div
                  key={`${e.timesheetId}-${idx}`}
                  className="block p-2.5 border rounded-md"
                  data-testid={`drill-labour-${e.timesheetId}-${idx}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{e.workerName}</span>
                        {e.status && (
                          <Badge variant="outline" className="text-data">{e.status}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.date ? new Date(e.date).toLocaleDateString("en-AU") : "—"}
                        {` · ${Number((Number(e.hours) || 0).toFixed(2))} hrs @ ${formatCurrency(e.rateCents)}/hr`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(e.costCents)}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold tabular-nums" data-testid="text-labour-drill-total">
                  {formatCurrency(labourDrillData.total)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!variationDrill} onOpenChange={(o) => { if (!o) setVariationDrill(null); }}>
        <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden" data-testid="dialog-variation-drill">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="text-sm font-semibold">{variationDrill?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              Approved variation lines on this cost code, at builder cost (ex GST, no markup)
            </DialogDescription>
          </DialogHeader>

          {variationDrillLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : !variationDrillData || variationDrillData.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              No approved variation lines on this cost code.
            </p>
          ) : (
            <>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
                {variationDrillData.lines.map((l) => (
                  <Link
                    key={l.id}
                    href={`/projects/${projectId}/variations/${l.variationId}`}
                    onClick={() => setVariationDrill(null)}
                    className="flex items-center gap-3 px-4 py-2.5 hover-elevate"
                    data-testid={`drill-variation-${l.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{l.name || l.description || "—"}</div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {l.variationNumber} · {l.variationName}
                        {` · ${l.quantity} ${l.unitType} @ ${formatCurrency(Math.round((Number(l.unitCostExTax) || 0) * 100))}`}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "w-24 flex-shrink-0 text-right text-sm font-semibold tabular-nums",
                        l.costCents < 0 && "text-[hsl(var(--status-danger-fg))]",
                      )}
                    >
                      {formatCurrency(l.costCents)}
                    </span>
                  </Link>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-[hsl(var(--bp-subtle))]">
                <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Total</span>
                <span className="text-sm font-bold tabular-nums" data-testid="text-variation-drill-total">
                  {formatCurrency(variationDrillData.total)}
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { Button } from "@/components/ui/button";
import { useAllowanceStatusOptions } from "@/hooks/useAllowanceStatusOptions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import {
  DollarSign,
  Search,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  MoreVertical,
  FolderOpen,
  SlidersHorizontal,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { type Estimate } from "@shared/schema";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

type EstimateItem = {
  id: string;
  estimateId: string;
  name: string;
  allowance: string;
  allowanceStatus: string;
  pcMarkupPercent: number | null;
  unitCostExTax: number;
  quantity: number;
  priceIncTax: number;
  estimateName: string;
  estimateVersion: number;
  groupName?: string | null;
  groupOrder?: number | null;
  notes?: string | null;
  description?: string | null;
};

type AllowanceWithCosts = {
  item: EstimateItem;
  actualCost: number;
  variance: number;
};

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  overdue: 0,
  pending: 1,
  quoted: 2,
  in_progress: 2,
  approved: 3,
  ordered: 4,
  invoiced: 5,
  finalized: 5,
};

function statusPriority(statusKey: string): number {
  return STATUS_PRIORITY[statusKey.toLowerCase()] ?? 99;
}

function getStatusToneClass(statusName: string): string {
  const n = statusName.toLowerCase();
  if (n.includes("overdue")) return "bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))]";
  if (n.includes("pending")) return "bg-[hsl(var(--amber-bg))] text-[hsl(var(--amber))]";
  if (n.includes("quoted") || n.includes("progress")) return "bg-primary/10 text-primary";
  if (
    n.includes("approved") ||
    n.includes("ordered") ||
    n.includes("invoiced") ||
    n.includes("finalized")
  )
    return "bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))]";
  return "bg-muted/40 text-muted-foreground";
}

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  const isWhole = dollars % 1 === 0;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

function formatVariance(varianceCents: number): { text: string; tone: "under" | "over" | "none" } {
  if (varianceCents === 0) return { text: formatCurrency(0), tone: "none" };
  const abs = Math.abs(varianceCents);
  // "under" means actual < estimate (good). variance = actual - estimate, so negative = under
  if (varianceCents < 0) return { text: `−${formatCurrency(abs)}`, tone: "under" };
  return { text: `+${formatCurrency(abs)}`, tone: "over" };
}

const GROUP_STATE_KEY = "allowances-group-state";

// ───────────────────────────────────────────────────────────────────────
// Stat card
// ───────────────────────────────────────────────────────────────────────

interface StatCardProps {
  value: string;
  label: string;
  variant: "default" | "primary" | "amber" | "sage" | "coral" | "muted";
  testId?: string;
}

function StatCard({ value, label, variant, testId }: StatCardProps) {
  const variantClasses: Record<typeof variant, string> = {
    default: "bg-card border-border text-foreground",
    primary: "bg-primary/10 border-primary/30 text-primary",
    amber: "bg-[hsl(var(--amber-bg))] border-[hsl(var(--amber))]/30 text-[hsl(var(--amber))]",
    sage: "bg-[hsl(var(--sage-bg))] border-[hsl(var(--sage))]/30 text-[hsl(var(--sage))]",
    coral: "bg-[hsl(var(--coral-bg))] border-[hsl(var(--coral))]/30 text-[hsl(var(--coral))]",
    muted: "bg-muted/30 border-border text-muted-foreground",
  };
  return (
    <div
      className={`rounded-lg border px-3 py-2 w-[148px] ${variantClasses[variant]}`}
      data-testid={testId}
    >
      <div className="text-[15px] font-bold leading-tight tabular-nums">{value}</div>
      <div className="text-[8px] font-semibold uppercase tracking-wide opacity-90 mt-1">{label}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Status popover badge
// ───────────────────────────────────────────────────────────────────────

interface StatusBadgePopoverProps {
  itemId: string;
  currentStatus: string;
  statusOptions: { key: string; name: string; color?: string | null }[];
  getStatusInfo: (key: string) => { key: string; name: string; color?: string | null };
  onChange: (newStatus: string) => void;
  disabled?: boolean;
}

function StatusBadgePopover({
  itemId,
  currentStatus,
  statusOptions,
  getStatusInfo,
  onChange,
  disabled,
}: StatusBadgePopoverProps) {
  const [open, setOpen] = useState(false);
  const info = getStatusInfo(currentStatus);
  const tone = getStatusToneClass(info.name);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${tone} hover-elevate active-elevate-2 disabled:opacity-50`}
          data-testid={`badge-status-${itemId}`}
        >
          {info.name}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-1 w-40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0.5">
          {statusOptions.map((opt) => {
            const optTone = getStatusToneClass(opt.name);
            const isCurrent = opt.key === currentStatus;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!isCurrent) onChange(opt.key);
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover-elevate active-elevate-2 disabled:opacity-50`}
                data-testid={`status-option-${itemId}-${opt.key}`}
              >
                <span className={`inline-block rounded text-[10px] font-medium px-1.5 py-0.5 ${optTone}`}>
                  {opt.name}
                </span>
                {isCurrent && <span className="text-[10px] text-muted-foreground">Current</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────────────────

export default function Allowances() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject } = useProject();
  const { statusOptions, getStatusInfo } = useAllowanceStatusOptions();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "pc" | "ps">("all");
  const [selectedEstimateId, setSelectedEstimateId] = useState<string | null>(null);
  const [showSummaryCards, setShowSummaryCards] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("allowances-cards-visible");
      return raw === null ? true : raw === "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    localStorage.setItem("allowances-cards-visible", String(showSummaryCards));
  }, [showSummaryCards]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(GROUP_STATE_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set();
  });

  // Persist collapsed groups
  useEffect(() => {
    localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(Array.from(collapsedGroups)));
  }, [collapsedGroups]);

  // Fetch estimates
  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/estimates?projectId=${projectId}`);
      if (!response.ok) throw new Error("Failed to fetch estimates");
      return response.json();
    },
    enabled: !!projectId,
  });

  // Fetch allowances
  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
  });

  // Reset selected estimate when project changes
  useEffect(() => {
    setSelectedEstimateId(null);
  }, [projectId]);

  // Initialise selected estimate from localStorage or default to working
  useEffect(() => {
    if (estimates.length > 0 && !selectedEstimateId) {
      const storageKey = `allowances-selected-estimate-${projectId}`;
      const stored = localStorage.getItem(storageKey);
      const exists = stored && estimates.some((e) => e.id === stored);
      if (exists) {
        setSelectedEstimateId(stored);
      } else {
        const working = estimates.find((e) => e.status === "working");
        const defId = working?.id || estimates[0].id;
        setSelectedEstimateId(defId);
        localStorage.setItem(storageKey, defId);
      }
    }
  }, [estimates, selectedEstimateId, projectId]);

  const handleEstimateChange = (id: string) => {
    setSelectedEstimateId(id);
    localStorage.setItem(`allowances-selected-estimate-${projectId}`, id);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return apiRequest(`/api/estimate-items/${itemId}`, "PATCH", { allowanceStatus: status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      toast({ title: "Status updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  // ── Derived data ─────────────────────────────────────────────────────

  // Filter by selected estimate first (these counts feed PC/PS toggle)
  const estimateScoped = useMemo(() => {
    if (!selectedEstimateId) return allowances;
    return allowances.filter((a) => a.item.estimateId === selectedEstimateId);
  }, [allowances, selectedEstimateId]);

  const pcCount = estimateScoped.filter((a) => a.item.allowance === "Prime Cost").length;
  const psCount = estimateScoped.filter((a) => a.item.allowance === "Provisional Sum").length;
  const totalCount = pcCount + psCount;

  // Apply other filters
  const filtered = useMemo(() => {
    return estimateScoped.filter((a) => {
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (
          !a.item.name.toLowerCase().includes(t) &&
          !(a.item.groupName?.toLowerCase().includes(t)) &&
          !(a.item.notes?.toLowerCase().includes(t))
        )
          return false;
      }
      if (statusFilter && a.item.allowanceStatus !== statusFilter) return false;
      if (typeFilter === "pc" && a.item.allowance !== "Prime Cost") return false;
      if (typeFilter === "ps" && a.item.allowance !== "Provisional Sum") return false;
      return true;
    });
  }, [estimateScoped, searchTerm, statusFilter, typeFilter]);

  // Group items
  const grouped = useMemo(() => {
    const groups = new Map<string, AllowanceWithCosts[]>();
    // Track the estimate order of each group so we can sort groups to match the estimate
    const groupOrder = new Map<string, number>();
    filtered.forEach((a) => {
      const key = a.item.groupName?.trim() || "Ungrouped";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
      const order = a.item.groupOrder;
      if (typeof order === "number" && !groupOrder.has(key)) {
        groupOrder.set(key, order);
      }
    });
    // Sort groups by estimate order (Ungrouped last)
    const entries = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "Ungrouped") return 1;
      if (b[0] === "Ungrouped") return -1;
      const oa = groupOrder.get(a[0]);
      const ob = groupOrder.get(b[0]);
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      if (oa != null && ob == null) return -1;
      if (oa == null && ob != null) return 1;
      return a[0].localeCompare(b[0]);
    });
    // Sort items within each group: status priority, then name
    entries.forEach(([, items]) => {
      items.sort((x, y) => {
        const sp = statusPriority(x.item.allowanceStatus) - statusPriority(y.item.allowanceStatus);
        if (sp !== 0) return sp;
        return x.item.name.localeCompare(y.item.name);
      });
    });
    return entries;
  }, [filtered]);

  // Stats for summary strip
  const stats = useMemo(() => {
    let totalEstimate = 0;
    let totalActual = 0;
    let outstanding = 0;
    let overBudget = 0;
    estimateScoped.forEach(({ item, actualCost }) => {
      const est = item.priceIncTax || 0;
      totalEstimate += est;
      totalActual += actualCost;
      const statusName = getStatusInfo(item.allowanceStatus).name.toLowerCase();
      if (statusName.includes("pending") || statusName.includes("quoted")) {
        outstanding += est;
      }
      if (actualCost > est) overBudget += actualCost - est;
    });
    return { totalEstimate, totalActual, outstanding, overBudget };
  }, [estimateScoped, getStatusInfo]);

  // Toggle group collapse
  const toggleGroup = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  if (!currentProject) {
    return (
      <EmptyState
        icon={DollarSign}
        title="No Project Selected"
        description="Please select a project to view allowances."
        variant="inline"
        className="h-full py-16"
      />
    );
  }

  // Status options to use (configured or fallback to spec)
  const filterStatusOptions =
    statusOptions.length > 0
      ? statusOptions
      : [
          { key: "pending", name: "Pending", color: "#F59E0B" },
          { key: "quoted", name: "Quoted", color: "#3B82F6" },
          { key: "approved", name: "Approved", color: "#10B981" },
          { key: "ordered", name: "Ordered", color: "#10B981" },
          { key: "invoiced", name: "Invoiced", color: "#10B981" },
        ];

  const grandVariance = formatVariance(stats.totalActual - stats.totalEstimate);

  // Column grid (must match between header / item / subtotal rows)
  // [expand 24 | DESCRIPTION 1fr | TYPE 60 | STATUS 110 | ESTIMATE 110 | MARKUP 90 | ACTUAL 110 | VARIANCE 110 | NOTES 1fr | actions 32]
  const colGrid =
    "grid grid-cols-[24px_minmax(220px,2fr)_60px_110px_110px_90px_110px_110px_minmax(160px,1fr)_32px] gap-3 items-center";

  return (
    <div className="flex flex-col h-full bg-background rounded-lg border overflow-hidden">
      {/* Summary strip (60px) */}
      {showSummaryCards && (
        <div className="h-[60px] flex items-center gap-3 px-6 border-b border-border flex-shrink-0">
          <StatCard
            value={formatCurrency(stats.totalEstimate)}
            label="Total Estimate"
            variant="default"
            testId="stat-total-estimate"
          />
          <StatCard
            value={formatCurrency(stats.totalActual)}
            label="Total Actual"
            variant="sage"
            testId="stat-total-actual"
          />
          <StatCard
            value={formatCurrency(stats.outstanding)}
            label="Outstanding"
            variant="amber"
            testId="stat-outstanding"
          />
          <StatCard
            value={formatCurrency(stats.overBudget)}
            label="Over Budget"
            variant="coral"
            testId="stat-over-budget"
          />
          <StatCard value={String(pcCount)} label="PC Items" variant="primary" testId="stat-pc-count" />
          <StatCard value={String(psCount)} label="PS Items" variant="muted" testId="stat-ps-count" />
        </div>
      )}

      {/* Top bar (consolidated toolbar) */}
      <div className="h-9 bg-background flex items-center justify-between px-4 gap-1 flex-shrink-0">
        {/* PC / PS / All segmented toggle (left) */}
        <div className="bg-muted/40 rounded-md p-0.5 h-7 flex items-center" role="tablist">
          {(
            [
              { key: "all", label: "All" },
              { key: "pc", label: "Prime Cost" },
              { key: "ps", label: "Prov Sum" },
            ] as const
          ).map((seg) => {
            const active = typeFilter === seg.key;
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => setTypeFilter(seg.key)}
                className={`h-6 px-2.5 rounded text-[11px] flex items-center ${
                  active
                    ? "bg-card shadow-sm text-foreground font-semibold"
                    : "text-muted-foreground hover-elevate"
                }`}
                data-testid={`button-filter-${seg.key}`}
              >
                {seg.label}
              </button>
            );
          })}
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-1">
        {/* Search icon button (popover with input) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${searchTerm ? "text-primary" : "text-muted-foreground"}`}
              data-testid="button-search-allowances"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search allowances…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-7 h-8 text-[12px] bg-card border border-border rounded-md"
                data-testid="input-search-allowances"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover-elevate"
                  data-testid="button-clear-search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Filter icon button (popover with status filter) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={`h-7 w-7 ${statusFilter ? "text-primary" : "text-muted-foreground"}`}
              data-testid="button-filter-allowances"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </label>
              <Select
                value={statusFilter || "all"}
                onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger
                  className="w-full h-8 text-[12px] bg-card border-border rounded-md"
                  data-testid="select-status-filter"
                >
                  <SelectValue>
                    {statusFilter ? getStatusInfo(statusFilter).name : "All Statuses"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {filterStatusOptions.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>

        {/* Options menu */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 ml-1"
              data-testid="button-toolbar-options"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowSummaryCards((v) => !v);
              }}
              className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover-elevate active-elevate-2"
              data-testid="button-toggle-summary-cards"
            >
              {showSummaryCards ? (
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="flex-1">Show summary cards</span>
              <span
                className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border ${
                  showSummaryCards ? "bg-primary border-primary text-white" : "border-border"
                }`}
              >
                {showSummaryCards && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </button>
            <Separator className="my-2" />
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Estimate version
              </label>
              <Select
                value={selectedEstimateId || ""}
                onValueChange={handleEstimateChange}
                disabled={estimatesLoading || estimates.length === 0}
              >
                <SelectTrigger
                  className="w-full h-8 text-[12px] bg-card border-border rounded-md"
                  data-testid="select-estimate"
                >
                  <SelectValue placeholder="Select estimate" />
                </SelectTrigger>
                <SelectContent>
                  {estimates.map((est) => (
                    <SelectItem key={est.id} value={est.id} data-testid={`estimate-option-${est.id}`}>
                      {est.name} (v{est.version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Header (sticky, 34px) */}
        <div
          className={`${colGrid} bg-muted/30 border-b border-border h-[34px] px-4 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground sticky top-0 z-10`}
        >
          <div></div>
          <div>Description</div>
          <div>Type</div>
          <div>Status</div>
          <div className="text-right">Estimate</div>
          <div className="text-right">Markup</div>
          <div className="text-right">Actual</div>
          <div className="text-right">Variance</div>
          <div>Notes</div>
          <div></div>
        </div>

        {isLoading ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            Loading allowances…
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title={allowances.length === 0 ? "No Allowances Yet" : "No Matching Allowances"}
            description={
              allowances.length === 0
                ? "Add Prime Cost or Provisional Sum items in your estimates to track allowances here."
                : searchTerm || statusFilter || typeFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "No allowances found for the selected estimate."
            }
            variant="inline"
            className="py-16"
          />
        ) : (
          grouped.map(([groupName, items], groupIdx) => {
            const collapsed = collapsedGroups.has(groupName);
            const groupEst = items.reduce((s, a) => s + (a.item.priceIncTax || 0), 0);
            const groupAct = items.reduce((s, a) => s + a.actualCost, 0);
            const groupVar = formatVariance(groupAct - groupEst);

            return (
              <div key={groupName}>
                {/* Group header (40px) */}
                <button
                  type="button"
                  onClick={() => toggleGroup(groupName)}
                  className="w-full flex items-center gap-3 px-4 h-10 bg-muted/30 border-y border-border hover-elevate text-left"
                  data-testid={`group-header-${groupIdx}`}
                >
                  {collapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  <FolderOpen className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[13px] font-semibold text-foreground">{groupName}</span>

                  <div className="ml-auto flex items-center gap-6">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      EST <span className="text-foreground font-medium">{formatCurrency(groupEst)}</span>
                    </span>
                    {groupAct > 0 && (
                      <span className="text-[11px] text-foreground tabular-nums">
                        ACT <span className="font-medium">{formatCurrency(groupAct)}</span>
                      </span>
                    )}
                    <span
                      className={`text-[12px] font-semibold tabular-nums ${
                        groupVar.tone === "under"
                          ? "text-[hsl(var(--sage))]"
                          : groupVar.tone === "over"
                            ? "text-[hsl(var(--coral))]"
                            : "text-muted-foreground"
                      }`}
                    >
                      {groupVar.text}
                    </span>
                    <span className="bg-muted/40 text-muted-foreground rounded-full text-[10px] font-medium px-2 py-0.5">
                      {items.length}
                    </span>
                  </div>
                </button>

                {/* Items */}
                {!collapsed && (
                  <>
                    {items.map(({ item, actualCost, variance }, idx) => {
                      const variantBg = idx % 2 === 0 ? "bg-card" : "bg-muted/10";
                      const isPC = item.allowance === "Prime Cost";
                      const typeBg = isPC
                        ? "bg-primary/10 text-primary"
                        : "bg-[hsl(var(--amber-bg))] text-[hsl(var(--amber))]";
                      const typeLabel = isPC ? "PC" : "PS";
                      const varMeta = formatVariance(variance);
                      const hasActual = actualCost > 0;

                      return (
                        <div
                          key={item.id}
                          className={`${colGrid} h-[44px] px-4 border-b border-border/40 ${variantBg} hover-elevate cursor-pointer`}
                          onClick={() => setLocation(`/projects/${projectId}/allowances/${item.id}`)}
                          data-testid={`row-allowance-${item.id}`}
                        >
                          <div></div>

                          {/* Description */}
                          <div className="text-[12px] text-foreground pl-6 truncate" data-testid={`text-name-${item.id}`}>
                            {item.name}
                          </div>

                          {/* Type */}
                          <div>
                            <span className={`inline-block rounded text-[10px] font-medium px-1.5 py-0.5 ${typeBg}`}>
                              {typeLabel}
                            </span>
                          </div>

                          {/* Status */}
                          <div>
                            <StatusBadgePopover
                              itemId={item.id}
                              currentStatus={item.allowanceStatus}
                              statusOptions={filterStatusOptions}
                              getStatusInfo={getStatusInfo}
                              onChange={(status) =>
                                updateStatusMutation.mutate({ itemId: item.id, status })
                              }
                              disabled={updateStatusMutation.isPending}
                            />
                          </div>

                          {/* Estimate */}
                          <div
                            className="text-[12px] text-muted-foreground tabular-nums text-right"
                            data-testid={`text-estimate-${item.id}`}
                          >
                            {formatCurrency(item.priceIncTax || 0)}
                          </div>

                          {/* Markup */}
                          <div className="text-[12px] tabular-nums text-right">
                            {isPC ? (
                              <span className="text-muted-foreground">{item.pcMarkupPercent || 0}%</span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </div>

                          {/* Actual */}
                          <div
                            className={`text-[12px] tabular-nums text-right ${
                              hasActual ? "text-foreground" : "text-muted-foreground/40"
                            }`}
                            data-testid={`text-actual-${item.id}`}
                          >
                            {hasActual ? formatCurrency(actualCost) : "—"}
                          </div>

                          {/* Variance */}
                          <div
                            className={`text-[12px] font-semibold tabular-nums text-right ${
                              !hasActual
                                ? "text-muted-foreground/40"
                                : varMeta.tone === "under"
                                  ? "text-[hsl(var(--sage))]"
                                  : varMeta.tone === "over"
                                    ? "text-[hsl(var(--coral))]"
                                    : "text-muted-foreground"
                            }`}
                            data-testid={`text-variance-${item.id}`}
                          >
                            {hasActual ? varMeta.text : "—"}
                          </div>

                          {/* Notes */}
                          <div className="text-[10px] text-muted-foreground/60 truncate">
                            {item.notes || ""}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
                              onClick={() => setLocation(`/projects/${projectId}/allowances/${item.id}`)}
                              data-testid={`button-actions-${item.id}`}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sticky grand total footer (48px) */}
      <div className="flex-none h-12 flex items-center px-6 border-t border-border bg-muted/30 flex-shrink-0">
        <div className="text-xs text-muted-foreground" data-testid="text-footer-summary">
          {filtered.length} item{filtered.length === 1 ? "" : "s"} across {grouped.length} group
          {grouped.length === 1 ? "" : "s"}
        </div>
        <div className="ml-auto flex items-center gap-8">
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase text-muted-foreground tracking-wide">
              Total Estimate
            </div>
            <div className="text-[13px] font-bold text-foreground tabular-nums" data-testid="text-grand-estimate">
              {formatCurrency(stats.totalEstimate)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase text-muted-foreground tracking-wide">
              Total Actual
            </div>
            <div
              className="text-[13px] font-bold tabular-nums text-[hsl(var(--sage))]"
              data-testid="text-grand-actual"
            >
              {formatCurrency(stats.totalActual)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase text-muted-foreground tracking-wide">
              Total Variance
            </div>
            <div
              className={`text-[13px] font-bold tabular-nums ${
                grandVariance.tone === "over"
                  ? "text-[hsl(var(--coral))]"
                  : grandVariance.tone === "under"
                    ? "text-[hsl(var(--sage))]"
                    : "text-foreground"
              }`}
              data-testid="text-grand-variance"
            >
              {grandVariance.text}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

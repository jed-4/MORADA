import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  LayoutList,
  Columns3,
  Search,
  MoreVertical,
  MapPin,
  X,
  SlidersHorizontal,
  Settings2,
} from "lucide-react";
import type { Defect } from "@shared/schema";
import { DefectFormDialog } from "@/components/defects/DefectFormDialog";
import { DefectBoardView } from "@/components/defects/DefectBoardView";
import { DefectDrawer } from "@/components/defects/DefectDrawer";
import {
  statusBadgeClass,
  priorityBadgeClass,
  typeBadgeClass,
  statusLabel,
  priorityLabel,
  typeLabel,
  ageInDays,
  ageColorClass,
} from "@/components/defects/defectStyles";
import { useDefectStatusOptions } from "@/hooks/useDefectStatusOptions";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

type ViewMode = "list" | "kanban";
const VIEW_KEY = "defects-view";
const HIDE_STATS_KEY = "defects-hide-stats";

export default function Defects() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const [currentView, setCurrentView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const saved = window.localStorage.getItem(VIEW_KEY);
    return saved === "kanban" ? "kanban" : "list";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, currentView);
    } catch {
      /* noop */
    }
  }, [currentView]);

  const [hideStats, setHideStats] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(HIDE_STATS_KEY) === "1";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(HIDE_STATS_KEY, hideStats ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [hideStats]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPriority, setSelectedPriority] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);
  const [openDefect, setOpenDefect] = useState<Defect | null>(null);
  const [deletingDefect, setDeletingDefect] = useState<Defect | null>(null);

  const { statusOptions } = useDefectStatusOptions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();

  const { data: defects = [], isLoading } = useQuery<Defect[]>({
    queryKey: ["/api/defects", projectId],
    queryFn: async () => {
      const url = projectId ? `/api/defects?projectId=${projectId}` : "/api/defects";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch defects");
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/defects/${id}`, "DELETE", null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/defects", projectId] });
      toast({ title: "Deleted", description: "Defect removed" });
      setDeletingDefect(null);
      setOpenDefect(null);
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to delete defect",
        variant: "destructive",
      }),
  });

  const filteredDefects = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return defects.filter((defect) => {
      const matchesSearch =
        !q ||
        defect.title.toLowerCase().includes(q) ||
        defect.description?.toLowerCase().includes(q) ||
        defect.location?.toLowerCase().includes(q);
      const matchesStatus = selectedStatus === "All" || defect.status === selectedStatus;
      const matchesPriority = selectedPriority === "All" || defect.priority === selectedPriority;
      const matchesType = selectedType === "All" || defect.type === selectedType;
      return matchesSearch && matchesStatus && matchesPriority && matchesType;
    });
  }, [defects, searchTerm, selectedStatus, selectedPriority, selectedType]);

  // Stats — computed from full data set, not filtered
  const stats = useMemo(() => {
    const open = defects.filter((d) => d.status === "open").length;
    const inProgress = defects.filter((d) => d.status === "in_progress").length;
    const resolved = defects.filter((d) => d.status === "resolved").length;
    const closed = defects.filter((d) => d.status === "closed").length;
    const critical = defects.filter(
      (d) => d.priority === "critical" && d.status !== "closed" && d.status !== "resolved",
    ).length;
    const openItems = defects.filter(
      (d) => d.status === "open" || d.status === "in_progress",
    );
    const avgAge = openItems.length
      ? Math.round(
          openItems.reduce((sum, d) => sum + ageInDays(d.dateIdentified), 0) /
            openItems.length,
        )
      : 0;
    return { open, inProgress, resolved, closed, critical, avgAge };
  }, [defects]);

  // Filtered stats for footer
  const footerStats = useMemo(() => {
    const open = filteredDefects.filter((d) => d.status === "open").length;
    const inProgress = filteredDefects.filter((d) => d.status === "in_progress").length;
    const critical = filteredDefects.filter(
      (d) => d.priority === "critical" && d.status !== "closed" && d.status !== "resolved",
    ).length;
    const openItems = filteredDefects.filter(
      (d) => d.status === "open" || d.status === "in_progress",
    );
    const avgAge = openItems.length
      ? Math.round(
          openItems.reduce((sum, d) => sum + ageInDays(d.dateIdentified), 0) /
            openItems.length,
        )
      : 0;
    return { open, inProgress, critical, avgAge };
  }, [filteredDefects]);

  const activeFilterCount =
    (selectedStatus !== "All" ? 1 : 0) +
    (selectedPriority !== "All" ? 1 : 0) +
    (selectedType !== "All" ? 1 : 0);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-9 bg-background flex items-center justify-between px-6 gap-3 border-b border-border flex-shrink-0">
        {/* Left: View toggle (icon only) + search + filter */}
        <div className="flex items-center gap-1.5">
          <div
            className="bg-muted/40 rounded-md p-0.5 h-[28px] flex"
            data-testid="view-toggle"
          >
            <button
              onClick={() => setCurrentView("list")}
              className={`w-7 h-full flex items-center justify-center rounded transition-colors ${
                currentView === "list"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground"
              }`}
              data-testid="button-list-view"
              aria-label="List view"
              title="List view"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentView("kanban")}
              className={`w-7 h-full flex items-center justify-center rounded transition-colors ${
                currentView === "kanban"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground"
              }`}
              data-testid="button-kanban-view"
              aria-label="Kanban view"
              title="Kanban view"
            >
              <Columns3 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search icon → popover with input */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center relative"
                data-testid="button-search"
                aria-label="Search defects"
                title="Search"
              >
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                {searchTerm && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search defects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 pr-7 h-8 text-xs"
                  data-testid="defects-search-input"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Filter icon → popover with all three filters */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center relative"
                data-testid="button-filter"
                aria-label="Filter defects"
                title="Filter"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] h-3.5 min-w-[14px] px-1">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2" align="start">
              <div className="space-y-3">
                <FilterGroup
                  label="Status"
                  value={selectedStatus}
                  onChange={setSelectedStatus}
                  allLabel="All statuses"
                  options={statusOptions}
                  testIdPrefix="filter-status"
                />
                <FilterGroup
                  label="Priority"
                  value={selectedPriority}
                  onChange={setSelectedPriority}
                  allLabel="All priorities"
                  options={priorityOptions}
                  testIdPrefix="filter-priority"
                />
                <FilterGroup
                  label="Type"
                  value={selectedType}
                  onChange={setSelectedType}
                  allLabel="All types"
                  options={typeOptions}
                  testIdPrefix="filter-type"
                />
                {activeFilterCount > 0 && (
                  <div className="pt-1.5 border-t border-border">
                    <button
                      onClick={() => {
                        setSelectedStatus("All");
                        setSelectedPriority("All");
                        setSelectedType("All");
                      }}
                      className="w-full h-7 text-xs text-muted-foreground hover:text-foreground rounded hover-elevate flex items-center justify-center gap-1"
                      data-testid="clear-filters"
                    >
                      <X className="w-3 h-3" />
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Right: Add + options */}
        <div className="flex items-center gap-1.5">
          <button
            className="h-7 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1"
            onClick={() => setIsCreateDialogOpen(true)}
            data-testid="button-create-defect"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>

          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-options"
                aria-label="Options"
                title="Options"
              >
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2" align="end">
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1">
                  Display
                </div>
                <label
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover-elevate cursor-pointer"
                  data-testid="option-hide-stats"
                >
                  <div className="flex flex-col">
                    <span className="text-xs text-foreground">
                      Hide summary cards
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Hide the coloured Open / In Progress strip
                    </span>
                  </div>
                  <Switch
                    checked={hideStats}
                    onCheckedChange={setHideStats}
                    data-testid="switch-hide-stats"
                  />
                </label>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary strip */}
      {!hideStats && (
        <div
          className="flex items-center gap-3 px-6 py-2 border-b border-border flex-shrink-0"
          data-testid="stats-strip"
        >
          <StatCard
            label="Open"
            value={stats.open}
            variant="coral"
            testId="stat-open"
          />
          <StatCard
            label="In Progress"
            value={stats.inProgress}
            variant="amber"
            testId="stat-in-progress"
          />
          <StatCard
            label="Resolved"
            value={stats.resolved}
            variant="sage"
            testId="stat-resolved"
          />
          <StatCard
            label="Closed"
            value={stats.closed}
            variant="muted"
            testId="stat-closed"
          />
          <StatCard
            label="Critical"
            value={stats.critical}
            variant="coral"
            testId="stat-critical"
          />
          <StatCard
            label="Avg Open Age"
            value={`${stats.avgAge}d`}
            variant="default"
            testId="stat-avg-age"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading defects...</p>
          </div>
        ) : filteredDefects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-muted-foreground text-sm">
              {defects.length === 0 ? "No defects found" : "No matching defects"}
            </p>
            {defects.length === 0 && (
              <button
                className="h-8 px-3 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1"
                onClick={() => setIsCreateDialogOpen(true)}
                data-testid="button-add-first-defect"
              >
                <Plus className="w-3.5 h-3.5" />
                Add first defect
              </button>
            )}
          </div>
        ) : currentView === "list" ? (
          <DefectListTable
            defects={filteredDefects}
            statusOptions={statusOptions}
            priorityOptions={priorityOptions}
            typeOptions={typeOptions}
            onOpen={setOpenDefect}
            onEdit={setEditingDefect}
            onDelete={setDeletingDefect}
          />
        ) : (
          <div className="h-full pt-3">
            <DefectBoardView
              defects={filteredDefects}
              onOpen={setOpenDefect}
              onAddDefect={() => setIsCreateDialogOpen(true)}
            />
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="flex-none h-11 bg-muted/30 border-t border-border flex items-center justify-between px-6 text-[11px] text-muted-foreground">
        <div data-testid="footer-count">
          {filteredDefects.length} of {defects.length} defects shown
        </div>
        <div className="flex items-center gap-3">
          <span>
            <span className="text-foreground font-semibold">{footerStats.open}</span> open
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="text-foreground font-semibold">{footerStats.inProgress}</span>{" "}
            in progress
          </span>
          <span className="text-border">·</span>
          <span>
            <span className="text-[hsl(var(--coral))] font-semibold">
              {footerStats.critical}
            </span>{" "}
            critical
          </span>
          <span className="text-border">·</span>
          <span>
            avg age <span className="text-foreground font-semibold">{footerStats.avgAge}d</span>
          </span>
        </div>
      </div>

      {/* Drawer */}
      <DefectDrawer
        defect={openDefect}
        open={!!openDefect}
        onOpenChange={(o) => !o && setOpenDefect(null)}
        onDelete={(d) => setDeletingDefect(d)}
      />

      {/* Form dialog */}
      <DefectFormDialog
        open={isCreateDialogOpen || !!editingDefect}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingDefect(null);
          }
        }}
        defect={editingDefect || undefined}
      />

      {/* Delete confirm */}
      <AlertDialog
        open={!!deletingDefect}
        onOpenChange={(open) => !open && setDeletingDefect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Defect</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDefect?.title}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDefect && deleteMutation.mutate(deletingDefect.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

interface FilterGroupProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: Array<{ key: string; name: string }>;
  testIdPrefix: string;
}

function FilterGroup({
  label,
  value,
  onChange,
  allLabel,
  options,
  testIdPrefix,
}: FilterGroupProps) {
  const items = [{ key: "All", name: allLabel }, ...options];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 px-1">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((opt) => {
          const isActive = value === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              className={`h-6 px-2 text-[11px] rounded-md border transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover-elevate"
              }`}
              data-testid={`${testIdPrefix}-${opt.key}`}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  variant: "coral" | "amber" | "sage" | "muted" | "default";
  testId: string;
}

function StatCard({ label, value, variant, testId }: StatCardProps) {
  const cls = (() => {
    switch (variant) {
      case "coral":
        return "bg-[hsl(var(--coral-bg))] border-[hsl(var(--coral))]/30 text-[hsl(var(--coral))]";
      case "amber":
        return "bg-[hsl(var(--amber-bg))] border-[hsl(var(--amber))]/30 text-[hsl(var(--amber))]";
      case "sage":
        return "bg-[hsl(var(--sage-bg))] border-[hsl(var(--sage))]/30 text-[hsl(var(--sage))]";
      case "muted":
        return "bg-muted/30 border-border text-muted-foreground";
      default:
        return "bg-card border-border text-foreground";
    }
  })();
  return (
    <div
      className={`rounded-lg border px-3 py-2 w-[130px] flex flex-col ${cls}`}
      data-testid={testId}
    >
      <div className="text-[14px] font-bold leading-tight">{value}</div>
      <div className="text-[8px] font-semibold uppercase tracking-wide mt-1 opacity-80">
        {label}
      </div>
    </div>
  );
}

interface DefectListTableProps {
  defects: Defect[];
  statusOptions: Array<{ key: string; name: string }>;
  priorityOptions: Array<{ key: string; name: string }>;
  typeOptions: Array<{ key: string; name: string }>;
  onOpen: (defect: Defect) => void;
  onEdit: (defect: Defect) => void;
  onDelete: (defect: Defect) => void;
}

function DefectListTable({
  defects,
  statusOptions,
  priorityOptions,
  typeOptions,
  onOpen,
}: DefectListTableProps) {
  return (
    <div className="w-full">
      {/* Header row */}
      <div className="h-[34px] bg-muted/30 grid grid-cols-[28px_minmax(220px,2fr)_90px_80px_120px_110px_120px_90px_60px_36px] items-center px-6 gap-3 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border sticky top-0 z-10">
        <div />
        <div>Defect</div>
        <div>Status</div>
        <div>Priority</div>
        <div>Type</div>
        <div>Trade</div>
        <div>Location</div>
        <div>Reported</div>
        <div>Age</div>
        <div />
      </div>

      {/* Rows */}
      {defects.map((defect, idx) => {
        const age = ageInDays(defect.dateIdentified);
        const isResolvedOrClosed = defect.status === "resolved" || defect.status === "closed";
        return (
          <div
            key={defect.id}
            onClick={() => onOpen(defect)}
            className={`h-11 grid grid-cols-[28px_minmax(220px,2fr)_90px_80px_120px_110px_120px_90px_60px_36px] items-center px-6 gap-3 border-b border-border/40 cursor-pointer hover-elevate ${
              idx % 2 === 1 ? "bg-muted/10" : "bg-card"
            }`}
            data-testid={`defect-row-${defect.id}`}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-border"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate">
                {defect.title}
              </div>
              {defect.description && (
                <div className="text-[10px] text-muted-foreground/70 truncate">
                  {defect.description}
                </div>
              )}
            </div>

            <div>
              <span
                className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${statusBadgeClass(
                  defect.status,
                )}`}
              >
                {statusLabel(defect.status, statusOptions)}
              </span>
            </div>

            <div>
              <span
                className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${priorityBadgeClass(
                  defect.priority,
                )}`}
              >
                {priorityLabel(defect.priority, priorityOptions)}
              </span>
            </div>

            <div>
              <span
                className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${typeBadgeClass(
                  defect.type,
                )}`}
              >
                {typeLabel(defect.type, typeOptions)}
              </span>
            </div>

            <div className="text-[11px] text-muted-foreground truncate">
              {defect.trade || "—"}
            </div>

            <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              {defect.location ? (
                <>
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{defect.location}</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground">
              {defect.dateIdentified
                ? format(new Date(defect.dateIdentified), "MMM d")
                : "—"}
            </div>

            <div className="text-[11px]">
              {isResolvedOrClosed ? (
                <span className="text-[hsl(var(--sage))]">
                  {defect.status === "resolved" ? "Resolved" : "Closed"}
                </span>
              ) : (
                <span className={ageColorClass(age)}>{age}d</span>
              )}
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(defect);
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
                data-testid={`row-actions-${defect.id}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

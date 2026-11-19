import { useEffect, useMemo, useState } from "react";
import { useQuery, useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { useParams, useSearch } from "wouter";
import { useProject } from "@/contexts/ProjectContext";
import { PinRowButton } from "@/components/widgets/PinRowButton";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ChevronRight,
  AlertTriangle,
  HardHat,
  FileCheck2,
} from "lucide-react";
import {
  DEFECT_JOB_STAGES,
  DEFECT_JOB_STAGE_LABELS,
  DEFECT_STAGE_LABELS,
  type DefectListResponse,
  type DefectStage,
  type DefectView,
} from "@shared/defects";
import { DefectFormDialog } from "@/components/defects/DefectFormDialog";
import { DefectBoardView } from "@/components/defects/DefectBoardView";
import { DefectDrawer } from "@/components/defects/DefectDrawer";
import { DefectTradesSheet } from "@/components/defects/DefectTradesSheet";
import { DefectHandoverDialog } from "@/components/defects/DefectHandoverDialog";
import {
  stageBadgeClass,
  priorityBadgeClass,
  priorityLabel,
  ageInDays,
  ageColorClass,
  STAGE_ORDER,
  invalidateDefectQueries,
} from "@/components/defects/defectStyles";
import { useDefectPermissions, useProjectLocations, useTeamUsers } from "@/components/defects/defectHooks";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTradeOptions } from "@/hooks/useDefectTradeOptions";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { EmptyState } from "@/components/EmptyState";
import { format } from "date-fns";

type ViewMode = "list" | "kanban";
const VIEW_KEY = "defects-view";
const HIDE_STATS_KEY = "defects-hide-stats";
const ALL = "All";
const PAGE = 200;

function readLocal(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, v: string) {
  try { window.localStorage.setItem(key, v); } catch { /* noop */ }
}

export default function Defects({ embedded }: { embedded?: boolean } = {}) {
  const { projectId } = useParams<{ projectId: string }>();
  const search = useSearch();
  const { currentProject } = useProject();
  const { toast } = useToast();
  const perms = useDefectPermissions();

  const [currentView, setCurrentView] = useState<ViewMode>(() => (readLocal(VIEW_KEY) === "kanban" ? "kanban" : "list"));
  useEffect(() => writeLocal(VIEW_KEY, currentView), [currentView]);
  const [hideStats, setHideStats] = useState<boolean>(() => readLocal(HIDE_STATS_KEY) === "1");
  useEffect(() => writeLocal(HIDE_STATS_KEY, hideStats ? "1" : "0"), [hideStats]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(ALL);
  const [jobStageFilter, setJobStageFilter] = useState<string>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);
  const [tradeFilter, setTradeFilter] = useState<string>(ALL);
  const [locationFilter, setLocationFilter] = useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [openDefect, setOpenDefect] = useState<DefectView | null>(null);
  const [deletingDefect, setDeletingDefect] = useState<DefectView | null>(null);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);

  const { priorityOptions } = useDefectPriorityOptions();
  const tradeOptions = useDefectTradeOptions();
  const teamUsers = useTeamUsers();
  const { data: locations = [] } = useProjectLocations(projectId);

  // One project: the v2 list, paged. All projects: the legacy array.
  const projectQuery = useInfiniteQuery<DefectListResponse>({
    queryKey: ["/api/projects", projectId, "defects"],
    enabled: !!projectId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: String(PAGE) });
      if (pageParam) qs.set("cursor", String(pageParam));
      const r = await fetch(`/api/projects/${projectId}/defects?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch defects");
      return r.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const allQuery = useQuery<DefectView[]>({
    queryKey: ["/api/defects", "all-projects"],
    enabled: !projectId,
    queryFn: async () => {
      const r = await fetch(`/api/defects`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch defects");
      return r.json();
    },
  });

  const defects: DefectView[] = useMemo(
    () => (projectId ? (projectQuery.data?.pages.flatMap((p) => p.items) ?? []) : (allQuery.data ?? [])),
    [projectId, projectQuery.data, allQuery.data],
  );
  const isLoading = projectId ? projectQuery.isLoading : allQuery.isLoading;

  // Open the defect a notification linked to (?defect=<id>).
  useEffect(() => {
    const id = new URLSearchParams(search).get("defect");
    if (!id || openDefect?.id === id) return;
    const hit = defects.find((d) => d.id === id);
    if (hit) setOpenDefect(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, defects]);

  // Keep the open drawer's list copy fresh after a refetch.
  useEffect(() => {
    if (!openDefect) return;
    const fresh = defects.find((d) => d.id === openDefect.id);
    if (fresh && fresh !== openDefect) setOpenDefect(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defects]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/defects/${id}`, "DELETE", null),
    onSuccess: () => {
      invalidateDefectQueries(queryClient);
      toast({ title: "Deleted", description: "Defect removed" });
      setDeletingDefect(null);
      setOpenDefect(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to delete defect", variant: "destructive" }),
  });

  // Location filter includes everything inside the picked location.
  const locationIds = useMemo(() => {
    if (locationFilter === ALL) return null;
    const out = new Set([locationFilter]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of locations) if (l.parentId && out.has(l.parentId) && !out.has(l.id)) { out.add(l.id); grew = true; }
    }
    return out;
  }, [locationFilter, locations]);

  const filteredDefects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return defects.filter((d) => {
      if (q && !(
        d.title.toLowerCase().includes(q) ||
        d.ref.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q) ||
        d.location?.toLowerCase().includes(q)
      )) return false;
      if (stageFilter !== ALL && d.stage !== stageFilter) return false;
      if (jobStageFilter !== ALL && d.jobStage !== jobStageFilter) return false;
      if (ownerFilter !== ALL && (ownerFilter === "none" ? !!d.ownerUserId : d.ownerUserId !== ownerFilter)) return false;
      if (tradeFilter !== ALL && d.trade !== tradeFilter) return false;
      if (locationIds && !(d.locationId && locationIds.has(d.locationId))) return false;
      if (priorityFilter !== ALL && d.priority !== priorityFilter) return false;
      if (overdueOnly && !d.overdue) return false;
      return true;
    });
  }, [defects, searchTerm, stageFilter, jobStageFilter, ownerFilter, tradeFilter, locationIds, priorityFilter, overdueOnly]);

  const stats = useMemo(() => {
    const by = (s: DefectStage) => defects.filter((d) => d.stage === s).length;
    return {
      open: by("open"),
      withTrade: by("sent") + by("accepted"),
      rejected: by("rejected"),
      fixed: by("fixed"),
      closed: by("closed"),
      overdue: defects.filter((d) => d.overdue).length,
    };
  }, [defects]);

  const footerStats = useMemo(() => {
    const live = filteredDefects.filter((d) => d.stage !== "closed");
    const notFixed = live.filter((d) => d.stage !== "fixed");
    const avgAge = notFixed.length
      ? Math.round(notFixed.reduce((sum, d) => sum + ageInDays(d.dateIdentified), 0) / notFixed.length)
      : 0;
    return {
      live: live.length,
      toCheck: filteredDefects.filter((d) => d.stage === "fixed").length,
      overdue: filteredDefects.filter((d) => d.overdue).length,
      avgAge,
    };
  }, [filteredDefects]);

  const activeFilterCount =
    [stageFilter, jobStageFilter, ownerFilter, tradeFilter, locationFilter, priorityFilter].filter((v) => v !== ALL).length +
    (overdueOnly ? 1 : 0);

  const clearFilters = () => {
    setStageFilter(ALL);
    setJobStageFilter(ALL);
    setOwnerFilter(ALL);
    setTradeFilter(ALL);
    setLocationFilter(ALL);
    setPriorityFilter(ALL);
    setOverdueOnly(false);
  };

  const canAdd = perms.add && !!projectId;

  if (!perms.view) {
    return (
      <div className="p-6">
        <EmptyState title="You don't have access to defects. Ask an admin to turn on Defects for your role." variant="card" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {!embedded && (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {projectId && currentProject ? currentProject.name : "All Projects"}
          </span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Defects</span>
        </div>
      )}
      {/* Toolbar */}
      <div className="h-9 bg-background flex items-center justify-between px-6 gap-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="bg-muted/40 rounded-md p-0.5 h-[28px] flex" data-testid="view-toggle">
            <button
              onClick={() => setCurrentView("list")}
              className={`w-7 h-full flex items-center justify-center rounded transition-colors ${
                currentView === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
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
                currentView === "kanban" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
              }`}
              data-testid="button-kanban-view"
              aria-label="Kanban view"
              title="Kanban view"
            >
              <Columns3 className="w-3.5 h-3.5" />
            </button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-7 w-7 border rounded-md hover-elevate active-elevate-2 flex items-center justify-center relative"
                data-testid="button-search"
                aria-label="Search defects"
                title="Search"
              >
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                {searchTerm && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search defects or D-014…"
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
            <PopoverContent className="w-72 p-2" align="start">
              <div className="space-y-3">
                <FilterGroup
                  label="Stage"
                  value={stageFilter}
                  onChange={setStageFilter}
                  allLabel="All stages"
                  options={STAGE_ORDER.map((s) => ({ key: s, name: DEFECT_STAGE_LABELS[s] }))}
                  testIdPrefix="filter-stage"
                />
                <FilterGroup
                  label="Job stage"
                  value={jobStageFilter}
                  onChange={setJobStageFilter}
                  allLabel="All"
                  options={DEFECT_JOB_STAGES.map((s) => ({ key: s, name: DEFECT_JOB_STAGE_LABELS[s] }))}
                  testIdPrefix="filter-job-stage"
                />
                <FilterSelect
                  label="Owner"
                  value={ownerFilter}
                  onChange={setOwnerFilter}
                  options={[{ key: "none", name: "No owner" }, ...teamUsers.map((u) => ({ key: u.id, name: u.name }))]}
                  testId="filter-owner"
                />
                <FilterSelect
                  label="Trade"
                  value={tradeFilter}
                  onChange={setTradeFilter}
                  options={tradeOptions.map((t) => ({ key: t.value, name: t.label }))}
                  testId="filter-trade"
                />
                {projectId && (
                  <FilterSelect
                    label="Location"
                    value={locationFilter}
                    onChange={setLocationFilter}
                    options={locations.map((l) => ({ key: l.id, name: l.path }))}
                    testId="filter-location"
                  />
                )}
                <FilterGroup
                  label="Priority"
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  allLabel="All priorities"
                  options={priorityOptions}
                  testIdPrefix="filter-priority"
                />
                <label className="flex items-center justify-between gap-3 px-1 cursor-pointer" data-testid="filter-overdue">
                  <span className="text-xs text-foreground">Overdue only</span>
                  <Switch checked={overdueOnly} onCheckedChange={setOverdueOnly} />
                </label>
                {activeFilterCount > 0 && (
                  <div className="pt-1.5 border-t border-border">
                    <button
                      onClick={clearFilters}
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

        <div className="flex items-center gap-1.5">
          {projectId && (
            <>
              <button
                className="h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                onClick={() => setTradesOpen(true)}
                data-testid="button-defect-trades"
                title="Trades: links, sending, backcharges"
              >
                <HardHat className="w-3 h-3" />
                <span>Trades</span>
              </button>
              <button
                className="h-7 px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
                onClick={() => setHandoverOpen(true)}
                data-testid="button-defect-handover"
                title="Handover list PDF and client sign-off"
              >
                <FileCheck2 className="w-3 h-3" />
                <span>Handover</span>
              </button>
            </>
          )}
          {canAdd && (
            <button
              className="h-7 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1"
              onClick={() => setIsCreateDialogOpen(true)}
              data-testid="button-create-defect"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          )}

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
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1">Display</div>
                <label className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover-elevate cursor-pointer" data-testid="option-hide-stats">
                  <div className="flex flex-col">
                    <span className="text-xs text-foreground">Hide summary cards</span>
                    <span className="text-[10px] text-muted-foreground">Hide the coloured stage strip</span>
                  </div>
                  <Switch checked={hideStats} onCheckedChange={setHideStats} data-testid="switch-hide-stats" />
                </label>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary strip */}
      {!hideStats && (
        <div className="flex items-center gap-3 px-6 py-2 border-b border-border flex-shrink-0 overflow-x-auto" data-testid="stats-strip">
          <StatCard label="Open" value={stats.open} variant="coral" testId="stat-open" onClick={() => setStageFilter("open")} />
          <StatCard label="With trade" value={stats.withTrade} variant="amber" testId="stat-with-trade" />
          <StatCard label="Rejected" value={stats.rejected} variant="coral" testId="stat-rejected" onClick={() => setStageFilter("rejected")} />
          <StatCard label="Fixed – to check" value={stats.fixed} variant="sage" testId="stat-fixed" onClick={() => setStageFilter("fixed")} />
          <StatCard label="Closed" value={stats.closed} variant="muted" testId="stat-closed" onClick={() => setStageFilter("closed")} />
          <StatCard label="Overdue" value={stats.overdue} variant="coral" testId="stat-overdue" onClick={() => setOverdueOnly(true)} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading defects...</p>
          </div>
        ) : filteredDefects.length === 0 ? (
          <EmptyState
            title={defects.length === 0 ? "No defects found" : "No matching defects"}
            action={
              defects.length === 0 && canAdd
                ? {
                    label: "Add first defect",
                    onClick: () => setIsCreateDialogOpen(true),
                    icon: Plus,
                    "data-testid": "button-add-first-defect",
                  }
                : undefined
            }
            variant="card"
          />
        ) : currentView === "list" ? (
          <DefectListTable
            defects={filteredDefects}
            priorityOptions={priorityOptions}
            showProject={!projectId}
            onOpen={setOpenDefect}
          />
        ) : (
          <div className="h-full pt-3">
            <DefectBoardView
              defects={filteredDefects}
              onOpen={setOpenDefect}
              onAddDefect={canAdd ? () => setIsCreateDialogOpen(true) : undefined}
            />
          </div>
        )}
        {projectId && projectQuery.hasNextPage && (
          <div className="flex justify-center py-3">
            <button
              className="h-7 px-3 text-xs border rounded-md hover-elevate"
              disabled={projectQuery.isFetchingNextPage}
              onClick={() => projectQuery.fetchNextPage()}
              data-testid="button-load-more"
            >
              {projectQuery.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="flex-none h-11 bg-muted/30 border-t border-border flex items-center justify-between px-6 text-[11px] text-muted-foreground">
        <div data-testid="footer-count">
          {filteredDefects.length} of {defects.length} defects shown
        </div>
        <div className="flex items-center gap-3">
          <span><span className="text-foreground font-semibold">{footerStats.live}</span> not closed</span>
          <span className="text-border">·</span>
          <span><span className="text-foreground font-semibold">{footerStats.toCheck}</span> to check</span>
          <span className="text-border">·</span>
          <span><span className="text-[hsl(var(--coral))] font-semibold">{footerStats.overdue}</span> overdue</span>
          <span className="text-border">·</span>
          <span>avg age <span className="text-foreground font-semibold">{footerStats.avgAge}d</span></span>
        </div>
      </div>

      <DefectDrawer
        defect={openDefect}
        open={!!openDefect}
        onOpenChange={(o) => !o && setOpenDefect(null)}
        onDelete={(d) => setDeletingDefect(d)}
      />

      <DefectFormDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />

      {projectId && (
        <>
          <DefectTradesSheet projectId={projectId} open={tradesOpen} onOpenChange={setTradesOpen} canEdit={perms.edit} />
          <DefectHandoverDialog projectId={projectId} open={handoverOpen} onOpenChange={setHandoverOpen} canEdit={perms.edit} />
        </>
      )}

      <AlertDialog open={!!deletingDefect} onOpenChange={(open) => !open && setDeletingDefect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Defect</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingDefect?.ref} "{deletingDefect?.title}"? Its history and
              comments go with it. This action cannot be undone.
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

function FilterGroup({ label, value, onChange, allLabel, options, testIdPrefix }: FilterGroupProps) {
  const items = [{ key: ALL, name: allLabel }, ...options];
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 px-1">{label}</div>
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ key: string; name: string }>;
  testId: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 px-1">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs" data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  variant: "coral" | "amber" | "sage" | "muted" | "default";
  testId: string;
  onClick?: () => void;
}

function StatCard({ label, value, variant, testId, onClick }: StatCardProps) {
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
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-lg border px-3 py-2 w-[130px] flex-shrink-0 flex flex-col text-left disabled:cursor-default ${cls}`}
      data-testid={testId}
    >
      <div className="text-[14px] font-bold leading-tight">{value}</div>
      <div className="text-[8px] font-semibold uppercase tracking-wide mt-1 opacity-80">{label}</div>
    </button>
  );
}

const GRID = "grid-cols-[64px_minmax(220px,2fr)_110px_80px_110px_120px_110px_130px_80px_50px_36px]";

function DefectListTable({
  defects,
  priorityOptions,
  showProject,
  onOpen,
}: {
  defects: DefectView[];
  priorityOptions: Array<{ key: string; name: string }>;
  showProject: boolean;
  onOpen: (defect: DefectView) => void;
}) {
  return (
    <div className="w-full">
      <div className={`h-[34px] bg-muted/30 grid ${GRID} items-center px-6 gap-3 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b border-border sticky top-0 z-10`}>
        <div>Ref</div>
        <div>Defect</div>
        <div>Stage</div>
        <div>Priority</div>
        <div>Job stage</div>
        <div>Owner</div>
        <div>Trade</div>
        <div>Location</div>
        <div>Due</div>
        <div>Age</div>
        <div />
      </div>

      {defects.map((defect, idx) => {
        const age = ageInDays(defect.dateIdentified);
        const done = defect.stage === "fixed" || defect.stage === "closed";
        return (
          <div
            key={defect.id}
            onClick={() => onOpen(defect)}
            className={`h-11 grid ${GRID} items-center px-6 gap-3 border-b border-border/40 cursor-pointer hover-elevate ${
              idx % 2 === 1 ? "bg-muted/10" : "bg-card"
            }`}
            data-testid={`defect-row-${defect.id}`}
          >
            <div className="text-[11px] font-semibold text-muted-foreground">{defect.ref}</div>

            <div className="min-w-0">
              <div className="text-[12px] font-medium text-foreground truncate">{defect.title}</div>
              {(showProject ? defect.projectName : defect.description) && (
                <div className="text-[10px] text-muted-foreground/70 truncate">
                  {showProject ? defect.projectName : defect.description}
                </div>
              )}
            </div>

            <div>
              <span className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${stageBadgeClass(defect.stage)}`}>
                {DEFECT_STAGE_LABELS[defect.stage] ?? defect.stage}
              </span>
            </div>

            <div>
              <span className={`inline-flex items-center rounded text-[10px] font-medium px-1.5 py-0.5 ${priorityBadgeClass(defect.priority)}`}>
                {priorityLabel(defect.priority, priorityOptions)}
              </span>
            </div>

            <div className="text-[11px] text-muted-foreground truncate">
              {DEFECT_JOB_STAGE_LABELS[defect.jobStage as keyof typeof DEFECT_JOB_STAGE_LABELS] ?? defect.jobStage}
            </div>

            <div className="text-[11px] text-muted-foreground truncate">{defect.ownerName || "—"}</div>

            <div className="text-[11px] text-muted-foreground truncate">{defect.trade || "—"}</div>

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

            <div className={`text-[11px] ${defect.overdue ? "text-[hsl(var(--coral))] font-semibold" : "text-muted-foreground"}`}>
              {defect.dueDate ? (
                <span className="inline-flex items-center gap-0.5">
                  {defect.overdue && <AlertTriangle className="w-3 h-3" />}
                  {format(new Date(defect.dueDate), "MMM d")}
                </span>
              ) : "—"}
            </div>

            <div className="text-[11px]">
              {done ? (
                <span className="text-[hsl(var(--sage))]">{defect.stage === "fixed" ? "Fixed" : "Closed"}</span>
              ) : (
                <span className={ageColorClass(age)}>{age}d</span>
              )}
            </div>

            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <PinRowButton projectId={defect.projectId} itemType="defect" itemId={defect.id} itemName={defect.title} />
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

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, ShieldCheck, Info, Pencil, Check, X, Columns3
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HbcfRow {
  id: string;
  companyId: string;
  projectId?: string | null;
  name: string;
  maxValue: string;
  statuses: Record<string, boolean>;
  color: string | null;
  sortOrder: number;
}

interface SystemProject {
  id: string;
  name: string;
  color?: string | null;
  contractCost?: number | null;
  constructionNumber?: string | null;
  jobNumber?: string | null;
  currentSystemPhase?: string | null;
}

interface CompanySettings {
  hwiExposureLimit?: string | null;
}

type TableRow = HbcfRow & { __isTotal?: boolean };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROW_COLORS = [
  "#A890D4", "#60a5fa", "#34d399", "#fbbf24", "#f87171",
  "#a78bfa", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
];

function fmt(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

function fmtFull(val: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(val);
}

function getWeeksForYear(year: number): Date[] {
  const dates: Date[] = [];
  const d = new Date(year, 0, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d.getFullYear() === year) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function currentMondayKey(): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// ─── Inline value editors ─────────────────────────────────────────────────────

function InlineName({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) return (
    <div className="flex items-center gap-1 w-full">
      <Input
        autoFocus value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="h-5 text-xs px-1 w-full"
      />
      <button onClick={() => { onSave(draft); setEditing(false); }}><Check className="w-3 h-3 text-green-500" /></button>
      <button onClick={() => { setDraft(value); setEditing(false); }}><X className="w-3 h-3 text-muted-foreground" /></button>
    </div>
  );

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="flex items-center gap-0.5 group/ne text-xs font-semibold text-left w-full min-w-0"
    >
      <span className="truncate">{value}</span>
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/ne:opacity-40 flex-shrink-0" />
    </button>
  );
}

function InlineAmount({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) return (
    <div className="flex items-center gap-0.5 w-full">
      <span className="text-data text-muted-foreground">$</span>
      <Input
        autoFocus type="number" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onSave(parseFloat(draft) || 0); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(parseFloat(draft) || 0); setEditing(false); }
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        className="h-5 text-data px-1 w-full"
      />
    </div>
  );

  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="flex items-center gap-0.5 group/ia text-data text-muted-foreground hover:text-foreground w-full"
    >
      <span className="tabular-nums">{value > 0 ? fmt(value) : "Set amount…"}</span>
      <Pencil className="w-2 h-2 opacity-0 group-hover/ia:opacity-40 flex-shrink-0" />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LEFT_COL_W = 176;
const CELL_W = 56;

export default function HBCFTracker() {
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedProjectId, setSelectedProjectId] = useState("__none__");
  const [newAmount, setNewAmount] = useState("");

  const { data: settings = {} as CompanySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const { data: rows = [], isLoading } = useQuery<HbcfRow[]>({
    queryKey: ["/api/hbcf-projects"],
    queryFn: () => fetch("/api/hbcf-projects", { credentials: "include" }).then(r => r.json()),
  });

  const { data: systemProjects = [] } = useQuery<SystemProject[]>({
    queryKey: ["/api/projects"],
  });

  const limit = settings.hwiExposureLimit ? parseFloat(settings.hwiExposureLimit) : null;
  const weeks = useMemo(() => getWeeksForYear(year), [year]);
  const nowKey = currentMondayKey();

  // Toggle a cell
  const toggleMutation = useMutation({
    mutationFn: ({ row, dateKey, active }: { row: HbcfRow; dateKey: string; active: boolean }) => {
      const ns = { ...row.statuses };
      if (active) ns[dateKey] = true; else delete ns[dateKey];
      return apiRequest(`/api/hbcf-projects/${row.id}`, "PATCH", { statuses: ns });
    },
    onMutate: async ({ row, dateKey, active }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/hbcf-projects"] });
      const prev = queryClient.getQueryData<HbcfRow[]>(["/api/hbcf-projects"]);
      queryClient.setQueryData<HbcfRow[]>(["/api/hbcf-projects"], old =>
        old?.map(r => {
          if (r.id !== row.id) return r;
          const ns = { ...r.statuses };
          if (active) ns[dateKey] = true; else delete ns[dateKey];
          return { ...r, statuses: ns };
        }) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/hbcf-projects"], ctx?.prev);
      toast({ title: "Toggle failed", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HbcfRow> }) =>
      apiRequest(`/api/hbcf-projects/${id}`, "PATCH", data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/hbcf-projects"] });
      const prev = queryClient.getQueryData<HbcfRow[]>(["/api/hbcf-projects"]);
      queryClient.setQueryData<HbcfRow[]>(["/api/hbcf-projects"], old =>
        old?.map(r => r.id === id ? { ...r, ...data } : r) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/hbcf-projects"], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<HbcfRow>) => apiRequest("/api/hbcf-projects", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] });
      setSelectedProjectId("__none__");
      setNewAmount("");
    },
    onError: () => toast({ title: "Failed to add project", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/hbcf-projects/${id}`, "DELETE"),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/hbcf-projects"] });
      const prev = queryClient.getQueryData<HbcfRow[]>(["/api/hbcf-projects"]);
      queryClient.setQueryData<HbcfRow[]>(["/api/hbcf-projects"], old => old?.filter(r => r.id !== id) ?? []);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/hbcf-projects"], ctx?.prev);
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] }),
  });

  // Projects in tracker (by their linked projectId)
  const trackedProjectIds = new Set(rows.map(r => r.projectId).filter(Boolean));

  // Available system projects to add
  const availableProjects = systemProjects.filter(
    p => !trackedProjectIds.has(p.id) &&
      (p.currentSystemPhase === "construction" || p.currentSystemPhase === "pre_construction" || p.currentSystemPhase === "post_construction" || !p.currentSystemPhase)
  );

  const selectedSysProject = selectedProjectId !== "__none__"
    ? systemProjects.find(p => p.id === selectedProjectId)
    : null;

  const handleAdd = () => {
    if (!selectedSysProject) return;
    const val = parseFloat(newAmount.replace(/[^0-9.]/g, ""));
    const maxValue = !isNaN(val) && val > 0
      ? val
      : selectedSysProject.contractCost
        ? selectedSysProject.contractCost / 100
        : 0;
    const color = selectedSysProject.color ?? ROW_COLORS[rows.length % ROW_COLORS.length];
    createMutation.mutate({
      projectId: selectedSysProject.id,
      name: selectedSysProject.name,
      maxValue: String(maxValue),
      color,
      sortOrder: rows.length,
    });
  };

  // Column totals
  const colTotal = (dateKey: string) =>
    rows.reduce((sum, r) => sum + (r.statuses[dateKey] ? parseFloat(r.maxValue) || 0 : 0), 0);

  function totalStyle(total: number): { bg: string; text: string } {
    if (total === 0) return { bg: "transparent", text: "var(--muted-foreground)" };
    if (!limit) return { bg: "transparent", text: "inherit" };
    const pct = total / limit;
    if (pct > 1) return { bg: "rgba(239,68,68,0.15)", text: "rgb(185,28,28)" };
    if (pct >= 0.8) return { bg: "rgba(249,115,22,0.12)", text: "rgb(154,52,18)" };
    return { bg: "rgba(34,197,94,0.08)", text: "rgb(21,128,45)" };
  }

  // Peak exposure
  const peakTotal = useMemo(() => {
    let peak = 0;
    weeks.forEach(w => { const t = colTotal(toKey(w)); if (t > peak) peak = t; });
    return peak;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, weeks]);

  // ── DataTable column defs ───────────────────────────────────────────────
  const tableColumns = useMemo<ColumnDef<TableRow, unknown>[]>(() => {
    const cols: (ColumnDef<TableRow, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "project",
        header: "Project / HBCF Amount",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.__isTotal) {
            return (
              <span className="text-data font-bold uppercase tracking-wide text-muted-foreground">
                HBCF Exposure
              </span>
            );
          }
          const maxVal = parseFloat(r.maxValue) || 0;
          return (
            <div className="flex items-start gap-1.5 min-w-0 group/row">
              <div
                className="w-2 h-full min-h-[28px] rounded-sm flex-shrink-0 mt-0.5"
                style={{ background: r.color ?? "#A890D4" }}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <InlineName
                  value={r.name}
                  onSave={v => updateMutation.mutate({ id: r.id, data: { name: v } })}
                />
                <InlineAmount
                  value={maxVal}
                  onSave={v => updateMutation.mutate({ id: r.id, data: { maxValue: String(v) } })}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Remove "${r.name}" from tracker?`)) deleteMutation.mutate(r.id);
                }}
                className="text-muted-foreground/20 hover:text-destructive transition-colors flex-shrink-0 opacity-0 group-hover/row:opacity-100 mt-0.5"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        },
        size: LEFT_COL_W,
        meta: { defaultWidth: LEFT_COL_W, headerLabel: "Project / HBCF Amount", pinned: true },
      },
    ];

    weeks.forEach((w) => {
      const key = toKey(w);
      const isNow = key === nowKey;
      const dayLabel = w.toLocaleDateString("en-AU", { day: "numeric" });
      const monthLabel = w.toLocaleDateString("en-AU", { month: "short" });
      cols.push({
        id: `w-${key}`,
        header: () => (
          <div className={cn("flex flex-col items-center leading-none gap-0.5", isNow && "text-[#7c5cbf]")}>
            <span className="text-label uppercase">{monthLabel}</span>
            <span className="text-label">{dayLabel}</span>
            {isNow && <span className="w-1 h-1 rounded-full bg-primary" />}
          </div>
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.__isTotal) {
            const total = colTotal(key);
            const { bg, text } = totalStyle(total);
            return (
              <div
                className={cn(
                  "w-full h-full flex items-center justify-center text-label font-bold tabular-nums",
                  isNow && "ring-1 ring-inset ring-primary/40",
                )}
                style={{ background: bg, color: text }}
              >
                {total > 0 ? fmt(total) : <span className="text-muted-foreground/20">—</span>}
              </div>
            );
          }
          const isActive = !!r.statuses[key];
          return (
            <div className={cn("w-full", isNow && "bg-primary/5")}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMutation.mutate({ row: r, dateKey: key, active: !isActive });
                }}
                title={isActive ? "Click to mark INACTIVE" : "Click to mark ACTIVE"}
                className={cn(
                  "w-full rounded-sm text-label font-bold py-0.5 leading-4 transition-all",
                  isActive
                    ? "text-white"
                    : "text-muted-foreground/25 hover:text-muted-foreground/60 hover:bg-muted/50",
                )}
                style={isActive ? { background: r.color ?? "#A890D4" } : undefined}
              >
                {isActive ? "ON" : "·"}
              </button>
            </div>
          );
        },
        size: CELL_W,
        meta: { defaultWidth: CELL_W, align: "center", headerLabel: `${monthLabel} ${dayLabel}` },
      });
    });

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, nowKey, rows, limit]);

  // Picker columns — week columns only (pinned project column excluded).
  const pickerColumns = useMemo(
    () =>
      weeks.map((w) => {
        const key = toKey(w);
        const dayLabel = w.toLocaleDateString("en-AU", { day: "numeric" });
        const monthLabel = w.toLocaleDateString("en-AU", { month: "short" });
        return { id: `w-${key}`, label: `${monthLabel} ${dayLabel}` };
      }),
    [weeks],
  );

  // Append synthetic totals row at the end.
  const tableData = useMemo<TableRow[]>(() => {
    const totalRow: TableRow = {
      id: "__total__",
      companyId: "",
      name: "HBCF Exposure",
      maxValue: "0",
      statuses: {},
      color: null,
      sortOrder: 9999,
      __isTotal: true,
    };
    return [...(rows as TableRow[]), totalRow];
  }, [rows]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading HBCF tracker…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Summary bar ── */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border/50 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">HBCF / DBI Limits Tracker</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {limit ? (
            <>
              <div className="text-xs flex items-center gap-1.5">
                <span className="text-muted-foreground">Limit:</span>
                <span className="font-semibold tabular-nums">{fmtFull(limit)}</span>
              </div>
              <div className="text-xs flex items-center gap-1.5">
                <span className="text-muted-foreground">Peak {year}:</span>
                <span className={`font-semibold tabular-nums ${
                  peakTotal > limit ? "text-status-danger" :
                  peakTotal / limit >= 0.8 ? "text-status-warning" :
                  peakTotal > 0 ? "text-status-success" : "text-muted-foreground"
                }`}>{fmtFull(peakTotal)}</span>
              </div>
              <div className="w-28 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${peakTotal > limit ? "bg-destructive" : peakTotal / limit >= 0.8 ? "bg-orange-500" : "bg-primary"}`}
                  style={{ width: `${Math.min((peakTotal / limit) * 100, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Set your HWI exposure limit in the Compliance tab to enable colour coding
            </div>
          )}
        </div>

        {/* Year nav */}
        <div className="flex items-center gap-1 ml-auto">
          <Button size="icon" variant="ghost" onClick={() => setYear(y => y - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold w-12 text-center tabular-nums">{year}</span>
          <Button size="icon" variant="ghost" onClick={() => setYear(y => y + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-column-picker">
                <Columns3 className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1 max-h-80 overflow-auto" align="end">
              <DataTableColumnPicker storageKey="hbcf-tracker" columns={pickerColumns} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* ── Spreadsheet grid ── */}
      <div className="flex-1 min-h-0">
        <DataTable
          key={year}
          data={tableData}
          columns={tableColumns}
          storageKey="hbcf-tracker"
          legacyConfigKey="hbcf-tracker-column-config-v1"
          rowKey={(r) => r.id}
          rowClassName={(r) => r.__isTotal ? "border-t border-border bg-muted/40 font-bold" : ""}
          emptyState="No projects yet — add one below"
          rowHeight={32}
        />
      </div>

      {/* ── Add project bar ── */}
      <div className="flex-shrink-0 border-t border-border/50 px-4 py-2 flex flex-wrap items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />

        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="h-7 text-xs w-56">
            <SelectValue placeholder="Select a project to add…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Select a project…</SelectItem>
            {availableProjects.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  {p.color && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  )}
                  <span>{p.constructionNumber ? `${p.constructionNumber} — ` : ""}{p.name}</span>
                </div>
              </SelectItem>
            ))}
            {availableProjects.length === 0 && (
              <SelectItem value="__empty__" disabled>No more projects to add</SelectItem>
            )}
          </SelectContent>
        </Select>

        {selectedSysProject && (
          <>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">HBCF amount $</span>
              <Input
                type="number"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                placeholder={
                  selectedSysProject.contractCost
                    ? `${Math.round(selectedSysProject.contractCost / 100).toLocaleString()} (contract)`
                    : "e.g. 480000"
                }
                className="h-7 text-xs w-44"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 flex-shrink-0"
              onClick={handleAdd}
              disabled={createMutation.isPending}
            >
              <Plus className="w-3 h-3" />
              Add to Tracker
            </Button>
          </>
        )}

        {rows.length === 0 && !selectedSysProject && (
          <span className="text-xs text-muted-foreground">
            Pick a project from the list to track its HBCF exposure
          </span>
        )}
      </div>
    </div>
  );
}

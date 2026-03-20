import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, ShieldCheck, Info, Pencil, Check, X
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HbcfProject {
  id: string;
  companyId: string;
  name: string;
  maxValue: string;
  statuses: Record<string, boolean>;
  color: string | null;
  sortOrder: number;
}

interface CompanySettings {
  hwiExposureLimit?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "#bba7db", "#60a5fa", "#34d399", "#fbbf24", "#f87171",
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

// Generate all Mondays for a given year
function getWeeksForYear(year: number): Date[] {
  const dates: Date[] = [];
  const d = new Date(year, 0, 1);
  // Advance to first Monday
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

function formatDateRow(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function isCurrentWeek(d: Date): boolean {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const dCopy = new Date(d);
  dCopy.setHours(0, 0, 0, 0);
  return dCopy.getTime() === monday.getTime();
}

// ─── Inline name editor ───────────────────────────────────────────────────────

function InlineNameEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(value); setEditing(false); }
          }}
          className="h-6 text-xs w-28 px-1"
        />
        <button onClick={() => { onSave(draft); setEditing(false); }}><Check className="w-3 h-3 text-green-500" /></button>
        <button onClick={() => { setDraft(value); setEditing(false); }}><X className="w-3 h-3 text-muted-foreground" /></button>
      </div>
    );
  }
  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className="flex items-center gap-1 group/ne text-xs font-medium text-left w-full"
    >
      <span className="truncate">{value}</span>
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/ne:opacity-50 flex-shrink-0" />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HBCFTracker() {
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectValue, setNewProjectValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current week on load
  const currentWeekRef = useRef<HTMLTableRowElement>(null);
  const didScroll = useRef(false);

  const scrollToNow = useCallback(() => {
    if (!didScroll.current && currentWeekRef.current) {
      currentWeekRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
      didScroll.current = true;
    }
  }, []);

  const { data: settings = {} as CompanySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const { data: projects = [], isLoading } = useQuery<HbcfProject[]>({
    queryKey: ["/api/hbcf-projects"],
    queryFn: () => fetch("/api/hbcf-projects", { credentials: "include" }).then(r => r.json()),
  });

  const limit = settings.hwiExposureLimit ? parseFloat(settings.hwiExposureLimit) : null;

  const weeks = useMemo(() => getWeeksForYear(year), [year]);

  // Toggle a cell (project × date)
  const toggleMutation = useMutation({
    mutationFn: ({ project, dateKey, active }: { project: HbcfProject; dateKey: string; active: boolean }) => {
      const newStatuses = { ...project.statuses, [dateKey]: active };
      // Clean up false values to keep the object lean
      if (!active) delete newStatuses[dateKey];
      return apiRequest(`/api/hbcf-projects/${project.id}`, "PATCH", { statuses: newStatuses });
    },
    onMutate: async ({ project, dateKey, active }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/hbcf-projects"] });
      const prev = queryClient.getQueryData<HbcfProject[]>(["/api/hbcf-projects"]);
      queryClient.setQueryData<HbcfProject[]>(["/api/hbcf-projects"], old =>
        old?.map(p => {
          if (p.id !== project.id) return p;
          const newStatuses = { ...p.statuses };
          if (active) newStatuses[dateKey] = true;
          else delete newStatuses[dateKey];
          return { ...p, statuses: newStatuses };
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

  // Update project field (name or maxValue)
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HbcfProject> }) =>
      apiRequest(`/api/hbcf-projects/${id}`, "PATCH", data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/hbcf-projects"] });
      const prev = queryClient.getQueryData<HbcfProject[]>(["/api/hbcf-projects"]);
      queryClient.setQueryData<HbcfProject[]>(["/api/hbcf-projects"], old =>
        old?.map(p => p.id === id ? { ...p, ...data } : p) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/hbcf-projects"], ctx?.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<HbcfProject>) => apiRequest("/api/hbcf-projects", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] });
      setNewProjectName("");
      setNewProjectValue("");
    },
    onError: () => toast({ title: "Failed to add project", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/hbcf-projects/${id}`, "DELETE"),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/hbcf-projects"] });
      const prev = queryClient.getQueryData<HbcfProject[]>(["/api/hbcf-projects"]);
      queryClient.setQueryData<HbcfProject[]>(["/api/hbcf-projects"], old =>
        old?.filter(p => p.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/hbcf-projects"], ctx?.prev);
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] }),
  });

  const handleAddProject = () => {
    const name = newProjectName.trim();
    const val = parseFloat(newProjectValue.replace(/[^0-9.]/g, ""));
    if (!name || isNaN(val)) return;
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    createMutation.mutate({ name, maxValue: String(val), color, sortOrder: projects.length });
  };

  const handleToggle = (project: HbcfProject, dateKey: string) => {
    const currentlyActive = !!project.statuses[dateKey];
    toggleMutation.mutate({ project, dateKey, active: !currentlyActive });
  };

  // Active count + total for a given week
  const weeklyTotal = (dateKey: string) =>
    projects.reduce((sum, p) => sum + (p.statuses[dateKey] ? parseFloat(p.maxValue) || 0 : 0), 0);

  // Colour coding for total cell
  function totalClass(total: number): string {
    if (!limit) return "text-foreground";
    const pct = total / limit;
    if (pct > 1) return "bg-red-500/20 text-red-700 dark:text-red-400 font-bold";
    if (pct >= 0.8) return "bg-orange-500/15 text-orange-700 dark:text-orange-400 font-semibold";
    if (total > 0) return "bg-green-500/10 text-green-700 dark:text-green-400";
    return "text-muted-foreground";
  }

  // Current peak HBCF value (max across all dates this year)
  const peakTotal = useMemo(() => {
    let peak = 0;
    weeks.forEach(w => {
      const t = weeklyTotal(toKey(w));
      if (t > peak) peak = t;
    });
    return peak;
  }, [projects, weeks]);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading HBCF tracker…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border/50 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">HBCF / DBI Limits Tracker</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {limit ? (
            <>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Limit:</span>
                <span className="font-semibold tabular-nums">{fmtFull(limit)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Peak this year:</span>
                <span className={`font-semibold tabular-nums ${limit && peakTotal > limit ? 'text-red-600 dark:text-red-400' : peakTotal / (limit || 1) >= 0.8 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                  {fmtFull(peakTotal)}
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="w-32 bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${peakTotal > limit ? 'bg-destructive' : peakTotal / limit >= 0.8 ? 'bg-orange-500' : 'bg-[#bba7db]'}`}
                  style={{ width: `${Math.min((peakTotal / limit) * 100, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5" />
              Set your HWI exposure limit in the Compliance tab to enable colour coding
            </div>
          )}
        </div>

        {/* Year nav */}
        <div className="flex items-center gap-1 ml-auto">
          <Button size="icon" variant="ghost" onClick={() => { setYear(y => y - 1); didScroll.current = false; }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold w-12 text-center tabular-nums">{year}</span>
          <Button size="icon" variant="ghost" onClick={() => { setYear(y => y + 1); didScroll.current = false; }}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto min-h-0" ref={scrollRef}>
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ShieldCheck className="w-12 h-12 text-muted-foreground/20" />
            <p className="text-sm">No projects yet — add your first project below</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs" style={{ tableLayout: "fixed" }}>
            <colgroup>
              {/* Date col */}
              <col style={{ width: "72px" }} />
              {/* HBCF Active col */}
              <col style={{ width: "96px" }} />
              {/* Project cols */}
              {projects.map(p => <col key={p.id} style={{ width: "92px" }} />)}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-background">
              {/* Project names header */}
              <tr className="border-b border-border">
                <th className="text-left px-2 py-1.5 text-muted-foreground font-medium text-[10px] uppercase tracking-wide bg-muted/30">Date</th>
                <th className="text-right px-2 py-1.5 text-muted-foreground font-medium text-[10px] uppercase tracking-wide bg-muted/30">HBCF Active</th>
                {projects.map(p => (
                  <th key={p.id} className="px-2 py-1.5 bg-muted/30">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color ?? "#bba7db" }} />
                          <InlineNameEdit
                            value={p.name}
                            onSave={v => updateMutation.mutate({ id: p.id, data: { name: v } })}
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${p.name}" from HBCF tracker?`)) deleteMutation.mutate(p.id);
                          }}
                          className="text-muted-foreground/30 hover:text-destructive transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      {/* Editable max value */}
                      <MaxValueEditor
                        value={parseFloat(p.maxValue) || 0}
                        onSave={v => updateMutation.mutate({ id: p.id, data: { maxValue: String(v) } })}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, idx) => {
                const key = toKey(week);
                const total = weeklyTotal(key);
                const isNow = isCurrentWeek(week);
                const isEven = idx % 2 === 0;
                const month = week.toLocaleDateString("en-AU", { month: "short" });
                const prevMonth = idx > 0 ? weeks[idx - 1].toLocaleDateString("en-AU", { month: "short" }) : null;
                const isNewMonth = month !== prevMonth;

                return (
                  <>
                    {isNewMonth && (
                      <tr key={`month-${key}`} className="bg-muted/40 border-t border-border/50">
                        <td colSpan={2 + projects.length} className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                          {week.toLocaleDateString("en-AU", { month: "long", year: "numeric" })}
                        </td>
                      </tr>
                    )}
                    <tr
                      key={key}
                      ref={isNow ? currentWeekRef : undefined}
                      className={`border-b border-border/10 ${isNow ? 'ring-1 ring-inset ring-[#bba7db]/50 bg-[#bba7db]/5' : isEven ? 'bg-background' : 'bg-muted/10'}`}
                    >
                      {/* Date */}
                      <td className={`px-2 py-1 font-medium ${isNow ? 'text-[#bba7db]' : 'text-muted-foreground'} whitespace-nowrap`}>
                        {isNow && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#bba7db] mr-1 mb-0.5" />}
                        {formatDateRow(week)}
                      </td>

                      {/* HBCF Active total */}
                      <td className={`px-2 py-1 text-right font-mono tabular-nums rounded-sm ${totalClass(total)}`}>
                        {total > 0 ? fmt(total) : <span className="text-muted-foreground/30">—</span>}
                      </td>

                      {/* Project cells */}
                      {projects.map(p => {
                        const isActive = !!p.statuses[key];
                        return (
                          <td key={p.id} className="px-1 py-0.5 text-center">
                            <button
                              onClick={() => handleToggle(p, key)}
                              className={`w-full rounded text-[10px] font-semibold py-0.5 transition-all ${
                                isActive
                                  ? 'text-white'
                                  : 'bg-transparent text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/50'
                              }`}
                              style={isActive ? { background: p.color ?? "#bba7db" } : undefined}
                              title={isActive ? "Click to mark INACTIVE" : "Click to mark ACTIVE"}
                            >
                              {isActive ? "ACTIVE" : "—"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add project row */}
      <div className="flex-shrink-0 border-t border-border/50 px-4 py-2 flex items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <Input
          value={newProjectName}
          onChange={e => setNewProjectName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newProjectValue) handleAddProject(); }}
          placeholder="Project name (e.g. 22 Boanyo)"
          className="h-7 text-xs flex-1"
        />
        <Input
          value={newProjectValue}
          onChange={e => setNewProjectValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newProjectName) handleAddProject(); }}
          placeholder="Max value (e.g. 480000)"
          className="h-7 text-xs w-36"
          type="number"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 flex-shrink-0"
          onClick={handleAddProject}
          disabled={!newProjectName.trim() || !newProjectValue || createMutation.isPending}
        >
          <Plus className="w-3 h-3" />
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Max Value Inline Editor ──────────────────────────────────────────────────

function MaxValueEditor({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <span className="text-muted-foreground text-[10px]">$</span>
        <Input
          autoFocus
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { onSave(parseFloat(draft) || 0); setEditing(false); }}
          onKeyDown={e => {
            if (e.key === "Enter") { onSave(parseFloat(draft) || 0); setEditing(false); }
            if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
          }}
          className="h-5 text-[10px] px-1 w-20"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 group/mv"
    >
      <span className="tabular-nums">{fmt(value)}</span>
      <Pencil className="w-2 h-2 opacity-0 group-hover/mv:opacity-50" />
    </button>
  );
}


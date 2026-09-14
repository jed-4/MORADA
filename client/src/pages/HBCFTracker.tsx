import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Pencil, ShieldCheck, Info, SlidersHorizontal, AlertTriangle, RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HbcfRow {
  id: string;
  companyId: string;
  projectId?: string | null;
  name: string;
  /** Dollars as a numeric string — this job's contribution to open-job exposure. */
  maxValue: string;
  jobType: string | null;
  startDate: string | null;
  endDate: string | null;
  basis: string; // "predicted" | "actual"
  color: string | null;
  sortOrder: number;
}

interface SystemProject {
  id: string;
  name: string;
  color?: string | null;
  constructionNumber?: string | null;
  currentSystemPhase?: string | null;
  contractCost?: number | null;
  contractPrice?: number | null;
  contractedTotalIncGstCents?: number | null;
  contractedAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  proposedStartDate?: string | null;
  proposedEndDate?: string | null;
  practicalCompletionDate?: string | null;
}

interface ConstructionLimit {
  code: string;
  label: string;
  limit: string;
}

interface CompanySettings {
  hwiExposureLimit?: string | null;
  hwiJobCountLimit?: number | null;
  hwiConstructionLimits?: ConstructionLimit[] | null;
}

type TableRow = HbcfRow & { __isTotal?: boolean };

// ─── Constants ───────────────────────────────────────────────────────────────

const ROW_COLORS = [
  "#A890D4", "#60a5fa", "#34d399", "#fbbf24", "#f87171",
  "#a78bfa", "#38bdf8", "#4ade80", "#fb923c", "#e879f9",
];

/**
 * icare's NSW job types, offered as the starting point when a company has not
 * entered its own. Stored per company, so a VIC or QLD builder can replace them
 * wholesale — nothing downstream assumes these codes exist.
 */
const DEFAULT_CONSTRUCTION_LIMITS: ConstructionLimit[] = [
  { code: "H01", label: "New Dwelling Construction", limit: "" },
  { code: "H02", label: "Building Work to an Existing Residential Apartment Building", limit: "" },
  { code: "H03", label: "New Residential Apartment Building Construction", limit: "" },
  { code: "H04", label: "Building Work to an Existing Dwelling", limit: "" },
  { code: "H05", label: "Swimming Pools", limit: "" },
];

/** Jed's thresholds: green below 90%, amber 90–99%, red at 100% and over. */
const AMBER_AT = 0.9;
const RED_AT = 1;

/** What a linked project now says, against what the row stored. */
interface Drift {
  amount?: { from: number; to: number };
  startDate?: { from: string; to: string };
  endDate?: { from: string; to: string };
}

const LEFT_COL_W = 244;
const CELL_W = 54;

// ─── Date helpers ────────────────────────────────────────────────────────────

/**
 * Local-date key, NOT `toISOString().slice(0,10)`. In any timezone east of UTC
 * a local midnight serialises as the previous day, which silently shifted every
 * week key in the old grid by one.
 */
function toKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseKey(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Whole days from `a` to `b`, inclusive of both ends. */
function daySpan(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000) + 1;
}

function shiftKey(iso: string, days: number): string {
  return toKey(addDays(parseKey(iso), days));
}

/**
 * Weeks a start/end pair spans, rounded. A range pulled from a project rarely
 * lands on a whole number of weeks, so this is for display and for resizing —
 * the dates stay the stored truth, and duration is never persisted.
 */
function weeksBetween(start: string, end: string): number {
  return Math.max(1, Math.round(daySpan(start, end) / 7));
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(v);

function fmtShort(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  return parseKey(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit" });
}

const num = (v: string | null | undefined) => (v ? parseFloat(v) || 0 : 0);

// ─── Week series ─────────────────────────────────────────────────────────────

interface Week { key: string; start: Date; end: Date }
interface Period { id: string; label: string; subLabel: string; weeks: Week[] }

/** Rolling window: `back` weeks before this Monday, then `months` forward. */
function buildWeeks(backWeeks: number, forwardMonths: number): Week[] {
  const first = addDays(mondayOf(new Date()), -7 * backWeeks);
  const last = new Date(first);
  last.setMonth(last.getMonth() + forwardMonths);
  const out: Week[] = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 7)) {
    out.push({ key: toKey(d), start: new Date(d), end: addDays(d, 6) });
  }
  return out;
}

function groupIntoPeriods(weeks: Week[], zoom: "week" | "month"): Period[] {
  if (zoom === "week") {
    return weeks.map((w) => ({
      id: `w-${w.key}`,
      label: w.start.toLocaleDateString("en-AU", { month: "short" }),
      subLabel: `${w.start.getDate()}`,
      weeks: [w],
    }));
  }
  const byMonth = new Map<string, Week[]>();
  for (const w of weeks) {
    // A week is filed under the month its Monday falls in, so no week is
    // double-counted across a month boundary.
    const id = `m-${w.start.getFullYear()}-${w.start.getMonth()}`;
    const list = byMonth.get(id);
    if (list) list.push(w); else byMonth.set(id, [w]);
  }
  return Array.from(byMonth.entries()).map(([id, ws]) => ({
    id,
    label: ws[0].start.toLocaleDateString("en-AU", { month: "short" }),
    subLabel: `${ws[0].start.getFullYear()}`.slice(2),
    weeks: ws,
  }));
}

/** A job occupies a week when its range touches that week at all. */
function rowCoversWeek(row: HbcfRow, w: Week): boolean {
  if (!row.startDate || !row.endDate) return false;
  return row.startDate <= toKey(w.end) && row.endDate >= toKey(w.start);
}

/**
 * Compare a row against its project, using prefillFromProject — the same
 * resolution the add/edit dialog fills from. Written this way on purpose: a
 * separate "what does the project say" implementation could disagree with the
 * dialog, and then the badge would point at a change that re-pulling does not
 * make.
 *
 * Amounts are compared in whole cents. maxValue is a numeric string and the
 * project figure arrives in cents, so a float equality test here would flag
 * rows that are identical.
 */
function driftOf(
  row: HbcfRow,
  project: SystemProject | undefined,
  metrics: ContractMetrics | undefined,
): Drift | null {
  if (!project) return null;
  const now = prefillFromProject(project, metrics);
  const out: Drift = {};

  // An empty figure on the project side is "not costed yet", not "worth zero" —
  // it must never propose wiping a number someone entered.
  if (now.maxValue) {
    const from = Math.round(num(row.maxValue) * 100);
    const to = Math.round(num(now.maxValue) * 100);
    if (from !== to) out.amount = { from: from / 100, to: to / 100 };
  }
  if (now.startDate && now.startDate !== (row.startDate ?? "")) {
    out.startDate = { from: row.startDate ?? "", to: now.startDate };
  }
  if (now.endDate && now.endDate !== (row.endDate ?? "")) {
    out.endDate = { from: row.endDate ?? "", to: now.endDate };
  }
  return out.amount || out.startDate || out.endDate ? out : null;
}

function toneFor(value: number, limit: number | null): "none" | "ok" | "warn" | "over" {
  if (value <= 0) return "none";
  if (!limit) return "none";
  const pct = value / limit;
  if (pct >= RED_AT) return "over";
  if (pct >= AMBER_AT) return "warn";
  return "ok";
}

const TONE_STYLE: Record<string, { bg: string; text: string }> = {
  none: { bg: "transparent", text: "var(--muted-foreground)" },
  ok: { bg: "rgba(34,197,94,0.10)", text: "rgb(21,128,45)" },
  warn: { bg: "rgba(249,115,22,0.16)", text: "rgb(154,52,18)" },
  over: { bg: "rgba(239,68,68,0.18)", text: "rgb(185,28,28)" },
};

// ─── Limits editor ───────────────────────────────────────────────────────────

function LimitsPopover({
  settings,
  onSave,
}: {
  settings: CompanySettings;
  onSave: (patch: Partial<CompanySettings>) => void;
}) {
  const [exposure, setExposure] = useState(settings.hwiExposureLimit ?? "");
  const [jobCount, setJobCount] = useState(
    settings.hwiJobCountLimit == null ? "" : String(settings.hwiJobCountLimit),
  );
  const [limits, setLimits] = useState<ConstructionLimit[]>(
    settings.hwiConstructionLimits?.length
      ? settings.hwiConstructionLimits
      : DEFAULT_CONSTRUCTION_LIMITS,
  );

  const setLimitAt = (i: number, v: string) =>
    setLimits((ls) => ls.map((l, idx) => (idx === i ? { ...l, limit: v } : l)));

  return (
    <PopoverContent className="w-[420px] p-3 max-h-[70vh] overflow-auto" align="end">
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Eligibility limits</h4>
          <p className="text-label text-muted-foreground mt-0.5">
            From your insurer's eligibility letter.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Open job limit ($)</Label>
            <Input
              type="number" className="h-8 text-xs"
              value={exposure} onChange={(e) => setExposure(e.target.value)}
              placeholder="2250000"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Open job limit (count)</Label>
            <Input
              type="number" className="h-8 text-xs"
              value={jobCount} onChange={(e) => setJobCount(e.target.value)}
              placeholder="112"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Construction limits — the most any one job may be</Label>
          {limits.map((l, i) => (
            <div key={l.code} className="flex items-center gap-2">
              <span className="text-data font-semibold w-9 flex-shrink-0">{l.code}</span>
              <span className="text-label text-muted-foreground flex-1 truncate" title={l.label}>
                {l.label}
              </span>
              <Input
                type="number" className="h-7 text-xs w-28 flex-shrink-0"
                value={l.limit} onChange={(e) => setLimitAt(i, e.target.value)}
                placeholder="—"
              />
            </div>
          ))}
          <p className="text-label text-muted-foreground">
            $0 is a real answer — it means no approval to build that category.
            Leave blank for one you do not hold a limit against.
          </p>
        </div>

        <Button
          size="sm" className="w-full h-7 text-xs"
          onClick={() =>
            onSave({
              hwiExposureLimit: exposure.trim() === "" ? null : exposure.trim(),
              hwiJobCountLimit: jobCount.trim() === "" ? null : parseInt(jobCount, 10),
              hwiConstructionLimits: limits,
            })
          }
        >
          Save limits
        </Button>
      </div>
    </PopoverContent>
  );
}

// ─── Add / edit row ──────────────────────────────────────────────────────────

const EMPTY = {
  projectId: "__none__",
  name: "",
  jobType: "__none__",
  maxValue: "",
  basis: "predicted",
  startDate: "",
  endDate: "",
};
type FormState = typeof EMPTY;

/** GET /api/projects/:id/contract-metrics */
interface ContractMetrics {
  originalContractPriceIncGstCents: number;
  approvedVariationsIncGstCents: number;
  revisedContractPriceIncGstCents: number;
}

/**
 * What the app already knows about a project, in HBCF terms. `contractedAt` is
 * the app's own "this is real now" predicate, so it decides the basis, and the
 * basis in turn decides which figures to read: the contract and real dates, or
 * the live estimate and proposed dates.
 *
 * The contracted amount is the REVISED contract price — the frozen sum plus
 * approved variations — not `contractedTotalIncGstCents`, which is the original
 * and never moves. Cover follows the contract, so a job varied up carries more
 * exposure, and taking the frozen figure would quietly understate it.
 */
function prefillFromProject(p: SystemProject, metrics?: ContractMetrics): Partial<FormState> {
  const contracted = !!p.contractedAt;
  const cents = contracted
    ? metrics?.revisedContractPriceIncGstCents
        ?? p.contractedTotalIncGstCents ?? p.contractCost ?? p.contractPrice
    : p.contractPrice ?? p.contractCost ?? p.contractedTotalIncGstCents;
  const start = contracted ? p.startDate ?? p.proposedStartDate : p.proposedStartDate ?? p.startDate;
  // Practical completion wins over every programmed end date, on either basis.
  // Exposure stops when the job is actually finished; endDate is what the
  // programme predicts, and it goes on predicting after the job is done.
  const end = p.practicalCompletionDate
    ?? (contracted ? p.endDate ?? p.proposedEndDate : p.proposedEndDate ?? p.endDate);
  return {
    name: p.name,
    basis: contracted ? "actual" : "predicted",
    maxValue: cents != null ? (cents / 100).toFixed(2) : "",
    startDate: start ?? "",
    endDate: end ?? "",
  };
}

function RowDialog({
  open, onOpenChange, initial, repullOnOpen, projects, limits, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: HbcfRow | null;
  /** Opened from a drift badge: seed from the PROJECT, not the stored row. */
  repullOnOpen?: boolean;
  projects: SystemProject[];
  limits: ConstructionLimit[];
  onSubmit: (payload: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // True while the amount is whatever we filled in, false once it is typed over.
  // The contracted figure needs a second fetch to be right, and this is what
  // decides whether that answer may replace what is on screen.
  const [autoAmount, setAutoAmount] = useState(false);

  // One fetch, only while a project is actually selected in an open dialog.
  const { data: metrics } = useQuery<ContractMetrics>({
    queryKey: [`/api/projects/${form.projectId}/contract-metrics`],
    enabled: open && form.projectId !== "__none__",
  });

  const selected = projects.find((x) => x.id === form.projectId);

  // The metrics arrive a beat after the project is picked, so the amount lands
  // on the frozen contract sum first and is corrected to the revised one here.
  // Only ever overwrites a figure we put there.
  useEffect(() => {
    if (!open || !autoAmount || !metrics || !selected?.contractedAt) return;
    const revised = (metrics.revisedContractPriceIncGstCents / 100).toFixed(2);
    setForm((f) => (f.maxValue === revised ? f : { ...f, maxValue: revised }));
  }, [open, autoAmount, metrics, selected?.contractedAt]);

  const seedKey = open ? initial?.id ?? "__new__" : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    // autoAmount true only for a drift re-pull, so the metrics correction below
    // is allowed to land on a figure that was just taken from the project.
    setAutoAmount(!!(initial && repullOnOpen));
    const seeded: FormState = initial
      ? {
          projectId: initial.projectId ?? "__none__",
          name: initial.name,
          jobType: initial.jobType ?? "__none__",
          maxValue: initial.maxValue ?? "",
          basis: initial.basis ?? "predicted",
          startDate: initial.startDate ?? "",
          endDate: initial.endDate ?? "",
        }
      : EMPTY;
    const project = initial?.projectId
      ? projects.find((x) => x.id === initial.projectId)
      : undefined;
    setForm(
      initial && repullOnOpen && project
        ? { ...seeded, ...prefillFromProject(project) }
        : seeded,
    );
  }

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Picking a project overwrites the figures on purpose — that is what the
  // picker is for — but only when the field is empty or this is a new row, so
  // re-opening an edited row and changing the link never silently discards a
  // number that was corrected by hand.
  const onPickProject = (id: string) => {
    if (id === "__none__") { setForm((f) => ({ ...f, projectId: id })); return; }
    const p = projects.find((x) => x.id === id);
    if (!p) { setForm((f) => ({ ...f, projectId: id })); return; }
    setAutoAmount((prev) => prev || form.maxValue.trim() === "");
    // metrics belong to the PREVIOUS selection at this point, so the first pick
    // uses the project's own fields and the figure firms up when they arrive.
    const pre = prefillFromProject(p);
    setForm((f) => ({
      ...f,
      projectId: id,
      name: f.name.trim() === "" ? pre.name ?? "" : f.name,
      basis: initial ? f.basis : pre.basis ?? f.basis,
      maxValue: f.maxValue.trim() === "" ? pre.maxValue ?? "" : f.maxValue,
      startDate: f.startDate === "" ? pre.startDate ?? "" : f.startDate,
      endDate: f.endDate === "" ? pre.endDate ?? "" : f.endDate,
    }));
  };

  const repull = () => {
    const p = selected;
    if (!p) return;
    setAutoAmount(true);
    setForm((f) => ({ ...f, ...prefillFromProject(p, metrics) }));
  };

  const durationWeeks =
    form.startDate && form.endDate && form.endDate >= form.startDate
      ? weeksBetween(form.startDate, form.endDate)
      : null;

  /**
   * Moving the start slides the whole job: the end shifts by the same number of
   * DAYS, so the exact span survives even when it is not a round number of
   * weeks — which is usually the case for a range pulled off a project.
   */
  const onStartChange = (v: string) => {
    setForm((f) => {
      if (!v) return { ...f, startDate: "" };
      if (!f.startDate || !f.endDate || f.endDate < f.startDate) {
        return { ...f, startDate: v };
      }
      const delta = Math.round(
        (parseKey(v).getTime() - parseKey(f.startDate).getTime()) / 86_400_000,
      );
      return { ...f, startDate: v, endDate: shiftKey(f.endDate, delta) };
    });
  };

  /** Resizing from the start, so the end moves and the start stays put. */
  const onDurationChange = (v: string) => {
    const weeks = parseInt(v, 10);
    setForm((f) => {
      if (!f.startDate || !Number.isFinite(weeks) || weeks < 1) return f;
      return { ...f, endDate: shiftKey(f.startDate, weeks * 7 - 1) };
    });
  };

  const amount = num(form.maxValue);
  const typeLimit = limits.find((l) => l.code === form.jobType);
  const typeLimitValue = typeLimit && typeLimit.limit !== "" ? num(typeLimit.limit) : null;
  const overType = typeLimitValue !== null && amount > typeLimitValue;
  const datesBackwards =
    form.startDate !== "" && form.endDate !== "" && form.endDate < form.startDate;

  const canSave = form.name.trim() !== "" && !datesBackwards;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit job" : "Add job to tracker"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Project</Label>
              {form.projectId !== "__none__" && (
                <button
                  onClick={repull}
                  className="text-label text-primary hover:underline"
                  title="Overwrite the fields below with the project's current figures"
                >
                  Re-pull from project
                </button>
              )}
            </div>
            <Select value={form.projectId} onValueChange={onPickProject}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Link a project (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No linked project — pipeline job</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.constructionNumber ? `${p.constructionNumber} — ` : ""}{p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Job name *</Label>
            <Input
              className="h-8 text-xs" value={form.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. 14 Rosedale Ave"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Job type</Label>
            <Select value={form.jobType} onValueChange={set("jobType")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not set</SelectItem>
                {limits.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.code} — {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Basis</Label>
            <Select value={form.basis} onValueChange={set("basis")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="predicted">Predicted</SelectItem>
                <SelectItem value="actual">Actual (contracted)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs">HBCF commitment ($)</Label>
            <Input
              type="number" className="h-8 text-xs" value={form.maxValue}
              onChange={(e) => { setAutoAmount(false); set("maxValue")(e.target.value); }}
            />
            {selected?.contractedAt && metrics && (
              <p className="text-label text-muted-foreground">
                Contract {fmtMoney(metrics.originalContractPriceIncGstCents / 100)}
                {metrics.approvedVariationsIncGstCents !== 0 && (
                  <> + approved variations {fmtMoney(metrics.approvedVariationsIncGstCents / 100)}</>
                )} inc GST
              </p>
            )}
            {overType && (
              <p className="text-label text-status-danger flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                Over the {form.jobType} construction limit of {fmtMoney(typeLimitValue!)}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Starts</Label>
            <Input
              type="date" className="h-8 text-xs" value={form.startDate}
              onChange={(e) => onStartChange(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ends</Label>
            <Input
              type="date" className="h-8 text-xs" value={form.endDate}
              onChange={(e) => set("endDate")(e.target.value)}
            />
            {datesBackwards && (
              <p className="text-label text-status-danger">Ends before it starts.</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Duration (weeks)</Label>
            <Input
              type="number" min={1} className="h-8 text-xs"
              value={durationWeeks === null ? "" : String(durationWeeks)}
              onChange={(e) => onDurationChange(e.target.value)}
              placeholder={form.startDate ? "e.g. 32" : "set a start date first"}
              disabled={!form.startDate}
            />
          </div>

          <p className="col-span-2 text-label text-muted-foreground">
            Duration is not stored — it is the span of the two dates. Set it once
            and the end follows, then move the start to try a job earlier or
            later and the whole job slides with it.
          </p>

          <p className="col-span-2 text-label text-muted-foreground">
            Without both dates the job holds a row but occupies no weeks, so it
            adds nothing to the exposure line.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm" disabled={!canSave || isPending}
            onClick={() =>
              onSubmit({
                projectId: form.projectId === "__none__" ? null : form.projectId,
                name: form.name.trim(),
                jobType: form.jobType === "__none__" ? null : form.jobType,
                maxValue: form.maxValue.trim() === "" ? "0" : form.maxValue.trim(),
                basis: form.basis,
                startDate: form.startDate === "" ? null : form.startDate,
                endDate: form.endDate === "" ? null : form.endDate,
              })
            }
          >
            {initial ? "Save" : "Add job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function HBCFTracker() {
  const { toast } = useToast();
  const [zoom, setZoom] = useState<"week" | "month">("week");
  const [horizon, setHorizon] = useState(18);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HbcfRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HbcfRow | null>(null);

  const { data: settings = {} as CompanySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const { data: rows = [], isLoading } = useQuery<HbcfRow[]>({
    queryKey: ["/api/hbcf-projects"],
  });

  const { data: systemProjects = [] } = useQuery<SystemProject[]>({
    queryKey: ["/api/projects"],
  });

  // Secondary and non-blocking: the grid renders on the rows alone, and drift
  // badges appear when this lands. One request for every linked job.
  const { data: contractValues = [] } = useQuery<ContractMetrics[] & { projectId: string }[]>({
    queryKey: ["/api/hbcf-projects/contract-values"],
  });

  const projectById = useMemo(
    () => new Map(systemProjects.map((p) => [p.id, p])),
    [systemProjects],
  );

  const driftByRow = useMemo(() => {
    const metricsById = new Map(
      (contractValues as (ContractMetrics & { projectId: string })[]).map((m) => [m.projectId, m]),
    );
    const out = new Map<string, Drift>();
    for (const r of rows) {
      if (!r.projectId) continue;
      const d = driftOf(r, projectById.get(r.projectId), metricsById.get(r.projectId));
      if (d) out.set(r.id, d);
    }
    return out;
  }, [rows, projectById, contractValues]);

  const limit = settings.hwiExposureLimit ? parseFloat(settings.hwiExposureLimit) : null;
  const countLimit = settings.hwiJobCountLimit ?? null;
  const constructionLimits = settings.hwiConstructionLimits?.length
    ? settings.hwiConstructionLimits
    : DEFAULT_CONSTRUCTION_LIMITS;

  const weeks = useMemo(() => buildWeeks(4, horizon), [horizon]);
  const periods = useMemo(() => groupIntoPeriods(weeks, zoom), [weeks, zoom]);
  const thisMonday = toKey(mondayOf(new Date()));

  const settingsMutation = useMutation({
    mutationFn: (patch: Partial<CompanySettings>) =>
      apiRequest("/api/company-settings", "PATCH", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "Limits saved" });
    },
    onError: () => toast({ title: "Could not save limits", variant: "destructive" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/hbcf-projects"] });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("/api/hbcf-projects", "POST", { ...payload, sortOrder: rows.length }),
    onSuccess: () => { invalidate(); setDialogOpen(false); },
    onError: () => toast({ title: "Could not add job", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiRequest(`/api/hbcf-projects/${id}`, "PATCH", payload),
    onSuccess: () => { invalidate(); setDialogOpen(false); },
    onError: () => toast({ title: "Could not save job", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/hbcf-projects/${id}`, "DELETE"),
    onSuccess: invalidate,
    onError: () => toast({ title: "Could not remove job", variant: "destructive" }),
  });

  // ── The weekly exposure series, computed once ────────────────────────────
  // Everything else — column colour, the peak, this week's usage, the tooltip —
  // reads off this, so a month column can never disagree with the weeks inside it.
  const weekly = useMemo(() => {
    const map = new Map<string, { total: number; jobs: HbcfRow[] }>();
    for (const w of weeks) {
      const jobs = rows.filter((r) => rowCoversWeek(r, w));
      map.set(w.key, { total: jobs.reduce((s, r) => s + num(r.maxValue), 0), jobs });
    }
    return map;
  }, [rows, weeks]);

  /** A period shows its WORST week: a month that breaches for one week breaches. */
  const periodPeak = useMemo(() => {
    const map = new Map<string, { total: number; week: Week; jobs: HbcfRow[] }>();
    for (const p of periods) {
      let best: { total: number; week: Week; jobs: HbcfRow[] } | null = null;
      for (const w of p.weeks) {
        const v = weekly.get(w.key);
        if (!v) continue;
        if (!best || v.total > best.total) best = { total: v.total, week: w, jobs: v.jobs };
      }
      if (best) map.set(p.id, best);
    }
    return map;
  }, [periods, weekly]);

  /** The worst week in view, and when it falls — the headline for planning. */
  const peak = useMemo(() => {
    let top = { total: 0, key: "" };
    weekly.forEach((v, key) => { if (v.total > top.total) top = { total: v.total, key }; });
    return top;
  }, [weekly]);

  const current = weekly.get(thisMonday) ?? { total: 0, jobs: [] as HbcfRow[] };

  /** Rows priced above the construction limit for their own job type. */
  const overTypeIds = useMemo(() => {
    const byCode = new Map(constructionLimits.map((l) => [l.code, l]));
    const out = new Set<string>();
    for (const r of rows) {
      if (!r.jobType) continue;
      const l = byCode.get(r.jobType);
      if (!l || l.limit === "") continue;
      if (num(r.maxValue) > num(l.limit)) out.add(r.id);
    }
    return out;
  }, [rows, constructionLimits]);

  const [repullOnOpen, setRepullOnOpen] = useState(false);
  const openAdd = () => { setEditing(null); setRepullOnOpen(false); setDialogOpen(true); };
  const openEdit = (r: HbcfRow) => { setEditing(r); setRepullOnOpen(false); setDialogOpen(true); };
  // The drift badge opens the editor already re-pulled, so the new figures are
  // seen and saved deliberately rather than written by clicking an icon.
  const openDrifted = (r: HbcfRow) => { setEditing(r); setRepullOnOpen(true); setDialogOpen(true); };

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<TableRow, unknown>[]>(() => {
    const cols: (ColumnDef<TableRow, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "job",
        header: "Job",
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.__isTotal) {
            return (
              <div className="flex flex-col gap-0.5">
                <span className="text-data font-bold uppercase tracking-wide">Open job exposure</span>
                <span className="text-label text-muted-foreground font-normal normal-case">
                  {limit ? `Limit ${fmtMoney(limit)}` : "No limit set"}
                </span>
              </div>
            );
          }
          const amount = num(r.maxValue);
          const predicted = r.basis !== "actual";
          const overType = overTypeIds.has(r.id);
          const drift = driftByRow.get(r.id);
          // A linked row wears its project's colour, so a job is the same
          // colour here as on the schedule and the project board. Resolved on
          // read rather than copied at link time: recolour a project and this
          // follows, and colour carries no compliance meaning worth freezing.
          // Unlinked pipeline rows keep the colour they were given.
          const colour = (r.projectId && projectById.get(r.projectId)?.color) || r.color || "#A890D4";
          return (
            <div className="flex items-start gap-1.5 min-w-0 group/row">
              <div
                className="w-2 self-stretch min-h-[30px] rounded-sm flex-shrink-0"
                style={{ background: colour, opacity: predicted ? 0.45 : 1 }}
              />
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs font-semibold truncate">{r.name}</span>
                  {r.jobType && (
                    <span className="text-label font-semibold text-muted-foreground flex-shrink-0">
                      {r.jobType}
                    </span>
                  )}
                  {predicted && (
                    <span className="text-label text-muted-foreground flex-shrink-0">· forecast</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-label">
                  <span className={cn("tabular-nums font-semibold", overType && "text-status-danger")}>
                    {fmtShort(amount)}
                  </span>
                  {overType && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangle className="w-3 h-3 text-status-danger flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Over the {r.jobType} construction limit for a single job
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <span className="text-muted-foreground truncate">
                    {r.startDate && r.endDate
                      ? `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`
                      : "no dates"}
                  </span>
                  {drift && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={(e) => { e.stopPropagation(); openDrifted(r); }}
                          className="flex items-center gap-0.5 text-status-warning flex-shrink-0 hover:underline"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span className="font-semibold">out of date</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-1">
                          <div className="font-semibold">The project has moved since this row was filled in</div>
                          {drift.amount && (
                            <div className="tabular-nums">
                              Amount {fmtMoney(drift.amount.from)} → {fmtMoney(drift.amount.to)}
                            </div>
                          )}
                          {drift.startDate && (
                            <div className="tabular-nums">
                              Starts {drift.startDate.from ? fmtDate(drift.startDate.from) : "—"} → {fmtDate(drift.startDate.to)}
                            </div>
                          )}
                          {drift.endDate && (
                            <div className="tabular-nums">
                              Ends {drift.endDate.from ? fmtDate(drift.endDate.from) : "—"} → {fmtDate(drift.endDate.to)}
                            </div>
                          )}
                          <div className="text-muted-foreground pt-0.5">Click to review and update</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/row:opacity-100">
                <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} title="Edit">
                  <Pencil className="w-3 h-3 text-muted-foreground/60 hover:text-foreground" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(r); }} title="Remove">
                  <Trash2 className="w-3 h-3 text-muted-foreground/30 hover:text-destructive" />
                </button>
              </div>
            </div>
          );
        },
        size: LEFT_COL_W,
        meta: { defaultWidth: LEFT_COL_W, headerLabel: "Job", pinned: true },
      },
    ];

    for (const p of periods) {
      const peakHere = periodPeak.get(p.id);
      const value = peakHere?.total ?? 0;
      const tone = toneFor(value, limit);
      const isNow = p.weeks.some((w) => w.key === thisMonday);
      // An inset shadow rather than a border: the columns have fixed widths, and
      // 2px of border would push every cell out of alignment with its header.
      // Written as an inline style, not a Tailwind arbitrary value — the
      // multi-value `shadow-[inset_...,inset_...]` form silently produced no
      // rule at all, so the band had a tint but no edges.
      const NOW_EDGES = "inset 2px 0 0 0 hsl(var(--primary)), inset -2px 0 0 0 hsl(var(--primary))";
      const nowCellStyle = isNow
        ? { background: "hsl(var(--primary) / 0.10)", boxShadow: NOW_EDGES }
        : undefined;

      cols.push({
        id: p.id,
        enableSorting: false,
        // Deliberately uncoloured. The exposure tone lives on the total row at
        // the bottom; painting it here too said the same thing twice and left
        // nowhere for the current week to stand out.
        header: () => (
          <div
            className={cn(
              "flex flex-col items-center leading-none gap-0.5 w-full py-1 -my-0.5",
              isNow ? "bg-primary text-primary-foreground font-bold rounded-t-sm" : "",
            )}
          >
            <span className="text-label uppercase">{p.label}</span>
            <span className="text-label font-semibold">{p.subLabel}</span>
          </div>
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (r.__isTotal) {
            return (
              <div
                className="w-full h-full flex items-center justify-center text-label font-bold tabular-nums"
                style={{
                  background: TONE_STYLE[tone].bg,
                  color: TONE_STYLE[tone].text,
                  // Closes the band at the bottom of the grid.
                  ...(isNow
                    ? { boxShadow: `${NOW_EDGES}, inset 0 -2px 0 0 hsl(var(--primary))` }
                    : {}),
                }}
              >
                {value > 0 ? fmtShort(value) : <span className="text-muted-foreground/20">—</span>}
              </div>
            );
          }
          const on = p.weeks.some((w) => rowCoversWeek(r, w));
          if (!on) return <div className="w-full h-full" style={nowCellStyle} />;
          const colour =
            (r.projectId && projectById.get(r.projectId)?.color) || r.color || "#A890D4";
          const predicted = r.basis !== "actual";
          return (
            <div className="w-full h-full flex items-center px-px" style={nowCellStyle}>
              <div
                className="w-full h-3.5 rounded-sm"
                style={
                  predicted
                    ? {
                        // Hatched, so a forecast never reads as committed work.
                        backgroundImage: `repeating-linear-gradient(45deg, ${colour} 0 3px, transparent 3px 6px)`,
                        opacity: 0.75,
                      }
                    : { background: colour }
                }
              />
            </div>
          );
        },
        size: CELL_W,
        meta: { defaultWidth: CELL_W, align: "center", headerLabel: `${p.label} ${p.subLabel}` },
      });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, periodPeak, limit, countLimit, thisMonday, zoom, overTypeIds, driftByRow, projectById]);

  // Chronological, because the grid is a timeline: reading top to bottom should
  // walk forward through the programme. Rows with no start sink to the bottom —
  // they occupy no weeks, so there is nowhere on the timeline to put them.
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (!a.startDate && !b.startDate) return a.name.localeCompare(b.name);
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [rows],
  );

  const tableData = useMemo<TableRow[]>(
    () => [
      ...(sortedRows as TableRow[]),
      {
        id: "__total__", companyId: "", name: "Open job exposure", maxValue: "0",
        jobType: null, startDate: null, endDate: null, basis: "actual",
        color: null, sortOrder: 9999, __isTotal: true,
      },
    ],
    [sortedRows],
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading HBCF tracker…
      </div>
    );
  }

  const peakTone = toneFor(peak.total, limit);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Summary ── */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border/50 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Open Job Limits</span>
        </div>

        {/*
          Two facts, because two are what the screen is for: where exposure is
          now, and the worst it gets in view. The limit itself is not repeated
          here — it is a setting, it sits on the total row, and every column is
          already coloured against it.
        */}
        {limit ? (
          <div className="flex items-center gap-5 flex-wrap text-xs">
            <span className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground">Now</span>
              <span className="font-semibold tabular-nums">{fmtMoney(current.total)}</span>
              <span className="text-muted-foreground">
                · {current.jobs.length}{countLimit ? ` of ${countLimit}` : ""} job
                {current.jobs.length === 1 && !countLimit ? "" : "s"}
              </span>
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground">Peak</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  peakTone === "over" && "text-status-danger",
                  peakTone === "warn" && "text-status-warning",
                  peakTone === "ok" && "text-status-success",
                )}
              >
                {fmtMoney(peak.total)}
              </span>
              <span className="tabular-nums text-muted-foreground">
                · {Math.round((peak.total / limit) * 100)}%
                {peak.key ? ` · wk ${fmtDate(peak.key)}` : ""}
              </span>
            </span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Set your open job limit to colour the timeline
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <Select value={zoom} onValueChange={(v) => setZoom(v as "week" | "month")}>
            <SelectTrigger className="h-7 text-xs w-[86px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(horizon)} onValueChange={(v) => setHorizon(parseInt(v, 10))}>
            <SelectTrigger className="h-7 text-xs w-[104px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 months</SelectItem>
              <SelectItem value="12">12 months</SelectItem>
              <SelectItem value="18">18 months</SelectItem>
              <SelectItem value="24">24 months</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Limits">
                <SlidersHorizontal className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <LimitsPopover settings={settings} onSave={(p) => settingsMutation.mutate(p)} />
          </Popover>

          <Button size="sm" className="h-7 text-xs gap-1" onClick={openAdd}>
            <Plus className="w-3 h-3" />
            Add job
          </Button>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="flex-1 min-h-0">
        <DataTable
          data={tableData}
          columns={columns}
          storageKey="hbcf-timeline"
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.__isTotal ? "border-t border-border bg-muted/40 font-bold" : "")}
          emptyState="No jobs yet — add one to start planning"
          rowHeight={34}
        />
      </div>

      <RowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        repullOnOpen={repullOnOpen}
        projects={systemProjects}
        limits={constructionLimits}
        isPending={createMutation.isPending || updateMutation.isPending}
        onSubmit={(payload) => {
          if (editing) updateMutation.mutate({ id: editing.id, payload });
          else createMutation.mutate({
            ...payload,
            color: ROW_COLORS[rows.length % ROW_COLORS.length],
          });
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Remove "${confirmDelete?.name ?? ""}" from the tracker?`}
        description="This only removes it from the HBCF plan. The project itself is untouched."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

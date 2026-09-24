import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Pencil, FileText, Columns3, ExternalLink, ShieldCheck,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HbcfCertificate {
  id: string;
  companyId: string;
  projectId: string | null;
  jobName: string;
  siteAddress: string | null;
  insurer: string | null;
  policyNumber: string | null;
  certificateNumber: string | null;
  status: string;
  /** numeric(15,2) — Drizzle hands these back as STRINGS, not numbers. */
  contractValue: string | null;
  premium: string | null;
  dateApplied: string | null;
  dateIssued: string | null;
  coverStart: string | null;
  structuralExpiry: string | null;
  nonStructuralExpiry: string | null;
  certificateUrl: string | null;
  notes: string | null;
  sortOrder: number;
}

interface SystemProject {
  id: string;
  name: string;
  constructionNumber?: string | null;
  contractCost?: number | null;
}

// ─── Status vocabulary ───────────────────────────────────────────────────────
// Deliberately about the certificate's life, not about any one insurer's
// workflow: every scheme has "haven't applied / applied / got it", and the two
// edge cases are jobs under the threshold and cover that was later pulled.

const STATUSES: { value: string; label: string; tone: StatusTone }[] = [
  { value: "not_required", label: "Not required", tone: "neutral" },
  { value: "not_applied", label: "Not applied", tone: "action" },
  // "applied" reads as neutral to getStatusTone, but waiting on the insurer is
  // exactly the warning case, so the tone is forced.
  { value: "applied", label: "Applied", tone: "warning" },
  { value: "issued", label: "Issued", tone: "success" },
  { value: "cancelled", label: "Cancelled", tone: "danger" },
];

const STATUS_META = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

/** Certificates that ought to exist but do not yet. */
const OUTSTANDING = new Set(["not_applied", "applied"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtMoney = (val: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(val);

const num = (v: string | null | undefined) => (v ? parseFloat(v) || 0 : 0);

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Whole days from today to `iso`. Negative once it is in the past. */
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

const EXPIRING_SOON_DAYS = 90;

function expiryClass(iso: string | null | undefined): string {
  const days = daysUntil(iso);
  if (days === null) return "text-muted-foreground/40";
  if (days < 0) return "text-status-danger font-semibold";
  if (days <= EXPIRING_SOON_DAYS) return "text-status-warning font-semibold";
  return "";
}

const EMPTY_FORM = {
  projectId: "__none__",
  jobName: "",
  siteAddress: "",
  insurer: "",
  policyNumber: "",
  certificateNumber: "",
  status: "not_applied",
  contractValue: "",
  premium: "",
  dateApplied: "",
  dateIssued: "",
  coverStart: "",
  structuralExpiry: "",
  nonStructuralExpiry: "",
  certificateUrl: "",
  notes: "",
};

type FormState = typeof EMPTY_FORM;

function toForm(row: HbcfCertificate): FormState {
  return {
    projectId: row.projectId ?? "__none__",
    jobName: row.jobName ?? "",
    siteAddress: row.siteAddress ?? "",
    insurer: row.insurer ?? "",
    policyNumber: row.policyNumber ?? "",
    certificateNumber: row.certificateNumber ?? "",
    status: row.status ?? "not_applied",
    contractValue: row.contractValue ?? "",
    premium: row.premium ?? "",
    dateApplied: row.dateApplied ?? "",
    dateIssued: row.dateIssued ?? "",
    coverStart: row.coverStart ?? "",
    structuralExpiry: row.structuralExpiry ?? "",
    nonStructuralExpiry: row.nonStructuralExpiry ?? "",
    certificateUrl: row.certificateUrl ?? "",
    notes: row.notes ?? "",
  };
}

/** Blanks become null so an emptied field clears rather than storing "". */
function toPayload(f: FormState) {
  const s = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    projectId: f.projectId === "__none__" ? null : f.projectId,
    jobName: f.jobName.trim(),
    siteAddress: s(f.siteAddress),
    insurer: s(f.insurer),
    policyNumber: s(f.policyNumber),
    certificateNumber: s(f.certificateNumber),
    status: f.status,
    contractValue: s(f.contractValue),
    premium: s(f.premium),
    dateApplied: s(f.dateApplied),
    dateIssued: s(f.dateIssued),
    coverStart: s(f.coverStart),
    structuralExpiry: s(f.structuralExpiry),
    nonStructuralExpiry: s(f.nonStructuralExpiry),
    certificateUrl: s(f.certificateUrl),
    notes: s(f.notes),
  };
}

// ─── Add / edit dialog ───────────────────────────────────────────────────────

function CertificateDialog({
  open,
  onOpenChange,
  initial,
  projects,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: HbcfCertificate | null;
  projects: SystemProject[];
  onSubmit: (payload: ReturnType<typeof toPayload>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Re-seed whenever the dialog opens, so editing one row then another does
  // not leave the first row's values behind.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = open ? (initial?.id ?? "__new__") : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setForm(initial ? toForm(initial) : EMPTY_FORM);
  }

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Picking a project fills the blanks it can, and only the blanks — typing a
  // job name and then linking a project must not wipe what was typed.
  const onPickProject = (id: string) => {
    setForm((f) => {
      if (id === "__none__") return { ...f, projectId: id };
      const p = projects.find((x) => x.id === id);
      if (!p) return { ...f, projectId: id };
      return {
        ...f,
        projectId: id,
        jobName: f.jobName.trim() === "" ? p.name : f.jobName,
        contractValue:
          f.contractValue.trim() === "" && p.contractCost
            ? (p.contractCost / 100).toFixed(2)
            : f.contractValue,
      };
    });
  };

  const canSave = form.jobName.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit certificate" : "Add certificate"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Project</Label>
            <Select value={form.projectId} onValueChange={onPickProject}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Link a project (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No linked project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.constructionNumber ? `${p.constructionNumber} — ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Job name *</Label>
            <Input
              className="h-8 text-xs"
              value={form.jobName}
              onChange={(e) => set("jobName")(e.target.value)}
              placeholder="e.g. 14 Rosedale Ave"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Site address</Label>
            <Input
              className="h-8 text-xs"
              value={form.siteAddress}
              onChange={(e) => set("siteAddress")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Insurer</Label>
            <Input
              className="h-8 text-xs"
              value={form.insurer}
              onChange={(e) => set("insurer")(e.target.value)}
              placeholder="e.g. icare HBCF, VMIA, QBCC"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Policy number</Label>
            <Input
              className="h-8 text-xs"
              value={form.policyNumber}
              onChange={(e) => set("policyNumber")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Certificate number</Label>
            <Input
              className="h-8 text-xs"
              value={form.certificateNumber}
              onChange={(e) => set("certificateNumber")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Contract value insured ($)</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={form.contractValue}
              onChange={(e) => set("contractValue")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Premium ($)</Label>
            <Input
              type="number"
              className="h-8 text-xs"
              value={form.premium}
              onChange={(e) => set("premium")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Date applied</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.dateApplied}
              onChange={(e) => set("dateApplied")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Date issued</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.dateIssued}
              onChange={(e) => set("dateIssued")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Cover start</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.coverStart}
              onChange={(e) => set("coverStart")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Certificate link</Label>
            <Input
              className="h-8 text-xs"
              value={form.certificateUrl}
              onChange={(e) => set("certificateUrl")(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Structural cover expires</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.structuralExpiry}
              onChange={(e) => set("structuralExpiry")(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Non-structural cover expires</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.nonStructuralExpiry}
              onChange={(e) => set("nonStructuralExpiry")(e.target.value)}
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSave || isPending}
            onClick={() => onSubmit(toPayload(form))}
          >
            {initial ? "Save" : "Add certificate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function HBCFCertificates() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HbcfCertificate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HbcfCertificate | null>(null);

  const { data: rows = [], isLoading } = useQuery<HbcfCertificate[]>({
    queryKey: ["/api/hbcf-certificates"],
  });

  const { data: projects = [] } = useQuery<SystemProject[]>({
    queryKey: ["/api/projects"],
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/hbcf-certificates"] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiRequest("/api/hbcf-certificates", "POST", payload),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Certificate added" });
    },
    onError: () => toast({ title: "Could not add certificate", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      apiRequest(`/api/hbcf-certificates/${id}`, "PATCH", payload),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({ title: "Certificate saved" });
    },
    onError: () => toast({ title: "Could not save certificate", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/hbcf-certificates/${id}`, "DELETE"),
    onSuccess: () => {
      invalidate();
      toast({ title: "Certificate removed" });
    },
    onError: () => toast({ title: "Could not remove certificate", variant: "destructive" }),
  });

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row: HbcfCertificate) => {
    setEditing(row);
    setDialogOpen(true);
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let issued = 0;
    let outstanding = 0;
    let insured = 0;
    let expiringSoon = 0;
    let expired = 0;

    for (const r of rows) {
      if (r.status === "issued") {
        issued += 1;
        insured += num(r.contractValue);
      }
      if (OUTSTANDING.has(r.status)) outstanding += 1;

      // The two periods cover different things, so EITHER one running out is
      // worth flagging — counting only the later date would stay silent while
      // non-structural cover lapsed, even as its own cell went amber. A job
      // counts as expired only once every date it has is in the past.
      const days = [r.structuralExpiry, r.nonStructuralExpiry]
        .map(daysUntil)
        .filter((d): d is number => d !== null);
      if (days.length) {
        if (Math.max(...days) < 0) expired += 1;
        else if (Math.min(...days) <= EXPIRING_SOON_DAYS) expiringSoon += 1;
      }
    }
    return { issued, outstanding, insured, expiringSoon, expired };
  }, [rows]);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<HbcfCertificate, unknown>[]>(() => {
    const cols: (ColumnDef<HbcfCertificate, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "job",
        header: "Job",
        accessorFn: (r) => r.jobName,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{r.jobName || "Untitled"}</div>
              {r.siteAddress && (
                <div className="text-label text-muted-foreground truncate">{r.siteAddress}</div>
              )}
            </div>
          );
        },
        size: 220,
        // Absorbs leftover width so the columns reach the right edge and the
        // pinned actions column sits flush, instead of a blank filler column.
        meta: { defaultWidth: 220, flex: true, headerLabel: "Job" },
      },
      {
        id: "insurer",
        header: "Insurer",
        accessorFn: (r) => r.insurer ?? "",
        cell: ({ row }) => (
          <span className="text-xs">{row.original.insurer ?? "—"}</span>
        ),
        size: 130,
        meta: { defaultWidth: 130, headerLabel: "Insurer" },
      },
      {
        id: "certificateNumber",
        header: "Certificate #",
        accessorFn: (r) => r.certificateNumber ?? "",
        cell: ({ row }) => {
          const r = row.original;
          if (!r.certificateNumber) return <span className="text-muted-foreground/40">—</span>;
          return (
            <span className="text-data tabular-nums flex items-center gap-1">
              {r.certificateNumber}
              {r.certificateUrl && (
                <a
                  href={r.certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-primary"
                  title="Open certificate"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          );
        },
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Certificate #" },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status];
          return (
            <StatusBadge
              status={row.original.status}
              tone={meta?.tone}
              label={meta?.label}
            />
          );
        },
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Status" },
      },
      {
        id: "contractValue",
        header: "Value insured",
        accessorFn: (r) => num(r.contractValue),
        cell: ({ row }) => {
          const v = num(row.original.contractValue);
          return (
            <span className="text-data tabular-nums">
              {v > 0 ? fmtMoney(v) : <span className="text-muted-foreground/40">—</span>}
            </span>
          );
        },
        size: 120,
        meta: { defaultWidth: 120, align: "right", headerLabel: "Value insured" },
      },
      {
        id: "premium",
        header: "Premium",
        accessorFn: (r) => num(r.premium),
        cell: ({ row }) => {
          const v = num(row.original.premium);
          return (
            <span className="text-data tabular-nums">
              {v > 0 ? fmtMoney(v) : <span className="text-muted-foreground/40">—</span>}
            </span>
          );
        },
        size: 100,
        meta: { defaultWidth: 100, align: "right", headerLabel: "Premium" },
      },
      {
        id: "dateIssued",
        header: "Issued",
        accessorFn: (r) => r.dateIssued ?? "",
        cell: ({ row }) => (
          <span className="text-data tabular-nums">
            {row.original.dateIssued
              ? fmtDate(row.original.dateIssued)
              : <span className="text-muted-foreground/40">—</span>}
          </span>
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Issued" },
      },
      {
        id: "structuralExpiry",
        header: "Structural to",
        accessorFn: (r) => r.structuralExpiry ?? "",
        cell: ({ row }) => (
          <span className={cn("text-data tabular-nums", expiryClass(row.original.structuralExpiry))}>
            {row.original.structuralExpiry ? fmtDate(row.original.structuralExpiry) : "—"}
          </span>
        ),
        size: 115,
        meta: { defaultWidth: 115, headerLabel: "Structural to" },
      },
      {
        id: "nonStructuralExpiry",
        header: "Non-struct. to",
        accessorFn: (r) => r.nonStructuralExpiry ?? "",
        cell: ({ row }) => (
          <span className={cn("text-data tabular-nums", expiryClass(row.original.nonStructuralExpiry))}>
            {row.original.nonStructuralExpiry ? fmtDate(row.original.nonStructuralExpiry) : "—"}
          </span>
        ),
        size: 115,
        meta: { defaultWidth: 115, headerLabel: "Non-struct. to" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openEdit(row.original);
              }}
              className="text-muted-foreground/50 hover:text-foreground"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(row.original);
              }}
              className="text-muted-foreground/30 hover:text-destructive"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
        size: 70,
        meta: { defaultWidth: 70, align: "right", headerLabel: "Actions", pinnedRight: true },
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickerColumns = useMemo(
    () =>
      (columns as (ColumnDef<HbcfCertificate, unknown> & { meta?: DataTableColumnMeta })[])
        .filter((c) => c.id !== "job" && c.id !== "actions")
        .map((c) => ({ id: c.id as string, label: c.meta?.headerLabel ?? (c.id as string) })),
    [columns],
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading certificates…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Summary bar ── */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border/50 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Home Warranty Insurance</span>
        </div>

        <div className="flex items-center gap-4 flex-wrap text-xs">
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Issued:</span>
            <span className="font-semibold tabular-nums">{summary.issued}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Outstanding:</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                summary.outstanding > 0 && "text-status-warning",
              )}
            >
              {summary.outstanding}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Value insured:</span>
            <span className="font-semibold tabular-nums">{fmtMoney(summary.insured)}</span>
          </span>
          {summary.expiringSoon > 0 && (
            <span className="text-status-warning font-semibold">
              {summary.expiringSoon} expiring within {EXPIRING_SOON_DAYS} days
            </span>
          )}
          {summary.expired > 0 && (
            <span className="text-status-danger font-semibold">
              {summary.expired} expired
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-column-picker">
                <Columns3 className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1 max-h-80 overflow-auto" align="end">
              <DataTableColumnPicker storageKey="hbcf-certificates" columns={pickerColumns} />
            </PopoverContent>
          </Popover>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={openAdd}>
            <Plus className="w-3 h-3" />
            Add certificate
          </Button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 min-h-0">
        <DataTable
          data={rows}
          columns={columns}
          storageKey="hbcf-certificates"
          rowKey={(r) => r.id}
          onRowClick={openEdit}
          emptyState={
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <FileText className="w-5 h-5" />
              <span className="text-sm">No certificates yet</span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAdd}>
                <Plus className="w-3 h-3" />
                Add the first one
              </Button>
            </div>
          }
        />
      </div>

      <CertificateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        projects={projects}
        isPending={createMutation.isPending || updateMutation.isPending}
        onSubmit={(payload) => {
          if (editing) updateMutation.mutate({ id: editing.id, payload });
          else createMutation.mutate(payload);
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Remove the certificate for "${confirmDelete?.jobName ?? ""}"?`}
        description="This deletes the record from Morada. It has no effect on the policy itself."
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

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { addMonths, monthLabel, monthStart, toDateKey, type CashflowJobRow, type JobMode } from "@shared/cashflow";
import { invalidateCashflow, money, PHASE_CLASSES, PHASE_LABELS, PROJECTS_KEY, shortDate } from "./cashflowShared";

type Filter = "all" | "included" | "leads";

const MODE_LABELS: Record<JobMode, string> = {
  even: "Even spread",
  manual: "By month",
};

/** A number field that saves when you leave it, not on every keystroke. */
function SaveOnBlurNumber({
  value,
  placeholder,
  min,
  max,
  disabled,
  onSave,
  testId,
  suffix,
}: {
  value: number | null;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  onSave: (v: number | null) => void;
  testId: string;
  suffix?: string;
}) {
  const [local, setLocal] = useState<number | null>(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div className="flex items-center gap-1">
      <NumericInput
        integer
        value={local}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        onCommit={setLocal}
        onBlur={() => {
          if (local !== value) onSave(local);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-7 w-11 rounded-md border border-border bg-transparent px-2 text-xs text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-50"
        data-testid={testId}
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function ManualAmountsDialog({ job, onClose }: { job: CashflowJobRow | null; onClose: () => void }) {
  const { toast } = useToast();
  const months = useMemo(() => {
    const first = monthStart(toDateKey(new Date())!);
    return Array.from({ length: 18 }, (_, i) => addMonths(first, i, 1));
  }, []);
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (!job) return;
    const next: Record<string, number | null> = {};
    for (const m of job.manualAmounts) next[m.month] = m.amountCents / 100;
    setAmounts(next);
  }, [job]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/cashflow/projects/${job!.projectId}/manual`, "PUT", {
        amounts: Object.entries(amounts)
          .filter(([, v]) => v != null && v !== 0)
          .map(([month, v]) => ({ month, amountCents: Math.round((v as number) * 100) })),
      }),
    onSuccess: () => {
      invalidateCashflow();
      onClose();
    },
    onError: () => toast({ title: "Couldn't save the amounts", variant: "destructive" }),
  });

  const totalCents = Object.values(amounts).reduce<number>((s, v) => s + Math.round((v ?? 0) * 100), 0);

  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{job?.name} — expected claims</DialogTitle>
          <DialogDescription>
            What you expect to claim each month, inc GST. It's paid {job?.clientPayDays} days after the month ends.
            Left to claim: {money(job?.remainingToClaimCents ?? 0)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 max-h-[50vh] overflow-auto py-1">
          {months.map((m) => (
            <label key={m} className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{monthLabel(m)}</span>
              <NumericInput
                value={amounts[m] ?? null}
                min={0}
                onCommit={(v) => setAmounts((a) => ({ ...a, [m]: v }))}
                placeholder="$0"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                data-testid={`input-manual-${m}`}
              />
            </label>
          ))}
        </div>
        <p className={cn("text-xs", totalCents > (job?.remainingToClaimCents ?? 0) ? "text-status-warning" : "text-muted-foreground")}>
          Total {money(totalCents)}
          {totalCents > (job?.remainingToClaimCents ?? 0) && " — more than is left to claim"}
        </p>
        <DialogFooter className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-manual">
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsTab() {
  const { toast } = useToast();
  const canEdit = usePermission("business.cashflow", "edit");
  const [filter, setFilter] = useState<Filter>("all");
  const [manualJob, setManualJob] = useState<CashflowJobRow | null>(null);
  const { data: jobs = [], isLoading, error } = useQuery<CashflowJobRow[]>({ queryKey: PROJECTS_KEY });

  const update = useMutation({
    mutationFn: ({ projectId, patch }: { projectId: string; patch: Record<string, unknown> }) =>
      apiRequest(`/api/cashflow/projects/${projectId}`, "PATCH", patch),
    onSuccess: () => invalidateCashflow(),
    onError: () => toast({ title: "Couldn't save that change", variant: "destructive" }),
  });
  const patch = (projectId: string, p: Record<string, unknown>) => update.mutate({ projectId, patch: p });

  const rows = useMemo(
    () =>
      jobs
        .filter((j) => (filter === "included" ? j.included : filter === "leads" ? j.phase === "lead" : true))
        .sort((a, b) => Number(b.included) - Number(a.included) || a.name.localeCompare(b.name)),
    [jobs, filter],
  );
  const included = jobs.filter((j) => j.included);
  const weightedLeft = included.reduce((s, j) => s + Math.round((j.remainingToClaimCents * j.winPercent) / 100), 0);

  const columns = useMemo<ColumnDef<CashflowJobRow, unknown>[]>(
    () => [
      {
        id: "include",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex h-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={row.original.included}
              disabled={!canEdit}
              onCheckedChange={(v) => patch(row.original.projectId, { included: v === true })}
              aria-label={`Include ${row.original.name}`}
              data-testid={`checkbox-include-${row.original.projectId}`}
            />
          </div>
        ),
        size: 40,
        meta: { defaultWidth: 40, pinned: true } satisfies DataTableColumnMeta,
      },
      {
        id: "name",
        header: "Job",
        accessorFn: (r) => r.name,
        cell: ({ row }) => (
          <div className="flex flex-col justify-center h-full min-w-0 py-1">
            <span className="text-xs font-medium truncate">{row.original.name}</span>
            {row.original.jobNumber && <span className="text-data text-muted-foreground">{row.original.jobNumber}</span>}
          </div>
        ),
        size: 170,
        meta: { defaultWidth: 170, headerLabel: "Job", flex: true } satisfies DataTableColumnMeta,
      },
      {
        id: "phase",
        header: "Phase",
        accessorFn: (r) => r.phase,
        cell: ({ row }) => (
          <Badge className={cn("text-data no-default-active-elevate", PHASE_CLASSES[row.original.phase])}>
            {PHASE_LABELS[row.original.phase]}
          </Badge>
        ),
        size: 135,
        meta: { defaultWidth: 135, headerLabel: "Phase" } satisfies DataTableColumnMeta,
      },
      {
        id: "left",
        header: "To claim",
        accessorFn: (r) => r.remainingToClaimCents,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums font-medium" title={`of a ${money(row.original.contractCents)} contract (inc approved variations)`}>
            {money(row.original.remainingToClaimCents)}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, align: "right", headerLabel: "Left to claim" } satisfies DataTableColumnMeta,
      },
      {
        id: "cost",
        header: "Costs left",
        accessorFn: (r) => r.remainingCostCents,
        cell: ({ row }) => (
          <span
            className="text-xs tabular-nums"
            title={row.original.costBasis === "margin" ? "No budget — estimated from your default margin" : "From the job's budget"}
          >
            {money(row.original.remainingCostCents)}
            {row.original.costBasis === "margin" && <span className="ml-1 text-muted-foreground">est.</span>}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, align: "right", headerLabel: "Cost to come" } satisfies DataTableColumnMeta,
      },
      {
        id: "dates",
        header: "Start – finish",
        accessorFn: (r) => r.startDate ?? "",
        cell: ({ row }) => (
          <span className={cn("text-xs", !row.original.endDate && "text-status-warning")}>
            {!row.original.startDate && !row.original.endDate
              ? "No dates"
              : `${shortDate(row.original.startDate)} – ${row.original.endDate ? shortDate(row.original.endDate) : "no end date"}`}
          </span>
        ),
        size: 150,
        meta: { defaultWidth: 150, headerLabel: "Start – finish" } satisfies DataTableColumnMeta,
      },
      {
        id: "mode",
        header: "Show as",
        accessorFn: (r) => r.mode,
        enableSorting: false,
        cell: ({ row }) => {
          const job = row.original;
          return (
            <div className="flex items-center gap-1.5 h-full" onClick={(e) => e.stopPropagation()}>
              <Select
                value={job.mode}
                disabled={!canEdit}
                onValueChange={(v) => {
                  // Radix emits "" on programmatic value changes (see
                  // morada-radix-select-value-wipe) — never a real choice.
                  if (!v || v === job.mode) return;
                  patch(job.projectId, { mode: v });
                }}
              >
                <SelectTrigger className="h-7 text-xs w-[110px]" data-testid={`select-mode-${job.projectId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODE_LABELS) as JobMode[]).map((m) => (
                    <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {job.mode === "manual" && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={!canEdit} onClick={() => setManualJob(job)}>
                  Amounts
                </Button>
              )}
            </div>
          );
        },
        size: 175,
        meta: { defaultWidth: 175, headerLabel: "Show as" } satisfies DataTableColumnMeta,
      },
      {
        id: "win",
        header: "Win",
        accessorFn: (r) => r.winPercent,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <SaveOnBlurNumber
              value={row.original.winPercent}
              min={0}
              max={100}
              disabled={!canEdit}
              suffix="%"
              onSave={(v) => patch(row.original.projectId, { winPercent: v })}
              testId={`input-win-${row.original.projectId}`}
            />
          </div>
        ),
        size: 75,
        meta: { defaultWidth: 75, headerLabel: "Win" } satisfies DataTableColumnMeta,
      },
      {
        id: "payDays",
        header: "Pays in",
        accessorFn: (r) => r.clientPayDays,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <SaveOnBlurNumber
              value={row.original.clientPayDaysOverride}
              placeholder={String(row.original.clientPayDays)}
              min={0}
              max={365}
              disabled={!canEdit}
              suffix="days"
              onSave={(v) => patch(row.original.projectId, { clientPayDays: v })}
              testId={`input-paydays-${row.original.projectId}`}
            />
          </div>
        ),
        size: 95,
        meta: { defaultWidth: 95, headerLabel: "Pays in" } satisfies DataTableColumnMeta,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit],
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) return <p className="py-16 text-center text-sm text-muted-foreground">Couldn't load the jobs.</p>;

  return (
    <Card className="overflow-hidden" data-testid="card-cashflow-projects">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold">Jobs on the forecast</h3>
          <p className="text-xs text-muted-foreground">
            Pre-construction and Construction jobs are included automatically. Tick a lead to add it, weighted by its win chance.
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          {(["all", "included", "leads"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "h-6 px-2.5 text-xs rounded",
                filter === f ? "bg-card font-semibold shadow-sm" : "text-muted-foreground",
              )}
              data-testid={`filter-jobs-${f}`}
            >
              {f === "all" ? "All" : f === "included" ? "On the forecast" : "Leads"}
            </button>
          ))}
        </div>
      </div>
      <DataTable
        data={rows}
        columns={columns}
        storageKey="cashflow-projects"
        rowKey={(r) => r.projectId}
        rowHeight={44}
        rowClassName={(r) => (r.included ? "" : "opacity-60")}
        emptyState={<p className="py-10 text-center text-sm text-muted-foreground">No Pre-construction, Construction or lead jobs.</p>}
      />
      <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-t border-border bg-muted/40 text-xs">
        <span className="text-muted-foreground">
          {included.length} job{included.length === 1 ? "" : "s"} on the forecast
        </span>
        <span className="font-semibold">{money(weightedLeft)} left to claim, weighted by win chance</span>
      </div>
      <ManualAmountsDialog job={manualJob} onClose={() => setManualJob(null)} />
    </Card>
  );
}

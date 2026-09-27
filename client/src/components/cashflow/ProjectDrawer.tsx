import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Link2, Loader2, Pencil, Plus, Settings2, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { addDays, daysBetween, maxKey, toDateKey, type CashflowJobRow, type DateKey, type ResolvedClaimStage } from "@shared/cashflow";
import { invalidateCashflow, money, PHASE_CLASSES, PHASE_LABELS, shortDate } from "./cashflowShared";

type ResolvedStage = ResolvedClaimStage;
// Mirrors ClaimSchedule in server/services/cashflowService.
interface ClaimSchedule {
  originalContractCents: number;
  invoicedCents: number;
  claimedPercent: number;
  stages: ResolvedStage[];
  scheduleItems: { id: string; name: string; type: string; category: string; endDate: string | null }[];
  suggestions: Record<string, string>;
  proposalMilestoneCount: number;
  invoiceCount: number;
}

/** One editable row. `key` is local; `id` is the saved stage it came from (for its state). */
interface DraftStage {
  key: string;
  id: string | null;
  name: string;
  kind: "percent" | "amount";
  percent: number | null;
  amountDollars: number | null;
  scheduleItemId: string | null;
  plannedDate: string | null;
}

// ─── Project info fields (chosen per viewer) ─────────────────────────────────

const INFO_FIELDS = {
  contract: "Contract (inc variations)",
  invoiced: "Invoiced to date",
  toClaim: "Left to claim",
  costsLeft: "Costs left",
  committed: "Committed (open POs)",
  dates: "Start – finish",
  nextClaim: "Next claim",
  showAs: "Shows on forecast as",
  win: "Win chance",
  payDays: "Clients pay in",
  claimedPercent: "Claimed % of contract",
} as const;
type InfoField = keyof typeof INFO_FIELDS;
const DEFAULT_FIELDS: InfoField[] = ["contract", "invoiced", "toClaim", "costsLeft", "committed", "nextClaim"];
const FIELDS_KEY = "morada.cashflow.projectInfoFields";

function useInfoFields(): [InfoField[], (f: InfoField[]) => void] {
  const [fields, setFields] = useState<InfoField[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FIELDS_KEY) ?? "null");
      // Keep only fields that still exist, so a removed one can't break the panel.
      if (Array.isArray(saved)) return saved.filter((f): f is InfoField => f in INFO_FIELDS);
    } catch {
      /* private window or bad JSON — fall back */
    }
    return DEFAULT_FIELDS;
  });
  const save = (f: InfoField[]) => {
    setFields(f);
    try {
      localStorage.setItem(FIELDS_KEY, JSON.stringify(f));
    } catch {
      /* not saved — still works for this visit */
    }
  };
  return [fields, save];
}

const MODE_TEXT: Record<CashflowJobRow["mode"], string> = {
  even: "Even spread",
  manual: "By month",
  claims: "Claims → schedule",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

let keySeq = 0;
const toDraft = (s: ResolvedStage): DraftStage => ({
  key: `k${keySeq++}`,
  id: s.id,
  name: s.name,
  kind: s.amountCents != null ? "amount" : "percent",
  percent: s.percent,
  amountDollars: s.amountCents != null ? s.amountCents / 100 : null,
  scheduleItemId: s.scheduleItemId,
  plannedDate: s.plannedDate,
});

const STATE_BADGE: Record<ResolvedStage["state"], [string, string]> = {
  claimed: ["Claimed", "bg-status-success-bg text-status-success"],
  part: ["Part claimed", "bg-status-warning-bg text-status-warning"],
  to_claim: ["To claim", "bg-primary/10 text-primary"],
};

// ─── Set-up (edit mode) ──────────────────────────────────────────────────────

const VALUE_SOURCE_TEXT: Record<CashflowJobRow["valueSource"], string> = {
  contract: "From the signed contract",
  forecast: "Your forecast value",
  budget: "From the project's client budget / cost",
  invoices: "The total of the job's invoices (drafts included)",
  none: "Not set — the job adds nothing to the forecast",
};
const DATE_SOURCE_TEXT: Record<CashflowJobRow["dateSource"], string> = {
  forecast: "Your forecast dates",
  schedule: "From the job's schedule",
  project: "From the project's proposed dates",
  none: "Not set — the job can't be spread over time",
};

/**
 * The builder's own figures for a job that isn't set up yet. A signed contract's
 * value is never overridden here — the forecast must agree with the contract.
 */
function JobSetup({ job, onDone }: { job: CashflowJobRow; onDone: () => void }) {
  const { toast } = useToast();
  const contracted = job.valueSource === "contract";
  const [valueDollars, setValueDollars] = useState<number | null>(job.forecastValueCents == null ? null : job.forecastValueCents / 100);
  const [start, setStart] = useState(job.forecastStart ?? "");
  // Length in weeks rather than a finish date; the finish is start + weeks.
  const [weeks, setWeeks] = useState<number | null>(
    job.forecastStart && job.forecastEnd ? Math.max(1, Math.round((daysBetween(job.forecastStart, job.forecastEnd) + 1) / 7)) : null,
  );
  const end = start && weeks ? addDays(start as DateKey, weeks * 7 - 1) : null;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiRequest(`/api/cashflow/projects/${job.projectId}`, "PATCH", body),
    onSuccess: async () => {
      await invalidateCashflow();
      onDone();
    },
    onError: (e: any) => toast({ title: e?.payload?.issues?.[0]?.message ?? "Couldn't save the job set-up", variant: "destructive" }),
  });
  const badDates = !!weeks && !start;

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/30" data-testid="panel-job-setup">
      <div className="space-y-1">
        <p className="text-xs font-medium">Job value (inc GST)</p>
        {contracted ? (
          <p className="text-sm">
            {money(job.contractCents)} <span className="text-xs text-muted-foreground">— from the signed contract, can't be changed here</span>
          </p>
        ) : (
          <>
            <NumericInput
              value={valueDollars}
              onCommit={setValueDollars}
              placeholder={job.valueSource === "budget" ? `${Math.round(job.contractCents / 100)} (client budget)` : "e.g. 850000"}
              className="h-8 text-sm"
              data-testid="input-job-value"
            />
            <p className="text-data text-muted-foreground">Used until the job has a contract. Leave empty to use the client budget.</p>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs font-medium">Start</span>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 text-sm" data-testid="input-job-start" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium">Length (weeks)</span>
          <NumericInput
            value={weeks}
            onCommit={(v) => setWeeks(v == null ? null : Math.max(1, Math.round(v)))}
            integer
            min={1}
            max={520}
            placeholder="e.g. 36"
            className="h-8 text-sm"
            data-testid="input-job-weeks"
          />
        </label>
      </div>
      <p className={cn("text-xs", badDates ? "text-destructive" : "text-muted-foreground")} data-testid="text-job-finish">
        {badDates
          ? "Add a start date for the weeks to count from."
          : end
            ? `Finishes ${shortDate(end)}.`
            : "Leave empty to use the schedule, or the project's proposed dates."}
      </p>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          disabled={save.isPending || (job.forecastValueCents == null && !job.forecastStart && !job.forecastEnd)}
          onClick={() => save.mutate({ forecastValueCents: null, forecastStart: null, forecastEnd: null })}
          data-testid="button-job-setup-reset"
        >
          Reset to automatic
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onDone}>Cancel</Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={save.isPending || badDates}
            onClick={() =>
              save.mutate({
                ...(contracted ? {} : { forecastValueCents: valueDollars == null ? null : Math.round(valueDollars * 100) }),
                forecastStart: start || null,
                forecastEnd: end,
              })
            }
            data-testid="button-job-setup-save"
          >
            {save.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer ──────────────────────────────────────────────────────────────────

export function ProjectDrawer({ job, onClose }: { job: CashflowJobRow | null; onClose: () => void }) {
  const { toast } = useToast();
  const canEdit = usePermission("business.cashflow", "edit");
  const [fields, setFields] = useInfoFields();
  const [editing, setEditing] = useState(false);
  const today = toDateKey(new Date())!;
  const claimsKey = [`/api/cashflow/projects/${job?.projectId}/claims`];
  const { data, isLoading } = useQuery<ClaimSchedule>({ queryKey: claimsKey, enabled: !!job });

  const [draft, setDraft] = useState<DraftStage[]>([]);
  const [dirty, setDirty] = useState(false);
  // A different job throws away unsaved edits; otherwise load what's saved
  // whenever it changes — but never over edits in progress.
  useEffect(() => {
    setDirty(false);
    setEditing(false);
  }, [job?.projectId]);
  useEffect(() => {
    if (data && !dirty) setDraft(data.stages.map(toDraft));
  }, [data, dirty]);

  const edit = (next: DraftStage[]) => {
    setDraft(next);
    setDirty(true);
  };
  const patch = (key: string, p: Partial<DraftStage>) => edit(draft.map((d) => (d.key === key ? { ...d, ...p } : d)));

  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/cashflow/projects/${job!.projectId}/claims`, "PUT", {
        stages: draft
          .filter((d) => d.name.trim())
          .map((d) => ({
            name: d.name.trim(),
            percent: d.kind === "percent" ? d.percent ?? 0 : null,
            amountCents: d.kind === "amount" ? Math.round((d.amountDollars ?? 0) * 100) : null,
            scheduleItemId: d.scheduleItemId,
            plannedDate: d.scheduleItemId ? null : d.plannedDate,
          })),
      }),
    onSuccess: async () => {
      setDirty(false);
      await invalidateCashflow();
      toast({ title: "Claims saved" });
    },
    onError: (e: any) => toast({ title: e?.payload?.error ?? "Couldn't save the claims", variant: "destructive" }),
  });
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const fromInvoices = useMutation({
    mutationFn: (replace: boolean) => apiRequest(`/api/cashflow/projects/${job!.projectId}/claims/from-invoices`, "POST", { replace }),
    onSuccess: async (res: any) => {
      setDirty(false);
      setConfirmRebuild(false);
      await invalidateCashflow();
      const n = res?.count;
      toast({ title: n ? `${n} claims built from the invoices` : "Claims built from the invoices" });
    },
    onError: (e: any) => toast({ title: e?.payload?.error ?? "Couldn't build claims from the invoices", variant: "destructive" }),
  });
  const seed = useMutation({
    mutationFn: () => apiRequest(`/api/cashflow/projects/${job!.projectId}/claims/from-proposal`, "POST"),
    onSuccess: () => invalidateCashflow(),
    onError: (e: any) => toast({ title: e?.payload?.error ?? "Couldn't copy the proposal's claims", variant: "destructive" }),
  });

  const stateById = useMemo(() => new Map((data?.stages ?? []).map((s) => [s.id, s])), [data]);
  const itemById = useMemo(() => new Map((data?.scheduleItems ?? []).map((i) => [i.id, i])), [data]);
  const itemOptions = useMemo(
    () =>
      (data?.scheduleItems ?? []).map((i) => ({
        value: i.id,
        label: i.name,
        description: i.endDate ? `Finishes ${shortDate(i.endDate)}${i.type === "milestone" ? " · milestone" : ""}` : undefined,
        group: i.category === "preconstruction" ? "Pre-construction schedule" : "Construction schedule",
      })),
    [data],
  );

  const contract = data?.originalContractCents ?? 0;
  const valueOf = (d: DraftStage) => (d.kind === "amount" ? Math.round((d.amountDollars ?? 0) * 100) : Math.round(((d.percent ?? 0) / 100) * contract));
  const totalValue = draft.reduce((s, d) => s + valueOf(d), 0);
  const pendingLinks = data ? draft.filter((d) => d.id && !d.scheduleItemId && data.suggestions[d.id]) : [];

  const nextClaim = useMemo(() => {
    if (!job || !data) return null;
    const open = data.stages.filter((s) => s.unclaimedCents > 0);
    const upcoming = open.filter((s) => s.date).sort((a, b) => (a.date! < b.date! ? -1 : 1))[0];
    if (!upcoming) return null;
    // Same fitting as the engine: stages scaled down to what's left, or the
    // extra (variations) added to the next claim.
    const total = open.reduce((s, st) => s + st.unclaimedCents, 0);
    const left = job.remainingToClaimCents;
    const amount = total > left ? Math.round((upcoming.unclaimedCents * left) / total) : upcoming.unclaimedCents + (left - total);
    return `${upcoming.name} · ${money(amount)} · paid ~${shortDate(addDays(maxKey(upcoming.date!, today), job.clientPayDays))}`;
  }, [job, data]);

  const needsSetup = !!job && (job.valueSource === "none" || !job.startDate || !job.endDate);

  const info: Record<InfoField, string> = job
    ? {
        contract: money(job.contractCents),
        invoiced: money(job.invoicedCents),
        toClaim: money(job.remainingToClaimCents),
        costsLeft: `${money(job.remainingCostCents)}${job.costBasis === "margin" ? " (est. from margin)" : ""}`,
        committed: job.costBasis === "margin" ? "— (no budget)" : money(job.committedCents),
        dates: `${shortDate(job.startDate)} – ${job.endDate ? shortDate(job.endDate) : "no end date"}`,
        nextClaim: nextClaim ?? "—",
        showAs: MODE_TEXT[job.mode],
        win: `${job.winPercent}%`,
        payDays: `${job.clientPayDays} days`,
        claimedPercent: data ? `${Math.round(data.claimedPercent * 10) / 10}%` : "—",
      }
    : ({} as Record<InfoField, string>);

  return (
    <Sheet open={!!job} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] overflow-y-auto" data-testid="drawer-cashflow-project">
        {job && (
          <>
            <SheetHeader className="space-y-1 pr-8">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="text-lg">{job.name}</SheetTitle>
                <Badge className={cn("text-data no-default-active-elevate", PHASE_CLASSES[job.phase])}>{PHASE_LABELS[job.phase]}</Badge>
              </div>
              <SheetDescription>{job.jobNumber ? `Job ${job.jobNumber}` : "Cash for this job"}</SheetDescription>
            </SheetHeader>

            {/* Project info */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-label font-semibold uppercase tracking-wide text-muted-foreground">Project info</p>
                <div className="flex items-center gap-1">
                {canEdit && !editing && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)} data-testid="button-edit-job">
                    <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                  </Button>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid="button-choose-info">
                      <Settings2 className="h-3.5 w-3.5 mr-1" />Choose info
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-60 p-2">
                    <p className="text-xs font-semibold px-1 pb-1">Show in project info</p>
                    {(Object.keys(INFO_FIELDS) as InfoField[]).map((f) => (
                      <label key={f} className="flex items-center gap-2 px-1 py-1 text-xs rounded hover-elevate cursor-pointer">
                        <Checkbox
                          checked={fields.includes(f)}
                          onCheckedChange={(v) => setFields(v === true ? [...fields, f] : fields.filter((x) => x !== f))}
                        />
                        {INFO_FIELDS[f]}
                      </label>
                    ))}
                  </PopoverContent>
                </Popover>
                </div>
              </div>
              {editing && <JobSetup job={job} onDone={() => setEditing(false)} />}
              <div className="grid grid-cols-2 rounded-lg border overflow-hidden" data-testid="grid-project-info">
                {fields.map((f, i) => (
                  <div key={f} className={cn("px-3 py-2", i % 2 === 0 && "border-r", i < fields.length - (fields.length % 2 === 0 ? 2 : 1) && "border-b")}>
                    <p className="text-xs text-muted-foreground">
                      {f === "contract" && job.valueSource !== "contract" ? "Job value (not contracted)" : INFO_FIELDS[f]}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">{info[f]}</p>
                  </div>
                ))}
                {fields.length === 0 && <p className="col-span-2 px-3 py-3 text-xs text-muted-foreground">Choose what to show here.</p>}
              </div>
              <p className={cn("text-xs", needsSetup ? "text-status-warning" : "text-muted-foreground")} data-testid="text-job-sources">
                Value: {VALUE_SOURCE_TEXT[job.valueSource]}. Dates: {DATE_SOURCE_TEXT[job.dateSource]}
                {job.dateSource !== "none" && !job.endDate ? ", but no finish date" : ""}.
                {needsSetup && canEdit && !editing && (
                  <button type="button" className="ml-1 text-primary hover:underline" onClick={() => setEditing(true)}>Set it up</button>
                )}
              </p>
            </div>

            {/* Claim schedule */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Claims</p>
                  <p className="text-xs text-muted-foreground">
                    Link each claim to the schedule item that triggers it. It's paid {job.clientPayDays} days after that item finishes.
                  </p>
                </div>
                {canEdit && data && draft.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {pendingLinks.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => edit(draft.map((d) => (d.id && !d.scheduleItemId && data.suggestions[d.id] ? { ...d, scheduleItemId: data.suggestions[d.id] } : d)))}
                        title="Link every claim to the schedule item it matches, so its date follows the schedule"
                        data-testid="button-link-all-suggested"
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1" />Link {pendingLinks.length} to the schedule
                      </Button>
                    )}
                    {data.invoiceCount > 0 && (
                      <Popover open={confirmRebuild} onOpenChange={setConfirmRebuild}>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid="button-rebuild-from-invoices">
                            <FileText className="h-3.5 w-3.5 mr-1" />Rebuild from invoices
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 space-y-2">
                          <p className="text-sm font-semibold">Replace these claims?</p>
                          <p className="text-xs text-muted-foreground">
                            The {draft.length} claims here are replaced by one per invoice ({data.invoiceCount}), on the invoice dates. Links to the schedule are cleared.
                          </p>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmRebuild(false)}>Cancel</Button>
                            <Button size="sm" className="h-7 text-xs" disabled={fromInvoices.isPending} onClick={() => fromInvoices.mutate(true)} data-testid="button-confirm-rebuild">
                              {fromInvoices.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Replace
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                )}
              </div>

              {isLoading || !data ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : draft.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">No claims set up for this job.</p>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {data.invoiceCount > 0 && canEdit && (
                      <Button size="sm" onClick={() => fromInvoices.mutate(false)} disabled={fromInvoices.isPending} data-testid="button-claims-from-invoices">
                        {fromInvoices.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
                        Build from {data.invoiceCount} invoice{data.invoiceCount === 1 ? "" : "s"}
                      </Button>
                    )}
                    {data.proposalMilestoneCount > 0 && canEdit && (
                      <Button size="sm" variant={data.invoiceCount > 0 ? "outline" : "default"} onClick={() => seed.mutate()} disabled={seed.isPending} data-testid="button-claims-from-proposal">
                        {seed.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Copy {data.proposalMilestoneCount} from the proposal
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => edit([{ key: `k${keySeq++}`, id: null, name: "", kind: "percent", percent: null, amountDollars: null, scheduleItemId: null, plannedDate: null }])}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />Add a claim
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2" data-testid="list-claim-stages">
                    {draft.map((d) => {
                      const saved = d.id ? stateById.get(d.id) : undefined;
                      const [stateLabel, stateClass] = STATE_BADGE[saved?.state ?? "to_claim"];
                      const item = d.scheduleItemId ? itemById.get(d.scheduleItemId) : undefined;
                      const suggestion = !d.scheduleItemId && d.id ? data.suggestions[d.id] : undefined;
                      const claimed = saved?.state === "claimed";
                      return (
                        <div key={d.key} className={cn("rounded-lg border p-3 space-y-2", claimed && "bg-muted/40")} data-testid={`claim-stage-${d.key}`}>
                          <div className="flex items-center gap-2">
                            <Input
                              value={d.name}
                              placeholder="e.g. Lock-up"
                              disabled={!canEdit}
                              onChange={(e) => patch(d.key, { name: e.target.value })}
                              className="h-8 text-sm flex-1"
                            />
                            <div className="flex items-center rounded-md border h-8 overflow-hidden shrink-0">
                              <NumericInput
                                value={d.kind === "percent" ? d.percent : d.amountDollars}
                                min={0}
                                max={d.kind === "percent" ? 100 : undefined}
                                disabled={!canEdit}
                                onCommit={(v) => patch(d.key, d.kind === "percent" ? { percent: v } : { amountDollars: v })}
                                className="h-full w-20 bg-transparent px-2 text-sm text-right focus-visible:outline-none"
                                data-testid={`input-claim-value-${d.key}`}
                              />
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => patch(d.key, { kind: d.kind === "percent" ? "amount" : "percent" })}
                                className="h-full px-2 text-xs bg-muted text-muted-foreground border-l"
                                title="Switch between % of contract and a dollar amount"
                              >
                                {d.kind === "percent" ? "%" : "$"}
                              </button>
                            </div>
                            <span className="text-xs tabular-nums w-20 text-right text-muted-foreground">{money(valueOf(d))}</span>
                            <Badge className={cn("text-data no-default-active-elevate shrink-0", stateClass)}>{stateLabel}</Badge>
                            {canEdit && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => edit(draft.filter((x) => x.key !== d.key))} aria-label="Remove claim">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          {(!claimed || d.scheduleItemId) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground w-14 shrink-0">Paid after</span>
                            <SearchableSelect
                              options={itemOptions}
                              value={d.scheduleItemId ?? undefined}
                              onValueChange={(v) => patch(d.key, { scheduleItemId: v || null })}
                              placeholder="Link a schedule item…"
                              searchPlaceholder="Search the schedule…"
                              emptyMessage="No schedule items on this job."
                              allowClear
                              disabled={!canEdit}
                              triggerClassName="h-8 text-xs"
                              className="flex-1 min-w-[200px]"
                              data-testid={`select-claim-item-${d.key}`}
                            />
                            {!d.scheduleItemId && (
                              <Input
                                type="date"
                                value={d.plannedDate ?? ""}
                                disabled={!canEdit}
                                onChange={(e) => patch(d.key, { plannedDate: e.target.value || null })}
                                className="h-8 text-xs w-[150px]"
                                title="Or a planned date"
                              />
                            )}
                          </div>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            {claimed ? null : item?.endDate ? (
                              <span className="text-muted-foreground">
                                {item.endDate < today ? "Finished" : "Finishes"} {shortDate(item.endDate)} → paid ~
                                {shortDate(addDays(maxKey(item.endDate, today), job.clientPayDays))}
                              </span>
                            ) : d.plannedDate ? (
                              <span className="text-muted-foreground">Paid ~{shortDate(addDays(maxKey(d.plannedDate, today), job.clientPayDays))}</span>
                            ) : (
                              <span className="text-status-warning">Not linked — spread evenly over the job</span>
                            )}
                            {suggestion && canEdit && (
                              <button
                                type="button"
                                onClick={() => patch(d.key, { scheduleItemId: suggestion })}
                                className="ml-auto flex items-center gap-1 rounded-full bg-amber-light border border-amber/40 px-2 py-0.5 text-status-warning"
                                data-testid={`button-claim-suggestion-${d.key}`}
                              >
                                <Sparkles className="h-3 w-3" />Link to “{itemById.get(suggestion)?.name}”
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => edit([...draft, { key: `k${keySeq++}`, id: null, name: "", kind: "percent", percent: null, amountDollars: null, scheduleItemId: null, plannedDate: null }])}
                        data-testid="button-add-claim"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />Add a claim
                      </Button>
                    )}
                    <span className={cn("tabular-nums", Math.abs(totalValue - contract) > 100 && contract > 0 ? "text-status-warning" : "text-muted-foreground")}>
                      Claims total {money(totalValue)} of a {money(contract)} contract
                    </span>
                  </div>
                </>
              )}

              {dirty && canEdit && (
                <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-card border-t flex items-center justify-end gap-2">
                  <span className="text-xs text-status-warning mr-auto">Unsaved changes</span>
                  <Button size="sm" variant="outline" onClick={() => setDirty(false)}>Undo</Button>
                  <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-claims">
                    {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save claims
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

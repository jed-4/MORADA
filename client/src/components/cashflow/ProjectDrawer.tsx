import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Settings2, Sparkles, Trash2 } from "lucide-react";
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
import { addDays, type CashflowJobRow } from "@shared/cashflow";
import { invalidateCashflow, money, PHASE_CLASSES, PHASE_LABELS, shortDate } from "./cashflowShared";

// Mirrors server/services/cashflowService ClaimSchedule.
interface ResolvedStage {
  id: string;
  name: string;
  percent: number | null;
  amountCents: number | null;
  scheduleItemId: string | null;
  scheduleItemName: string | null;
  plannedDate: string | null;
  date: string | null;
  dateSource: "schedule" | "planned" | null;
  valueCents: number;
  unclaimedCents: number;
  state: "claimed" | "part" | "to_claim";
}
interface ClaimSchedule {
  originalContractCents: number;
  invoicedCents: number;
  claimedPercent: number;
  stages: ResolvedStage[];
  scheduleItems: { id: string; name: string; type: string; category: string; endDate: string | null }[];
  suggestions: Record<string, string>;
  proposalMilestoneCount: number;
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
  dates: "Start – finish",
  nextClaim: "Next claim",
  showAs: "Shows on forecast as",
  win: "Win chance",
  payDays: "Clients pay in",
  claimedPercent: "Claimed % of contract",
} as const;
type InfoField = keyof typeof INFO_FIELDS;
const DEFAULT_FIELDS: InfoField[] = ["contract", "invoiced", "toClaim", "costsLeft", "dates", "nextClaim"];
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

// ─── Drawer ──────────────────────────────────────────────────────────────────

export function ProjectDrawer({ job, onClose }: { job: CashflowJobRow | null; onClose: () => void }) {
  const { toast } = useToast();
  const canEdit = usePermission("business.cashflow", "edit");
  const [fields, setFields] = useInfoFields();
  const claimsKey = [`/api/cashflow/projects/${job?.projectId}/claims`];
  const { data, isLoading } = useQuery<ClaimSchedule>({ queryKey: claimsKey, enabled: !!job });

  const [draft, setDraft] = useState<DraftStage[]>([]);
  const [dirty, setDirty] = useState(false);
  // A different job throws away unsaved edits; otherwise load what's saved
  // whenever it changes — but never over edits in progress.
  useEffect(() => setDirty(false), [job?.projectId]);
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

  const nextClaim = useMemo(() => {
    if (!job || !data) return null;
    const upcoming = data.stages
      .filter((s) => s.unclaimedCents > 0 && s.date)
      .sort((a, b) => (a.date! < b.date! ? -1 : 1))[0];
    return upcoming ? `${upcoming.name} · ${money(upcoming.unclaimedCents)} · paid ~${shortDate(addDays(upcoming.date!, job.clientPayDays))}` : null;
  }, [job, data]);

  const info: Record<InfoField, string> = job
    ? {
        contract: money(job.contractCents),
        invoiced: money(job.invoicedCents),
        toClaim: money(job.remainingToClaimCents),
        costsLeft: `${money(job.remainingCostCents)}${job.costBasis === "margin" ? " (est. from margin)" : ""}`,
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
              <div className="grid grid-cols-2 rounded-lg border overflow-hidden" data-testid="grid-project-info">
                {fields.map((f, i) => (
                  <div key={f} className={cn("px-3 py-2", i % 2 === 0 && "border-r", i < fields.length - (fields.length % 2 === 0 ? 2 : 1) && "border-b")}>
                    <p className="text-xs text-muted-foreground">{INFO_FIELDS[f]}</p>
                    <p className="text-sm font-semibold tabular-nums">{info[f]}</p>
                  </div>
                ))}
                {fields.length === 0 && <p className="col-span-2 px-3 py-3 text-xs text-muted-foreground">Choose what to show here.</p>}
              </div>
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
              </div>

              {isLoading || !data ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : draft.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">No claims set up for this job.</p>
                  <div className="flex justify-center gap-2">
                    {data.proposalMilestoneCount > 0 && canEdit && (
                      <Button size="sm" onClick={() => seed.mutate()} disabled={seed.isPending} data-testid="button-claims-from-proposal">
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
                          <div className="flex items-center gap-2 text-xs">
                            {item?.endDate ? (
                              <span className="text-muted-foreground">
                                Finishes {shortDate(item.endDate)} → paid ~{shortDate(addDays(item.endDate, job.clientPayDays))}
                              </span>
                            ) : d.plannedDate ? (
                              <span className="text-muted-foreground">Paid ~{shortDate(addDays(d.plannedDate, job.clientPayDays))}</span>
                            ) : !claimed ? (
                              <span className="text-status-warning">Not linked — spread evenly over the job</span>
                            ) : null}
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

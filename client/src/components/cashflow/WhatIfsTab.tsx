import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Briefcase, CheckCircle2, FlaskConical, Loader2, Plus, Receipt, Truck, UserPlus, Wrench, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  averageMonthlyCents,
  buildForecast,
  defaultParams,
  employeeCost,
  expandWhatIf,
  type EmployeeParams,
  type ForecastResult,
  type WhatIfDefinition,
  type WhatIfTemplate,
} from "@shared/cashflow";
import { invalidateCashflow, money, moneyShort, type ForecastResponse } from "./cashflowShared";
import { TEMPLATE_LABELS, WhatIfFields } from "./WhatIfEditor";

const TEMPLATE_INFO: Record<WhatIfTemplate, { icon: typeof Truck; blurb: string; defaultName: string }> = {
  employee: { icon: UserPlus, blurb: "Pay, super and on-costs worked out for you", defaultName: "New hire" },
  vehicle: { icon: Truck, blurb: "Finance or cash, rego, running costs, GST back", defaultName: "New vehicle" },
  win_job: { icon: Briefcase, blurb: "Claims and costs spread over the job", defaultName: "New job" },
  one_off: { icon: Receipt, blurb: "A single payment in or out", defaultName: "One-off payment" },
  custom: { icon: Wrench, blurb: "Build it from your own lines", defaultName: "Custom what-if" },
};

// ─── Verdicts ────────────────────────────────────────────────────────────────

type Tone = "good" | "tight" | "bad";

function verdictOf(r: ForecastResult): { tone: Tone; text: string } {
  const lowest = r.lowest;
  const at = r.periods[lowest.periodIndex].label;
  if (lowest.cents < 0) {
    const i = r.closingCents.findIndex((c) => c < 0);
    return { tone: "bad", text: `Goes below $0 in ${r.periods[i].label} and bottoms out at ${money(lowest.cents)} (${at}).` };
  }
  if (r.firstBelowBufferIndex != null) {
    return { tone: "tight", text: `Below your ${money(r.bufferCents)} buffer from ${r.periods[r.firstBelowBufferIndex].label}. Lowest ${money(lowest.cents)} in ${at}.` };
  }
  return { tone: "good", text: `Lowest balance ${money(lowest.cents)} (${at}). Stays above your ${money(r.bufferCents)} buffer the whole way.` };
}

const TONE_STYLE: Record<Tone, { box: string; icon: typeof CheckCircle2; head: string }> = {
  good: { box: "bg-sage-light border-sage/40", icon: CheckCircle2, head: "text-status-success" },
  tight: { box: "bg-amber-light border-amber/50", icon: AlertTriangle, head: "text-status-warning" },
  bad: { box: "bg-coral-light border-coral/40", icon: XCircle, head: "text-destructive" },
};

function Verdict({ title, r, extra }: { title: string; r: ForecastResult; extra?: string }) {
  const v = verdictOf(r);
  const s = TONE_STYLE[v.tone];
  const Icon = s.icon;
  return (
    <div className={cn("rounded-lg border p-3 flex gap-2.5", s.box)}>
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", s.head)} />
      <div className="space-y-0.5 min-w-0">
        <p className={cn("text-xs font-semibold", s.head)}>
          {title} — {v.tone === "good" ? "yes" : v.tone === "tight" ? "tight" : "not yet"}
        </p>
        <p className="text-xs text-foreground">{v.text}</p>
        {extra && <p className="text-xs text-muted-foreground">{extra}</p>}
      </div>
    </div>
  );
}

// ─── Impact panel ────────────────────────────────────────────────────────────

function ImpactPanel({
  data,
  draft,
}: {
  data: ForecastResponse;
  draft: WhatIfDefinition;
}) {
  const ctx = { clientPayDays: data.settings.clientPayDays, supplierPayDays: data.settings.supplierPayDays };
  const { base, alone, together, othersOn } = useMemo(() => {
    const run = (defs: WhatIfDefinition[]) =>
      buildForecast({ ...data.input, whatIfs: defs.map((d) => expandWhatIf({ ...d, isEnabled: true }, ctx)) });
    const others = data.whatIfs.filter((w) => w.isEnabled && w.id !== draft.id);
    return {
      base: run([]),
      alone: run([draft]),
      together: run([...others, draft]),
      othersOn: others,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, draft]);

  const rows = base.periods.map((p, i) => ({
    label: p.label,
    base: base.closingCents[i],
    alone: alone.closingCents[i],
    together: together.closingCents[i],
  }));

  const breakEven =
    draft.template === "employee"
      ? (() => {
          const cost = employeeCost(draft.params as EmployeeParams).totalPerYearCents;
          const margin = data.settings.defaultMarginPercent;
          if (!cost || !margin) return undefined;
          return `Costs ${money(cost)} a year. To pay for itself it needs to help bring in about ${money((cost * 100) / margin)} more work a year at your ${margin}% margin.`;
        })()
      : undefined;

  return (
    <Card className="p-4 space-y-3" data-testid="card-whatif-impact">
      <h3 className="text-sm font-semibold">Can we afford it?</h3>
      <div className="h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={moneyShort} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(v: number) => money(v)} contentStyle={{ fontSize: 12 }} />
            <ReferenceLine y={base.bufferCents} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Line dataKey="base" name="Now" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="alone" name={`+ ${draft.name}`} stroke="hsl(var(--sage))" strokeWidth={2} dot={false} isAnimationActive={false} />
            {othersOn.length > 0 && (
              <Line dataKey="together" name="+ everything on" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-foreground" />Now</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-sage" />+ {draft.name}</span>
        {othersOn.length > 0 && (
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-primary" />+ everything switched on</span>
        )}
      </div>
      <Verdict title={`${draft.name} on its own`} r={alone} extra={breakEven} />
      {othersOn.length > 0 && (
        <Verdict title={`With ${othersOn.map((w) => w.name).join(", ")} too`} r={together} />
      )}
      <p className="text-xs text-muted-foreground">
        Without any what-ifs: lowest {money(base.lowest.cents)} in {base.periods[base.lowest.periodIndex].label}.
      </p>
    </Card>
  );
}

// ─── New what-if ─────────────────────────────────────────────────────────────

function NewWhatIfDialog({ open, onOpenChange, onCreated, today }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void; today: string }) {
  const { toast } = useToast();
  const create = useMutation({
    mutationFn: (template: WhatIfTemplate) =>
      apiRequest("/api/cashflow/what-ifs", "POST", {
        name: TEMPLATE_INFO[template].defaultName,
        template,
        isEnabled: true,
        params: defaultParams(template, today),
        lines: [],
      }),
    onSuccess: async (row: { id: string }) => {
      await invalidateCashflow();
      onCreated(row.id);
      onOpenChange(false);
    },
    onError: () => toast({ title: "Couldn't add the what-if", variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New what-if</DialogTitle>
          <DialogDescription>Try a decision on the forecast before you make it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(Object.keys(TEMPLATE_INFO) as WhatIfTemplate[]).map((t) => {
            const Icon = TEMPLATE_INFO[t].icon;
            return (
              <button
                key={t}
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate(t)}
                className="w-full flex items-center gap-3 rounded-lg border p-3 text-left hover-elevate active-elevate-2"
                data-testid={`button-new-whatif-${t}`}
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{TEMPLATE_LABELS[t]}</p>
                  <p className="text-xs text-muted-foreground">{TEMPLATE_INFO[t].blurb}</p>
                </div>
                {create.isPending && create.variables === t && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── The tab ─────────────────────────────────────────────────────────────────

export function WhatIfsTab({ data }: { data: ForecastResponse }) {
  const { toast } = useToast();
  const canAdd = usePermission("business.cashflow", "add");
  const canEdit = usePermission("business.cashflow", "edit");
  const canDelete = usePermission("business.cashflow", "delete");
  const today = data.input.today;
  const ctx = { clientPayDays: data.settings.clientPayDays, supplierPayDays: data.settings.supplierPayDays };

  const [selectedId, setSelectedId] = useState<string | null>(data.whatIfs[0]?.id ?? null);
  const [draft, setDraft] = useState<WhatIfDefinition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = data.whatIfs.find((w) => w.id === selectedId) ?? null;

  // Load the selected what-if into the editor — but never over unsaved edits.
  useEffect(() => {
    if (!selectedId && data.whatIfs.length > 0) setSelectedId(data.whatIfs[0].id);
    if (selected && !dirty) setDraft(structuredClone(selected));
    if (!selected) setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedId, data.whatIfs]);

  const edit = (d: WhatIfDefinition) => {
    setDraft(d);
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: (d: WhatIfDefinition) =>
      apiRequest(`/api/cashflow/what-ifs/${d.id}`, "PATCH", {
        name: d.name.trim() || TEMPLATE_INFO[d.template].defaultName,
        template: d.template,
        isEnabled: d.isEnabled,
        params: d.params,
        lines: d.lines.filter((l) => l.name.trim() && l.amountCents > 0).map((l) => ({ ...l, name: l.name.trim() })),
      }),
    onSuccess: async () => {
      setDirty(false);
      await invalidateCashflow();
      toast({ title: "What-if saved" });
    },
    onError: () => toast({ title: "Couldn't save — check the dates and amounts", variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: (w: WhatIfDefinition) => apiRequest(`/api/cashflow/what-ifs/${w.id}`, "PATCH", { isEnabled: !w.isEnabled }),
    onSuccess: () => invalidateCashflow(),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/cashflow/what-ifs/${id}`, "DELETE"),
    onSuccess: async () => {
      setDirty(false);
      setSelectedId(null);
      await invalidateCashflow();
    },
    onError: () => toast({ title: "Couldn't delete the what-if", variant: "destructive" }),
  });

  const switchTo = (id: string) => {
    if (dirty && !window.confirm("Discard your unsaved changes to this what-if?")) return;
    setDirty(false);
    setSelectedId(id);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* The list */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {data.whatIfs.map((w) => {
          const Icon = TEMPLATE_INFO[w.template].icon;
          const shown = w.id === draft?.id ? draft : w;
          const perMonth = averageMonthlyCents(expandWhatIf(shown, ctx).streams, today);
          const active = w.id === selectedId;
          return (
            <Card
              key={w.id}
              onClick={() => switchTo(w.id)}
              className={cn("p-3 cursor-pointer hover-elevate", active && "ring-2 ring-primary/40 border-primary")}
              data-testid={`card-whatif-${w.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-semibold truncate">{shown.name}</p>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={w.isEnabled}
                    disabled={!canEdit}
                    onCheckedChange={() => toggle.mutate(w)}
                    aria-label="On the forecast"
                    data-testid={`switch-whatif-${w.id}`}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{TEMPLATE_LABELS[w.template]}{w.isEnabled ? " · on the forecast" : " · off"}</p>
              <p className={cn("text-xs font-semibold mt-1 tabular-nums", perMonth < 0 ? "text-destructive" : "text-status-success")}>
                {perMonth === 0 ? "—" : `${money(Math.abs(perMonth))} a month ${perMonth < 0 ? "out" : "in"} on average`}
              </p>
            </Card>
          );
        })}
        {canAdd && (
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="rounded-xl border border-dashed border-border p-3 text-left hover-elevate"
            data-testid="button-new-whatif"
          >
            <p className="text-sm font-semibold text-primary flex items-center gap-1.5"><Plus className="h-4 w-4" />New what-if</p>
            <p className="text-xs text-muted-foreground mt-1">Employee · Vehicle or equipment · Win a job · One-off · Custom</p>
          </button>
        )}
      </div>

      {data.whatIfs.length === 0 ? (
        <Card className="py-12 flex flex-col items-center gap-2 text-center">
          <FlaskConical className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No what-ifs yet.</p>
          <p className="text-xs text-muted-foreground max-w-sm">Thinking about a new truck, a hire or a big job? Add it here to see what it does to your bank balance before you commit.</p>
        </Card>
      ) : draft ? (
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-[1fr_420px] items-start">
          <Card className="p-4 space-y-4" data-testid="card-whatif-editor">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <Input
                  value={draft.name}
                  onChange={(e) => edit({ ...draft, name: e.target.value })}
                  className="text-base font-semibold h-9 max-w-xs"
                  disabled={!canEdit}
                  data-testid="input-whatif-name"
                />
                <span className="text-xs text-muted-foreground">{TEMPLATE_LABELS[draft.template]}</span>
              </div>
              <div className="flex items-center gap-2">
                {dirty && <span className="text-xs text-status-warning">Unsaved — the impact shows your edits</span>}
                {canDelete && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} data-testid="button-delete-whatif">Delete</Button>
                )}
                {dirty && (
                  <Button size="sm" variant="outline" onClick={() => { setDirty(false); if (selected) setDraft(structuredClone(selected)); }}>
                    Undo
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)} data-testid="button-save-whatif">
                    {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save
                  </Button>
                )}
              </div>
            </div>
            <WhatIfFields draft={draft} onChange={edit} today={today} />
          </Card>
          <ImpactPanel data={data} draft={draft} />
        </div>
      ) : null}

      <NewWhatIfDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        today={today}
        onCreated={(id) => {
          setDirty(false);
          setSelectedId(id);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${draft?.name}"?`}
        description="It comes off the forecast. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => draft && remove.mutate(draft.id)}
      />
    </div>
  );
}

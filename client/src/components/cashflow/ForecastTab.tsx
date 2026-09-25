import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { usePermission } from "@/hooks/use-permission";
import { useToast } from "@/hooks/use-toast";
import type { CashEvent, ForecastLine, ForecastResult, WhatIfDefinition } from "@shared/cashflow";
import { invalidateCashflow, money, moneyShort, shortDate, type ForecastResponse } from "./cashflowShared";

// ─── KPI cards ───────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, tone, testId }: { label: string; value: string; sub: string; tone?: "bad"; testId: string }) {
  return (
    <Card
      className={cn("flex-1 min-w-[200px] px-4 py-3", tone === "bad" && "bg-coral-light border-coral/40")}
      data-testid={testId}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums mt-0.5", tone === "bad" && "text-destructive")}>{value}</p>
      <p className={cn("text-xs mt-0.5", tone === "bad" ? "text-destructive" : "text-muted-foreground")}>{sub}</p>
    </Card>
  );
}

function syncedAgo(iso: string | undefined): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return " · synced just now";
  if (mins < 60) return ` · synced ${mins} min ago`;
  return ` · synced ${new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
}

/** "Operations" / "Operations + Tax holding" / "all 6 accounts" — say which cash this is. */
function accountLabel(names: string[]): string {
  if (names.length === 0) return "no accounts ticked";
  if (names.length <= 2) return names.join(" + ");
  return `${names.length} accounts`;
}

/** "In the bank today", with Sync from Xero and a typed-in override. */
function OpeningKpi({ data }: { data: ForecastResponse }) {
  const { toast } = useToast();
  const canEdit = usePermission("business.cashflow", "edit");
  const [editing, setEditing] = useState(false);
  const [dollars, setDollars] = useState<number | null>(null);
  const o = data.opening;

  const sync = useMutation({
    mutationFn: () => apiRequest("/api/cashflow/opening-balance/sync", "POST"),
    onSuccess: () => invalidateCashflow(),
    onError: (e: any) =>
      toast({ title: "Couldn't sync from Xero", description: e?.message?.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: (cents: number | null) => apiRequest("/api/cashflow/settings", "PATCH", { manualOpeningBalanceCents: cents }),
    onSuccess: () => {
      setEditing(false);
      invalidateCashflow();
    },
    onError: () => toast({ title: "Couldn't save the balance", variant: "destructive" }),
  });

  const sub =
    o.source === "xero"
      ? `From Xero · ${accountLabel(o.accounts.filter((a) => a.included).map((a) => a.name))}${syncedAgo(o.fetchedAt)}`
      : o.source === "manual"
        ? o.xeroConnected ? "Entered by hand · Xero not used" : "Entered by hand"
        : o.error ?? (o.xeroConnected ? "No balance yet — sync from Xero" : "No balance yet — enter today's balance");

  return (
    <Card className="flex-1 min-w-[200px] px-4 py-3" data-testid="kpi-opening">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">In the bank today</p>
        {canEdit && (
          <div className="flex items-center gap-1 -mt-0.5 -mr-1">
            {o.xeroConnected && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-muted-foreground"
                disabled={sync.isPending}
                onClick={() => sync.mutate()}
                data-testid="button-sync-opening"
              >
                {sync.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                Sync from Xero
              </Button>
            )}
            <Popover
              open={editing}
              onOpenChange={(v) => {
                setEditing(v);
                if (v) setDollars(o.cents == null ? null : Math.round(o.cents) / 100);
              }}
            >
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground" data-testid="button-edit-opening">
                  <Pencil className="w-3 h-3 mr-1" />Enter
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-2">
                <p className="text-sm font-semibold">Today's bank balance</p>
                <p className="text-xs text-muted-foreground">
                  {o.xeroConnected
                    ? "Used instead of Xero until you press Sync from Xero."
                    : "Xero isn't connected, so type in what's in the bank today."}
                </p>
                <NumericInput
                  value={dollars}
                  onCommit={setDollars}
                  placeholder="e.g. 184320"
                  className="h-8 text-sm"
                  autoFocus
                  data-testid="input-opening-balance"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    disabled={dollars == null || save.isPending}
                    onClick={() => dollars != null && save.mutate(Math.round(dollars * 100))}
                    data-testid="button-save-opening"
                  >
                    {save.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Save
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums mt-0.5">{money(data.forecast.openingBalanceCents)}</p>
      <p className={cn("text-xs mt-0.5", o.error ? "text-destructive" : "text-muted-foreground")}>{sub}</p>
    </Card>
  );
}

function KpiRow({ data }: { data: ForecastResponse }) {
  const f = data.forecast;
  const last = f.periods.length - 1;
  const below = f.firstBelowBufferIndex;
  const withWhatIfs = data.whatIfs.some((w) => w.isEnabled) ? " · with what-ifs" : "";

  return (
    <div className="flex flex-wrap gap-3">
      <OpeningKpi data={data} />
      <Kpi
        testId="kpi-lowest"
        label="Lowest point"
        value={money(f.lowest.cents)}
        sub={`${f.periods[f.lowest.periodIndex].label}${f.lowest.cents < f.bufferCents ? " · below your buffer" : ""}${withWhatIfs}`}
        tone={f.lowest.cents < f.bufferCents ? "bad" : undefined}
      />
      <Kpi
        testId="kpi-buffer"
        label={`Safety buffer ${money(f.bufferCents)}`}
        value={below == null ? "Stays above" : f.periods[below].label}
        sub={below == null ? `for the next ${f.periods.length} ${f.granularity === "month" ? "months" : "fortnights"}` : "first period below it"}
        tone={below == null ? undefined : "bad"}
      />
      <Kpi
        testId="kpi-closing"
        label={`Balance at ${f.periods[last].label}`}
        value={money(f.closingCents[last])}
        sub={`Net ${money(f.closingCents[last] - f.openingBalanceCents)} over the forecast`}
      />
    </div>
  );
}

// ─── Chart ───────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm space-y-0.5">
      <p className="font-semibold">{p.label}</p>
      <p className="text-status-success">In {money(p.in)}</p>
      <p className="text-destructive">Out {money(-p.out)}</p>
      {p.showBoth ? (
        <>
          <p className="font-medium">Balance {money(p.baseline)}</p>
          <p className="font-medium text-primary">With what-ifs {money(p.closing)}</p>
        </>
      ) : (
        <p className="font-medium">Balance {money(p.closing)}</p>
      )}
    </div>
  );
}

function WhatIfChips({ whatIfs }: { whatIfs: WhatIfDefinition[] }) {
  const { toast } = useToast();
  const canEdit = usePermission("business.cashflow", "edit");
  const toggle = useMutation({
    mutationFn: (w: WhatIfDefinition) => apiRequest(`/api/cashflow/what-ifs/${w.id}`, "PATCH", { isEnabled: !w.isEnabled }),
    onSuccess: () => invalidateCashflow(),
    onError: () => toast({ title: "Couldn't switch that what-if", variant: "destructive" }),
  });
  if (whatIfs.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <span className="text-xs text-muted-foreground">What-ifs on the forecast:</span>
      {whatIfs.map((w) => (
        <button
          key={w.id}
          type="button"
          disabled={!canEdit || toggle.isPending}
          onClick={() => toggle.mutate(w)}
          className={cn(
            "h-6 px-2.5 rounded-full border text-xs flex items-center gap-1 transition-colors",
            w.isEnabled ? "bg-primary/10 text-primary border-primary/30" : "text-muted-foreground border-border hover-elevate",
          )}
          data-testid={`chip-whatif-${w.id}`}
        >
          {w.isEnabled && <Check className="h-3 w-3" />}
          {w.name}
        </button>
      ))}
    </div>
  );
}

function ForecastChart({ f, whatIfs }: { f: ForecastResult; whatIfs: WhatIfDefinition[] }) {
  const showBoth = whatIfs.some((w) => w.isEnabled);
  const rows = f.periods.map((p, i) => ({
    label: p.label,
    // A what-if's net for the period joins the in or out bar it pushes.
    in: f.inCents[i] + Math.max(0, f.whatIfCents[i]),
    out: -(f.outCents[i] + Math.min(0, f.whatIfCents[i])),
    closing: f.closingCents[i],
    baseline: f.baselineClosingCents[i],
    showBoth,
  }));
  return (
    <Card className="p-4" data-testid="card-cashflow-chart">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h3 className="text-sm font-semibold">Bank balance and cash movement</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sage" />Cash in</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-coral" />Cash out</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-foreground" />Balance</span>
          {showBoth && (
            <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-primary" />With what-ifs</span>
          )}
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-destructive" />Buffer</span>
        </div>
      </div>
      <WhatIfChips whatIfs={whatIfs} />
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={moneyShort} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <ReferenceLine y={f.bufferCents} stroke="hsl(var(--destructive))" strokeDasharray="5 4" />
            <Bar dataKey="in" fill="hsl(var(--sage))" radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Bar dataKey="out" fill="hsl(var(--coral))" radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Line dataKey="baseline" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} type="linear" isAnimationActive={false} />
            {showBoth && (
              <Line dataKey="closing" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeDasharray="7 5" dot={false} type="linear" isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────

/** Where a payment comes from, when it has a page of its own. */
function sourceHref(e: CashEvent): string | null {
  if (e.source === "invoice" && e.projectId && e.sourceId) return `/projects/${e.projectId}/client-invoices/${e.sourceId}`;
  if (e.source === "bill" && e.sourceId) return e.projectId ? `/projects/${e.projectId}/bills/${e.sourceId}` : `/bills/${e.sourceId}`;
  if ((e.source === "claim" || e.source === "job_cost") && e.projectId) return `/projects/${e.projectId}`;
  return null;
}

/** The payments behind one number, each linked to its source. */
function CellEvents({ events }: { events: CashEvent[] }) {
  const total = events.reduce((s, e) => s + e.amountCents, 0);
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-xs">
        <tbody>
          {events.map((e, i) => {
            const href = sourceHref(e);
            return (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{shortDate(e.date)}</td>
                <td className="py-1.5 pr-3">
                  {href ? (
                    <Link href={href} className="hover:underline decoration-dotted underline-offset-2">{e.label}</Link>
                  ) : (
                    e.label
                  )}
                  {e.overdue && <span className="ml-1.5 text-destructive">overdue</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{money(e.amountCents)}</td>
              </tr>
            );
          })}
        </tbody>
        {events.length > 1 && (
          <tfoot>
            <tr className="border-t border-border">
              <td className="pt-1.5 font-semibold" colSpan={2}>{events.length} payments</td>
              <td className="pt-1.5 text-right tabular-nums font-semibold">{money(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function ValueCell({
  cents,
  events,
  flip,
  className,
  testId,
  showZero,
}: {
  cents: number;
  /** Balances show "$0"; movement rows show "–" for nothing. */
  showZero?: boolean;
  events?: CashEvent[];
  /** Money-out rows read as positive amounts. */
  flip?: boolean;
  className?: string;
  testId?: string;
}) {
  const shown = flip ? -cents : cents;
  const blank = cents === 0 && !showZero;
  const text = blank ? "–" : money(shown);
  const base = cn("px-2 py-1.5 text-right tabular-nums whitespace-nowrap", blank && "text-muted-foreground/50", className);
  if (!events || events.length === 0) {
    return <td className={base} data-testid={testId}>{text}</td>;
  }
  return (
    <td className={base} data-testid={testId}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="hover:underline decoration-dotted underline-offset-2">{text}</button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-3">
          <CellEvents events={events} />
        </PopoverContent>
      </Popover>
    </td>
  );
}

function ForecastGrid({ f }: { f: ForecastResult }) {
  const [showInLines, setShowInLines] = useState(true);
  const [showOutLines, setShowOutLines] = useState(true);
  const [showWhatIfLines, setShowWhatIfLines] = useState(true);

  // events[lineId][periodIndex]
  const eventsByCell = useMemo(() => {
    const map = new Map<string, CashEvent[][]>();
    for (const e of f.events) {
      const i = f.periods.findIndex((p) => e.date >= p.start && e.date <= p.end);
      if (i < 0) continue;
      const row = map.get(e.lineId) ?? f.periods.map(() => []);
      row[i].push(e);
      map.set(e.lineId, row);
    }
    return map;
  }, [f]);

  // The same, pooled by what the total rows add up: in, out, and everything (net).
  const eventsBySection = useMemo(() => {
    // f.events is already in date order.
    const pool = (keep: (e: CashEvent) => boolean) => {
      const row: CashEvent[][] = f.periods.map(() => []);
      for (const e of f.events) {
        if (!keep(e)) continue;
        const i = f.periods.findIndex((p) => e.date >= p.start && e.date <= p.end);
        if (i >= 0) row[i].push(e);
      }
      return row;
    };
    const outIds = new Set(f.lines.filter((l) => l.section === "out").map((l) => l.id));
    return {
      in: pool((e) => e.lineId.startsWith("job:")),
      out: pool((e) => outIds.has(e.lineId)),
      net: pool(() => true),
    };
  }, [f]);

  const inLines = f.lines.filter((l) => l.section === "in");
  const outLines = f.lines.filter((l) => l.section === "out");
  const whatIfLines = f.lines.filter((l) => l.section === "whatif");
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const lineRow = (l: ForecastLine, flip: boolean) => (
    <tr key={l.id} className="border-b border-border/60 hover:bg-muted/40" data-testid={`row-cashflow-${l.id}`}>
      <td className="sticky left-0 bg-card px-3 py-1.5 pl-7 truncate max-w-[240px]">{l.label}</td>
      {l.values.map((v, i) => (
        <ValueCell key={i} cents={v} flip={flip} events={eventsByCell.get(l.id)?.[i]} />
      ))}
      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{money(flip ? -l.totalCents : l.totalCents)}</td>
    </tr>
  );

  const sectionRow = (label: string, open: boolean, toggle: () => void, tone: string) => (
    <tr className="border-b border-border/60 bg-muted">
      <td className="sticky left-0 bg-muted px-3 py-1.5">
        <button type="button" onClick={toggle} className={cn("flex items-center gap-1 text-label font-semibold uppercase tracking-wide", tone)}>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {label}
        </button>
      </td>
      <td colSpan={f.periods.length + 1} />
    </tr>
  );

  return (
    <Card className="overflow-hidden" data-testid="card-cashflow-grid">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">{f.granularity === "month" ? "Month by month" : "Fortnight by fortnight"}</h3>
        <p className="text-xs text-muted-foreground">Click any number to see the payments behind it. All amounts include GST.</p>
      </div>
      <div className="overflow-x-auto dt-autohide-scrollbar">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted border-b border-border text-muted-foreground">
              <th className="sticky left-0 bg-muted px-3 py-2 text-left font-semibold min-w-[220px]" />
              {f.periods.map((p) => (
                <th key={p.key} className="px-2 py-2 text-right font-semibold whitespace-nowrap min-w-[84px]">{p.label}</th>
              ))}
              <th className="px-3 py-2 text-right font-semibold min-w-[96px]">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/60">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-semibold">Opening balance</td>
              {f.openingCents.map((v, i) => <ValueCell key={i} cents={v} showZero className="font-semibold" />)}
              <td />
            </tr>

            {sectionRow("Cash in", showInLines, () => setShowInLines((v) => !v), "text-status-success")}
            {showInLines && inLines.map((l) => lineRow(l, false))}
            {showInLines && inLines.length === 0 && (
              <tr className="border-b border-border/60">
                <td className="sticky left-0 bg-card px-3 py-1.5 pl-7 text-muted-foreground" colSpan={f.periods.length + 2}>
                  No money in yet — tick jobs on the Projects tab.
                </td>
              </tr>
            )}
            <tr className="border-b border-border">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-semibold text-status-success">Total in</td>
              {f.inCents.map((v, i) => <ValueCell key={i} cents={v} events={eventsBySection.in[i]} className="font-semibold text-status-success" />)}
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-status-success">{money(total(f.inCents))}</td>
            </tr>

            {sectionRow("Cash out", showOutLines, () => setShowOutLines((v) => !v), "text-destructive")}
            {showOutLines && outLines.map((l) => lineRow(l, true))}
            <tr className="border-b border-border">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-semibold text-destructive">Total out</td>
              {f.outCents.map((v, i) => <ValueCell key={i} cents={v} flip events={eventsBySection.out[i]} className="font-semibold text-destructive" />)}
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-destructive">{money(-total(f.outCents))}</td>
            </tr>

            {whatIfLines.length > 0 && sectionRow("What-ifs", showWhatIfLines, () => setShowWhatIfLines((v) => !v), "text-primary")}
            {showWhatIfLines && whatIfLines.map((l) => lineRow(l, false))}

            <tr className="border-b border-border/60">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-semibold">Net movement</td>
              {f.netCents.map((v, i) => <ValueCell key={i} cents={v} events={eventsBySection.net[i]} className="font-semibold" />)}
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{money(total(f.netCents))}</td>
            </tr>
            <tr className="bg-muted/50">
              <td className="sticky left-0 bg-muted px-3 py-2 font-bold">Closing balance</td>
              {f.closingCents.map((v, i) => (
                <ValueCell
                  key={i}
                  cents={v}
                  showZero
                  testId={`cell-closing-${i}`}
                  className={cn("font-bold py-2", v < f.bufferCents && "bg-coral-light text-destructive")}
                />
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Warnings ────────────────────────────────────────────────────────────────

function Warnings({ f }: { f: ForecastResult }) {
  const [open, setOpen] = useState(false);
  if (f.warnings.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber/50 bg-amber-light px-3 py-2 text-xs" data-testid="cashflow-warnings">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
        {f.warnings.length} thing{f.warnings.length === 1 ? "" : "s"} to check in this forecast
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5 pl-5 list-disc text-muted-foreground">
          {f.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ForecastTab({ data }: { data: ForecastResponse }) {
  return (
    <div className="flex flex-col gap-4">
      <Warnings f={data.forecast} />
      <KpiRow data={data} />
      <ForecastChart f={data.forecast} whatIfs={data.whatIfs} />
      <ForecastGrid f={data.forecast} />
    </div>
  );
}

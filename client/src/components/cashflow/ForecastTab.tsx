import { useMemo, useState } from "react";
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
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CashEvent, ForecastLine, ForecastResult } from "@shared/cashflow";
import { money, moneyShort, shortDate, type ForecastResponse } from "./cashflowShared";

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

function KpiRow({ data }: { data: ForecastResponse }) {
  const f = data.forecast;
  const last = f.periods.length - 1;
  const openingSub =
    data.opening.source === "xero"
      ? `From Xero · ${data.opening.accounts.filter((a) => a.included).length} account(s)`
      : data.opening.source === "manual"
        ? "Entered in settings"
        : data.opening.error ?? "No balance — set one in settings";
  const below = f.firstBelowBufferIndex;

  return (
    <div className="flex flex-wrap gap-3">
      <Kpi testId="kpi-opening" label="In the bank today" value={money(f.openingBalanceCents)} sub={openingSub} />
      <Kpi
        testId="kpi-lowest"
        label="Lowest point"
        value={money(f.lowest.cents)}
        sub={`${f.periods[f.lowest.periodIndex].label}${f.lowest.cents < f.bufferCents ? " · below your buffer" : ""}`}
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
      <p className="font-medium">Balance {money(p.closing)}</p>
    </div>
  );
}

function ForecastChart({ f }: { f: ForecastResult }) {
  const rows = f.periods.map((p, i) => ({
    label: p.label,
    in: f.inCents[i],
    out: -f.outCents[i],
    closing: f.closingCents[i],
  }));
  return (
    <Card className="p-4" data-testid="card-cashflow-chart">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h3 className="text-sm font-semibold">Bank balance and cash movement</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sage" />Cash in</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-coral" />Cash out</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-foreground" />Balance</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-destructive" />Buffer</span>
        </div>
      </div>
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
            <Line dataKey="closing" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} type="linear" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Grid ────────────────────────────────────────────────────────────────────

/** The payments behind one number. */
function CellEvents({ events }: { events: CashEvent[] }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-xs">
        <tbody>
          {events.map((e, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{shortDate(e.date)}</td>
              <td className="py-1.5 pr-3">
                {e.label}
                {e.overdue && <span className="ml-1.5 text-destructive">overdue</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{money(e.amountCents)}</td>
            </tr>
          ))}
        </tbody>
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

  const inLines = f.lines.filter((l) => l.section === "in");
  const outLines = f.lines.filter((l) => l.section === "out");
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
              {f.inCents.map((v, i) => <ValueCell key={i} cents={v} className="font-semibold text-status-success" />)}
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-status-success">{money(total(f.inCents))}</td>
            </tr>

            {sectionRow("Cash out", showOutLines, () => setShowOutLines((v) => !v), "text-destructive")}
            {showOutLines && outLines.map((l) => lineRow(l, true))}
            <tr className="border-b border-border">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-semibold text-destructive">Total out</td>
              {f.outCents.map((v, i) => <ValueCell key={i} cents={v} flip className="font-semibold text-destructive" />)}
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-destructive">{money(-total(f.outCents))}</td>
            </tr>

            <tr className="border-b border-border/60">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-semibold">Net movement</td>
              {f.netCents.map((v, i) => <ValueCell key={i} cents={v} className="font-semibold" />)}
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
      <ForecastChart f={data.forecast} />
      <ForecastGrid f={data.forecast} />
    </div>
  );
}

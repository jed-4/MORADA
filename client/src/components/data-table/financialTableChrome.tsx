import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Shared theme detection ───────────────────────────────────────────────────
// Subscribe to the `.dark` class on <html> so palettes that need a different
// alpha in dark mode can re-render when the user toggles theme. Kept here so
// every financial table reads light/dark identically.
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// ─── Row banding tints ────────────────────────────────────────────────────────
// Warm muted tint in light mode, subtle foreground overlay in dark mode (where
// --muted ≈ --card so muted-based tints disappear).
export function financialRowTints(isDark: boolean): { zebra: string; category: string } {
  return {
    zebra: isDark ? "hsl(var(--foreground) / 0.05)" : "hsl(var(--muted) / 0.5)",
    category: isDark ? "hsl(var(--foreground) / 0.09)" : "hsl(var(--muted) / 0.85)",
  };
}

// Builds the row style. `--dt-row-bg` is composited over the card so the sticky
// first column stays opaque (no bleed-through on horizontal scroll). See
// .agents/memory/datatable-sticky-row-bg.md for the contract.
export function financialRowBgStyle(tint: string | null): React.CSSProperties {
  if (!tint) {
    return { ["--dt-row-bg"]: "hsl(var(--card))" } as React.CSSProperties;
  }
  return {
    backgroundColor: tint,
    ["--dt-row-bg"]: `linear-gradient(${tint}, ${tint}), hsl(var(--card))`,
  } as React.CSSProperties;
}

// ─── Totals bar ───────────────────────────────────────────────────────────────
export interface FinancialTotalSegment {
  label: string;
  value: string;
  color?: string;
}

export function FinancialTotalsBar({
  segments,
  testId = "budget-totals-bar",
}: {
  segments: FinancialTotalSegment[];
  testId?: string;
}) {
  return (
    <div
      className="flex-shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 border-t-2 border-border bg-[hsl(var(--muted)/0.7)] dark:bg-[hsl(var(--foreground)/0.07)]"
      data-testid={testId}
    >
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Total
      </span>
      <div className="flex items-center flex-wrap justify-end gap-y-1">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className={cn("flex flex-col items-end px-3", i > 0 && "border-l border-border/60")}
            data-testid={`total-${seg.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          >
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground leading-tight">
              {seg.label}
            </span>
            <span className={cn("text-sm font-bold tabular-nums leading-snug", seg.color ?? "text-foreground")}>
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Under / On Track / Over legend ───────────────────────────────────────────
export function FinancialTableLegend() {
  return (
    <div className="flex-shrink-0 flex items-center flex-wrap gap-x-5 gap-y-1 px-3 py-1.5 border-t border-border/50">
      {[
        { color: "hsl(var(--bp-green))", label: "Under" },
        { color: "hsl(var(--muted-foreground) / 0.4)", label: "On Track" },
        { color: "hsl(var(--bp-coral))", label: "Over" },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Monthly Actuals palette ──────────────────────────────────────────────────
// The Monthly Actuals view is a custom div-grid (not a DataTable), so it can't
// use the --dt-row-bg helpers above. It still shares the same theme-aware design
// tokens — every value resolves to a CSS variable so the grid follows the global
// light/dark theme. Muted-row tints get higher alpha in dark mode so the grid
// still reads as banded against the warm dark card surface. Centralized here so
// the financial-table palette has a single home.
export interface MonthlyActualsPalette {
  bg: string;
  white: string;
  purple: string;
  purpleLight: string;
  purpleTint: string;
  coral: string;
  greenTint: string;
  greenNum: string;
  redNum: string;
  border: string;
  text: string;
  textMid: string;
  textLight: string;
  zebraRow: string;
  totalRow: string;
  sectionHdr: string;
  amber: string;
  dotGreen: string;
  dotCoral: string;
  dotGray: string;
}

export function monthlyActualsPalette(isDark: boolean): MonthlyActualsPalette {
  return {
    bg:          'hsl(var(--background))',
    white:       'hsl(var(--card))',
    purple:      'hsl(var(--primary))',
    purpleLight: isDark ? 'hsl(var(--primary) / 0.18)' : 'hsl(var(--primary) / 0.08)',
    purpleTint:  isDark ? 'hsl(var(--primary) / 0.24)' : 'hsl(var(--primary) / 0.12)',
    coral:       'hsl(var(--destructive))',
    greenTint:   'hsl(var(--status-success-bg))',
    greenNum:    'hsl(var(--status-success-fg))',
    redNum:      'hsl(var(--destructive))',
    border:      'hsl(var(--border))',
    text:        'hsl(var(--foreground))',
    textMid:     'hsl(var(--muted-foreground))',
    textLight:   isDark ? 'hsl(var(--muted-foreground) / 0.55)' : 'hsl(var(--muted-foreground) / 0.65)',
    zebraRow:    isDark ? 'hsl(var(--muted) / 0.85)' : 'hsl(var(--muted) / 0.35)',
    totalRow:    isDark ? 'hsl(var(--muted) / 1)'    : 'hsl(var(--muted) / 0.55)',
    sectionHdr:  isDark ? 'hsl(var(--muted) / 0.95)' : 'hsl(var(--muted) / 0.5)',
    amber:       'hsl(var(--amber))',
    dotGreen:    'hsl(var(--status-success-fg))',
    dotCoral:    'hsl(var(--destructive))',
    dotGray:     'hsl(var(--muted-foreground) / 0.35)',
  };
}

// ─── Monthly Actuals confirmation legend ──────────────────────────────────────
// Distinct from FinancialTableLegend (Under/On Track/Over) — this conveys the
// month-confirmation / drift state for the Monthly Actuals grid.
export function MonthlyActualsLegend({ palette }: { palette: MonthlyActualsPalette }) {
  return (
    <div className="flex items-center flex-wrap gap-x-6 gap-y-2 px-4 py-3 border-t border-border/50 bg-card">
      {[
        { color: palette.dotGreen, label: 'Month confirmed' },
        { color: palette.dotCoral, label: 'Cost drifted from Xero — review needed' },
        { color: palette.dotGray,  label: 'Awaiting confirmation' },
        { color: palette.amber,    label: 'Current month (in progress)' },
      ].map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

import { queryClient } from "@/lib/queryClient";
import type { CashflowSettings } from "@shared/schema";
import type { ForecastResult, OpeningBalance, PeriodGranularity } from "@shared/cashflow";

export interface ForecastResponse {
  forecast: ForecastResult;
  opening: OpeningBalance;
  settings: CashflowSettings;
}

export interface SettingsResponse {
  settings: CashflowSettings;
  opening: OpeningBalance;
}

export const forecastKey = (period: PeriodGranularity) => [`/api/cashflow/forecast?period=${period}`];
export const SETTINGS_KEY = ["/api/cashflow/settings"];
export const PROJECTS_KEY = ["/api/cashflow/projects"];
export const EXPENSES_KEY = ["/api/cashflow/expenses"];

/**
 * Every cashflow screen reads from the same numbers, and the app's QueryClient
 * never refetches on its own (staleTime: Infinity) — so any edit invalidates
 * every /api/cashflow query, not just the one it touched.
 */
export function invalidateCashflow() {
  return queryClient.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/cashflow"),
  });
}

const wholeDollars = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/** "$184,320" / "−$2,400" — whole dollars; the forecast is an estimate. */
export function money(cents: number): string {
  const s = wholeDollars.format(Math.abs(cents) / 100);
  return Math.round(cents / 100) < 0 ? `−${s}` : s;
}

/** Axis labels: "$150k". */
export function moneyShort(cents: number): string {
  const d = cents / 100;
  const abs = Math.abs(d);
  const sign = d < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

export const PHASE_LABELS: Record<string, string> = {
  lead: "Lead",
  pre_construction: "Pre-construction",
  construction: "Construction",
};

export const PHASE_CLASSES: Record<string, string> = {
  lead: "bg-muted text-muted-foreground",
  pre_construction: "bg-status-info-bg text-status-info",
  construction: "bg-status-success-bg text-status-success",
};

/** 'YYYY-MM-DD' → "14 Oct 26" without going through a Date's time zone. */
export function shortDate(key: string | null | undefined): string {
  if (!key) return "—";
  const [y, m, d] = key.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${String(y % 100).padStart(2, "0")}`;
}

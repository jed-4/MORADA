import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatCents } from "@shared/money";
import { METER_UNIT, type DueState, type MeterType } from "@shared/assets";

export const ASSETS_KEY = ["/api/assets"] as const;
export const assetKey = (id: string) => ["/api/assets", id] as const;
export const ASSIGNABLE_USERS_KEY = ["/api/users/assignable"] as const;

export interface AssignableUser {
  id: string;
  displayName: string;
}

/** Refresh the register and, when given, one asset's detail. */
export function invalidateAssets(id?: string) {
  queryClient.invalidateQueries({ queryKey: ASSETS_KEY, exact: true });
  if (id) queryClient.invalidateQueries({ queryKey: assetKey(id) });
}

export function money(cents: number | null | undefined): string {
  return cents == null ? "—" : formatCents(cents);
}

/** "12 Mar 26" from 'YYYY-MM-DD'. */
export function shortDate(key: string | null | undefined): string {
  if (!key) return "—";
  const [y, m, d] = key.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${String(y % 100).padStart(2, "0")}`;
}

export function meter(value: number | null | undefined, type: string): string {
  if (value == null || type === "none") return "—";
  return `${value.toLocaleString("en-AU")} ${METER_UNIT[type as MeterType] ?? ""}`.trim();
}

/** "in 12 days", "today", "3 days ago". */
export function relativeDays(days: number | null | undefined): string {
  if (days == null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

// The design system's status tokens: contrast-checked (4.6:1) in light and
// dark. Hard-coded dark text on the -light washes disappeared in dark mode.
const DUE_STYLES: Record<DueState, string> = {
  overdue: "bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))] border-[hsl(var(--status-danger-fg))]/25",
  due_soon: "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))] border-[hsl(var(--status-warning-fg))]/25",
  ok: "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))] border-[hsl(var(--status-success-fg))]/25",
};
const DUE_LABELS: Record<DueState, string> = { overdue: "Overdue", due_soon: "Due soon", ok: "OK" };

export function DueChip({ state, children, className }: { state: DueState; children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", DUE_STYLES[state], className)}
      data-testid={`chip-due-${state}`}
    >
      {children ?? DUE_LABELS[state]}
    </span>
  );
}

/** The server's `{ error }` out of an apiRequest failure ("400: {...}"). */
export function errorText(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  const json = msg.slice(msg.indexOf("{"));
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    /* not JSON */
  }
  return fallback;
}

/** Dollars typed in a form → integer cents, or null for an empty field. */
export const toCents = (dollars: number | null) => (dollars == null ? null : Math.round(dollars * 100));

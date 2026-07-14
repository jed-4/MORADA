/**
 * Single source of truth for task/RFI priority labels and colours.
 * Replaces the ~19 per-file copies of the same map (TaskDetailModal,
 * TaskCard, FocusBlockPanel, widgets, …). Render with
 * `<PriorityBadge>` (components/PriorityBadge.tsx) where a pill is wanted.
 *
 * Colours intentionally match the historical per-file values so this
 * consolidation is visually a no-op; re-theming to Morada tokens is a
 * one-file change here when that decision is made.
 */

export type Priority = "urgent" | "high" | "medium" | "low" | "none";

export interface PriorityStyle {
  label: string;
  /** Foreground/accent colour. */
  color: string;
  /** Soft background tint for pills/chips. */
  bgColor: string;
}

export const priorityConfig: Record<Priority, PriorityStyle> = {
  urgent: { label: "Urgent", color: "#dc2626", bgColor: "rgba(220, 38, 38, 0.1)" },
  high: { label: "High", color: "#f97316", bgColor: "rgba(249, 115, 22, 0.1)" },
  medium: { label: "Medium", color: "#eab308", bgColor: "rgba(234, 179, 8, 0.1)" },
  low: { label: "Low", color: "#22c55e", bgColor: "rgba(34, 197, 94, 0.1)" },
  none: { label: "None", color: "#6b7280", bgColor: "rgba(107, 114, 128, 0.1)" },
};

/** Tolerant lookup: unknown/missing priority falls back to "none". */
export function getPriorityStyle(priority: string | null | undefined): PriorityStyle {
  const key = (priority ?? "none").toLowerCase() as Priority;
  return priorityConfig[key] ?? priorityConfig.none;
}

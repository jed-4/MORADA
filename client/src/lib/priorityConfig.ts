/**
 * Single source of truth for task/RFI priority labels and colours.
 * Replaces the ~19 per-file copies of the same map (TaskDetailModal,
 * TaskCard, FocusBlockPanel, widgets, …). Render with
 * `<PriorityBadge>` (components/PriorityBadge.tsx) where a pill is wanted.
 *
 * Morada-toned scale (approved July 2026): urgent coral, high amber,
 * medium lavender, low sage, none muted — the brand's soft palette in
 * conventional severity order. Values are raw hex (matching the tokens in
 * index.css) rather than CSS variables so react-pdf documents can use the
 * same config.
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
  urgent: { label: "Urgent", color: "#DA988A", bgColor: "#F7E5E2" }, // coral / coral-light
  high: { label: "High", color: "#D4B670", bgColor: "#F7EDDA" }, // amber / amber-light
  medium: { label: "Medium", color: "#A890D4", bgColor: "#F2EEF9" }, // primary / primary-light
  low: { label: "Low", color: "#82C8A2", bgColor: "#E0F5E9" }, // sage / sage-light
  none: { label: "None", color: "#6B6560", bgColor: "#EAEAE8" }, // muted-foreground / border
};

/** Tolerant lookup: unknown/missing priority falls back to "none". */
export function getPriorityStyle(priority: string | null | undefined): PriorityStyle {
  const key = (priority ?? "none").toLowerCase() as Priority;
  return priorityConfig[key] ?? priorityConfig.none;
}

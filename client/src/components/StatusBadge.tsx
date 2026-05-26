import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Compact status pill used across all data-table list views.
 * Maps a free-form status string to one of the soft pastel palettes
 * defined in tailwind config (--status-*).
 *
 * Tone palette:
 *   success (sage)   - paid / approved / complete / accepted / won
 *   warning (amber)  - pending / partial / in-progress / processing / on-hold
 *   info    (lilac)  - sent / draft / awaiting-approval / new / scheduled
 *   danger  (coral)  - overdue / rejected / cancelled / declined / failed / lost / expired
 *   action  (sky)    - action_required / needs-action / requires-action / info
 */

export type StatusTone =
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "action"
  | "neutral";

const TONE_BUCKETS: Record<Exclude<StatusTone, "neutral">, string[]> = {
  success: [
    "paid",
    "approved",
    "complete",
    "completed",
    "accepted",
    "success",
    "won",
    "active",
    "received",
    "signed",
  ],
  warning: [
    "pending",
    "partial",
    "partially_received",
    "in_progress",
    "in-progress",
    "inprogress",
    "processing",
    "awaiting_payment",
    "awaiting-payment",
    "on_hold",
    "on-hold",
    "scheduled",
    "queued",
    "review",
    "submitted",
    "sent_for_review",
    "billed",
    "pending_approval",
    "acknowledged",
    "invoiced",
    "partially_paid",
  ],
  info: [
    "sent",
    "draft",
    "awaiting_approval",
    "awaiting-approval",
    "new",
    "open",
    "issued",
    "quoted",
  ],
  danger: [
    "overdue",
    "rejected",
    "cancelled",
    "canceled",
    "declined",
    "failed",
    "lost",
    "expired",
    "void",
    "voided",
    "deleted",
  ],
  action: [
    "action_required",
    "action-required",
    "needs_action",
    "needs-action",
    "needs_review",
    "needs-review",
    "requires_action",
    "requires-action",
    "needs_attention",
    "follow_up",
    "follow-up",
  ],
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_");
}

export function getStatusTone(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  const key = normalize(status);
  for (const [tone, list] of Object.entries(TONE_BUCKETS) as Array<[StatusTone, string[]]>) {
    if (list.includes(key)) return tone;
  }
  return "neutral";
}

function humanize(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface StatusBadgeProps {
  status: string;
  /** Override the auto-detected tone (e.g. force "danger" on a custom string). */
  tone?: StatusTone;
  /** Custom display label; defaults to a humanized version of `status`. */
  label?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Drop-in replacement for the various per-page `getStatusBadge` helpers.
 * Pass any status string — the component picks the right pastel pill.
 */
export function StatusBadge({
  status,
  tone,
  label,
  className,
  ...rest
}: StatusBadgeProps) {
  const resolvedTone = tone ?? getStatusTone(status);

  if (resolvedTone === "neutral") {
    return (
      <Badge
        variant="secondary"
        className={cn("rounded-[9px] h-[18px] px-[7px] py-0 text-data font-medium", className)}
        data-testid={rest["data-testid"] ?? `badge-status-${normalize(status)}`}
      >
        {label ?? humanize(status)}
      </Badge>
    );
  }

  const variantMap: Record<Exclude<StatusTone, "neutral">,
    "status-success" | "status-warning" | "status-info" | "status-danger" | "status-action"
  > = {
    success: "status-success",
    warning: "status-warning",
    info: "status-info",
    danger: "status-danger",
    action: "status-action",
  };

  return (
    <Badge
      variant={variantMap[resolvedTone]}
      className={className}
      data-testid={rest["data-testid"] ?? `badge-status-${normalize(status)}`}
    >
      {label ?? humanize(status)}
    </Badge>
  );
}

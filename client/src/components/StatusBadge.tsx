import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Compact status pill used across all data-table list views.
 * Maps a free-form status string to one of the soft pastel palettes
 * defined in tailwind config (--status-*).
 *
 * Tone palette — each tone answers "where is this in its life?", not "what
 * colour would look nice":
 *   neutral          - nothing has happened yet: draft
 *   info    (blue)   - it has left the building: sent / issued / quoted / new
 *   warning (amber)  - waiting on someone: pending / partial / in-progress / on-hold
 *   success (sage)   - done: paid / approved / complete / accepted / won
 *   action  (plum)   - needs you: action_required / needs-action / needs-review
 *   danger  (coral)  - bad end state: overdue / rejected / cancelled / failed / expired
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
    "contract",
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
    "working",
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
  // Blue means "it has left the building". A draft has not, so `draft` is
  // deliberately absent — it falls through to `neutral` (grey). Before this it
  // sat here beside `sent`, and the two were the same pill: you could not tell
  // an unsent variation from one already with the client.
  info: [
    "sent",
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
  /**
   * Dynamic colour for field-setting-driven statuses (6-digit hex from the
   * status colour picker). Renders a translucent pill tinted with the colour.
   * Takes precedence over tone detection.
   *
   * @deprecated Prefer `paint`. This path paints `${color}20` as the fill and
   * the raw hex as the label, which routinely lands under 3:1 for a mid-tone
   * picker colour — it is what made chips look wrong in PR #57. Resolve through
   * `resolveStatusChip()` in lib/statusChip.ts instead, which derives a pair
   * with the contrast checked.
   */
  color?: string | null;
  /**
   * A contrast-checked fill/label pair from `deriveChipPaint()`. Takes
   * precedence over everything else.
   */
  paint?: { background: string; foreground: string } | null;
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
  color,
  paint,
  className,
  ...rest
}: StatusBadgeProps) {
  const resolvedTone = tone ?? getStatusTone(status);

  if (paint) {
    return (
      <Badge
        variant="outline"
        className={cn("rounded-[9px] h-[18px] px-[7px] py-0 text-data font-medium border-transparent", className)}
        style={{ backgroundColor: paint.background, color: paint.foreground }}
        data-testid={rest["data-testid"] ?? `badge-status-${normalize(status)}`}
      >
        {label ?? humanize(status)}
      </Badge>
    );
  }

  if (color) {
    // User-configured status colour (field settings). 6-digit hex gets the
    // translucent-tint treatment; anything else falls back to a solid fill.
    const isHex6 = /^#[0-9a-fA-F]{6}$/.test(color);
    return (
      <Badge
        variant="outline"
        className={cn("rounded-[9px] h-[18px] px-[7px] py-0 text-data font-medium", className)}
        style={
          isHex6
            ? { backgroundColor: `${color}20`, color, borderColor: `${color}40` }
            : { backgroundColor: color, color: "#FFFFFF", borderColor: color }
        }
        data-testid={rest["data-testid"] ?? `badge-status-${normalize(status)}`}
      >
        {label ?? humanize(status)}
      </Badge>
    );
  }

  if (resolvedTone === "neutral") {
    // Grey, and specifically NOT `variant="secondary"` — that is the plum wash
    // (`--secondary: 270 36% 95%`), which reads as a tone of its own rather
    // than the absence of one. Neutral means "nothing has happened yet", so it
    // takes the warm grey `--muted` pair, which is defined for both themes.
    return (
      <Badge
        variant="secondary"
        className={cn(
          "rounded-[9px] h-[18px] px-[7px] py-0 text-data font-medium",
          "bg-muted text-muted-foreground",
          className,
        )}
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

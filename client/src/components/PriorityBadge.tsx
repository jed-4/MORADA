import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPriorityStyle } from "@/lib/priorityConfig";

export interface PriorityBadgeProps {
  priority: string | null | undefined;
  /** Custom display label; defaults to the config label (e.g. "Urgent"). */
  label?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Compact priority pill — drop-in replacement for the per-file
 * `priorityConfig`/`getPriorityColor` badge idioms. Uses the shared
 * map in lib/priorityConfig.ts.
 */
export function PriorityBadge({ priority, label, className, ...rest }: PriorityBadgeProps) {
  const style = getPriorityStyle(priority);
  return (
    <Badge
      variant="outline"
      className={cn("rounded-[9px] h-[18px] px-[7px] py-0 text-data font-medium", className)}
      style={{ color: style.color, backgroundColor: style.bgColor, borderColor: style.bgColor }}
      data-testid={rest["data-testid"] ?? `badge-priority-${(priority ?? "none").toLowerCase()}`}
    >
      {label ?? style.label}
    </Badge>
  );
}

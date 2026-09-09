import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The trailing "Add Line" row on a line-item table.
 *
 * Copied in behaviour from the estimates grid (EstimateGroupCard), which has had
 * this pattern the longest and is the one Jed reaches for: a full-width row that
 * is always present at the foot of the table rather than an empty-state button
 * that disappears the moment there is one row. Being permanent is the point —
 * it doubles as the empty state, so the section header does not also need an
 * "Add item" button.
 */
export function AddLineRow({
  onClick,
  label = "Add Line",
  busyLabel = "Adding…",
  busy = false,
  disabled = false,
  className,
  "data-testid": testId,
}: {
  onClick: () => void;
  label?: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "w-full h-10 px-3.5 flex items-center gap-1.5 text-left",
        "border-t border-border/60 transition-colors",
        "text-primary/70 hover:text-primary hover:bg-primary/[0.04]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        className,
      )}
      data-testid={testId}
    >
      <Plus className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
      <span className="text-body-sm font-medium">{busy ? busyLabel : label}</span>
    </button>
  );
}

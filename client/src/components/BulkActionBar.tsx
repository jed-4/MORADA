import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BulkActionBarProps {
  /** Number of currently selected rows. The bar renders only when this is > 0. */
  count: number;
  /** Optional summary suffix shown after "N selected ·" (e.g. "$1,200.00" or "84.5 hrs"). */
  summary?: ReactNode;
  /** Called when the user clears the selection (Clear button or Esc key). */
  onClear: () => void;
  /** Action buttons for the current page (e.g. Change Project, Approve, Delete). */
  children: ReactNode;
  "data-testid"?: string;
}

/**
 * Shared floating-pill bulk action bar used across list pages (Bills, Timesheets).
 * Fixed at the bottom-centre so it never pushes page layout. Pressing Esc clears
 * the selection. Each page supplies its own action buttons via `children`.
 */
export function BulkActionBar({
  count,
  summary,
  onClear,
  children,
  "data-testid": dataTestId,
}: BulkActionBarProps) {
  useEffect(() => {
    if (count <= 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [count, onClear]);

  if (count <= 0) return null;

  return (
    <div
      data-testid={dataTestId}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl shadow-lg border border-border bg-popover text-popover-foreground"
    >
      <span className="text-xs font-medium text-muted-foreground pr-1 border-r border-border mr-1">
        {count} selected
        {summary != null && (
          <> · <span className="text-foreground">{summary}</span></>
        )}
      </span>
      {children}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 ml-0.5"
        onClick={onClear}
        aria-label="Clear selection"
        data-testid="button-bulk-clear"
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

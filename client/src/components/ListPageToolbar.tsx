import { Plus, Search, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface ListPageToolbarAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  "data-testid"?: string;
}

export interface ListPageToolbarProps {
  /** Page title shown on the first row. Pass a string or a richer ReactNode. */
  title: ReactNode;
  /** Optional subtle suffix shown next to the title (e.g. "12 items"). */
  count?: ReactNode;
  /** Primary lilac CTA button on the right of row 1 (e.g. "+ Create Invoice"). */
  primaryAction?: ListPageToolbarAction;
  /** Additional buttons rendered to the LEFT of the primary action. */
  extraActions?: ReactNode;
  /**
   * Optional band rendered between row 1 and the search/filters row.
   * Use this for rich page summaries (e.g. ClientInvoices' finance totals).
   * Receives the full inner width of the card.
   */
  summaryRow?: ReactNode;
  /**
   * Optional second row with search + filter chips + columns picker.
   * If omitted, only the title row (and optional summary) is shown.
   */
  search?: {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    "data-testid"?: string;
  };
  /** Filter chips / popovers placed between search and the right-hand slot. */
  filters?: ReactNode;
  /** Right-aligned slot on row 2 — typically the DataTable column-picker. */
  rightSlot?: ReactNode;
  /**
   * Escape hatch — fully replace row 2 with custom content. Use only when
   * the standard search/filters/rightSlot layout cannot express what you need.
   */
  customRow?: ReactNode;
  /** Render the toolbar without the outer card border (useful when embedded). */
  bare?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Standard list-page header used across Estimates / Bills / Invoices /
 * Variations / RFQs etc.
 *
 * Layout:
 *   Row 1 (h-8):  [ Title  · Count ]                [ extras ] [ + Primary ]
 *   Row 2 (h-9):  [ 🔍 Search ]  [ filters … ]      [ rightSlot ]
 */
export function ListPageToolbar({
  title,
  count,
  primaryAction,
  extraActions,
  summaryRow,
  search,
  filters,
  rightSlot,
  customRow,
  bare = false,
  className,
  ...rest
}: ListPageToolbarProps) {
  const PrimaryIcon = primaryAction?.icon ?? Plus;
  const hasRow2 = !!customRow || !!search || !!filters || !!rightSlot;

  return (
    <div
      className={cn(
        !bare && "mx-3 mt-3 rounded-lg border border-border bg-card overflow-hidden",
        "flex-shrink-0",
        className,
      )}
      data-testid={rest["data-testid"] ?? "list-page-toolbar"}
    >
      {/* Row 1 — title + primary action */}
      <div
        className={cn(
          "h-8 flex items-center justify-between gap-2 px-3",
          hasRow2 && "border-b border-border/50",
        )}
      >
        <h2
          className="text-sm font-semibold truncate flex items-center gap-1.5"
          data-testid="text-page-title"
        >
          <span className="truncate">{title}</span>
          {count !== undefined && count !== null ? (
            <span className="text-muted-foreground font-normal text-xs whitespace-nowrap">
              {count}
            </span>
          ) : null}
        </h2>

        <div className="flex items-center gap-2 flex-shrink-0">
          {extraActions}
          {primaryAction ? (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.loading}
              data-testid={primaryAction["data-testid"] ?? "button-primary-action"}
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 disabled:opacity-60 disabled:pointer-events-none"
            >
              <PrimaryIcon className={cn("w-3 h-3", primaryAction.loading && "animate-spin")} />
              <span>{primaryAction.label}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Optional summary band between row 1 and row 2 */}
      {summaryRow ? (
        <div className={cn(hasRow2 && "border-b border-border/50")}>{summaryRow}</div>
      ) : null}

      {/* Row 2 — search + filters + right slot, OR fully custom content */}
      {customRow ? (
        <div className="px-3 py-1.5">{customRow}</div>
      ) : hasRow2 ? (
        <div className="h-9 flex items-center gap-2 px-3">
          {search ? (
            <div className="relative flex-shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? "Search…"}
                className="h-7 w-56 pl-7 text-xs"
                data-testid={search["data-testid"] ?? "input-search"}
              />
            </div>
          ) : null}

          {filters ? (
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">{filters}</div>
          ) : null}

          {rightSlot ? <div className="ml-auto flex-shrink-0">{rightSlot}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

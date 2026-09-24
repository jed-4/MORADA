import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The shell every client LIST section uses.
 *
 * Deliberately the card-header pattern from the builder's Reviews page — the
 * sharpest of the toolbars (Jed's call): a 3px accent bar, the section name,
 * count chips, then search and controls pushed right, with the body closing
 * the card underneath. One shell means the client's six sections are the same
 * screen with different rows, rather than six layouts.
 *
 * The body scrolls itself. The project shell gives each tab a fixed-height
 * overflow-hidden box, so a page that does not scroll is simply clipped.
 */

export interface ClientChip {
  label: string;
  /** "primary" for a count that is waiting on the client, "alert" for overdue. */
  tone?: "primary" | "alert";
}

export function ClientListPage({
  title,
  chips = [],
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  controls,
  children,
}: {
  title: string;
  chips?: ClientChip[];
  /** Omit both search props to leave the search box out. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Filters and the like, right of the search box. */
  controls?: ReactNode;
  children: ReactNode;
}) {
  const showSearch = search !== undefined && !!onSearchChange;
  return (
    <div className="flex flex-col h-full min-h-0" data-testid={`client-list-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="min-h-8 flex flex-wrap items-center gap-2 px-3 py-1">
          <div
            className="w-[3px] h-3.5 rounded-full flex-shrink-0"
            style={{ background: "hsl(var(--primary))" }}
            aria-hidden="true"
          />
          <span className="text-xs font-medium text-foreground">{title}</span>

          {chips.map((chip) => (
            <span
              key={chip.label}
              className={cn(
                "h-[15px] px-1.5 rounded-full text-[10px] leading-[15px] font-semibold",
                chip.tone === "alert"
                  ? "text-[hsl(var(--coral))] bg-[hsl(var(--coral-light))]"
                  : "bg-primary/10 text-primary",
              )}
              data-testid={`client-chip-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {chip.label}
            </span>
          ))}

          <div className="flex-1" />

          {showSearch && (
            <div className="relative w-40 hidden sm:block">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearchChange!(e.target.value)}
                className="pl-7 pr-6 py-0 h-6 text-xs border"
                data-testid="input-client-search"
              />
              {search && (
                <button
                  onClick={() => onSearchChange!("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {controls}
        </div>
      </div>

      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card min-h-0">
        {children}
      </div>
    </div>
  );
}

/**
 * A filter, sized for the toolbar row. The stock SelectTrigger is h-10 and
 * towers over a 24px search box.
 */
export function ClientToolbarSelect({ children }: { children: ReactNode }) {
  return <div className="[&_button]:h-6 [&_button]:text-xs [&_button]:py-0 [&_button]:px-2">{children}</div>;
}

/** Section heading inside a list body — "Kitchen", "Lock-up stage". */
export function ClientGroupHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/40 border-b">
      <h2 className="text-xs font-semibold">{title}</h2>
      {meta && <span className="text-data text-muted-foreground uppercase tracking-wide">{meta}</span>}
    </div>
  );
}

/**
 * One row of a client list: a state dot, the name and its detail, then the
 * status and value on the right. The schedule established this shape and Jed
 * asked for allowances, variations and invoices to match it.
 */
export function ClientListRow({
  marker,
  title,
  meta,
  status,
  value,
  onClick,
  muted,
  children,
}: {
  marker?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  muted?: boolean;
  children?: ReactNode;
}) {
  const interactive = !!onClick;
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-b last:border-b-0",
        interactive && "cursor-pointer hover-elevate",
      )}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
    >
      {marker}
      <div className="min-w-0 flex-1">
        <div className={cn("font-medium truncate", muted && "text-muted-foreground")}>{title}</div>
        {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
        {children}
      </div>
      {status}
      {value !== undefined && <div className="text-right tabular-nums font-medium shrink-0">{value}</div>}
    </div>
  );
}

/** The tick/empty circle the schedule uses for done vs not done. */
export function ClientMarker({ done, icon }: { done: boolean; icon?: ReactNode }) {
  return (
    <div
      className={cn(
        "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 border",
        done ? "bg-[hsl(var(--sage-light))] border-[hsl(var(--sage))]" : "bg-muted border-border",
      )}
      aria-hidden
    >
      {icon}
    </div>
  );
}

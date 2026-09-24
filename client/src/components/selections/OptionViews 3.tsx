/**
 * The Options block — one implementation, used by a project selection and by a
 * selection template.
 *
 * These two screens showed the same thing in two different ways for no reason
 * anybody chose. SelectionDetail drew `<Card>` in a 2/3/4 grid off
 * `option_attachments`; SelectionTemplateDetail drew a bare `<div>` in a 1/2/3
 * grid off a JSON `imageUrls` array, with its own table, its own toolbar and its
 * own empty state. Same block, same job, two codebases — so a fix to one never
 * reached the other.
 *
 * ── What is shared and what is not ──────────────────────────────────────────
 *
 * SHARED: every pixel. Card, grid columns, hero, badge positions, the price
 * block, the toolbar, the table columns, the empty state.
 *
 * NOT SHARED: what the host can DO. A project option can be approved, locked,
 * and measured against the selection's allowance; a template option can be none
 * of those, because a template has no allowance and nothing to approve. Rather
 * than branch on `isTemplate` inside here — which is how the two drifted in the
 * first place — the host passes the affordances it has:
 *
 *   renderMenu           the kebab's contents. SelectionDetail's carries
 *                        approve/unapprove/save-to-library behind permission
 *                        checks and an AlertDialog; the template's carries
 *                        edit/default/delete. Neither belongs in a view.
 *   renderPrimaryAction  the full-width button under the price. Approve on a
 *                        project; nothing on a template.
 *   chosenLabel          "Client selected" vs "Default" — the same state
 *                        (`isSelectedByClient`) means different things.
 *   allowanceCents       drives the variance figure. Null on a template, which
 *                        is why the figure is absent there rather than zero.
 *
 * Money is cents throughout, matching selection_options.unit_cost. The template
 * blob stores cents too, so no conversion happens at the boundary.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Camera, EyeOff, Eye, Lock, CheckCircle, ExternalLink,
  Package, LayoutGrid, LayoutList, Search, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LineItemTable } from "@/components/LineItemTable";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/**
 * The shape both sides normalise to.
 *
 * A project option arrives as a `selection_options` row plus its
 * `option_attachments`; a template option arrives out of `templateData`. The
 * adapters live next to each host (`optionViewFromSelectionOption`,
 * `optionViewFromTemplateOption` below) so the mapping is one function per
 * source rather than a conditional in every cell.
 */
export interface OptionView {
  id: string;
  name: string;
  brand?: string | null;
  sku?: string | null;
  description?: string | null;
  url?: string | null;
  quantity?: number | null;
  unitType?: string | null;
  /** Cents. */
  unitCost?: number | null;
  /** Cents. Null falls back to unitCost x quantity x markup — see displayCents. */
  totalCost?: number | null;
  markupPercent?: number | null;
  visibleToClient?: boolean | null;
  isSelectedByClient?: boolean | null;
  approvedAt?: string | Date | null;
  approvedBy?: string | null;
  lockedAt?: string | Date | null;
  /** Already resolved to a URL by the adapter; the views never dig for an image. */
  heroUrl?: string | null;
  /** "Matte · 600x600" — the template grid's specs line. Absent on a project. */
  specsLine?: string | null;
}

/**
 * What the card shows as the price.
 *
 * `totalCost` where it is stored, else derived. Kept here rather than in each
 * host because the grid and the table disagreed about it before: the grid
 * derived, the table read `totalCost || 0` and so printed $0.00 for any option
 * whose total had never been written.
 */
export function displayCents(o: OptionView): number | null {
  if (o.totalCost != null) return o.totalCost;
  if (o.unitCost == null) return null;
  return Math.round(o.unitCost * (o.quantity || 1) * (1 + (o.markupPercent || 0) / 100));
}

export interface OptionViewProps {
  options: OptionView[];
  /** Row/card click. The host decides whether that is view or edit. */
  onOpen: (option: OptionView) => void;
  /**
   * The kebab, or nothing to leave it out entirely.
   *
   * `place` is passed because the two views need different triggers: the grid's
   * sits over the hero image and reveals on card hover
   * (`opacity-0 group-hover:opacity-100`), which in a table row has no `group`
   * ancestor and so would stay invisible forever.
   */
  renderMenu?: (option: OptionView, place: "grid" | "table") => ReactNode;
  /** Full-width button under the price in the grid. Grid only. */
  renderPrimaryAction?: (option: OptionView) => ReactNode;
  /** Badge wording for `isSelectedByClient`. */
  chosenLabel?: string;
  /**
   * The selection's allowance in cents. Drives the +/- variance above the price.
   * Null on a template — there is nothing to vary from.
   */
  allowanceCents?: number | null;
  /**
   * True once any option is chosen or approved. The unchosen cards fade back so
   * the decision reads first; without a decision nothing fades, because every
   * card being 55% opaque is just a dim page.
   */
  hasDecision?: boolean;
}

const isApprovedOf = (o: OptionView) => !!o.approvedAt;
const isLockedOf = (o: OptionView) => !!o.lockedAt;

/** Gallery view. */
export function OptionGrid({
  options,
  onOpen,
  renderMenu,
  renderPrimaryAction,
  chosenLabel = "Selected",
  allowanceCents = null,
  hasDecision = false,
}: OptionViewProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {options.map((option) => {
        const isApproved = isApprovedOf(option);
        const isLocked = isLockedOf(option);
        const cents = displayCents(option);
        const showVariance = allowanceCents != null && allowanceCents > 0 && cents != null;
        const variance = showVariance ? cents! - allowanceCents! : null;
        const primary = renderPrimaryAction?.(option);
        return (
          <Card
            key={option.id}
            className={cn(
              "transition-all duration-200 group hover-elevate cursor-pointer",
              option.isSelectedByClient && !isApproved && "ring-1 ring-[hsl(var(--amber))]",
              isApproved && "ring-1 ring-[hsl(var(--sage))]",
              hasDecision && !option.isSelectedByClient && !isApproved &&
                "opacity-55 saturate-50 hover:opacity-100 hover:saturate-100",
            )}
            onClick={() => onOpen(option)}
            data-testid={`card-option-${option.id}`}
          >
            <div className="h-40 bg-muted flex items-center justify-center relative overflow-hidden">
              {option.heroUrl ? (
                <img
                  src={option.heroUrl}
                  alt={option.name}
                  className="w-full h-full object-cover"
                  // A template image is a URL stored in a JSON blob and can rot.
                  // Hiding the broken <img> falls through to the muted panel
                  // rather than a browser's broken-image glyph.
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <Camera className="w-10 h-10 text-muted-foreground/30" />
              )}
              <div className="absolute top-2 left-2 flex flex-col gap-1">
                {option.visibleToClient === false && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                    <EyeOff className="w-3 h-3 mr-1" />
                    Hidden
                  </Badge>
                )}
                {isLocked && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                    <Lock className="w-3 h-3 mr-1" />
                    Locked
                  </Badge>
                )}
              </div>
              <div className="absolute top-2 right-2 flex flex-row items-center gap-1">
                {isApproved ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="bg-[hsl(var(--sage))] text-white text-[10px] px-1.5 py-0.5 no-default-active-elevate cursor-default">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approved
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs">
                        {option.approvedBy || "Admin"}
                        {option.approvedAt ? ` · ${format(new Date(option.approvedAt), "d MMM yyyy")}` : ""}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : option.isSelectedByClient ? (
                  <Badge className="bg-[hsl(var(--amber))] text-white text-[10px] px-1.5 py-0.5 no-default-active-elevate">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {chosenLabel}
                  </Badge>
                ) : null}
                {renderMenu?.(option, "grid")}
              </div>
            </div>
            <CardContent className="px-3 pt-2 pb-2">
              <div className="font-medium text-sm truncate">{option.name}</div>
              {(option.brand || option.sku) && (
                <div className="text-xs text-muted-foreground truncate">
                  {[option.brand, option.sku ? `SKU ${option.sku}` : null].filter(Boolean).join(" · ")}
                </div>
              )}
              {option.specsLine && (
                <div className="text-[10px] text-muted-foreground/80 truncate">{option.specsLine}</div>
              )}
              <div className="mt-1.5 flex items-end justify-between gap-1">
                <span className="text-xs text-muted-foreground">
                  {option.quantity ?? 1} {option.unitType || "ea"}
                </span>
                <div className="text-right">
                  {showVariance && variance !== 0 && (
                    <div className={cn(
                      "text-[10px] font-medium",
                      variance! > 0 ? "text-[hsl(var(--coral))]" : "text-[hsl(var(--sage))]",
                    )}>
                      {variance! > 0 ? "+" : ""}${(Math.abs(variance!) / 100).toFixed(0)}
                    </div>
                  )}
                  {cents != null && (
                    <div className="text-sm font-semibold">${(cents / 100).toFixed(2)}</div>
                  )}
                </div>
              </div>
              {primary}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Table view. Same columns on both sides; the status cell reads what it has. */
export function OptionTable({
  options,
  onOpen,
  renderMenu,
  chosenLabel = "Selected",
}: OptionViewProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <LineItemTable
        size="sm"
        data={options}
        rowKey={(o) => o.id}
        rowTestId={(o) => `row-option-${o.id}`}
        onRowClick={(o) => onOpen(o)}
        rowClassName={(_o, idx) => cn("hover-elevate", idx % 2 === 0 ? "bg-background" : "bg-muted/20")}
        columns={[
          {
            key: "image",
            header: "Image",
            width: 64,
            truncate: false,
            cell: (o) => (
              <div className="w-10 h-10 bg-muted rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                {o.heroUrl ? (
                  <img
                    src={o.heroUrl}
                    alt={o.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Camera className="w-4 h-4 text-muted-foreground/40" />
                )}
              </div>
            ),
          },
          {
            key: "option",
            header: "Option",
            truncate: false,
            cell: (o) => (
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm">{o.name}</span>
                {o.brand && <span className="text-xs text-muted-foreground">{o.brand}</span>}
                {o.url && (
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View product
                  </a>
                )}
              </div>
            ),
          },
          {
            key: "sku",
            header: "SKU",
            cell: (o) => <span className="font-mono text-xs text-muted-foreground">{o.sku || "-"}</span>,
          },
          {
            key: "qty",
            header: "Qty",
            align: "center",
            cell: (o) => `${o.quantity ?? 1} ${o.unitType || "ea"}`,
          },
          {
            key: "unitPrice",
            header: "Unit Price",
            align: "right",
            cell: (o) => (o.unitCost != null ? `$${(o.unitCost / 100).toFixed(2)}` : "—"),
          },
          {
            key: "amount",
            header: "Amount",
            align: "right",
            className: "font-semibold",
            // Was `totalCost || 0`, which printed $0.00 for every option whose
            // total had never been written — most of them, since the grid
            // derived the figure and only the option dialog stores it.
            cell: (o) => {
              const cents = displayCents(o);
              return cents != null ? `$${(cents / 100).toFixed(2)}` : "—";
            },
          },
          {
            key: "status",
            header: "Status",
            align: "center",
            truncate: false,
            cell: (o) => (
              <div className="flex flex-col gap-1 items-center">
                {isApprovedOf(o) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="bg-[hsl(var(--sage))] text-white text-[10px] px-1.5 cursor-default no-default-active-elevate">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approved
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {o.approvedBy || "Admin"}
                        {o.approvedAt ? ` · ${format(new Date(o.approvedAt), "d MMM yyyy")}` : ""}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ) : isLockedOf(o) ? (
                  <Badge variant="outline" className="text-xs">
                    <Lock className="w-3 h-3 mr-1" />
                    Locked
                  </Badge>
                ) : o.isSelectedByClient ? (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {chosenLabel}
                  </Badge>
                ) : o.visibleToClient === false ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    <EyeOff className="w-3 h-3 mr-1" />
                    Hidden
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Eye className="w-3 h-3 mr-1" />
                    Visible
                  </Badge>
                )}
              </div>
            ),
          },
        ]}
        actions={renderMenu ? (o) => renderMenu(o, "table") : undefined}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The whole block: heading, count, view toggle, search, add control, and
// whichever view is on.
//
// A page should not have to reassemble these in the right order to look like
// the other page — which is exactly how one side ended up with an expanding
// search button and the other with a fixed 160px box.
// ─────────────────────────────────────────────────────────────────────────────

export interface OptionsSectionProps extends Omit<OptionViewProps, "options"> {
  options: OptionView[];
  /** Rendered at the right of the heading row — the host's Add control. */
  addControl?: ReactNode;
  /** Shown in the empty state when there is no search term. */
  emptyAction?: ReactNode;
  emptyHint?: string;
  /** Replaces the whole body — the project page's "withheld by permission" notice. */
  bodyOverride?: ReactNode;
  /** Persisted per host so a page remembers which view you left it in. */
  viewStorageKey?: string;
}

export function OptionsSection({
  options,
  addControl,
  emptyAction,
  emptyHint = "Add options for your client to choose from.",
  bodyOverride,
  viewStorageKey,
  ...viewProps
}: OptionsSectionProps) {
  const [view, setView] = useState<"grid" | "table">(() => {
    if (!viewStorageKey) return "grid";
    try {
      return localStorage.getItem(viewStorageKey) === "table" ? "table" : "grid";
    } catch {
      // Private windows and blocked site data both throw here. A remembered
      // view is a convenience, not state worth failing a render over.
      return "grid";
    }
  });
  const setViewPersisted = (v: "grid" | "table") => {
    setView(v);
    try { if (viewStorageKey) localStorage.setItem(viewStorageKey, v); } catch { /* see above */ }
  };

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) =>
      [o.name, o.description, o.brand, o.sku].some((f) => (f ?? "").toLowerCase().includes(t)),
    );
  }, [options, search]);

  const body = bodyOverride ?? (
    filtered.length === 0 ? (
      <div className="text-center py-12 border rounded-lg bg-muted/20">
        <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-medium mb-2">
          {search ? "No matching options" : "No options yet"}
        </h3>
        <p className="text-muted-foreground mb-4">
          {search ? "Try adjusting your search terms." : emptyHint}
        </p>
        {!search && emptyAction}
      </div>
    ) : view === "grid" ? (
      <OptionGrid options={filtered} {...viewProps} />
    ) : (
      <OptionTable options={filtered} {...viewProps} />
    )
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Package className="w-4 h-4" />
          Options ({options.length})
        </h2>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewPersisted("grid")}
              className={cn(
                "h-7 w-7 flex items-center justify-center transition-colors",
                view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate",
              )}
              data-testid="button-view-grid"
              aria-label="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewPersisted("table")}
              className={cn(
                "h-7 w-7 flex items-center justify-center transition-colors",
                view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate",
              )}
              data-testid="button-view-table"
              aria-label="Table view"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center flex-shrink-0">
            <div className={cn(
              "flex items-center transition-all duration-200 overflow-hidden",
              searchOpen ? "w-44" : "w-7",
            )}>
              {searchOpen ? (
                <div className="relative w-full">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    autoFocus
                    placeholder="Search options…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => { if (!search) setSearchOpen(false); }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setSearch(""); setSearchOpen(false); }
                    }}
                    className="h-7 pl-7 pr-6 text-xs"
                    data-testid="input-search-options"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded hover-elevate text-muted-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover-elevate active-elevate-2"
                  data-testid="button-search-options"
                  aria-label="Search options"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {addControl}
        </div>
      </div>
      {body}
    </div>
  );
}

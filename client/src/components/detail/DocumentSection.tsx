import { Children, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The one section header for every document-shaped detail page.
 *
 * It replaces three things that all drew the same idea differently:
 *   - `SectionCard variant="card"`      (AllowanceDetail) — 3px stripe + icon badge
 *   - `SectionCard variant="editorial"` (RFQDetail)       — hairline rule, no card
 *   - a private `SubHeader`             (VariationDetail) — 32px grey bar + dot
 *
 * `SectionCard` still exists because RFQ and Allowance have not been migrated
 * yet. It is not a peer of this component — it is on its way out, and should be
 * DELETED once the last page is off it. Do not add call sites to it.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * Actions live INSIDE a section, never on its collapsed header. At rest a page
 * is a quiet list of names and chevrons; a section's controls appear when it is
 * open. Six sections each carrying an Import button is what made the variation
 * page read as busy.
 *
 * ── The three states ───────────────────────────────────────────────────────
 *   collapsed + empty    34px · dimmed tick · grey label · optional add link
 *   collapsed + content  34px · full tick · dark label · count and summary
 *   expanded             40px · actions appear · body renders
 */

/**
 * What the section holds, not what colour it should be. The mapping is fixed
 * across every detail page so a user learns it once: Bills are amber on the
 * variation page, the allowance page and the bill page.
 */
export type SectionRole =
  /** Money going out to suppliers — bills, purchase orders, vendor credits. */
  | "supplier"
  /** Labour and time — timesheets, labour, schedule. */
  | "labour"
  /** Typed by hand — cost lines, custom lines, manual adjustments. */
  | "manual"
  /** Goes to the client — intro, closing text, T&C, selections, preview. */
  | "client"
  /** Something is wrong — over budget, rejected, disputed. */
  | "exception"
  /** Supporting material — activity, internal notes, attachments. */
  | "meta";

/** Soft wash of the role accent, for a section that needs lifting off the
 *  stack — the summary, which is a conclusion rather than another list. */
const ROLE_TINT: Record<SectionRole, string> = {
  supplier: "hsl(var(--amber) / 0.10)",
  labour: "hsl(var(--teal) / 0.10)",
  manual: "hsl(var(--sage) / 0.10)",
  client: "hsl(var(--primary) / 0.07)",
  exception: "hsl(var(--coral) / 0.10)",
  meta: "hsl(var(--muted) / 0.60)",
};

const ROLE_ACCENT: Record<SectionRole, string> = {
  supplier: "hsl(var(--amber))",
  labour: "hsl(var(--teal))",
  manual: "hsl(var(--sage))",
  client: "hsl(var(--primary))",
  exception: "hsl(var(--coral))",
  meta: "hsl(var(--muted-foreground) / 0.55)",
};

export interface DocumentSectionProps {
  title: string;
  role?: SectionRole;

  /** Count pill beside the title. Hidden at 0 so an empty section stays quiet. */
  count?: number;
  /** A figure or short note beside the title — usually the section's total. */
  summary?: ReactNode;

  /**
   * Controls for the section. Rendered ONLY when expanded — that is the rule
   * this component exists to enforce. Clicks here never toggle the section.
   */
  actions?: ReactNode;

  /**
   * Shown on the right of a collapsed EMPTY section — the one affordance that
   * survives at rest, e.g. "+ Add line". Clicking it does not toggle.
   */
  emptyAction?: ReactNode;

  /**
   * Force the empty treatment. Normally derived: a section is empty when it has
   * no count and no body. Pass this when the body renders a placeholder that
   * `Children.toArray` would otherwise count as content.
   */
  isEmpty?: boolean;

  collapsible?: boolean;
  /** Uncontrolled initial state. Ignored when `open` is supplied. */
  defaultOpen?: boolean;
  /** Controlled. Pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  /** Hairline under the header row. Off for the last section in a card. */
  divider?: boolean;
  /** Wash the header in the role accent. Use sparingly — it is emphasis, and
   *  a page where every section is tinted has none. */
  tint?: boolean;

  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
  "data-testid"?: string;
}

export function DocumentSection({
  title,
  role = "meta",
  count,
  summary,
  actions,
  emptyAction,
  isEmpty,
  collapsible = true,
  defaultOpen = false,
  open,
  onOpenChange,
  divider = true,
  tint = false,
  className,
  bodyClassName,
  children,
  "data-testid": testId,
}: DocumentSectionProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  // A section that cannot be collapsed is, by definition, always showing its
  // body — otherwise `collapsible={false}` silently hides the content with no
  // control to get it back, which is exactly what happened to the variation
  // summary the first time this shipped.
  const isOpen = collapsible ? (open ?? uncontrolled) : true;

  const toggle = () => {
    if (!collapsible) return;
    const next = !isOpen;
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  // Children.toArray drops null/undefined/false, so a body made entirely of
  // unmet conditionals counts as no body rather than one truthy node.
  const hasBody = Children.toArray(children).length > 0;
  const empty = isEmpty ?? (!count && !hasBody);

  // A non-collapsible section is always showing its content, so it never takes
  // the quiet treatment even when its body is still loading.
  const quiet = empty && !isOpen && collapsible;

  const headerInteractive = collapsible
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-expanded": isOpen,
        onClick: toggle,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        },
      }
    : {};

  return (
    <section className={cn("min-w-0", className)} data-testid={testId}>
      <div
        className={cn(
          "flex items-center gap-2.5 px-3.5",
          !tint && "bg-card",
          quiet ? "h-[34px]" : "h-10",
          divider && "border-b border-border/60",
          collapsible && "cursor-pointer hover-elevate",
        )}
        style={tint ? { background: ROLE_TINT[role] } : undefined}
        {...headerInteractive}
      >
        {/* Role tick. Dimmed rather than hidden on an empty section, so the
            column of ticks still reads as a list. */}
        <span
          className={cn("w-1 rounded-sm flex-shrink-0", quiet ? "h-3.5 opacity-35" : "h-4")}
          style={{ background: ROLE_ACCENT[role] }}
          aria-hidden
        />

        <span className={quiet ? "doc-section-label-empty truncate" : "doc-section-label truncate"}>
          {title}
        </span>

        {!!count && (
          <Badge variant="secondary" className="h-4 px-1.5 text-data font-semibold flex-shrink-0">
            {count}
          </Badge>
        )}

        {summary != null && summary !== "" && (
          <span className="doc-body-muted truncate">{summary}</span>
        )}

        <span className="flex-1" />

        {/* The rule, enforced: actions only exist while the section is open. */}
        {isOpen && actions && (
          <div
            className="flex items-center gap-1.5 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}

        {quiet && emptyAction && (
          <div
            className="flex items-center flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {emptyAction}
          </div>
        )}

        {collapsible &&
          (isOpen ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
          ))}
      </div>

      {isOpen && hasBody && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}

/**
 * The card that groups sections. Chrome is spent once per group rather than
 * once per section — a page where every block is a card has no hierarchy left
 * to mark the one block that matters.
 */
export function DocumentCard({
  children,
  className,
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn("rounded-[10px] border border-border bg-card overflow-hidden", className)}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

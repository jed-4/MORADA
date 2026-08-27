import { Children, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The section card used by the detail pages: a 3px left accent stripe, an icon
 * badge, and a title/subtitle pair over a divider.
 *
 * This visual is the one CLAUDE.md documents ("Section cards use a 3px left
 * accent border in the section colour"). It lived as a private component inside
 * AllowanceDetail while the RFQ pages used a denser dot-header version of this
 * file, which is why the two pages did not look like the same product. Promoted
 * here so there is one card; the collapse/count/actions API the RFQ pages rely
 * on is preserved.
 *
 * `accent` names a Morada design token (see client/src/index.css), not a raw
 * colour, so section colours stay consistent across pages.
 */
export type SectionAccent =
  | "primary"
  | "amber"
  | "teal"
  | "sage"
  | "coral"
  | "muted";

interface AccentPaint {
  /** The 3px stripe and the icon glyph. */
  stripe: string;
  /** The icon badge fill — the token's -light pair, which is defined for both themes. */
  iconBg: string;
}

const ACCENT_PAINT: Record<SectionAccent, AccentPaint> = {
  primary: { stripe: "hsl(var(--primary))", iconBg: "hsl(var(--primary-light))" },
  amber: { stripe: "hsl(var(--amber))", iconBg: "hsl(var(--amber-light))" },
  teal: { stripe: "hsl(var(--teal))", iconBg: "hsl(var(--teal-light))" },
  sage: { stripe: "hsl(var(--sage))", iconBg: "hsl(var(--sage-light))" },
  coral: { stripe: "hsl(var(--coral))", iconBg: "hsl(var(--coral-light))" },
  muted: { stripe: "hsl(var(--muted-foreground) / 0.5)", iconBg: "hsl(var(--muted))" },
};

export interface SectionCardProps {
  title: string;
  /**
   * "card" is the bordered card with the 3px accent stripe and icon badge that
   * CLAUDE.md prescribes, still used by the allowance detail page.
   * "editorial" drops the card chrome entirely — a small uppercase title over a
   * hairline rule, no stripe, no badge — so a page made almost entirely of
   * sections reads as a document rather than a wall of tinted panels.
   */
  variant?: "card" | "editorial";
  /** One line under the title explaining what the section is for. */
  subtitle?: string;
  /**
   * Glyph for the badge beside the title — a short string ("$", "S") or a
   * lucide icon. Omitted renders the title without a badge.
   */
  icon?: ReactNode;
  accent?: SectionAccent;
  /** Count pill beside the title. Hidden when 0 so empty sections stay quiet. */
  count?: number;
  /** Controls in the header, right-aligned. Clicks here never toggle collapse. */
  actions?: ReactNode;
  children?: ReactNode;

  collapsible?: boolean;
  /** Uncontrolled initial state. Ignored when `collapsed` is supplied. */
  defaultCollapsed?: boolean;
  /** Controlled collapse. Pair with onCollapsedChange. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;

  className?: string;
  bodyClassName?: string;
  "data-testid"?: string;
}

export function SectionCard({
  title,
  variant = "card",
  subtitle,
  icon,
  accent = "primary",
  count,
  actions,
  children,
  collapsible = false,
  defaultCollapsed = false,
  collapsed,
  onCollapsedChange,
  className,
  bodyClassName,
  "data-testid": testId,
}: SectionCardProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? uncontrolled;

  const toggle = () => {
    if (!collapsible) return;
    const next = !isCollapsed;
    if (collapsed === undefined) setUncontrolled(next);
    onCollapsedChange?.(next);
  };

  const paint = ACCENT_PAINT[accent];
  // Children.toArray drops null/undefined/false, so a body made entirely of
  // unmet conditionals collapses to an empty list rather than a truthy node.
  const hasBody = Children.toArray(children).length > 0;

  const headerInteractive = collapsible
    ? {
        role: "button" as const,
        tabIndex: 0,
        "aria-expanded": !isCollapsed,
        onClick: toggle,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        },
      }
    : {};

  if (variant === "editorial") {
    return (
      <section className={cn("min-w-0", className)} data-testid={testId}>
        <div
          className={cn(
            "flex items-end justify-between gap-2 pb-1.5 border-b border-border",
            collapsible && "cursor-pointer",
          )}
          {...headerInteractive}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {title}
              </h3>
              {!!count && (
                <Badge variant="secondary" className="text-xs h-4 px-1.5 flex-shrink-0">
                  {count}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {actions && (
              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {actions}
              </div>
            )}
            {collapsible &&
              (isCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ))}
          </div>
        </div>
        {!isCollapsed && hasBody && <div className={bodyClassName}>{children}</div>}
      </section>
    );
  }

  return (
    <Card className={cn("relative rounded-xl overflow-hidden", className)} data-testid={testId}>
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: paint.stripe }}
        aria-hidden
      />
      <div className="px-5 py-4 pl-6">
        <div
          className={cn(
            // Deliberately not flex-wrap: in the 320px detail rail a long
            // title/subtitle would wrap the actions onto their own line, which
            // stranded the Reminders switch under its own card. The title block
            // truncates instead.
            "flex items-center justify-between gap-2",
            collapsible && "cursor-pointer",
          )}
          {...headerInteractive}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon != null && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: paint.iconBg, color: paint.stripe }}
                aria-hidden
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                {!!count && (
                  <Badge variant="secondary" className="text-xs h-4 px-1.5 flex-shrink-0">
                    {count}
                  </Badge>
                )}
              </div>
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Stops action clicks from toggling the section. A previous version
                of this passed onClick to a Radix <Select>, which is not a DOM
                prop, so opening the dropdown also collapsed the card. */}
            {actions && (
              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {actions}
              </div>
            )}
            {collapsible &&
              (isCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              ))}
          </div>
        </div>

        {/* A trailing rule under nothing reads as a missing body rather than a
            closed section, so the divider follows the content — not just the
            collapse state. Sections whose body is entirely conditional (a card
            that is only a header plus a switch until the switch is on) render
            as header-only rather than header-plus-empty-rule. */}
        {!isCollapsed && hasBody && (
          <>
            <div className="mt-3 border-t border-border" />
            <div className={bodyClassName}>{children}</div>
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * A sub-section inside a SectionCard — one shade quieter than the card header.
 */
export function SectionSubHeader({
  title,
  actions,
  className,
}: {
  title: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-8 flex items-center justify-between px-3 gap-2 border-b border-border/30 bg-muted/20",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground font-medium">{title}</span>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}

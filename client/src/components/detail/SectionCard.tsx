import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The card-with-a-coloured-dot-header used by the detail pages.
 *
 * This pattern was hand-rolled 27 times across RFQDetail and
 * ClientInvoiceDetail and absent entirely from BillDetail, VariationDetail,
 * AllowanceDetail and PurchaseOrderDetail — so the six detail pages did not
 * look like the same product. Extracted here as the first shared piece; new
 * detail work should use it and the others migrate onto it over time.
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

const ACCENT_CLASS: Record<SectionAccent, string> = {
  primary: "bg-primary/80",
  amber: "bg-amber/70",
  teal: "bg-teal/70",
  sage: "bg-sage/70",
  coral: "bg-coral/70",
  muted: "bg-muted-foreground/40",
};

export interface SectionCardProps {
  title: string;
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

  return (
    <Card className={cn("overflow-hidden", className)} data-testid={testId}>
      <div
        className={cn(
          "h-8 flex items-center justify-between px-3 gap-2 border-b border-border/50 bg-muted/40",
          collapsible && "cursor-pointer hover-elevate",
        )}
        onClick={collapsible ? toggle : undefined}
        {...(collapsible
          ? {
              role: "button",
              tabIndex: 0,
              "aria-expanded": !isCollapsed,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle();
                }
              },
            }
          : {})}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", ACCENT_CLASS[accent])} />
          <span className="text-xs font-medium truncate">{title}</span>
          {!!count && (
            <Badge variant="secondary" className="text-xs h-4 px-1.5">
              {count}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
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

      {!isCollapsed && <div className={bodyClassName}>{children}</div>}
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

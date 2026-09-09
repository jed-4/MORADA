import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoneyStrip, type MoneyStripItem } from "./MoneySummary";

/**
 * The header card for a document-shaped detail page: an identity row (back,
 * number, status, context, actions) over a strip of the figures that matter.
 *
 * Distinct from `DetailPageHeader`, which is the flush 36px application bar
 * used where a page has no money to state. This one is a card, sits inside the
 * scrolling column, and carries the strip. A page uses one or the other.
 *
 * The strip is the part worth having in one place. Before it, the variation
 * page rendered `Subtotal $1,019.09 | GST $101.91 | Total $1,121` as three
 * figures at one size, one weight and one colour — the total, which is the
 * number the document exists to state, was styled like a footnote.
 */
export interface DocumentHeaderProps {
  /** Business-level list path, e.g. "/variations". Project context is re-applied. */
  backTo?: string;
  projectId?: string | null;
  /** Overrides `backTo` — for a page that has unsaved-changes handling. */
  onBack?: () => void;

  /** The document's number or name — VAR-001, RFQ-014. */
  title: string;
  /** Status pill. Pass a `<StatusBadge />`. */
  status?: ReactNode;
  /** Quiet context to the right of the status — the project, the estimate. */
  context?: string | null;

  /** Secondary buttons. */
  actions?: ReactNode;
  /** The one filled button, rendered last. */
  primaryAction?: ReactNode;

  /** Figures under the identity row. Omit for a document with no money. */
  strip?: MoneyStripItem[];
  /** The headline figure, pushed right. */
  headline?: { label: string; value: string; className?: string };

  className?: string;
  "data-testid"?: string;
}

export function DocumentHeader({
  backTo,
  projectId,
  onBack,
  title,
  status,
  context,
  actions,
  primaryAction,
  strip,
  headline,
  className,
  "data-testid": testId,
}: DocumentHeaderProps) {
  const [, setLocation] = useLocation();

  const goBack = () => {
    if (onBack) return onBack();
    if (!backTo) return;
    // Back from a project-scoped record returns to that project's list, not the
    // business-level one — losing project context on the way out was a real
    // complaint about the RFQ pages.
    setLocation(projectId ? `/projects/${projectId}${backTo}` : backTo);
  };

  return (
    <div
      className={cn("rounded-[10px] border border-border bg-card overflow-hidden", className)}
      data-testid={testId}
    >
      <div
        className={cn(
          "h-11 px-3.5 flex items-center gap-2.5",
          (strip || headline) && "border-b border-border/60",
        )}
      >
        {(backTo || onBack) && (
          <button
            type="button"
            onClick={goBack}
            className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
            aria-label="Back"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        )}

        <span className="doc-title truncate" data-testid="text-detail-title">
          {title}
        </span>

        {status}

        {context && <span className="doc-body-muted truncate">{context}</span>}

        <span className="flex-1" />

        {actions && <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>}
        {primaryAction}
      </div>

      {(strip || headline) && <MoneyStrip items={strip ?? []} headline={headline} />}
    </div>
  );
}

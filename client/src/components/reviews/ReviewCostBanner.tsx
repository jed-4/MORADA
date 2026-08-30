import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@shared/money";
import {
  costImpactBanner,
  type ReviewCostImpact,
  type ReviewCostEstimate,
} from "@shared/reviewCostImpact";

/**
 * The ONE cost-impact banner.
 *
 * Cost impact is a single field with three states, so exactly one banner can
 * ever render and `none` renders nothing at all. The copy comes from
 * shared/reviewCostImpact.ts — the same module the server reads when it freezes
 * the wording into an approval — so what the builder sees here and what a
 * client agreed to can never drift apart.
 *
 * The spec calls for orange/red; those map onto the Morada tokens (--amber,
 * --coral) rather than raw hex, so the banner follows the theme like every
 * other tinted surface.
 */

const TONE_PAINT = {
  orange: { bg: "hsl(var(--amber-light))", stripe: "hsl(var(--amber))", icon: Info },
  red: { bg: "hsl(var(--coral-light))", stripe: "hsl(var(--coral))", icon: AlertTriangle },
} as const;

/** Renders the estimated impact line: an amount, a range, or "TBC". */
function estimateLine(estimate: ReviewCostEstimate): string | null {
  if (!estimate.mode) return null;
  if (estimate.mode === "tbc") return "Estimated impact: to be confirmed";
  if (estimate.mode === "amount" && estimate.amountCents != null) {
    return `Estimated impact: ${formatCents(estimate.amountCents)}`;
  }
  if (estimate.mode === "range" && estimate.minCents != null && estimate.maxCents != null) {
    return `Estimated impact: ${formatCents(estimate.minCents)} – ${formatCents(estimate.maxCents)}`;
  }
  return null;
}

export interface ReviewCostBannerProps {
  costImpact: ReviewCostImpact | null | undefined;
  estimate?: ReviewCostEstimate | null;
  /**
   * Wording frozen into an approval. When supplied it WINS over the live copy:
   * a historic decision must always read back as what the client was shown,
   * even after the banner text is reworded.
   */
  frozenText?: string | null;
  className?: string;
}

export function ReviewCostBanner({
  costImpact,
  estimate,
  frozenText,
  className,
}: ReviewCostBannerProps) {
  const banner = costImpactBanner(costImpact);
  if (!banner) return null;

  const paint = TONE_PAINT[banner.tone];
  const Icon = paint.icon;
  const text = frozenText ?? banner.text;
  const line = estimate ? estimateLine(estimate) : null;

  return (
    <div
      className={cn("rounded-md border-l-[3px] px-3 py-2.5 flex items-start gap-2.5", className)}
      style={{ backgroundColor: paint.bg, borderLeftColor: paint.stripe }}
      data-testid={`review-cost-banner-${costImpact}`}
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: paint.stripe }} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium leading-snug text-foreground">{text}</p>
        {line && <p className="text-xs text-muted-foreground">{line}</p>}
      </div>
    </div>
  );
}

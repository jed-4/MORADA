import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2 } from "lucide-react";
import {
  fmtPrice,
  foundingPrice,
  planHighlights,
  planPrice,
  type BillingCycle,
  type PlansResponse,
} from "@/lib/plans";

/**
 * Public pricing. Reads the same catalogue the signed-in plan chooser uses
 * (via the unauthenticated /public-plans variant) so the numbers advertised
 * here can't drift from what people are actually charged. The founding-member
 * banner only appears while the programme is configured and spots remain.
 */
export function PricingSection({ className = "mt-24" }: { className?: string }) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  const { data, isLoading } = useQuery<PlansResponse>({
    queryKey: ["/api/billing/public-plans"],
  });

  const plans = data?.plans ?? [];
  const foundingOffer = data?.foundingOffer ?? null;

  return (
    <div className={className} id="pricing">
      <h2 className="text-center text-3xl font-bold text-foreground" data-testid="text-pricing-title">
        Simple pricing that grows with you
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground" data-testid="text-pricing-subtitle">
        Every plan starts with a 14-day free trial. No credit card required, cancel any time.
      </p>

      <div className="mt-8 flex items-center justify-center">
        <div className="inline-flex items-center gap-1 rounded-md border p-1" role="tablist" aria-label="Billing cycle">
          <Button
            type="button"
            variant={cycle === "monthly" ? "default" : "ghost"}
            size="sm"
            onClick={() => setCycle("monthly")}
            data-testid="button-pricing-cycle-monthly"
          >
            Monthly
          </Button>
          <Button
            type="button"
            variant={cycle === "annual" ? "default" : "ghost"}
            size="sm"
            onClick={() => setCycle("annual")}
            data-testid="button-pricing-cycle-annual"
          >
            Annual
            <Badge variant="secondary" className="ml-2">2 months free</Badge>
          </Button>
        </div>
      </div>

      {foundingOffer && (
        <Card className="mx-auto mt-6 max-w-2xl p-4" data-testid="note-founding-offer">
          <p className="text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Founding member offer</span>
            {" — "}the first {foundingOffer.limit} builders to subscribe get their first
            month free and Studio at half price for life.{" "}
            <span className="text-foreground">
              {foundingOffer.spotsLeft} of {foundingOffer.limit} spots left.
            </span>
          </p>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16" data-testid="pricing-loading">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const price = planPrice(plan, cycle);
            const founding = foundingPrice(plan, cycle, foundingOffer);
            const effective = founding ?? price;
            const perMonth = cycle === "annual" ? Math.round(effective / 12) : effective;
            return (
              <Card
                key={plan.key}
                className={`relative flex flex-col p-6 ${plan.mostPopular ? "border-primary ring-1 ring-primary" : ""}`}
                data-testid={`card-pricing-${plan.key}`}
              >
                {founding !== null ? (
                  <Badge className="absolute -top-2 right-4" data-testid="badge-pricing-founding">
                    Founding price
                  </Badge>
                ) : (
                  plan.mostPopular && <Badge className="absolute -top-2 right-4">Most Popular</Badge>
                )}
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

                <div className="mt-4">
                  <div className="flex items-baseline gap-1">
                    {founding !== null && (
                      <span className="text-sm text-muted-foreground line-through">
                        ${fmtPrice(price)}
                      </span>
                    )}
                    <span className="text-3xl font-bold text-foreground">${fmtPrice(effective)}</span>
                    <span className="text-sm text-muted-foreground">
                      /{cycle === "monthly" ? "mo" : "yr"}
                    </span>
                  </div>
                  {cycle === "annual" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      ${perMonth.toLocaleString()}/mo billed annually
                    </p>
                  )}
                  {founding !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Half price for life for founding members
                    </p>
                  )}
                </div>

                <ul className="mt-6 flex-1 space-y-2">
                  {planHighlights(plan.limits).map((h) => (
                    <li key={h} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{h}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>${plan.limits.extraUserPriceMonthly}/mo per extra user</span>
                  </li>
                </ul>

                <Button
                  className="mt-6 w-full"
                  variant={plan.mostPopular ? "default" : "outline"}
                  onClick={() => (window.location.href = "/auth")}
                  data-testid={`button-pricing-${plan.key}`}
                >
                  Start free trial
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground" data-testid="text-pricing-footnote">
        All prices in AUD. You can change or cancel your plan any time.
      </p>
    </div>
  );
}

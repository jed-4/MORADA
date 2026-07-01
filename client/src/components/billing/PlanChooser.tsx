import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2 } from "lucide-react";

export type BillingCycle = "monthly" | "annual";

interface PlanCard {
  key: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  mostPopular: boolean;
  limits: {
    activeProjects: number;
    fullUsers: number;
    storageGB: number;
    extraUserPriceMonthly: number;
  };
}

interface PlansResponse {
  plans: PlanCard[];
  stripeConfigured: boolean;
}

function fmtLimit(n: number): string {
  return n === -1 ? "Unlimited" : String(n);
}

/**
 * Presents the four plan tiers with a monthly/annual toggle. Clicking a plan
 * starts a Stripe Checkout session and redirects the browser to it. Used both
 * inside the paywall (PlanGate) and the billing settings page.
 */
export function PlanChooser({
  currentPlan,
  ctaLabel = "Choose plan",
}: {
  currentPlan?: string | null;
  ctaLabel?: string;
}) {
  const { toast } = useToast();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PlansResponse>({
    queryKey: ["/api/billing/plans"],
  });

  const subscribe = async (planKey: string) => {
    setPendingKey(planKey);
    try {
      const res = await apiRequest("/api/billing/create-checkout-session", "POST", {
        planKey,
        billingCycle: cycle,
      });
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      throw new Error("No checkout link was returned.");
    } catch (e: any) {
      toast({
        title: "Couldn't start checkout",
        description: e?.payload?.message || e?.message || "Please try again in a moment.",
        variant: "destructive",
      });
      setPendingKey(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10" data-testid="plans-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  if (!data.stripeConfigured) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground" data-testid="text-billing-unavailable">
          Online billing isn't switched on yet. Please contact support to choose or
          change your plan.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={cycle === "monthly" ? "default" : "outline"}
          onClick={() => setCycle("monthly")}
          data-testid="button-cycle-monthly"
        >
          Monthly
        </Button>
        <Button
          size="sm"
          variant={cycle === "annual" ? "default" : "outline"}
          onClick={() => setCycle("annual")}
          data-testid="button-cycle-annual"
        >
          Annual
        </Button>
        <span className="text-xs text-muted-foreground">2 months free on annual</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.plans.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const price = cycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
          const suffix = cycle === "annual" ? "/yr" : "/mo";
          return (
            <Card key={plan.key} className="flex flex-col gap-3 p-4" data-testid={`plan-card-${plan.key}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{plan.name}</h3>
                {plan.mostPopular && <Badge>Popular</Badge>}
              </div>
              <div>
                <span className="text-2xl font-semibold">${price}</span>
                <span className="text-sm text-muted-foreground">{suffix} AUD</span>
              </div>
              <ul className="flex-1 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-foreground" />
                  {fmtLimit(plan.limits.activeProjects)} active projects
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-foreground" />
                  {fmtLimit(plan.limits.fullUsers)} full users
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-foreground" />
                  {fmtLimit(plan.limits.storageGB)} GB storage
                </li>
              </ul>
              {isCurrent ? (
                <Button size="sm" variant="outline" disabled data-testid={`button-current-${plan.key}`}>
                  Current plan
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => subscribe(plan.key)}
                  disabled={pendingKey !== null}
                  data-testid={`button-subscribe-${plan.key}`}
                >
                  {pendingKey === plan.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    ctaLabel
                  )}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

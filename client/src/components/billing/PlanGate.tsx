import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlanChooser } from "./PlanChooser";

interface BillingStatus {
  planStatus: string | null;
  trialEndsAt: string | null;
  plan: string | null;
  chosenPlan: string | null;
  isOwner: boolean;
  blocked: boolean;
  stripeConfigured: boolean;
}

const PORTAL_PREFIXES = ["/portal/", "/auth", "/reset-password", "/privacy", "/terms", "/billing/"];

/**
 * Global paywall. When the signed-in user's company no longer has an active
 * plan or live trial, this renders a non-dismissible dialog over the whole app.
 * The owner can pick a plan on the spot; everyone else is asked to contact the
 * owner. Renders nothing (no overlay) while the plan is healthy.
 */
export function PlanGate() {
  const { isAuthenticated, logout } = useAuth();
  const [location] = useLocation();

  const onPublicRoute = PORTAL_PREFIXES.some((p) => location.startsWith(p));

  const { data } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    enabled: isAuthenticated && !onPublicRoute,
    refetchInterval: 60_000,
  });

  if (!data?.blocked || onPublicRoute) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-w-3xl"
        hideCloseButton
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        data-testid="dialog-paywall"
      >
        <DialogHeader>
          <DialogTitle>Your trial has ended</DialogTitle>
          <DialogDescription>
            {data.isOwner
              ? "Choose a plan to keep using Morada. You can change or cancel any time."
              : "Access is paused until your account owner chooses a plan. Please ask them to set one up."}
          </DialogDescription>
        </DialogHeader>

        {data.isOwner ? (
          <PlanChooser currentPlan={data.plan} ctaLabel="Subscribe" />
        ) : (
          <div className="flex justify-end">
            <Button variant="outline" onClick={logout} data-testid="button-paywall-logout">
              Sign out
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

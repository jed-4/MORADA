import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";

/**
 * Landing page Stripe Checkout redirects back to. Renders success or cancelled
 * state based on the current path (/billing/success or /billing/cancelled).
 */
export default function BillingResult() {
  const [location] = useLocation();
  const success = location.startsWith("/billing/success");

  useEffect(() => {
    // Refresh plan state so the paywall/settings reflect the new subscription.
    queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  }, []);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          {success ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-foreground" />
              <div>
                <h1 className="text-lg font-semibold">You're all set</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Thanks for subscribing. Your plan is now active.
                </p>
              </div>
            </>
          ) : (
            <>
              <XCircle className="h-12 w-12 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-semibold">Checkout cancelled</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  No charge was made. You can choose a plan whenever you're ready.
                </p>
              </div>
            </>
          )}
          <Link href="/">
            <Button data-testid="button-billing-continue">Continue to Morada</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

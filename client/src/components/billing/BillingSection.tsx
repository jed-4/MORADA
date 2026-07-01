import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { PlanChooser } from "./PlanChooser";

interface Summary {
  plan: string;
  planName: string;
  billingCycle: string;
  planStatus: string | null;
  trialEndsAt: string | null;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  limits: {
    activeProjects: number;
    fullUsers: number;
    storageGB: number;
    extraUserPriceMonthly: number;
  };
  usage: {
    activeProjects: number;
    fullUsers: number;
    storageUsedGB: number | null;
  };
  stripeConfigured: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function statusLabel(status: string | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (status) {
    case "active":
      return { label: "Active", variant: "default" };
    case "trialing":
    case "trial":
      return { label: "Trial", variant: "secondary" };
    case "past_due":
      return { label: "Payment overdue", variant: "destructive" };
    case "cancelled":
    case "canceled":
      return { label: "Cancelled", variant: "destructive" };
    case "expired":
      return { label: "Expired", variant: "destructive" };
    default:
      return { label: status || "Unknown", variant: "outline" };
  }
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const atLimit = !unlimited && used >= limit;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className={atLimit ? "font-medium text-destructive" : "text-muted-foreground"}>
          {used} / {unlimited ? "Unlimited" : limit}
        </span>
      </div>
      {!unlimited && <Progress value={pct} />}
    </div>
  );
}

export function BillingSection() {
  const { toast } = useToast();
  const [showChange, setShowChange] = useState(false);

  const { data, isLoading, error } = useQuery<Summary>({
    queryKey: ["/api/billing/summary"],
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("/api/billing/cancel", "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
      toast({
        title: "Subscription cancelled",
        description: "Your plan will stay active until the end of the current period.",
      });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't cancel",
        description: e?.payload?.message || e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10" data-testid="billing-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    const forbidden = (error as any)?.status === 403;
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-billing-error">
            {forbidden
              ? "Only the account owner can view and manage billing."
              : "We couldn't load your billing details. Please try again shortly."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const status = statusLabel(data.planStatus);

  return (
    <div className="space-y-6" data-testid="section-billing">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div className="flex items-center gap-2">
            <CardTitle>{data.planName} plan</CardTitle>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          {data.stripeConfigured && (
            <Button size="sm" onClick={() => setShowChange((s) => !s)} data-testid="button-change-plan">
              {showChange ? "Hide plans" : "Change plan"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Billing cycle</span>
              <div className="capitalize">{data.billingCycle}</div>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">
                {data.planStatus === "trialing" || data.planStatus === "trial"
                  ? "Trial ends"
                  : data.cancelAtPeriodEnd
                    ? "Access ends"
                    : "Renews"}
              </span>
              <div>
                {data.planStatus === "trialing" || data.planStatus === "trial"
                  ? fmtDate(data.trialEndsAt)
                  : fmtDate(data.renewalDate)}
              </div>
            </div>
          </div>

          {data.cancelAtPeriodEnd && (
            <p className="text-sm text-destructive" data-testid="text-cancel-pending">
              Your subscription is set to cancel at the end of the current period.
            </p>
          )}

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Usage</h4>
            <UsageRow label="Active projects" used={data.usage.activeProjects} limit={data.limits.activeProjects} />
            <UsageRow label="Full users" used={data.usage.fullUsers} limit={data.limits.fullUsers} />
          </div>
        </CardContent>
      </Card>

      {showChange && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a different plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanChooser currentPlan={data.plan} ctaLabel="Switch to this plan" />
          </CardContent>
        </Card>
      )}

      {data.stripeConfigured && data.planStatus === "active" && !data.cancelAtPeriodEnd && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-cancel-subscription">
              Cancel subscription
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
              <AlertDialogDescription>
                Your plan stays active until the end of the current billing period. After
                that, access will be paused until you subscribe again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep plan</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? "Cancelling..." : "Cancel subscription"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

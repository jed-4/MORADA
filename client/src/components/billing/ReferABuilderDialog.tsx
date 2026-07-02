import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Check, Copy, Loader2 } from "lucide-react";

interface ReferralStats {
  referralCode: string | null;
  referralLink: string | null;
  totalReferrals: number;
  creditsPending: number;
  creditsIssued: number;
}

/**
 * "Refer a Builder" modal — shows the company's referral link, copy button and
 * simple stats (signups, pending credits, credits earned). Opened from the
 * avatar dropdown in the header.
 */
export function ReferABuilderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<ReferralStats>({
    queryKey: ["/api/billing/referral-stats"],
    enabled: open,
    staleTime: 0,
  });

  const copyLink = async () => {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — user can still select the text manually.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refer a Builder</DialogTitle>
          <DialogDescription>
            Share your link with another builder. When they subscribe, you get one
            month's credit off your bill and they get 50% off their first month.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8" data-testid="referral-loading">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.referralLink ? (
          <p className="text-sm text-muted-foreground" data-testid="text-referral-unavailable">
            Your referral link isn't ready yet. Please try again in a moment.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={data.referralLink}
                onFocus={(e) => e.currentTarget.select()}
                data-testid="input-referral-link"
              />
              <Button variant="outline" onClick={copyLink} data-testid="button-copy-referral-link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 text-center">
                <p className="text-xl font-semibold" data-testid="stat-referral-signups">
                  {data.totalReferrals}
                </p>
                <p className="text-xs text-muted-foreground">Sign-ups</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xl font-semibold" data-testid="stat-referral-pending">
                  {data.creditsPending}
                </p>
                <p className="text-xs text-muted-foreground">Pending credits</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xl font-semibold" data-testid="stat-referral-earned">
                  {data.creditsIssued}
                </p>
                <p className="text-xs text-muted-foreground">Credits earned</p>
              </Card>
            </div>

            <p className="text-xs text-muted-foreground">
              Credits are applied to your subscription about a week after your
              referral's first payment.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

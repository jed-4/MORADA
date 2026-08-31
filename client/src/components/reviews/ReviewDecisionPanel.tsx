import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  requiresVariationAcknowledgement,
  VARIATION_ACKNOWLEDGEMENT_LABEL,
  type ReviewCostImpact,
  type ReviewDecision,
} from "@shared/reviewCostImpact";

/**
 * The reviewer's answer: approve, request changes, or reject.
 *
 * "Request changes" is the primary action by weight, not approve. The whole
 * module exists so a client can push back before work is committed, and a
 * prominent Approve invites a reflexive tick.
 *
 * THE RED GATE: on a `confirmed` item, Approve stays disabled until the
 * acknowledgement is ticked. This is a nudge, not the enforcement — the server
 * refuses the same request with `variation_acknowledgement_required`, and the
 * ack is persisted onto the approval row. Disabling here only means the client
 * finds out before they click rather than after.
 */
export function ReviewDecisionPanel({
  reviewId,
  costImpact,
  disabled,
}: {
  reviewId: string;
  costImpact: ReviewCostImpact;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState<ReviewDecision | null>(null);

  const needsAck = requiresVariationAcknowledgement(costImpact);

  const decide = useMutation({
    mutationFn: async (decision: ReviewDecision) => {
      setPending(decision);
      return apiRequest(`/api/reviews/${reviewId}/decision`, "POST", {
        decision,
        comment: comment.trim() || null,
        acknowledgedVariationRequired: acknowledged,
      });
    },
    onSuccess: (_d, decision) => {
      setPending(null);
      setComment("");
      queryClient.invalidateQueries({ queryKey: [`/api/reviews/${reviewId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      toast({
        title:
          decision === "approved" ? "Approved"
          : decision === "rejected" ? "Declined"
          : "Changes requested",
        description: "Your builder has been notified.",
      });
    },
    onError: (e: Error) => {
      setPending(null);
      toast({ title: "Could not record your decision", description: e.message, variant: "destructive" });
    },
  });

  const busy = decide.isPending || disabled;
  const approveBlocked = needsAck && !acknowledged;

  return (
    <div className="rounded-md border p-4 space-y-3" data-testid="review-decision-panel">
      <div>
        <h2 className="text-sm font-semibold">Your response</h2>
        <p className="text-xs text-muted-foreground">
          Tell your builder what you'd like to happen. They'll be notified either way.
        </p>
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Add a note — what you'd like changed, or anything you want recorded."
        disabled={busy}
        data-testid="input-decision-comment"
      />

      {needsAck && (
        <label
          className={cn(
            "flex items-start gap-2.5 cursor-pointer rounded-md px-3 py-2.5",
            "border-l-[3px]",
          )}
          style={{
            backgroundColor: "hsl(var(--coral-light))",
            borderLeftColor: "hsl(var(--coral))",
          }}
        >
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            disabled={busy}
            data-testid="checkbox-variation-ack"
          />
          <span className="text-sm leading-snug font-medium">{VARIATION_ACKNOWLEDGEMENT_LABEL}</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => decide.mutate("changes_requested")}
          disabled={busy}
          data-testid="button-request-changes"
        >
          {pending === "changes_requested"
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <MessageSquareWarning className="mr-2 h-4 w-4" />}
          Request changes
        </Button>

        <Button
          variant="outline"
          onClick={() => decide.mutate("approved")}
          disabled={busy || approveBlocked}
          title={approveBlocked ? VARIATION_ACKNOWLEDGEMENT_LABEL : undefined}
          data-testid="button-approve"
        >
          {pending === "approved"
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Check className="mr-2 h-4 w-4" />}
          Approve
        </Button>

        <Button
          variant="ghost"
          onClick={() => decide.mutate("rejected")}
          disabled={busy}
          className="text-muted-foreground"
          data-testid="button-reject"
        >
          {pending === "rejected"
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <X className="mr-2 h-4 w-4" />}
          Decline
        </Button>
      </div>

      {approveBlocked && (
        <p className="text-xs text-muted-foreground" data-testid="approve-blocked-hint">
          Tick the box above before approving.
        </p>
      )}
    </div>
  );
}

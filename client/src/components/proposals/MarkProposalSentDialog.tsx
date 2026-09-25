import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { expiryFromDays } from "@shared/proposalExpiry";
import { format } from "date-fns";
import type { Proposal } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
  /** The rendered document. Recording a send is blocked until it exists. */
  pdfBlob: Blob | null;
}

/**
 * Record a proposal that went out some other way — printed, handed over at a
 * site meeting, or attached to the builder's own email.
 *
 * It does everything Send does apart from the email, because the alternative
 * people were using was to send it from the app as well, which lands the client
 * a second copy of a document they already have. The snapshot is frozen, the
 * PDF is stored and the portal link stays live, so the client can still accept
 * or decline online and the status moves on by itself.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the generated PDF"));
    reader.readAsDataURL(blob);
  });
}

const todayInput = () => format(new Date(), "yyyy-MM-dd");

export function MarkProposalSentDialog({ open, onOpenChange, proposal, pdfBlob }: Props) {
  const { toast } = useToast();
  const [sentOn, setSentOn] = useState(todayInput());
  const [validDays, setValidDays] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setSentOn(todayInput());
    // Only offer to set an expiry when the proposal does not already carry one,
    // the same rule the send dialog uses.
    setValidDays(proposal.expiryDate ? "" : "30");
    setNote("");
  }, [open, proposal.expiryDate]);

  /**
   * The date input gives a day, not a moment. Midday local is a sane stand-in
   * for "some time that day" — except for TODAY, where midday is still in the
   * future for anyone working in the morning, and the server refuses a send
   * dated in the future. Pick now in that case: it is today either way.
   */
  const sentAt = (() => {
    if (!sentOn) return null;
    const chosen = new Date(`${sentOn}T12:00:00`);
    if (Number.isNaN(chosen.getTime())) return null;
    return chosen.getTime() > Date.now() ? new Date() : chosen;
  })();

  const days = Number.parseInt(validDays, 10);
  const expiresOn = Number.isFinite(days) && days > 0 ? expiryFromDays(days) : null;

  const markSentMutation = useMutation({
    mutationFn: async () => {
      if (!pdfBlob) throw new Error("The proposal PDF is still generating");
      if (!sentAt) throw new Error("Enter the date it was sent");
      const pdfBase64 = await blobToBase64(pdfBlob);
      const res = await fetch(`/api/proposals/${proposal.id}/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          pdfFilename: `${proposal.proposalNumber}.pdf`,
          sentAt: sentAt.toISOString(),
          note: note.trim() || undefined,
          ...(expiresOn ? { expiryDate: expiresOn.toISOString() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.details || body.error || "Could not mark the proposal as sent");
      return body as { portalLink: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", proposal.id] });
      toast({
        title: "Marked as sent",
        description: `Recorded as sent on ${format(sentAt ?? new Date(), "d MMM yyyy")}. No email was sent.`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Could not mark it as sent", description: error.message });
    },
  });

  const futureDated = !!sentAt && sentAt.getTime() > Date.now();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-mark-proposal-sent">
        <DialogHeader>
          <DialogTitle>Mark as sent</DialogTitle>
          <DialogDescription>
            For a proposal you sent yourself — printed, handed over, or attached to your own
            email. Nothing is emailed from here. The document is frozen exactly as Send would
            freeze it, and the client's link stays live, so they can still accept or decline
            online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mark-sent-date">Date sent</Label>
            <Input
              id="mark-sent-date"
              type="date"
              value={sentOn}
              max={todayInput()}
              onChange={(e) => setSentOn(e.target.value)}
              data-testid="input-mark-sent-date"
            />
            {futureDated && (
              <p className="text-xs text-destructive">
                That is in the future. Pick the day it actually went out.
              </p>
            )}
          </div>

          {!proposal.expiryDate && (
            <div className="space-y-1.5">
              <Label htmlFor="mark-sent-valid">Pricing valid for</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mark-sent-valid"
                  type="number"
                  min={1}
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value)}
                  className="w-24"
                  data-testid="input-mark-sent-valid-days"
                />
                <span className="text-sm text-muted-foreground">
                  days
                  {expiresOn ? ` — until ${format(expiresOn, "d MMM yyyy")}` : " — leave blank for no expiry"}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mark-sent-note">Note (optional)</Label>
            <Textarea
              id="mark-sent-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Handed over at the site meeting"
              rows={2}
              maxLength={500}
              data-testid="input-mark-sent-note"
            />
            <p className="text-xs text-muted-foreground">
              Kept on the project activity feed, so anyone can see how it went out.
            </p>
          </div>

          {/* Chasing needs an address, and this path has none. Said once here
              rather than leaving someone to wonder where the switch went. */}
          <p className="text-xs text-muted-foreground">
            Follow-up reminders are not available for a proposal sent this way — they need an
            email address to chase. Send it from the app if you want it chased automatically.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-mark-sent-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => markSentMutation.mutate()}
            disabled={!pdfBlob || !sentAt || futureDated || markSentMutation.isPending}
            data-testid="button-mark-sent-confirm"
          >
            {markSentMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            {pdfBlob ? "Mark as sent" : "Preparing the PDF…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

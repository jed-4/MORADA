import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2, Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Email the review link to the client.
 *
 * The recipient defaults server-side to the item's assigned reviewer; the field
 * here is an override for the case where a second contact needs it, so the
 * builder is not forced to reassign the item to send one email.
 *
 * The link is stable across revisions — issuing Rev B does not invalidate a
 * link already sent, which is the behaviour a client expects when they come
 * back to an old email.
 */
export function SendReviewLinkDialog({
  reviewId,
  open,
  onOpenChange,
  defaultTo,
}: {
  reviewId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultTo?: string | null;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setTo(defaultTo ?? ""); setMessage(""); setSentUrl(null); }
  }, [open, defaultTo]);

  const send = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/reviews/${reviewId}/send`, "POST", {
        to: to.trim() || undefined,
        message: message.trim() || undefined,
      }),
    onSuccess: (res: any) => {
      setSentUrl(res?.url ?? null);
      queryClient.invalidateQueries({ queryKey: [`/api/reviews/${reviewId}`] });
      toast({ title: "Link sent", description: `Emailed to ${res?.to ?? "the client"}.` });
    },
    onError: (e: Error) =>
      toast({ title: "Could not send the link", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="send-review-link-dialog">
        <DialogHeader>
          <DialogTitle>Send the review link</DialogTitle>
          <DialogDescription>
            Your client can open this without logging in. The link keeps working when you issue a new revision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="send-to">Send to</Label>
            <Input
              id="send-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={defaultTo || "client@example.com"}
              data-testid="input-send-to"
            />
            {!defaultTo && (
              <p className="text-xs text-muted-foreground">
                This project has no client contact assigned, so an address is required.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="send-message">Message <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="send-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Anything you want them to know before they open it."
              data-testid="input-send-message"
            />
          </div>

          {sentUrl && (
            <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
              <p className="text-xs text-muted-foreground">Link sent. You can also share it directly:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs truncate flex-1" data-testid="sent-review-url">{sentUrl}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(sentUrl);
                    toast({ title: "Link copied" });
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {sentUrl ? "Done" : "Cancel"}
          </Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending} data-testid="button-send-review-link">
            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {sentUrl ? "Send again" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

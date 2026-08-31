import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Issue the next revision.
 *
 * The label is chosen server-side (Rev A, Rev B…) rather than typed here, so a
 * builder cannot skip a letter or reuse one — the unique index on
 * (review_item_id, revision_number) is what actually guarantees it, and the
 * label follows from the number.
 *
 * Issuing is the only thing that moves an item into "awaiting_review", and
 * re-issuing supersedes the previous revision rather than editing it, so the
 * client's history stays a true record of what they were shown.
 */
export function IssueRevisionDialog({
  reviewId,
  open,
  onOpenChange,
  nextIsFirst,
}: {
  reviewId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nextIsFirst: boolean;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");

  const issueMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/reviews/${reviewId}/revisions`, "POST", { notes: notes.trim() || null }),
    onSuccess: (rev: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/reviews/${reviewId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      toast({
        title: `${rev?.revisionLabel ?? "Revision"} issued`,
        description: "The review is now with the client.",
      });
      setNotes("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ title: "Could not issue the revision", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="issue-revision-dialog">
        <DialogHeader>
          <DialogTitle>{nextIsFirst ? "Issue Rev A" : "Issue the next revision"}</DialogTitle>
          <DialogDescription>
            {nextIsFirst
              ? "This puts the review in front of the client."
              : "The current revision is superseded and kept in the history."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="rev-notes">What changed?</Label>
          <Textarea
            id="rev-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={nextIsFirst ? "Issued for client review" : "e.g. Swapped the floor tile after your feedback"}
            data-testid="input-revision-notes"
          />
          <p className="text-xs text-muted-foreground">The client sees this note against the revision.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending} data-testid="button-confirm-issue">
            {issueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

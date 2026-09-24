import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Check, FileText, Loader2, MessageSquareWarning, Send, X,
} from "lucide-react";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLoading, PortalError } from "@/components/portal/PortalStateBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ReviewCostBanner } from "@/components/reviews/ReviewCostBanner";
import {
  requiresVariationAcknowledgement,
  VARIATION_ACKNOWLEDGEMENT_LABEL,
  isOverdue,
  daysOverdue,
  type ReviewCostImpact,
  type ReviewDecision,
} from "@shared/reviewCostImpact";

/**
 * The review as the client sees it from an emailed link — no login.
 *
 * Deliberately a separate page from the in-app ProjectReviews detail rather
 * than a shared component: this one has no session, no project shell, no
 * navigation, and a payload that is a hand-written server projection rather
 * than the full row. Trying to serve both from one component is how a
 * builder-only field ends up on a public page.
 *
 * What IS shared is the part that must not drift: the cost banner reads the
 * same shared/reviewCostImpact.ts the server freezes wording from.
 */

interface PortalDoc { id: string; fileName: string; mimeType: string | null; fileSize: number | null; filePath: string }
interface PortalRev {
  id: string; revisionLabel: string; revisionNumber: number; notes: string | null;
  issuedAt: string; supersededAt: string | null; documents: PortalDoc[];
}
interface PortalComment {
  id: string; content: string; authorType: string; createdByName: string;
  isSystem: boolean; createdAt: string; parentCommentId: string | null;
}
interface PortalApproval {
  id: string; decision: string; comment: string | null; decidedByName: string;
  createdAt: string; snapshotBannerText: string | null; acknowledgedVariationRequired: boolean;
}
interface PortalPayload {
  review: {
    id: string; name: string; description: string | null; status: string;
    dueDate: string | null; costImpact: ReviewCostImpact;
    costImpactEstimateMode: string | null; costImpactAmountCents: number | null;
    costImpactMinCents: number | null; costImpactMaxCents: number | null;
    costImpactNote: string | null; currentRevisionId: string | null;
  };
  projectName: string | null;
  companyName: string | null;
  revisions: PortalRev[];
  comments: PortalComment[];
  approvals: PortalApproval[];
}

const fmtBytes = (n: number | null) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export default function ReviewPortal() {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState<ReviewDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery<PortalPayload>({
    queryKey: ["/api/portal/reviews", token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/reviews/${token}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      return res.json();
    },
    enabled: !!token,
  });

  const postComment = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/portal/reviews/${token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment.trim(), clientName: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to post");
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reviews", token] });
    },
  });

  const decide = useMutation({
    mutationFn: async (decision: ReviewDecision) => {
      setPending(decision);
      setError(null);
      const res = await fetch(`/api/portal/reviews/${token}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          comment: note.trim() || null,
          acknowledgedVariationRequired: acknowledged,
          clientName: name.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to record");
      return res.json();
    },
    onSuccess: () => {
      setPending(null);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/portal/reviews", token] });
    },
    onError: (e: Error) => { setPending(null); setError(e.message); },
  });

  if (isLoading) return <PortalLoading message="Loading your review…" />;

  if (loadError || !data) {
    return (
      <PortalError
        title="Link not found"
        description="This review link is invalid or has expired. Please contact your builder for a new one."
      />
    );
  }

  const r = data.review;
  const overdue = isOverdue(r.dueDate);
  const open = r.status === "awaiting_review";
  const needsAck = requiresVariationAcknowledgement(r.costImpact);
  const approveBlocked = needsAck && !acknowledged;
  const current = data.revisions.find((x) => x.id === r.currentRevisionId) ?? data.revisions[0];
  const visible = data.comments.filter((c) => !c.parentCommentId);

  return (
    <PortalLayout
      title={r.name}
      subtitle={[data.companyName, data.projectName].filter(Boolean).join(" · ")}
      maxWidth="max-w-3xl"
      headerRight={
        r.dueDate ? (
          <Badge variant={overdue ? "destructive" : "secondary"} className="font-normal shrink-0">
            {overdue ? `Overdue by ${daysOverdue(r.dueDate)}d` : `Due ${format(new Date(r.dueDate), "d MMM")}`}
          </Badge>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <ReviewCostBanner
          costImpact={r.costImpact}
          estimate={{
            mode: r.costImpactEstimateMode as any,
            amountCents: r.costImpactAmountCents,
            minCents: r.costImpactMinCents,
            maxCents: r.costImpactMaxCents,
            note: r.costImpactNote,
          }}
        />

        {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}

        {/* Documents on the current revision */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {current ? `Documents — ${current.revisionLabel}` : "Documents"}
          </h2>
          {current?.documents.length ? (
            <ul className="divide-y">
              {current.documents.map((d) => (
                <li key={d.id} className="py-2">
                  <a
                    href={d.filePath}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 hover:underline"
                    data-testid={`portal-doc-${d.id}`}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">{d.fileName}</span>
                    <span className="text-xs text-muted-foreground">{fmtBytes(d.fileSize)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No documents attached.</p>
          )}
        </section>

        {/* Your response */}
        {open ? (
          <section className="rounded-lg border bg-card p-4 space-y-3" data-testid="portal-decision-panel">
            <div>
              <h2 className="text-sm font-semibold">Your response</h2>
              <p className="text-xs text-muted-foreground">
                Your builder will be notified either way.
              </p>
            </div>

            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              data-testid="input-portal-name"
            />

            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add a note — what you'd like changed, or anything you want recorded."
              data-testid="input-portal-note"
            />

            {needsAck && (
              <label
                className="flex items-start gap-2.5 cursor-pointer rounded-md px-3 py-2.5 border-l-[3px]"
                style={{ backgroundColor: "hsl(var(--coral-light))", borderLeftColor: "hsl(var(--coral))" }}
              >
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(v === true)}
                  data-testid="checkbox-portal-ack"
                />
                <span className="text-sm leading-snug font-medium">{VARIATION_ACKNOWLEDGEMENT_LABEL}</span>
              </label>
            )}

            {error && (
              <p className="text-sm text-destructive" data-testid="portal-decision-error">{error}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => decide.mutate("changes_requested")} disabled={decide.isPending} data-testid="button-portal-request-changes">
                {pending === "changes_requested" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareWarning className="mr-2 h-4 w-4" />}
                Request changes
              </Button>
              <Button
                variant="outline"
                onClick={() => decide.mutate("approved")}
                disabled={decide.isPending || approveBlocked}
                title={approveBlocked ? VARIATION_ACKNOWLEDGEMENT_LABEL : undefined}
                data-testid="button-portal-approve"
              >
                {pending === "approved" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Approve
              </Button>
              <Button variant="ghost" onClick={() => decide.mutate("rejected")} disabled={decide.isPending} className="text-muted-foreground" data-testid="button-portal-reject">
                {pending === "rejected" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                Decline
              </Button>
            </div>

            {approveBlocked && (
              <p className="text-xs text-muted-foreground">Tick the box above before approving.</p>
            )}
          </section>
        ) : (
          <section className="rounded-lg border bg-muted/30 p-4" data-testid="portal-closed-notice">
            <p className="text-sm">
              {r.status === "changes_requested"
                ? "You've asked for changes. Your builder will send a new revision."
                : r.status === "approved" ? "You've approved this review."
                : r.status === "rejected" ? "You've declined this review."
                : "This review is closed."}
            </p>
          </section>
        )}

        {/* Decisions */}
        {data.approvals.length > 0 && (
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Decisions</h2>
            <ul className="space-y-3">
              {data.approvals.map((a) => (
                <li key={a.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium capitalize">{a.decision.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">
                      {a.decidedByName} · {format(new Date(a.createdAt), "d MMM yyyy")}
                    </span>
                  </div>
                  {a.comment && <p className="text-sm text-muted-foreground">{a.comment}</p>}
                  {a.snapshotBannerText && (
                    <p className="text-xs text-muted-foreground italic">
                      Shown at the time: “{a.snapshotBannerText}”
                      {a.acknowledgedVariationRequired && " · acknowledged"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Revision history */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Revision history</h2>
          <ul className="space-y-2.5">
            {data.revisions.map((rev) => (
              <li key={rev.id} className="flex items-start gap-3" data-testid={`portal-rev-${rev.revisionLabel}`}>
                <Badge variant={rev.supersededAt ? "outline" : "secondary"} className="font-mono text-xs mt-0.5">
                  {rev.revisionLabel}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{rev.notes || <span className="text-muted-foreground">No note</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    Issued {format(new Date(rev.issuedAt), "d MMM yyyy")}
                    {rev.supersededAt && " · superseded"}
                    {rev.documents.length > 0 && ` · ${rev.documents.length} document${rev.documents.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Conversation */}
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</h2>
          {visible.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
          {visible.map((c) => (
            <div key={c.id} className={cn("rounded-md px-3 py-2", c.isSystem ? "bg-muted/50" : "bg-muted/30")}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-medium">{c.createdByName}</span>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(c.createdAt), "d MMM, h:mma")}
                </span>
              </div>
              <p className={cn("text-sm whitespace-pre-wrap", c.isSystem && "text-muted-foreground italic")}>
                {c.content}
              </p>
            </div>
          ))}

          <div className="space-y-2 pt-1">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Add a comment…"
              data-testid="input-portal-comment"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => postComment.mutate()}
                disabled={!comment.trim() || postComment.isPending}
                data-testid="button-portal-post-comment"
              >
                {postComment.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                Post
              </Button>
            </div>
          </div>
        </section>
      </div>
    </PortalLayout>
  );
}

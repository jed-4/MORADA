import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, Paperclip, Send, FileText, Loader2, Upload, Lock,
  MessageSquare, History, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionCard } from "@/components/detail/SectionCard";
import { DetailLayout } from "@/components/detail/DetailLayout";
import { EmptyState } from "@/components/EmptyState";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ReviewCostBanner } from "./ReviewCostBanner";
import { IssueRevisionDialog } from "./IssueRevisionDialog";
import { SendReviewLinkDialog } from "./SendReviewLinkDialog";
import { isOverdue, daysOverdue, isTerminalReviewStatus } from "@shared/reviewCostImpact";
import { useClientPortal } from "@/hooks/use-client-portal";
import { ReviewDecisionPanel } from "./ReviewDecisionPanel";

/**
 * The builder's view of one review item.
 *
 * Everything here comes from GET /api/reviews/:id, which returns the item plus
 * its revisions (each with its documents), comments and approvals in one round
 * trip — Neon is ~400ms away, so the detail view must not fan out.
 *
 * ONE component serves both sides. The reviewer sees the same revisions,
 * documents and conversation the builder does, minus the builder-only
 * controls — and the internal comments are filtered by the SERVER, not hidden
 * here, so a rendering mistake cannot leak them.
 */

interface ReviewDoc {
  id: string; revisionId: string; fileName: string; filePath: string;
  mimeType: string | null; fileSize: number | null;
}
interface ReviewRev {
  id: string; revisionNumber: number; revisionLabel: string; notes: string | null;
  issuedAt: string; supersededAt: string | null; documents: ReviewDoc[];
}
interface ReviewCmt {
  id: string; content: string; authorType: string; createdByName: string;
  isInternal: boolean; isSystem: boolean; createdAt: string; parentCommentId: string | null;
}
interface ReviewApproval {
  id: string; decision: string; comment: string | null; decidedByName: string;
  createdAt: string; snapshotCostImpact: string; snapshotBannerText: string | null;
  acknowledgedVariationRequired: boolean; createdVariationId: string | null;
}
interface ReviewDetailData {
  id: string; name: string; description: string | null; status: string;
  dueDate: string | null; costImpact: "none" | "possible" | "confirmed";
  costImpactEstimateMode: string | null; costImpactAmountCents: number | null;
  costImpactMinCents: number | null; costImpactMaxCents: number | null;
  costImpactNote: string | null; createVariationOnApproval: boolean;
  reviewerName?: string | null;
  projectId: string;
  currentRevisionId: string | null;
  portalSentAt: string | null;
  portalViewedAt: string | null;
  reviewerEmail?: string | null;
  revisions: ReviewRev[]; comments: ReviewCmt[]; approvals: ReviewApproval[];
}

const fmtBytes = (n: number | null) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export function ReviewDetail({ reviewId, onBack }: { reviewId: string; onBack: () => void }) {
  const { toast } = useToast();
  const { isClient } = useClientPortal();
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<ReviewDetailData>({
    queryKey: [`/api/reviews/${reviewId}`],
  });

  // Repair path for the one case the hook cannot recover from itself: the
  // approval landed but raising the variation failed.
  const raiseVariation = useMutation({
    mutationFn: async () => apiRequest(`/api/reviews/${reviewId}/raise-variation`, "POST"),
    onSuccess: (r: any) => {
      toast({ title: "Draft variation raised", description: r?.variationNumber ?? undefined });
      queryClient.invalidateQueries({ queryKey: [`/api/reviews/${reviewId}`] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not raise the variation", description: e.message, variant: "destructive" }),
  });

  const commentMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/reviews/${reviewId}/comments`, "POST", {
        content: comment.trim(),
        isInternal: isClient ? false : internal,
      }),
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: [`/api/reviews/${reviewId}`] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not post the comment", description: e.message, variant: "destructive" }),
  });

  /**
   * Upload, then attach. The server-side multipart route is used rather than a
   * presigned PUT because it avoids the direct-to-GCS CORS problem, and it
   * returns the signed grant the documents route needs to bind the path to
   * this company.
   */
  const attachMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const upRes = await fetch("/api/uploads/file", { method: "POST", body: form, credentials: "include" });
      if (!upRes.ok) throw new Error((await upRes.json().catch(() => ({}))).error || "Upload failed");
      const up = await upRes.json();
      return apiRequest(`/api/reviews/${reviewId}/documents`, "POST", {
        objectPath: up.objectPath,
        uploadGrant: up.uploadGrant,
        fileName: up.name ?? file.name,
        mimeType: up.contentType ?? file.type,
        fileSize: file.size,
      });
    },
    onSuccess: () => {
      toast({ title: "Document attached" });
      queryClient.invalidateQueries({ queryKey: [`/api/reviews/${reviewId}`] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not attach the document", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const overdue = isOverdue(data.dueDate);
  const terminal = isTerminalReviewStatus(data.status);
  const current = data.revisions.find((r) => r.id === data.currentRevisionId) ?? data.revisions[0];
  const visibleComments = data.comments.filter((c) => !c.parentCommentId);
  const repliesOf = (id: string) => data.comments.filter((c) => c.parentCommentId === id);

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="review-detail">
      {/* Header panel — same card-header pattern as the Reviews list, so the
          section reads as one product rather than two pages. */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-8 flex items-center gap-2 px-2">
          <button
            onClick={onBack}
            className="h-6 w-6 text-xs border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2 flex items-center justify-center flex-shrink-0"
            data-testid="button-review-back"
            aria-label="Back to reviews"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: "hsl(var(--primary))" }} aria-hidden="true" />
          <span className="text-xs font-medium text-foreground truncate" data-testid="review-detail-title">
            {data.name}
          </span>

          <div className="flex-1" />

          {!isClient && data.currentRevisionId && (
            <button
              onClick={() => setSendOpen(true)}
              className="h-6 w-auto px-2 text-xs border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1"
              data-testid="button-send-review-link"
            >
              <Send className="w-3 h-3" />
              {data.portalSentAt ? "Resend link" : "Send link"}
            </button>
          )}
          {!isClient && (
            <button
              onClick={() => setIssueOpen(true)}
              disabled={terminal}
              title={terminal ? `This review is ${data.status} — reopen it before issuing another revision.` : undefined}
              className={cn(
                "h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1",
                terminal
                  ? "border-border/50 text-muted-foreground/60 cursor-not-allowed"
                  : "bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2",
              )}
              data-testid="button-issue-revision"
            >
              {terminal ? <Lock className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
              {data.revisions.length === 0 ? "Issue Rev A" : "Issue next revision"}
            </button>
          )}
        </div>
      </div>

      {/* Body closes the card. DetailLayout gives the main column + w-80 rail
          the other detail pages use, so the facts a reader needs first are not
          buried in the same stack as the work. */}
      <div className="flex-1 min-h-0 border-x border-b border-border rounded-b-lg bg-card overflow-hidden flex">
        <DetailLayout sidebar={<ReviewFactsRail data={data} isClient={isClient} />}>

        <ReviewCostBanner
          costImpact={data.costImpact}
          estimate={{
            mode: data.costImpactEstimateMode as any,
            amountCents: data.costImpactAmountCents,
            minCents: data.costImpactMinCents,
            maxCents: data.costImpactMaxCents,
            note: data.costImpactNote,
          }}
        />

        {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}

        {isClient && data.status === "awaiting_review" && (
          <ReviewDecisionPanel reviewId={reviewId} costImpact={data.costImpact} />
        )}

        <SectionCard
          title="Documents"
          variant="card"
          icon={<Paperclip className="h-3.5 w-3.5" />}
          accent="teal"
          count={data.revisions.reduce((n, r) => n + r.documents.length, 0)}
          actions={ isClient ? null : (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) attachMutation.mutate(f);
                  e.target.value = "";
                }}
                data-testid="input-review-file"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={!current || attachMutation.isPending}
                title={!current ? "Issue a revision before attaching documents" : undefined}
                data-testid="button-attach-document"
              >
                {attachMutation.isPending
                  ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  : <Upload className="mr-2 h-3.5 w-3.5" />}
                Attach
              </Button>
            </>
          )}
        >
          {current?.documents.length ? (
            <ul className="divide-y">
              {current.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 py-2" data-testid={`review-doc-${d.id}`}>
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate flex-1">{d.fileName}</span>
                  <span className="text-xs text-muted-foreground">{fmtBytes(d.fileSize)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              {current ? "No documents on this revision yet." : "Issue Rev A, then attach the drawings."}
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Revision history"
          variant="card"
          icon={<History className="h-3.5 w-3.5" />}
          accent="primary"
          count={data.revisions.length}
        >
          {data.revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nothing issued yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.revisions.map((r) => (
                <li key={r.id} className="flex items-start gap-3" data-testid={`review-rev-${r.revisionLabel}`}>
                  <Badge variant={r.supersededAt ? "outline" : "secondary"} className="font-mono text-xs mt-0.5">
                    {r.revisionLabel}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {r.notes || <span className="text-muted-foreground">No note</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Issued {format(new Date(r.issuedAt), "d MMM yyyy, h:mma")}
                      {r.supersededAt && " · superseded"}
                      {r.documents.length > 0 && ` · ${r.documents.length} document${r.documents.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {data.approvals.length > 0 && (
          <SectionCard title="Decisions" variant="card" icon={<CheckCircle2 className="h-3.5 w-3.5" />} accent="sage" count={data.approvals.length}>
            <ul className="space-y-3">
              {data.approvals.map((a) => (
                <li key={a.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.decision} />
                    <span className="text-sm">{a.decidedByName}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.createdAt), "d MMM yyyy, h:mma")}
                    </span>
                  </div>
                  {a.comment && <p className="text-sm text-muted-foreground">{a.comment}</p>}
                  {a.snapshotBannerText && (
                    <p className="text-xs text-muted-foreground italic">
                      Shown at approval: “{a.snapshotBannerText}”
                      {a.acknowledgedVariationRequired && " · variation acknowledged"}
                    </p>
                  )}
                  {a.decision === "approved" && a.createdVariationId && (
                    <a
                      href={`/projects/${data.projectId}/variations/${a.createdVariationId}`}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      data-testid="link-created-variation"
                    >
                      <FileText className="h-3 w-3" />
                      Open the draft variation this raised
                    </a>
                  )}
                  {!isClient && a.decision === "approved" && !a.createdVariationId && data.createVariationOnApproval && (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-destructive" data-testid="variation-missing">
                        The draft variation was not raised.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => raiseVariation.mutate()}
                        disabled={raiseVariation.isPending}
                        data-testid="button-raise-variation"
                      >
                        {raiseVariation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Raise it now
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <SectionCard
          title="Comments"
          variant="card"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          accent="muted"
          count={visibleComments.length}
        >
          <div className="space-y-3">
            {visibleComments.length === 0 && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
            {visibleComments.map((c) => (
              <div key={c.id} className="space-y-1.5" data-testid={`review-comment-${c.id}`}>
                <div className={cn("rounded-md px-3 py-2", c.isSystem ? "bg-muted/50" : "bg-muted/30")}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{c.createdByName}</span>
                    {c.isInternal && <Badge variant="outline" className="text-[10px] px-1 py-0">Internal</Badge>}
                    {c.authorType === "client" && <Badge variant="secondary" className="text-[10px] px-1 py-0">Client</Badge>}
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(c.createdAt), "d MMM, h:mma")}
                    </span>
                  </div>
                  <p className={cn("text-sm whitespace-pre-wrap", c.isSystem && "text-muted-foreground italic")}>
                    {c.content}
                  </p>
                </div>
                {repliesOf(c.id).map((r) => (
                  <div key={r.id} className="ml-6 rounded-md bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium">{r.createdByName}</span>
                      {r.isInternal && <Badge variant="outline" className="text-[10px] px-1 py-0">Internal</Badge>}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
              </div>
            ))}

            <div className="space-y-2 pt-1">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Add a comment…"
                data-testid="input-review-comment"
              />
              <div className="flex items-center justify-between">
                {isClient ? <span /> : (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={internal} onCheckedChange={(v) => setInternal(v === true)} data-testid="checkbox-internal-comment" />
                    <span className="text-xs text-muted-foreground">Internal only — the client never sees this</span>
                  </label>
                )}
                <Button
                  size="sm"
                  onClick={() => commentMutation.mutate()}
                  disabled={!comment.trim() || commentMutation.isPending}
                  data-testid="button-post-comment"
                >
                  {commentMutation.isPending
                    ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    : <Send className="mr-2 h-3.5 w-3.5" />}
                  Post
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
        </DetailLayout>
      </div>

      <SendReviewLinkDialog
        reviewId={reviewId}
        open={sendOpen}
        onOpenChange={setSendOpen}
        defaultTo={data.reviewerEmail ?? null}
      />

      <IssueRevisionDialog
        reviewId={reviewId}
        open={issueOpen}
        onOpenChange={setIssueOpen}
        nextIsFirst={data.revisions.length === 0}
      />
    </div>
  );
}

/** One label/value pair in the rail. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * The facts a reader needs before the body: what state is this in, who is it
 * with, when is it due, does it carry money, and has the link actually reached
 * them.
 *
 * Previously all of this was either absent or inferable only by reading four
 * stacked sections, which is what made the page hard to scan. A rail is what
 * the other detail pages use for exactly this, at the same w-80.
 */
function ReviewFactsRail({ data, isClient }: { data: ReviewDetailData; isClient: boolean }) {
  const overdue = isOverdue(data.dueDate);
  const current = data.revisions.find((r) => r.id === data.currentRevisionId) ?? data.revisions[0];
  const docCount = current?.documents.length ?? 0;

  return (
    <div className="space-y-4" data-testid="review-facts-rail">
      <Fact label="Status">
        <StatusBadge status={data.status} data-testid="review-detail-status" />
      </Fact>

      <Fact label="Current revision">
        {current ? (
          <span className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">{current.revisionLabel}</Badge>
            <span className="text-xs text-muted-foreground">
              {format(new Date(current.issuedAt), "d MMM yyyy")}
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not issued yet</span>
        )}
      </Fact>

      <Fact label="Due">
        {data.dueDate ? (
          <span className={cn("text-sm", overdue && "text-destructive font-medium")}>
            {overdue
              ? `Overdue by ${daysOverdue(data.dueDate)} day${daysOverdue(data.dueDate) === 1 ? "" : "s"}`
              : format(new Date(data.dueDate), "d MMM yyyy")}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">No due date</span>
        )}
      </Fact>

      {!isClient && (
        <Fact label="Reviewer">
          <span className="text-sm">{data.reviewerName || <span className="text-muted-foreground">Unassigned</span>}</span>
        </Fact>
      )}

      <Fact label="Documents">
        <span className="text-sm">
          {docCount} on {current?.revisionLabel ?? "this revision"}
        </span>
      </Fact>

      {!isClient && (
        <Fact label="Client link">
          {data.portalSentAt ? (
            <span className="text-sm">
              Sent {format(new Date(data.portalSentAt), "d MMM")}
              <span className="block text-xs text-muted-foreground">
                {data.portalViewedAt
                  ? `Opened ${format(new Date(data.portalViewedAt), "d MMM")}`
                  : "Not opened yet"}
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Not sent</span>
          )}
        </Fact>
      )}

      {!isClient && data.createVariationOnApproval && (
        <Fact label="On approval">
          <span className="text-sm flex items-start gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
            Raises a draft variation
          </span>
        </Fact>
      )}
    </div>
  );
}

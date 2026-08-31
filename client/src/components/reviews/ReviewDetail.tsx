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
  acknowledgedVariationRequired: boolean;
}
interface ReviewDetailData {
  id: string; name: string; description: string | null; status: string;
  dueDate: string | null; costImpact: "none" | "possible" | "confirmed";
  costImpactEstimateMode: string | null; costImpactAmountCents: number | null;
  costImpactMinCents: number | null; costImpactMaxCents: number | null;
  costImpactNote: string | null; createVariationOnApproval: boolean;
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
    <div className="flex-1 overflow-auto" data-testid="review-detail">
      <div className="border-b bg-card">
        <div className="px-6 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-review-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold truncate" data-testid="review-detail-title">{data.name}</h1>
            <p className="text-xs text-muted-foreground">
              {current ? `${current.revisionLabel} · issued ${format(new Date(current.issuedAt), "d MMM yyyy")}` : "No revision issued yet"}
            </p>
          </div>
          {data.dueDate && (
            <Badge variant={overdue ? "destructive" : "secondary"} className="font-normal">
              {overdue ? `Overdue by ${daysOverdue(data.dueDate)}d` : `Due ${format(new Date(data.dueDate), "d MMM")}`}
            </Badge>
          )}
          <StatusBadge status={data.status} data-testid="review-detail-status" />
          {!isClient && data.currentRevisionId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSendOpen(true)}
              data-testid="button-send-review-link"
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              {data.portalSentAt ? "Resend link" : "Send link"}
            </Button>
          )}
          {!isClient && <Button
            size="sm"
            onClick={() => setIssueOpen(true)}
            disabled={terminal}
            title={terminal ? `This review is ${data.status} — reopen it before issuing another revision.` : undefined}
            data-testid="button-issue-revision"
          >
            {terminal && <Lock className="mr-2 h-3.5 w-3.5" />}
            {data.revisions.length === 0 ? "Issue Rev A" : "Issue next revision"}
          </Button>}
        </div>
      </div>

      <div className="px-6 py-5 space-y-6 max-w-4xl">
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

        {!isClient && data.createVariationOnApproval && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            A draft variation will be raised when the client approves this.
          </p>
        )}

        {isClient && data.status === "awaiting_review" && (
          <ReviewDecisionPanel reviewId={reviewId} costImpact={data.costImpact} />
        )}

        <SectionCard
          title="Documents"
          variant="editorial"
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
          variant="editorial"
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
          <SectionCard title="Decisions" variant="editorial" icon={<CheckCircle2 className="h-3.5 w-3.5" />} accent="sage" count={data.approvals.length}>
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
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <SectionCard
          title="Comments"
          variant="editorial"
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

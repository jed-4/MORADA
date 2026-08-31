import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardCheck, Plus, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { useProject } from "@/contexts/ProjectContext";
import { cn } from "@/lib/utils";
import { CreateReviewDialog } from "@/components/reviews/CreateReviewDialog";
import { ReviewDetail } from "@/components/reviews/ReviewDetail";
import { costImpactBanner, isOverdue, daysOverdue } from "@shared/reviewCostImpact";
import { useClientPortal } from "@/hooks/use-client-portal";

/**
 * Reviews inside the project shell.
 *
 * List and detail both render here, chosen from the URL, so the project header
 * and section tabs stay put when you open one — the same idiom the selections
 * tab uses (see CustomizableProjectOverview's `case "selections"`).
 *
 * The ordering is deliberate and mirrors what the client will see in PR3:
 * anything still with the client comes first, overdue at the very top, because
 * that is the list the builder needs to chase.
 */

interface ReviewRow {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  costImpact: "none" | "possible" | "confirmed";
  createVariationOnApproval: boolean;
  createdAt: string;
}

/** Sort weight: with the client first, then waiting on us, then settled. */
const STATUS_WEIGHT: Record<string, number> = {
  awaiting_review: 0,
  changes_requested: 1,
  draft: 2,
  approved: 3,
  rejected: 4,
  closed: 5,
};

/**
 * Groups shown to the reviewer. The order is the point: what is waiting on
 * them is surfaced hardest and everything settled is pushed below, so the list
 * answers "what do I need to do" before "what happened".
 */
const CLIENT_GROUPS: { key: string; title: string; blurb?: string; statuses: string[] }[] = [
  { key: "needs-you", title: "Needs your review", blurb: "Waiting on you.", statuses: ["awaiting_review"] },
  { key: "with-builder", title: "Waiting on your builder", statuses: ["changes_requested"] },
  { key: "approved", title: "Approved", statuses: ["approved"] },
  { key: "closed", title: "Closed", statuses: ["rejected", "closed"] },
];

export default function ProjectReviews() {
  const { currentProject } = useProject();
  const { isClient } = useClientPortal();
  const [location, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  const projectId = currentProject?.id;

  // /projects/:id/reviews/:reviewId → detail; bare /reviews → list.
  const detailId = useMemo(() => {
    if (!projectId) return null;
    const tail = location.split(`/projects/${projectId}/reviews`)[1] || "";
    return tail.split("/").filter(Boolean)[0] ?? null;
  }, [location, projectId]);

  const { data: reviews, isLoading } = useQuery<ReviewRow[]>({
    queryKey: ["/api/reviews", { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/reviews?projectId=${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load reviews");
      return res.json();
    },
    enabled: !!projectId,
  });

  const sorted = useMemo(() => {
    const rows = [...(reviews ?? [])];
    rows.sort((a, b) => {
      const w = (STATUS_WEIGHT[a.status] ?? 9) - (STATUS_WEIGHT[b.status] ?? 9);
      if (w !== 0) return w;
      const ao = isOverdue(a.dueDate), bo = isOverdue(b.dueDate);
      if (ao !== bo) return ao ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  }, [reviews]);

  if (!projectId) return null;

  if (detailId) {
    return (
      <ReviewDetail
        reviewId={detailId}
        onBack={() => navigate(`/projects/${projectId}/reviews`)}
      />
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="project-reviews">
      <div className="px-6 py-4 flex items-center justify-between border-b bg-card">
        <div>
          <h1 className="text-base font-semibold">Reviews</h1>
          <p className="text-xs text-muted-foreground">
            {isClient
              ? "Plans, quotes and specs your builder has sent you to approve."
              : "Push plans, quotes and specs to your client for approval."}
          </p>
        </div>
        {!isClient && (
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-new-review">
            <Plus className="mr-2 h-4 w-4" />
            New review
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={isClient ? "Nothing to review" : "No reviews yet"}
          description={isClient
            ? "When your builder sends you plans or a quote to approve, it'll appear here."
            : "Send the client a set of plans or a sub-trade quote and track their approval here."}
          variant="inline"
          className="py-16"
          action={isClient ? undefined : { label: "New review", onClick: () => setCreateOpen(true), icon: Plus }}
          data-testid="reviews-empty"
        />
      ) : isClient ? (
        <div>
          {CLIENT_GROUPS.map((g) => {
            const rows = sorted.filter((r) => g.statuses.includes(r.status));
            if (rows.length === 0 && g.key !== "needs-you") return null;
            return (
              <section key={g.key} data-testid={`review-group-${g.key}`}>
                <div className="px-6 pt-4 pb-1.5 flex items-baseline gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.title}
                  </h2>
                  {rows.length > 0 && (
                    <span className="text-xs text-muted-foreground">{rows.length}</span>
                  )}
                </div>
                {rows.length === 0 ? (
                  <p className="px-6 pb-3 text-sm text-muted-foreground" data-testid="reviews-all-clear">
                    You're all caught up — nothing needs your review right now.
                  </p>
                ) : (
                  <ul className="divide-y border-t">
                    {rows.map((r) => <ReviewRowItem key={r.id} r={r} projectId={projectId} navigate={navigate} showAutoVariation={false} />)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y">
          {sorted.map((r) => <ReviewRowItem key={r.id} r={r} projectId={projectId} navigate={navigate} showAutoVariation />)}
        </ul>
      )}

      <CreateReviewDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/projects/${projectId}/reviews/${id}`)}
      />
    </div>
  );
}

/** One row. Shared by the builder's flat list and the reviewer's grouped one. */
function ReviewRowItem({
  r, projectId, navigate, showAutoVariation,
}: {
  r: ReviewRow;
  projectId: string;
  navigate: (to: string) => void;
  showAutoVariation?: boolean;
}) {
  const overdue = isOverdue(r.dueDate);
  const banner = costImpactBanner(r.costImpact);
  return (
    <li>
      <button
        className="w-full text-left px-6 py-3 hover-elevate flex items-center gap-3"
        onClick={() => navigate(`/projects/${projectId}/reviews/${r.id}`)}
        data-testid={`review-row-${r.id}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{r.name}</span>
            {r.costImpact !== "none" && (
              <span
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    r.costImpact === "confirmed" ? "hsl(var(--coral))" : "hsl(var(--amber))",
                }}
                title={banner?.text}
                data-testid={`review-impact-dot-${r.costImpact}`}
              />
            )}
          </div>
          {r.dueDate && (
            <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
              {overdue
                ? `Overdue by ${daysOverdue(r.dueDate)} day${daysOverdue(r.dueDate) === 1 ? "" : "s"}`
                : `Due ${format(new Date(r.dueDate), "d MMM yyyy")}`}
            </span>
          )}
        </div>
        {overdue && <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />}
        {showAutoVariation && r.createVariationOnApproval && (
          <Badge variant="outline" className="text-[10px] font-normal">Auto-variation</Badge>
        )}
        <StatusBadge status={r.status} />
      </button>
    </li>
  );
}

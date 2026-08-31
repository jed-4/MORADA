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

export default function ProjectReviews() {
  const { currentProject } = useProject();
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
            Push plans, quotes and specs to your client for approval.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-new-review">
          <Plus className="mr-2 h-4 w-4" />
          New review
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No reviews yet"
          description="Send the client a set of plans or a sub-trade quote and track their approval here."
          variant="inline"
          className="py-16"
          action={{ label: "New review", onClick: () => setCreateOpen(true), icon: Plus }}
          data-testid="reviews-empty"
        />
      ) : (
        <ul className="divide-y">
          {sorted.map((r) => {
            const overdue = isOverdue(r.dueDate);
            const banner = costImpactBanner(r.costImpact);
            return (
              <li key={r.id}>
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
                  {r.createVariationOnApproval && (
                    <Badge variant="outline" className="text-[10px] font-normal">Auto-variation</Badge>
                  )}
                  <StatusBadge status={r.status} />
                </button>
              </li>
            );
          })}
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

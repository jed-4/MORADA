import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ClipboardCheck, Plus, Loader2, AlertCircle, Search, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [search, setSearch] = useState("");

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

  /** Open = still with the reviewer; overdue is a subset of it. */
  const counts = useMemo(() => {
    const rows = reviews ?? [];
    const open = rows.filter((r) => r.status === "awaiting_review");
    return { open: open.length, overdue: open.filter((r) => isOverdue(r.dueDate)).length };
  }, [reviews]);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (reviews ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
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
    <div className="flex flex-col h-full min-h-0" data-testid="project-reviews">
      {/* Header panel — the card-header pattern used by Tasks/Timesheets. The
          project header and section tabs sit directly above, so the breadcrumb
          strip that pattern carries on a standalone page is omitted here. */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-8 flex items-center gap-2 px-3">
          <div className="w-[3px] h-3.5 rounded-full flex-shrink-0" style={{ background: "hsl(var(--primary))" }} aria-hidden="true" />
          <span className="text-xs font-medium text-foreground">Reviews</span>

          {counts.open > 0 && (
            <span
              className="h-[15px] px-1.5 rounded-full bg-primary/10 text-primary text-[10px] leading-[15px] font-semibold"
              data-testid="chip-open-count"
            >
              {counts.open} open
            </span>
          )}
          {counts.overdue > 0 && (
            <span
              className="h-[15px] px-1.5 rounded-full text-[10px] leading-[15px] font-semibold"
              style={{ background: "hsl(var(--coral-light))", color: "hsl(var(--coral))" }}
              data-testid="chip-overdue-count"
            >
              {counts.overdue} overdue
            </span>
          )}

          <div className="flex-1" />

          <div className="relative w-40 hidden sm:block">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-reviews"
            />
          </div>

          {!isClient && (
            <button
              onClick={() => setCreateOpen(true)}
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              data-testid="button-new-review"
            >
              <Plus className="w-3 h-3" />
              New review
            </button>
          )}
        </div>
      </div>

      {/* Body closes the card */}
      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card min-h-0">

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
                <div className="px-3 pt-3 pb-1.5 flex items-baseline gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.title}
                  </h2>
                  {rows.length > 0 && (
                    <span className="text-xs text-muted-foreground">{rows.length}</span>
                  )}
                </div>
                {rows.length === 0 ? (
                  <p className="px-3 pb-3 text-sm text-muted-foreground" data-testid="reviews-all-clear">
                    You're all caught up — nothing needs your review right now.
                  </p>
                ) : (
                  <ul className="px-3 pb-1 space-y-2">
                    {rows.map((r) => <ReviewRowItem key={r.id} r={r} projectId={projectId} navigate={navigate} showAutoVariation={false} />)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="p-3 space-y-2">
          {sorted.map((r) => <ReviewRowItem key={r.id} r={r} projectId={projectId} navigate={navigate} showAutoVariation />)}
        </ul>
      )}

      </div>

      <CreateReviewDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => navigate(`/projects/${projectId}/reviews/${id}`)}
      />
    </div>
  );
}

/**
 * One review, as a card.
 *
 * Rows separated by hairlines read as a spreadsheet; a review is a piece of
 * work with a state, so it gets a card. The cost-impact wording is shown in
 * full rather than as a bare dot — a client scanning this list should be able
 * to see which items carry money without opening them.
 *
 * Shared by the builder's flat list and the reviewer's grouped one.
 */
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
  const impactColour =
    r.costImpact === "confirmed" ? "hsl(var(--coral))" : "hsl(var(--amber))";

  return (
    <li>
      <button
        className={cn(
          "w-full text-left rounded-lg border bg-card px-3 py-2.5",
          "hover-elevate active-elevate-2 transition-shadow",
          overdue && "border-l-[3px]",
        )}
        style={overdue ? { borderLeftColor: "hsl(var(--coral))" } : undefined}
        onClick={() => navigate(`/projects/${projectId}/reviews/${r.id}`)}
        data-testid={`review-row-${r.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate">{r.name}</span>
              {showAutoVariation && r.createVariationOnApproval && (
                <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                  Auto-variation
                </Badge>
              )}
            </div>

            {banner && (
              // The DOT carries the colour, not the text. --amber and --coral
              // are ~2:1 against the card and are unreadable at 12px; they are
              // accent hues, not text colours. Weight separates "will" from
              // "may" instead, which also survives a colourblind reader.
              <div className="flex items-center gap-1.5" data-testid={`review-impact-${r.costImpact}`}>
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: impactColour }}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-xs",
                    r.costImpact === "confirmed"
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {banner.text}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {r.dueDate ? (
                <span className={cn(overdue && "text-destructive font-medium")}>
                  {overdue
                    ? `Overdue by ${daysOverdue(r.dueDate)} day${daysOverdue(r.dueDate) === 1 ? "" : "s"}`
                    : `Due ${format(new Date(r.dueDate), "d MMM yyyy")}`}
                </span>
              ) : (
                <span>No due date</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {overdue && <AlertCircle className="h-4 w-4 text-destructive" />}
            <StatusBadge status={r.status} />
          </div>
        </div>
      </button>
    </li>
  );
}

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { GitBranch } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { WidgetError } from "@/components/ui/WidgetError";
import type { WidgetProps } from "@/types/widgets";
import type { Variation, Project } from "@shared/schema";

function formatCurrencyCents(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
}

export default function BusinessVariationsPendingWidget({}: WidgetProps) {
  const {
    data: variations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Variation[]>({
    queryKey: ["/api/variations"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (isError)
    return <WidgetError onRetry={() => refetch()} message="Couldn't load variations." />;

  const pending = variations
    .filter((v) => v.status === "pending" || v.status === "action")
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  if (pending.length === 0) {
    return (
      <WidgetEmpty
        icon={GitBranch}
        title="No pending variations"
        message="All variations have been resolved."
      />
    );
  }

  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name || "Unknown project";

  return (
    <div className="flex h-full flex-col" data-testid="business-variations-pending-widget">
      <div className="mb-2 flex items-center justify-between text-xs text-bp-muted">
        <span>{pending.length} pending</span>
        <span>Days waiting</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {pending.map((v) => {
            const days = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(v.createdAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            );
            return (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-md border border-bp-border px-2 py-1.5"
                data-testid={`variation-${v.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.name}</p>
                  <p className="truncate text-xs text-bp-muted">
                    {v.variationNumber} · {projectName(v.projectId)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-sm font-semibold">
                    {formatCurrencyCents(v.totalAmount || 0)}
                  </span>
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {days}d
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

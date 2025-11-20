import { Loader2 } from "lucide-react";

interface PullToRefreshIndicatorProps {
  isRefreshing: boolean;
  pullDistance: number;
  pullPercentage: number;
}

export function PullToRefreshIndicator({
  isRefreshing,
  pullDistance,
  pullPercentage,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className="flex items-center justify-center py-2 transition-all"
      style={{
        transform: `translateY(${pullDistance}px)`,
        opacity: Math.min(pullPercentage / 100, 1),
      }}
    >
      {isRefreshing ? (
        <div className="flex items-center gap-2 text-primary">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Refreshing...</span>
        </div>
      ) : (
        <div className="text-sm font-medium text-muted-foreground">
          {pullPercentage >= 100 ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}
    </div>
  );
}

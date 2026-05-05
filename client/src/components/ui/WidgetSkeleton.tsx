import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface WidgetSkeletonProps {
  rows?: number;
  className?: string;
}

/**
 * Standard loading skeleton for widgets — a few shimmer rows shaped like
 * typical list / metric content. Drop directly inside a <WidgetCard>.
 */
export function WidgetSkeleton({ rows = 3, className }: WidgetSkeletonProps) {
  return (
    <div
      data-testid="widget-skeleton"
      className={cn("flex flex-col gap-2 pt-1", className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full bg-bp-subtle" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-3/4 bg-bp-subtle" />
            <Skeleton className="h-2.5 w-1/2 bg-bp-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

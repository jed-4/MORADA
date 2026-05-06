import { Skeleton } from "@/components/ui/skeleton";

export function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-5" data-testid="widget-skeleton">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

interface WidgetEmptyProps {
  message: string;
  action?: { label: string; onClick: () => void };
}

export function WidgetEmpty({ message, action }: WidgetEmptyProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 py-8 px-5 text-center"
      data-testid="widget-empty"
    >
      <p className="text-xs text-bp-muted">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-xs text-bp-purple font-medium hover:underline"
          data-testid="button-widget-empty-action"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

interface WidgetErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function WidgetError({
  message = "Could not load data",
  onRetry,
}: WidgetErrorProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-5 py-3 border-t border-bp-border bg-bp-subtle"
      data-testid="widget-error"
    >
      <p className="text-[11px] text-bp-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-[11px] text-bp-purple font-medium hover:underline"
          data-testid="button-widget-retry"
        >
          Retry
        </button>
      )}
    </div>
  );
}

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface WidgetErrorProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Subtle error notice for widgets — coloured strip at the bottom of the card
 * with a Retry button. Designed to sit inside a <WidgetCard>.
 */
export function WidgetError({
  message = "Couldn't load this widget.",
  onRetry,
  className,
}: WidgetErrorProps) {
  return (
    <div
      data-testid="widget-error"
      className={cn(
        "mt-2 flex items-center justify-between gap-2 rounded-sm border border-bp-coral/30 bg-bp-coral/10 px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-bp-coral" />
        <p className="truncate text-xs text-bp-card-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRetry}
          data-testid="widget-error-retry"
          className="h-7 px-2 text-xs"
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}

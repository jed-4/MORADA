import { ReactNode } from "react";
import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WidgetEmptyProps {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Empty-state placeholder for widgets — centred icon + short message + optional
 * action slot (e.g. a small "Add task" button). Drop inside a <WidgetCard>.
 */
export function WidgetEmpty({
  icon: Icon = Inbox,
  title,
  message = "Nothing to show yet.",
  action,
  className,
}: WidgetEmptyProps) {
  return (
    <div
      data-testid="widget-empty"
      className={cn(
        "flex h-full flex-col items-center justify-center gap-2 py-6 text-center",
        className,
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bp-subtle text-bp-muted">
        <Icon className="h-4 w-4" />
      </div>
      {title ? (
        <p className="text-sm font-medium text-bp-card-foreground">{title}</p>
      ) : null}
      <p className="max-w-[18rem] text-xs text-bp-muted">{message}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

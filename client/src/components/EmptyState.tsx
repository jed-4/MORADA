import { Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** Lucide icon component to render in the circular badge above the title. */
  icon?: LucideIcon;
  /** Headline shown directly under the icon. */
  title: string;
  /** Optional supporting copy under the title. */
  description?: string;
  /** Optional primary call-to-action. */
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    /** Disable the button (e.g. while a mutation is pending). */
    disabled?: boolean;
    /** Show a spinner in place of the icon and disable the button. */
    loading?: boolean;
    "data-testid"?: string;
  };
  /** Choose how prominent the empty state should look.
   *  - "card"  : full bordered card, suitable for the body of a list page
   *  - "inline": no border, suitable for embedding inside other surfaces */
  variant?: "card" | "inline";
  className?: string;
  "data-testid"?: string;
}

/**
 * Standard empty-state used across list pages ("No X found").
 * Drop-in replacement for the per-page Card + icon + title + button combos.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
  className,
  ...rest
}: EmptyStateProps) {
  const ActionIcon = action?.icon;
  const wrapper =
    variant === "card"
      ? "rounded-lg border border-border bg-card"
      : "";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12",
        wrapper,
        className,
      )}
      data-testid={rest["data-testid"] ?? "empty-state"}
    >
      {Icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? (
        <Button
          className="mt-4"
          onClick={action.onClick}
          disabled={action.disabled || action.loading}
          data-testid={action["data-testid"] ?? "empty-state-action"}
        >
          {action.loading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : ActionIcon ? (
            <ActionIcon className="mr-1.5 h-4 w-4" />
          ) : null}
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

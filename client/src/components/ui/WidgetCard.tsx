import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type WidgetAccent =
  | "purple"
  | "teal"
  | "green"
  | "amber"
  | "coral"
  | "financial"
  | "project"
  | "schedule"
  | "success"
  | "danger";

const ACCENT_BG: Record<WidgetAccent, string> = {
  purple: "bg-bp-purple",
  teal: "bg-bp-teal",
  green: "bg-bp-green",
  amber: "bg-bp-amber",
  coral: "bg-bp-coral",
  financial: "bg-bp-accent-financial",
  project: "bg-bp-accent-project",
  schedule: "bg-bp-accent-schedule",
  success: "bg-bp-accent-success",
  danger: "bg-bp-accent-danger",
};

export interface WidgetCardProps {
  title: string;
  subtitle?: string;
  accent?: WidgetAccent;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  locked?: boolean;
  lockedMessage?: string;
}

export function WidgetCard({
  title,
  subtitle,
  accent = "purple",
  headerLeft,
  headerRight,
  children,
  className,
  contentClassName,
  locked = false,
  lockedMessage = "You don't have permission to view this content.",
}: WidgetCardProps) {
  return (
    <div
      data-testid={`widget-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-md border border-bp-border bg-bp-card text-bp-card-foreground shadow-card",
        className,
      )}
    >
      <div className={cn("h-1 w-full", ACCENT_BG[accent])} />
      <div className="flex items-start gap-2 px-4 pt-3 pb-2">
        {headerLeft ? (
          <div className="flex shrink-0 items-center">{headerLeft}</div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-bp-muted">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {locked ? (
            <span
              data-testid="widget-card-locked-badge"
              className="inline-flex items-center gap-1 rounded-sm bg-bp-amber/15 px-2 py-0.5 text-xs font-medium text-bp-amber"
            >
              <Lock className="h-3 w-3" />
              Permission required
            </span>
          ) : null}
          {headerRight}
        </div>
      </div>
      <div className={cn("relative flex-1 min-h-0 overflow-y-auto px-4 pb-4", contentClassName)}>
        {children}
        {locked ? (
          <div
            data-testid="widget-card-locked-overlay"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-b-md bg-bp-card/70 p-4 text-center backdrop-blur-sm"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bp-amber/15 text-bp-amber">
              <Lock className="h-4 w-4" />
            </div>
            <p className="max-w-xs text-xs text-bp-muted">{lockedMessage}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

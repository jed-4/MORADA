import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type WidgetAccent = "purple" | "teal" | "green" | "amber" | "coral";

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  accent?: WidgetAccent;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  locked?: boolean;
  lockedMessage?: string;
}

const accentClasses: Record<WidgetAccent, string> = {
  purple: "bg-bp-purple",
  teal: "bg-bp-teal",
  green: "bg-bp-green",
  amber: "bg-bp-amber",
  coral: "bg-bp-coral",
};

export function WidgetCard({
  title,
  subtitle,
  accent = "purple",
  headerRight,
  children,
  className,
  locked = false,
  lockedMessage = "You don't have permission to view this data",
}: WidgetCardProps) {
  return (
    <div
      className={cn(
        "bg-bp-card border border-bp-border rounded-md overflow-hidden flex flex-col h-full",
        className,
      )}
      data-testid="widget-card"
    >
      <div className={cn("h-1 w-full shrink-0", accentClasses[accent])} />

      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-bp-card-foreground leading-tight truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-[11px] text-bp-muted mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {headerRight && (
          <div className="flex items-center gap-2 shrink-0">{headerRight}</div>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {children}

        {locked && (
          <div
            className="absolute inset-0 bg-bp-card/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 z-10"
            data-testid="widget-card-locked"
          >
            <div className="bg-bp-amber/15 text-bp-amber text-[11px] font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              <span>{lockedMessage}</span>
            </div>
            <p className="text-[10px] text-bp-muted">
              Contact your administrator to request access
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

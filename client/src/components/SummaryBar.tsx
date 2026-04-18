import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Inline summary strip used above data tables. A single horizontal bar of
 * `label: value` pairs (no separate cards). Per the table-restyle spec:
 *   - 40px height, white surface (light) / table surface (dark)
 *   - 8px radius, no shadow
 *   - label: 9px / muted; value: 13px bold (optionally tinted via `tone`)
 */

export type SummaryTone =
  | "default"
  | "success"
  | "warning"
  | "info"
  | "danger"
  | "action";

export interface SummaryItem {
  label: string;
  value: React.ReactNode;
  tone?: SummaryTone;
  testid?: string;
}

const TONE_CLASS: Record<SummaryTone, string> = {
  default: "text-foreground",
  success: "text-status-success",
  warning: "text-status-warning",
  info: "text-status-info",
  danger: "text-status-danger",
  action: "text-status-action",
};

export interface SummaryBarProps extends React.HTMLAttributes<HTMLDivElement> {
  items: SummaryItem[];
}

export function SummaryBar({ items, className, ...rest }: SummaryBarProps) {
  return (
    <div
      className={cn(
        "h-10 flex items-center gap-6 px-4 rounded-md bg-table-surface",
        className,
      )}
      {...rest}
    >
      {items.map((item, idx) => (
        <div
          key={idx}
          className="flex items-baseline gap-2"
          data-testid={item.testid}
        >
          <span className="text-[9px] uppercase tracking-wide text-table-header-foreground">
            {item.label}
          </span>
          <span
            className={cn(
              "text-[13px] font-bold leading-none",
              TONE_CLASS[item.tone ?? "default"],
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

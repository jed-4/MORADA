import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Main column + optional right rail, at one agreed width.
 *
 * The detail pages disagreed: RFQDetail used w-72, BillDetail w-[31vw], and
 * four others had no rail at all. w-80 is the settled default — wide enough for
 * a date, a status and a short note without crowding the main column.
 */
export function DetailLayout({
  children,
  sidebar,
  sidebarWidth = "w-80",
  className,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
  sidebarWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-hidden flex min-h-0", className)}>
      <div className="flex-1 overflow-auto px-6 py-5 space-y-7 min-w-0">{children}</div>
      {sidebar && (
        <div className={cn("border-l overflow-auto px-4 py-5 space-y-6 bg-muted/10 flex-shrink-0", sidebarWidth)}>
          {sidebar}
        </div>
      )}
    </div>
  );
}

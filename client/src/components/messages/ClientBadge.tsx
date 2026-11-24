import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Amber "Client" pill for client-facing channels (channels.isClientFacing).
 * Amber, not red: destructive means error/over-budget, warning means caution.
 * Matches the mobile app's CLIENT pill (amber-light wash, status-warning text,
 * both tokens have dark-mode values). Shared by the conversation header and
 * message search so the two can't drift apart.
 */
export function ClientBadge({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center shrink-0 rounded-full bg-amber-light text-status-warning font-semibold text-data",
        size === "sm" ? "h-4 px-1.5 gap-0.5" : "h-5 px-2 gap-1",
        className,
      )}
      aria-label="Client-facing channel, visible to the client"
      data-testid="badge-client-facing"
    >
      <Eye className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      Client
    </span>
  );
}

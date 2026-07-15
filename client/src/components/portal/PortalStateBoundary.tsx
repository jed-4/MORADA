import { Loader2, AlertCircle } from "lucide-react";

/**
 * Standard full-screen loading state for public portals.
 */
export function PortalLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <div
        className="flex flex-col items-center gap-3"
        data-testid="portal-loading"
      >
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/**
 * Standard full-screen error / expired-link state for public portals.
 */
export function PortalError({
  title = "Link not found",
  description = "This link is invalid or has expired. Please contact your builder for a new link.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <div
        className="flex flex-col items-center gap-3 text-center max-w-sm"
        data-testid="portal-error"
      >
        <AlertCircle className="w-10 h-10 text-destructive" />
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

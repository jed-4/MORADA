import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useClientPortal } from "@/hooks/use-client-portal";

/**
 * Deny-by-default routing for client-portal users.
 *
 * Wraps the authenticated router so a client can only ever land on their own
 * project. Two things make a per-route guard impractical here: the ~20 detail
 * routes (/projects/:id/variations/:vid, /bills/:id, …) bypass the project page
 * component entirely, and every builder-only global page (/business, /contacts,
 * /estimates, /settings…) is otherwise reachable by typing the URL. Both are
 * covered by matching the location once, here.
 *
 * Presentation only — the server's clientAccessGate is what actually withholds
 * the data. This just means a client sees a clear message instead of an empty
 * page full of failed requests.
 */

/** Paths a client may reach outside their project. */
const CLIENT_GLOBAL_PATHS = ["/", "/profile", "/privacy", "/terms"];

function deniedSection(pathname: string, canSeeTab: (id: string) => boolean): boolean {
  const projectMatch = pathname.match(/^\/projects\/[^/]+(?:\/([^/?#]+))?/);
  if (projectMatch) {
    const section = projectMatch[1];
    // Bare /projects/:id — the project page itself resolves the landing tab.
    if (!section) return false;
    return !canSeeTab(section);
  }
  return !CLIENT_GLOBAL_PATHS.includes(pathname);
}

export function ClientRouteGuard({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isClient, canSeeTab } = useClientPortal();

  if (!isClient) return <>{children}</>;

  const pathname = location.split("?")[0];
  if (deniedSection(pathname, canSeeTab)) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="No access to this page"
        description="You don't have permission to view this page. Contact your builder if you think you should."
        variant="inline"
        className="h-full"
        data-testid="client-route-denied"
      />
    );
  }

  return <>{children}</>;
}

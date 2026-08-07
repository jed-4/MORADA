import type { Request, Response, NextFunction } from "express";

/**
 * Reject authenticated requests whose session has no companyId.
 *
 * Registration creates a user with companyId null and nothing forces
 * onboarding to completion, so a company-less session could reach the normal
 * API. Roughly a dozen list endpoints pass their companyId straight through to
 * storage as `user?.companyId as string | undefined` and simply skip the
 * tenancy filter when it's undefined — GET /api/tasks, /api/bills,
 * /api/checklist-templates (+ /export), /api/projects/:id/bills,
 * /bill-line-items, /actual-costs, /budget-actuals, /contract-metrics,
 * GET + PATCH /api/company-settings and POST /api/bills/recompute-totals all
 * fail open that way, returning every company's rows. Rather than patch each
 * one, this closes the whole class at the mount point.
 *
 * Mounted after the global auth middleware, so an unauthenticated request has
 * already been handled: either it was rejected, or the path is public
 * (token-gated portals, webhooks) and has no session to check. Those fall
 * through untouched.
 */

/**
 * Paths a user legitimately reaches before their company exists.
 *
 * `path` is relative to the /api mount. This list is deliberately narrow: the
 * client renders ONLY the onboarding page while `user.companyId` is null (see
 * App.tsx), so the entire pre-company surface is /auth/user, the profile step,
 * company creation and plan selection. Anything broader would hand a
 * company-less session part of the real API.
 */
function isPreCompanyPath(method: string, path: string, req: Request): boolean {
  if (method === "OPTIONS") return true;

  // Login / register / logout / session probe.
  if (path.startsWith("/auth/")) return true;

  // Plan selection runs at the end of onboarding. These routes read the
  // company from the session themselves and 401 when it's absent.
  if (path.startsWith("/billing/")) return true;

  // Token-gated and machine callers — no session, nothing to scope.
  if (path.startsWith("/portal/")) return true;
  if (path === "/stripe/webhook" || path === "/xero/webhook") return true;
  if (/^\/invitations\/by-token\/[^/]+$/.test(path)) return true;
  if (/^\/invitations\/[^/]+\/accept$/.test(path)) return true;
  if (/^\/proposals\/[^/]+\/(client-view|view|acceptances)$/.test(path)) return true;

  // Company creation — the step that ends the pre-company state. Exact match
  // on POST only: a prefix rule would also expose GET and PATCH
  // /api/companies/:id, which must stay gated.
  if (method === "POST" && path === "/companies") return true;

  // The onboarding profile step is a PATCH to the user's own record. Scoped to
  // self: the same route is the admin user-edit endpoint, so allowing every
  // /users/:id through would let a company-less session edit other users.
  const selfMatch = /^\/users\/([^/]+)$/.exec(path);
  if (method === "PATCH" && selfMatch) {
    const targetId = selfMatch[1];
    const sessionUserId = (req.session as any)?.userId;
    const reqUserId = (req.user as any)?.id;
    if (targetId && (targetId === sessionUserId || targetId === reqUserId)) return true;
  }

  return false;
}

export function requireCompany(req: Request, res: Response, next: NextFunction) {
  if (isPreCompanyPath(req.method, req.path, req)) return next();

  // No authenticated user means the global auth middleware already let this
  // through as a public route — there is no session company to enforce.
  if (!req.user && !(req.session as any)?.userId) return next();

  const companyId = (req.user as any)?.companyId || (req.session as any)?.companyId;
  if (companyId) return next();

  return res.status(403).json({
    error: "company_required",
    message: "Finish setting up your company before using this feature.",
  });
}

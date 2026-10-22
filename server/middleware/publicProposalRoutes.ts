/**
 * The proposal share-link endpoints. They live under /api/proposals rather
 * than /api/portal, so every gate that exempts /portal/* has to exempt these
 * too — and each handler validates the proposal's opaque shareToken itself
 * before reading anything.
 *
 * One list, used by the auth middleware (routes.ts), requireActivePlan
 * (plan.ts) and clientAccessGate (clientAccess.ts). Keeping three hand-copied
 * regexes was how /sent-pdf ended up public in the handler but behind auth in
 * the middleware: a signed-out homeowner got 401 on the very PDF they were
 * emailed, and a signed-in client was refused the whole proposal.
 *
 * Method-scoped on purpose: GET /acceptances returns acceptance history and
 * stays behind auth.
 */
export function isPublicProposalShareRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" && /^\/proposals\/[^/]+\/(client-view|sent-pdf)$/.test(path)) return true;
  if (m === "POST" && /^\/proposals\/[^/]+\/(view|acceptances)$/.test(path)) return true;
  return false;
}

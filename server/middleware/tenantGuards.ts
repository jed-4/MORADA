/**
 * Generic tenant-ownership combinators.
 *
 * The per-entity guards in routes.ts are thin wrappers around these three
 * shapes. They live here, with their record lookups injected, so the logic can
 * be exercised without a database — server/auth.ts builds its session
 * middleware in a module-load IIFE bound to a connect-pg-simple store, so
 * registerRoutes cannot boot without live Postgres. Same constraint that shaped
 * middleware/scopeOwnership.ts and middleware/uploadsAccess.ts.
 *
 * Every guard answers 404 (never 403) so the existence of another tenant's
 * record is never confirmed. Unauthenticated requests are rejected upstream by
 * requireAuth (401), and company-less sessions by requireCompany (403).
 */

type Req = any;
type Res = any;

/** A guard: returns the record when owned, else writes 404 and returns null. */
export type OwnershipGuard = (
  req: Req, res: Res, id: string, notFound?: string,
) => Promise<any | null>;

/**
 * Shape 1 — the record carries companyId. Compare it to the session's.
 *
 * Fails closed on every missing input: no id, no session company, no record,
 * or a company mismatch all produce the same 404.
 */
export function makeOwnedByCompany(
  load: (id: string) => Promise<any | undefined | null>,
  defaultNotFound = "Not found",
): OwnershipGuard {
  return async (req, res, id, notFound = defaultNotFound) => {
    if (!id) { res.status(404).json({ error: notFound }); return null; }
    const companyId = req.user?.companyId;
    if (!companyId) { res.status(404).json({ error: notFound }); return null; }
    const record = await load(id);
    if (!record || record.companyId !== companyId) {
      res.status(404).json({ error: notFound }); return null;
    }
    return record;
  };
}

/**
 * Shape 2 — the record has no companyId; ownership lives on a parent.
 *
 * Loads the record, extracts the parent id, and delegates to the parent's
 * guard. Chains: a step's parent guard can itself be a via-parent guard, which
 * is how schedule_item_steps → schedule_items → schedules → projects resolves.
 */
export function makeOwnedViaParent(
  load: (id: string) => Promise<any | undefined | null>,
  parentIdOf: (record: any) => string | null | undefined,
  parentGuard: OwnershipGuard,
  defaultNotFound = "Not found",
): OwnershipGuard {
  return async (req, res, id, notFound = defaultNotFound) => {
    if (!id) { res.status(404).json({ error: notFound }); return null; }
    const record = await load(id);
    if (!record) { res.status(404).json({ error: notFound }); return null; }
    const parentId = parentIdOf(record);
    if (!parentId) { res.status(404).json({ error: notFound }); return null; }
    if (!(await parentGuard(req, res, parentId, notFound))) return null;
    return record;
  };
}

/**
 * Shape 3 — a batch of ids, all of which must be owned.
 *
 * One foreign or missing id rejects the WHOLE batch: a partial accept on a
 * multi-row write is worse than a refusal, because the caller cannot tell
 * which half applied.
 *
 * `fetchOwnedIds` resolves the subset of ids the caller owns — implementations
 * do this in a single joined query rather than one lookup per id, because at
 * ~400ms per round trip an N-query guard is a timeout, not a fix.
 */
export function makeOwnsAllByIds(
  fetchOwnedIds: (ids: string[], companyId: string) => Promise<string[]>,
  defaultNotFound = "Not found",
) {
  return async (
    req: Req, res: Res, ids: Array<string | null | undefined>, notFound = defaultNotFound,
  ): Promise<boolean> => {
    const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
    if (unique.length === 0) return true;               // nothing to write
    const companyId = req.user?.companyId;
    if (!companyId) { res.status(404).json({ error: notFound }); return false; }

    const owned = await fetchOwnedIds(unique, companyId);
    const ownedSet = new Set(owned);
    if (unique.some((id) => !ownedSet.has(id))) {
      res.status(404).json({ error: notFound });
      return false;
    }
    return true;
  };
}

/**
 * Batch variant driven by a per-id guard, for entities with no bulk query.
 * Resolves in parallel — never a sequential loop.
 */
export function makeOwnsAllVia(guard: OwnershipGuard, defaultNotFound = "Not found") {
  return async (
    req: Req, res: Res, ids: Array<string | null | undefined>, notFound = defaultNotFound,
  ): Promise<boolean> => {
    if (ids.some((id) => !id)) { res.status(404).json({ error: notFound }); return false; }
    if (ids.length === 0) return true;
    // A sink res so an individual resolver cannot write a 404 mid-batch; the
    // batch sends exactly one response.
    const sink = { status: () => ({ json: () => undefined }) } as any;
    const results = await Promise.all(ids.map((id) => guard(req, sink, id as string, notFound)));
    if (results.some((r) => !r)) { res.status(404).json({ error: notFound }); return false; }
    return true;
  };
}

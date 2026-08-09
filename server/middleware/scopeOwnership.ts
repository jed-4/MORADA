/**
 * Cross-tenant ownership guards for the scope section.
 *
 * These live outside routes.ts so they can be exercised without a database:
 * the record lookups are injected, so a test can supply an in-memory fixture
 * and drive the real guard logic. server/auth.ts builds its session middleware
 * in a module-load IIFE bound to a connect-pg-simple store, so registerRoutes
 * cannot boot without live Postgres — the same constraint that shaped
 * middleware/uploadsAccess.ts.
 *
 * Every guard answers 404 (never 403) on a company mismatch, so the existence
 * of another tenant's record is never confirmed to an outside caller.
 * Unauthenticated requests are already rejected upstream by requireAuth (401).
 */

/** The subset of a record these guards care about. */
interface CompanyOwned {
  companyId?: string | null;
}

export interface ScopeOwnershipDeps {
  getProject(id: string): Promise<CompanyOwned | undefined | null>;
  getScopeItem(id: string): Promise<CompanyOwned | undefined | null>;
  getScopeStage(id: string): Promise<CompanyOwned | undefined | null>;
  getScopeGearPhoto(id: string): Promise<CompanyOwned | undefined | null>;
}

export interface ScopeOwnershipGuards {
  enforceProjectCompany(
    req: any, res: any, projectId: string | null | undefined, notFoundMessage?: string,
  ): Promise<boolean>;
  getOwnedScopeItem(req: any, res: any, id: string, notFound?: string): Promise<any | null>;
  getOwnedScopeStage(req: any, res: any, id: string, notFound?: string): Promise<any | null>;
  getOwnedGearPhoto(req: any, res: any, id: string, notFound?: string): Promise<any | null>;
  ownsAllScopeStages(
    req: any, res: any, ids: Array<string | undefined | null>, notFound?: string,
  ): Promise<boolean>;
}

export function createScopeOwnershipGuards(deps: ScopeOwnershipDeps): ScopeOwnershipGuards {
  /**
   * Loads a record by id and verifies it belongs to the caller's company.
   * Returns the record when owned; otherwise writes the 404 and returns null
   * so the caller can `return` immediately.
   */
  const ownedBy = async (
    load: (id: string) => Promise<CompanyOwned | undefined | null>,
    req: any, res: any, id: string, notFound: string,
  ): Promise<any | null> => {
    if (!id) { res.status(404).json({ error: notFound }); return null; }
    const companyId = req.user?.companyId;
    if (!companyId) { res.status(404).json({ error: notFound }); return null; }
    const record = await load(id);
    if (!record || record.companyId !== companyId) {
      res.status(404).json({ error: notFound });
      return null;
    }
    return record;
  };

  return {
    // Ownership guard for resources isolated only via project_id (estimates,
    // selections, schedules, scope stages by project). Loads the owning project
    // and verifies it belongs to the caller's company. Returns true when access
    // is allowed; otherwise writes the 404 and returns false.
    async enforceProjectCompany(req, res, projectId, notFoundMessage = "Not found") {
      return (await ownedBy(deps.getProject, req, res, projectId as string, notFoundMessage)) !== null;
    },

    // Scope items, stages and gear photos all carry companyId directly, so a
    // single-row read is enough — no project join required.
    getOwnedScopeItem(req, res, id, notFound = "Scope item not found") {
      return ownedBy(deps.getScopeItem, req, res, id, notFound);
    },

    getOwnedScopeStage(req, res, id, notFound = "Scope stage not found") {
      return ownedBy(deps.getScopeStage, req, res, id, notFound);
    },

    getOwnedGearPhoto(req, res, id, notFound = "Photo not found") {
      return ownedBy(deps.getScopeGearPhoto, req, res, id, notFound);
    },

    // Batch guard for the reorder route: every id must resolve to a stage the
    // caller owns, and one foreign or missing id rejects the whole batch (the
    // reorder is a multi-row write, so a partial accept would be worse than a
    // refusal). Loaded in parallel — a sequential loop would cost a full
    // database round trip per stage.
    async ownsAllScopeStages(req, res, ids, notFound = "Scope stage not found") {
      const companyId = req.user?.companyId;
      if (!companyId) { res.status(404).json({ error: notFound }); return false; }
      if (ids.some((id) => !id)) { res.status(404).json({ error: notFound }); return false; }

      const stages = await Promise.all(ids.map((id) => deps.getScopeStage(id as string)));
      if (stages.some((stage) => !stage || stage.companyId !== companyId)) {
        res.status(404).json({ error: notFound });
        return false;
      }
      return true;
    },
  };
}

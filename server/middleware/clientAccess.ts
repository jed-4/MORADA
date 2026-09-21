import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";
import { resolveVariationDocumentColumns } from "@shared/variationDocumentColumns";
import { PORTAL_KEYS } from "@shared/clientPortalPermissions";
import {
  clientAllowanceEstimateIds,
  isSiteDiaryClientVisible,
  projectClientScheduleItem,
  projectClientSiteDiaryEntry,
  isInvoiceClientVisible,
  isVariationClientVisible,
  projectClientAllowance,
  projectClientInvoice,
  projectClientInvoiceItem,
  projectClientInvoicePayments,
  projectClientVariation,
  projectClientVariationItems,
} from "../clientProjections";

/**
 * Client-session gate.
 *
 * Clients (users.userCategory === "client") live inside the same app as the
 * team, so every route they can reach must be deliberate. This middleware is
 * the single choke point for that: it runs once, early, and is a no-op for
 * every non-client session — team/supplier/admin paths are untouched.
 *
 * For a client session it enforces three things:
 *   1. Deny-by-default. Only routes in ALLOW_RULES are reachable; anything
 *      else 403s. Most project sub-resource routes have no permission check of
 *      their own, so this allow-list — not the routes — is what contains a
 *      client.
 *   2. Permission. Each rule names a client portal key (portal.*, see
 *      shared/clientPortalPermissions.ts) + action, checked against the
 *      role's persisted permissions, so a tick in Roles & Permissions is the
 *      single source of truth for what a client can see.
 *   3. Project scope. Project-scoped rules resolve the target project and
 *      reject anything outside the client's userProjectAccess grants. Without
 *      this a client could read any project in the builder's company, since
 *      the routes themselves only check companyId.
 *
 * Deliberately has NO development bypass (unlike requirePermission /
 * requireTeamMember): client containment is the whole point of this gate, so
 * it must behave identically in dev and prod.
 */

type PermissionAction =
  | "view"
  | "add"
  | "edit"
  | "delete"
  | "approve"
  | "send"
  | "convert"
  | "summary_only";

type ProjectResolver = (req: Request) => Promise<string | null>;

/** Returned by a shaper to answer 404 instead of the route's body. */
export const HIDE_FROM_CLIENT = Symbol("hideFromClient");

/**
 * Rewrites a successful JSON body into what the client may see. Runs AFTER the
 * route handler, so the route stays client-agnostic and this file remains the
 * one place that decides what a client session receives.
 */
type ResponseShaper = (
  body: any,
  req: Request,
  user: User,
  /**
   * The gate-relative path ("/variations/:id/items"), captured when the gate
   * ran. Shapers run inside the route's res.json, and by then Express has
   * restored req.url to the full "/api/..." path — so req.path must NOT be
   * read inside a shaper.
   */
  path: string,
) => Promise<any | typeof HIDE_FROM_CLIENT>;

interface AllowRule {
  methods: string[];
  pattern: RegExp;
  /** Omitted = reachable by any client session (app-shell essentials). */
  permission?: [string, PermissionAction];
  /** Resolves the project this request targets; omit for non-project routes. */
  project?: ProjectResolver;
  /** Extra resource-level check (e.g. channel membership). false → 403. */
  check?: (req: Request, user: User) => Promise<boolean>;
  /** Projects the response body for a client. Omitted = sent as-is. */
  shape?: ResponseShaper;
}

// Paths are matched WITHOUT the /api prefix — this middleware is mounted with
// app.use('/api', ...), so req.path is already relative.

const projectFromQuery: ProjectResolver = async (req) =>
  (req.query.projectId as string) || null;

/** /projects/:projectId/... */
const projectParam: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/projects\/([^/]+)/);
  return m ? m[1] : null;
};

/** Resolve the project by loading the resource the path points at. */
const projectViaSelection: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/selections\/([^/]+)/);
  if (!m) return null;
  const selection = await storage.getSelection(m[1]);
  return selection?.projectId ?? null;
};

const projectViaSelectionOption: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/selection-options\/([^/]+)/);
  if (!m) return null;
  const option = await storage.getSelectionOption(m[1]);
  if (!option) return null;
  const selection = await storage.getSelection(option.selectionId);
  return selection?.projectId ?? null;
};

/**
 * /reviews/:id/... — resolve the project a review item belongs to.
 *
 * Company-scoped at the lookup: a client quoting another tenant's review id
 * resolves to nothing and the gate denies, rather than leaking the fact that
 * the id exists by returning a project the client then fails on.
 */
const projectViaReviewItem: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/reviews\/([^/]+)/);
  if (!m) return null;
  const companyId = (req as any).__clientAccessUser?.companyId;
  if (!companyId) return null;
  const item = await storage.getReviewItem(m[1], companyId);
  return item?.projectId ?? null;
};

const projectViaVariation: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/variations\/([^/]+)/);
  if (!m) return null;
  const variation = await storage.getVariation(m[1]);
  return variation?.projectId ?? null;
};

const projectViaClientInvoice: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/client-invoices\/([^/]+)/);
  if (!m) return null;
  const invoice = await storage.getClientInvoice(m[1]);
  return invoice?.projectId ?? null;
};

const projectViaSchedule: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/schedules\/([^/]+)/);
  if (!m) return null;
  // getSchedule() takes a projectId — getScheduleById() is the id lookup.
  const schedule = await storage.getScheduleById(m[1]);
  return schedule?.projectId ?? null;
};

const projectViaSiteDiaryEntry: ProjectResolver = async (req) => {
  const m = req.path.match(/^\/site-diary-entries\/([^/]+)/);
  if (!m) return null;
  const entry = await storage.getSiteDiaryEntry(m[1]);
  return (entry as any)?.projectId ?? null;
};

// ── Resource checks ─────────────────────────────────────────────────────────

/**
 * /channels/:id/... — the client must be a MEMBER of the channel. The routes
 * only check the channel is in the caller's company, so without this a client
 * holding any channel id could post into an internal team channel.
 */
const isChannelMember = async (req: Request, user: User): Promise<boolean> => {
  const m = req.path.match(/^\/channels\/([^/]+)/);
  if (!m || !user.companyId) return false;
  const channel = await storage.getChannel(m[1], user.companyId);
  if (!channel) return false;
  const members = await storage.getChannelMembers(m[1]);
  return members.some((member) => member.userId === user.id);
};

// ── Response shapers ────────────────────────────────────────────────────────

const variationIdFromPath = (path: string) => path.match(/^\/variations\/([^/]+)/)?.[1] ?? null;
const invoiceIdFromPath = (path: string) => path.match(/^\/client-invoices\/([^/]+)/)?.[1] ?? null;

const shapeVariationList: ResponseShaper = async (body) =>
  Array.isArray(body)
    ? body
        .filter(isVariationClientVisible)
        .map((v: any) => ({ ...projectClientVariation(v), projectId: v.projectId }))
    : HIDE_FROM_CLIENT;

const shapeVariation: ResponseShaper = async (body) =>
  isVariationClientVisible(body)
    ? { ...projectClientVariation(body), projectId: body.projectId }
    : HIDE_FROM_CLIENT;

const shapeVariationItems: ResponseShaper = async (body, _req, user, path) => {
  const id = variationIdFromPath(path);
  const variation = id ? await storage.getVariation(id) : undefined;
  if (!isVariationClientVisible(variation) || !Array.isArray(body)) return HIDE_FROM_CLIENT;
  const settings = user.companyId
    ? await storage.getCompanySettings(user.companyId).catch(() => undefined)
    : undefined;
  // Same column resolution as the emailed portal: a column the builder turned
  // off on this document never leaves the server.
  const columns = resolveVariationDocumentColumns(
    (variation as any).pdfColumns,
    (settings as any)?.variationPdfColumns,
  );
  const costCodeLabels: Record<string, string> = {};
  if (columns.costCode && user.companyId) {
    const codes = await storage.getCostCodes(user.companyId).catch(() => []);
    for (const c of codes as any[]) costCodeLabels[c.id] = `${c.code} - ${c.title}`;
  }
  return projectClientVariationItems(body, columns, costCodeLabels);
};

const shapeInvoiceList: ResponseShaper = async (body) =>
  Array.isArray(body) ? body.filter(isInvoiceClientVisible).map(projectClientInvoice) : HIDE_FROM_CLIENT;

const shapeInvoice: ResponseShaper = async (body) =>
  isInvoiceClientVisible(body) ? projectClientInvoice(body) : HIDE_FROM_CLIENT;

const shapeInvoiceChild: ResponseShaper = async (body, _req, _user, path) => {
  const id = invoiceIdFromPath(path);
  const invoice = id ? await storage.getClientInvoice(id) : undefined;
  if (!isInvoiceClientVisible(invoice) || !Array.isArray(body)) return HIDE_FROM_CLIENT;
  return path.endsWith("/payments")
    ? projectClientInvoicePayments(body)
    : body.map(projectClientInvoiceItem);
};

const shapeAllowances: ResponseShaper = async (body, _req, _user, path) => {
  const projectId = path.match(/^\/projects\/([^/]+)/)?.[1];
  if (!projectId || !Array.isArray(body)) return HIDE_FROM_CLIENT;
  const [project, estimates] = await Promise.all([
    storage.getProject(projectId),
    storage.getEstimates(projectId),
  ]);
  const visibleEstimates = clientAllowanceEstimateIds(project as any, estimates as any);
  return body
    .filter((row: any) => visibleEstimates.has(row?.item?.estimateId))
    .map(projectClientAllowance);
};

/**
 * Schedule items: without "every item", a client sees the top-level phases
 * only (items with no parent). Rolled-up dates and progress already live on
 * the parent rows, so nothing is lost from the phase view.
 */
const shapeScheduleItems: ResponseShaper = async (body, _req, user) => {
  if (!Array.isArray(body)) return HIDE_FROM_CLIENT;
  const allItems = await storage.checkUserPermission(user.id, PORTAL_KEYS.scheduleAllItems, "view");
  const items = allItems ? body : body.filter((item: any) => !item?.parentItemId);
  return items.map(projectClientScheduleItem);
};

/** Site diary: only entries ticked "share with client", trimmed. */
const shapeSiteDiaryList: ResponseShaper = async (body) => {
  if (!Array.isArray(body)) return HIDE_FROM_CLIENT;
  return body.filter(isSiteDiaryClientVisible).map(projectClientSiteDiaryEntry);
};

const shapeSiteDiaryEntry: ResponseShaper = async (body) =>
  isSiteDiaryClientVisible(body) ? projectClientSiteDiaryEntry(body) : HIDE_FROM_CLIENT;

/**
 * Review detail: drop the bearer portal token, internal ids and the audit
 * trail's IP/user-agent. Comments are already filtered to non-internal by the
 * route's query.
 */
const shapeReview: ResponseShaper = async (body) => {
  if (!body || typeof body !== "object") return body;
  const { portalToken, reviewerContactId, createdById, approvals, ...rest } = body;
  return {
    ...rest,
    approvals: Array.isArray(approvals)
      ? approvals.map(({ decidedIp, decidedUserAgent, ...a }: any) => a)
      : approvals,
  };
};

/**
 * Attach a shaper to res.json for this request. Error responses pass through
 * untouched; a shaper failure answers 500 rather than falling back to the
 * unshaped body.
 */
function installShaper(req: Request, res: Response, user: User, shape: ResponseShaper) {
  const originalJson = res.json.bind(res);
  const path = req.path; // gate-relative; see ResponseShaper
  res.json = ((body: any) => {
    if (res.statusCode >= 400) return originalJson(body);
    shape(body, req, user, path)
      .then((shaped) => {
        if (shaped === HIDE_FROM_CLIENT) {
          res.status(404);
          return originalJson({ error: "Not found" });
        }
        return originalJson(shaped);
      })
      .catch((error) => {
        console.error("[clientAccess] response shaping failed:", error);
        res.status(500);
        originalJson({ error: "Failed to load" });
      });
    return res;
  }) as Response["json"];
}

/**
 * The client user resolved by the gate, or null for any non-client session.
 * Routes should prefer this to req.user.userCategory, which the development
 * auth injection does not populate.
 */
export function getClientUser(req: Request): User | null {
  return ((req as any).__clientUser as User | undefined) ?? null;
}

const ALLOW_RULES: AllowRule[] = [
  // --- App shell essentials (no project, no permission) ---
  { methods: ["GET"], pattern: /^\/auth\/user$/ },
  { methods: ["GET", "POST"], pattern: /^\/(auth\/)?logout$/ },
  { methods: ["GET"], pattern: /^\/billing\/status$/ },
  { methods: ["GET"], pattern: /^\/company-settings$/ },
  { methods: ["GET"], pattern: /^\/notifications(\/.*)?$/ },
  { methods: ["POST"], pattern: /^\/notifications\/[^/]+\/read$/ },
  // Self only — the route resolves the user from the session.
  { methods: ["GET"], pattern: /^\/users\/me$/ },

  // --- Projects (the list route scopes itself to userProjectAccess) ---
  // No permission key: being granted the project (userProjectAccess) is what
  // lets a client see it; the sections inside are each gated below.
  { methods: ["GET"], pattern: /^\/projects$/ },
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+$/,
    project: projectParam,
  },

  // --- Schedule ---
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/schedules?$/,
    permission: [PORTAL_KEYS.schedule, "view"],
    project: projectParam,
  },
  {
    methods: ["GET"],
    pattern: /^\/schedules\/[^/]+\/items$/,
    permission: [PORTAL_KEYS.schedule, "view"],
    project: projectViaSchedule,
    shape: shapeScheduleItems,
  },
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/schedule-items$/,
    permission: [PORTAL_KEYS.schedule, "view"],
    project: projectParam,
    shape: shapeScheduleItems,
  },
  {
    methods: ["GET"],
    pattern: /^\/schedules\/[^/]+$/,
    permission: [PORTAL_KEYS.schedule, "view"],
    project: projectViaSchedule,
  },

  // --- Selections ---
  {
    methods: ["GET"],
    pattern: /^\/selections(\/with-options)?$/,
    permission: [PORTAL_KEYS.selections, "view"],
    project: projectFromQuery,
  },
  {
    methods: ["GET"],
    pattern: /^\/selections\/[^/]+$/,
    permission: [PORTAL_KEYS.selections, "view"],
    project: projectViaSelection,
  },
  {
    methods: ["GET"],
    pattern: /^\/selections\/[^/]+\/options$/,
    permission: [PORTAL_KEYS.selections, "view"],
    project: projectViaSelection,
  },
  {
    methods: ["GET"],
    pattern: /^\/selection-options\/[^/]+\/attachments$/,
    permission: [PORTAL_KEYS.selections, "view"],
    project: projectViaSelectionOption,
  },
  // The client CHOOSES an option; the builder confirms it (Jed, 2026-09-17),
  // so there is deliberately no client route to APPROVE one.
  {
    methods: ["PATCH"],
    pattern: /^\/selections\/[^/]+\/options\/[^/]+\/client-select$/,
    permission: [PORTAL_KEYS.selections, "edit"],
    project: projectViaSelection,
  },
  {
    methods: ["GET"],
    pattern: /^\/selections\/[^/]+\/client-comments$/,
    permission: [PORTAL_KEYS.selections, "view"],
    project: projectViaSelection,
  },
  {
    methods: ["POST"],
    pattern: /^\/selections\/[^/]+\/client-comments$/,
    permission: [PORTAL_KEYS.selections, "add"],
    project: projectViaSelection,
  },
  // The allowance list only. The /detail route is deliberately NOT here: it
  // is the builder's cost ledger (bills, suppliers, staff cost rates, markup).
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/allowances$/,
    permission: [PORTAL_KEYS.allowances, "view"],
    project: projectParam,
    shape: shapeAllowances,
  },

  // --- Client Reviews ---
  // Reads are gated on projects.reviews:view; posting a comment needs :add and
  // recording a decision needs :approve, so a read-only client can follow a
  // review without being able to answer it.
  {
    methods: ["GET"],
    pattern: /^\/reviews$/,
    permission: [PORTAL_KEYS.reviews, "view"],
    project: projectFromQuery,
  },
  {
    methods: ["GET"],
    pattern: /^\/reviews\/[^/]+$/,
    permission: [PORTAL_KEYS.reviews, "view"],
    project: projectViaReviewItem,
    shape: shapeReview,
  },
  {
    methods: ["POST"],
    pattern: /^\/reviews\/[^/]+\/comments$/,
    permission: [PORTAL_KEYS.reviews, "add"],
    project: projectViaReviewItem,
  },
  {
    methods: ["POST"],
    pattern: /^\/reviews\/[^/]+\/decision$/,
    permission: [PORTAL_KEYS.reviews, "approve"],
    project: projectViaReviewItem,
  },

  // --- Variations ---
  {
    methods: ["GET"],
    pattern: /^\/variations$/,
    permission: [PORTAL_KEYS.variations, "view"],
    project: projectFromQuery,
    shape: shapeVariationList,
  },
  {
    methods: ["GET"],
    pattern: /^\/variations\/[^/]+$/,
    permission: [PORTAL_KEYS.variations, "view"],
    project: projectViaVariation,
    shape: shapeVariation,
  },
  {
    methods: ["GET"],
    pattern: /^\/variations\/[^/]+\/items$/,
    permission: [PORTAL_KEYS.variations, "view"],
    project: projectViaVariation,
    shape: shapeVariationItems,
  },
  // Signing in the portal. Same handler as the emailed link, so the role's
  // "Sign to approve or reject" tick is what decides whether it is offered.
  {
    methods: ["POST"],
    pattern: /^\/variations\/[^/]+\/client-sign$/,
    permission: [PORTAL_KEYS.variations, "approve"],
    project: projectViaVariation,
  },

  // --- Progress claims (client invoices) ---
  {
    methods: ["GET"],
    pattern: /^\/client-invoices$/,
    permission: [PORTAL_KEYS.invoices, "view"],
    project: projectFromQuery,
    shape: shapeInvoiceList,
  },
  {
    methods: ["GET"],
    pattern: /^\/client-invoices\/[^/]+$/,
    permission: [PORTAL_KEYS.invoices, "view"],
    project: projectViaClientInvoice,
    shape: shapeInvoice,
  },
  {
    methods: ["GET"],
    pattern: /^\/client-invoices\/[^/]+\/(items|payments)$/,
    permission: [PORTAL_KEYS.invoices, "view"],
    project: projectViaClientInvoice,
    shape: shapeInvoiceChild,
  },

  // --- Site diary ---
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/site-diary-entries$/,
    permission: [PORTAL_KEYS.siteDiary, "view"],
    project: projectParam,
    shape: shapeSiteDiaryList,
  },
  {
    methods: ["GET"],
    pattern: /^\/site-diary-entries\/[^/]+$/,
    permission: [PORTAL_KEYS.siteDiary, "view"],
    project: projectViaSiteDiaryEntry,
    shape: shapeSiteDiaryEntry,
  },

  // --- Messages ---
  {
    methods: ["GET"],
    pattern: /^\/channels$/,
    permission: [PORTAL_KEYS.messages, "view"],
    project: projectFromQuery,
  },
  {
    methods: ["GET"],
    pattern: /^\/channels\/unread\/counts$/,
    permission: [PORTAL_KEYS.messages, "view"],
  },
  {
    methods: ["GET"],
    pattern: /^\/channels\/[^/]+\/(messages|members)$/,
    permission: [PORTAL_KEYS.messages, "view"],
    check: isChannelMember,
  },
  {
    methods: ["POST"],
    pattern: /^\/channels\/[^/]+\/messages$/,
    permission: [PORTAL_KEYS.messages, "send"],
    check: isChannelMember,
  },
  {
    methods: ["POST"],
    pattern: /^\/channels\/[^/]+\/read$/,
    permission: [PORTAL_KEYS.messages, "view"],
    check: isChannelMember,
  },
];

/**
 * Resolve the acting user.
 *
 * In development the global auth block (routes.ts) injects a synthetic req.user
 * that has NO userCategory and whose `id` may be a replitId rather than
 * users.id. Trusting req.user directly would make this gate silently inert in
 * dev and would break project-access lookups, so always resolve to a real user
 * row.
 */
async function resolveActingUser(req: Request): Promise<User | null> {
  const injected = (req as any).user;
  if (injected?.dbUser) return injected.dbUser as User;
  if (injected?.userCategory && injected?.id) return injected as User;

  const sessionUserId = (req.session as any)?.userId;
  if (sessionUserId) {
    return (await storage.getUser(sessionUserId)) ?? null;
  }
  return null;
}

function matchRule(method: string, path: string): AllowRule | undefined {
  return ALLOW_RULES.find(
    (rule) => rule.methods.includes(method) && rule.pattern.test(path),
  );
}

function deny(res: Response, reason: string, detail: Record<string, unknown>) {
  console.warn(`[clientAccess] denied (${reason})`, detail);
  return res.status(403).json({ error: "not_available_for_client" });
}

export async function clientAccessGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let user: User | null;
  try {
    user = await resolveActingUser(req);
  } catch (error) {
    console.error("[clientAccess] failed to resolve acting user:", error);
    res.status(500).json({ error: "Access check failed" });
    return;
  }

  // Not a client session → this gate does not apply.
  if (!user || user.userCategory !== "client") {
    next();
    return;
  }
  (req as any).__clientUser = user;

  const path = req.path;

  // Public, token-authenticated portal endpoints are outside this gate's remit.
  // It exists to contain what a SESSION can reach; /api/portal/* is reachable
  // by any anonymous visitor holding the link, so exempting a signed-in client
  // grants them nothing they could not get by logging out — while without the
  // exemption a client who follows an emailed link while signed in is refused
  // the very document that was addressed to them. Each portal route does its
  // own token lookup and projection.
  if (path.startsWith("/portal/")) {
    next();
    return;
  }
  const method = req.method.toUpperCase();
  const rule = matchRule(method, path);

  if (!rule) {
    deny(res, "route not on client allow-list", { method, path, userId: user.id });
    return;
  }

  try {
    if (rule.permission) {
      const [key, action] = rule.permission;
      const allowed = await storage.checkUserPermission(user.id, key, action);
      if (!allowed) {
        deny(res, `missing ${key}:${action}`, { method, path, userId: user.id });
        return;
      }
    }

    if (rule.project) {
      // Some resolvers need the acting user's company to scope their lookup.
      (req as any).__clientAccessUser = user;
      const projectId = await rule.project(req);
      if (!projectId) {
        // A project-scoped route we cannot scope is not safe to serve.
        deny(res, "could not resolve target project", { method, path, userId: user.id });
        return;
      }
      const access = await storage.getUserProjectAccess(user.id);
      const granted = new Set(access.map((a) => a.projectId));
      if (!granted.has(projectId)) {
        deny(res, "project not granted to this client", {
          method,
          path,
          projectId,
          userId: user.id,
        });
        return;
      }
    }

    if (rule.check && !(await rule.check(req, user))) {
      deny(res, "resource check failed", { method, path, userId: user.id });
      return;
    }

    if (rule.shape) installShaper(req, res, user, rule.shape);

    next();
  } catch (error) {
    console.error("[clientAccess] check failed:", error);
    res.status(500).json({ error: "Access check failed" });
  }
}

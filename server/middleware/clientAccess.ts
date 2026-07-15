import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";

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
 *   2. Permission. Each rule names a permission key + action, checked against
 *      the role's persisted permissions, so a tick in Roles & Permissions is
 *      the single source of truth for what a client can see.
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

interface AllowRule {
  methods: string[];
  pattern: RegExp;
  /** Omitted = reachable by any client session (app-shell essentials). */
  permission?: [string, PermissionAction];
  /** Resolves the project this request targets; omit for non-project routes. */
  project?: ProjectResolver;
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
  { methods: ["GET"], pattern: /^\/projects$/, permission: ["projects.view", "view"] },
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+$/,
    permission: ["projects.view", "view"],
    project: projectParam,
  },

  // --- Schedule ---
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/schedules?$/,
    permission: ["projects.schedule", "view"],
    project: projectParam,
  },
  {
    methods: ["GET"],
    pattern: /^\/schedules\/[^/]+\/items$/,
    permission: ["projects.schedule", "view"],
    project: projectViaSchedule,
  },
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/schedule-items$/,
    permission: ["projects.schedule", "view"],
    project: projectParam,
  },
  {
    methods: ["GET"],
    pattern: /^\/schedules\/[^/]+$/,
    permission: ["projects.schedule", "view"],
    project: projectViaSchedule,
  },

  // --- Selections ---
  {
    methods: ["GET"],
    pattern: /^\/selections(\/with-options)?$/,
    permission: ["projects.selections", "view"],
    project: projectFromQuery,
  },
  {
    methods: ["GET"],
    pattern: /^\/selections\/[^/]+$/,
    permission: ["projects.selections", "view"],
    project: projectViaSelection,
  },
  {
    methods: ["GET"],
    pattern: /^\/selections\/[^/]+\/options$/,
    permission: ["projects.selections", "view"],
    project: projectViaSelection,
  },
  {
    methods: ["GET"],
    pattern: /^\/selection-options\/[^/]+\/attachments$/,
    permission: ["projects.selections", "view"],
    project: projectViaSelectionOption,
  },
  // The client approving a selection runs the same route staff use.
  {
    methods: ["PATCH"],
    pattern: /^\/selection-options\/[^/]+\/approve$/,
    permission: ["projects.selections", "approve"],
    project: projectViaSelectionOption,
  },
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/allowances$/,
    permission: ["projects.selections", "view"],
    project: projectParam,
  },
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/allowances\/[^/]+\/detail$/,
    permission: ["projects.selections", "view"],
    project: projectParam,
  },

  // --- Variations ---
  {
    methods: ["GET"],
    pattern: /^\/variations$/,
    permission: ["projects.variations", "view"],
    project: projectFromQuery,
  },
  {
    methods: ["GET"],
    pattern: /^\/variations\/[^/]+$/,
    permission: ["projects.variations", "view"],
    project: projectViaVariation,
  },
  {
    methods: ["GET"],
    pattern: /^\/variations\/[^/]+\/items$/,
    permission: ["projects.variations", "view"],
    project: projectViaVariation,
  },

  // --- Progress claims (client invoices) ---
  {
    methods: ["GET"],
    pattern: /^\/client-invoices$/,
    permission: ["projects.invoices", "view"],
    project: projectFromQuery,
  },
  {
    methods: ["GET"],
    pattern: /^\/client-invoices\/[^/]+$/,
    permission: ["projects.invoices", "view"],
    project: projectViaClientInvoice,
  },
  {
    methods: ["GET"],
    pattern: /^\/client-invoices\/[^/]+\/(items|payments)$/,
    permission: ["projects.invoices", "view"],
    project: projectViaClientInvoice,
  },

  // --- Site diary ---
  {
    methods: ["GET"],
    pattern: /^\/projects\/[^/]+\/site-diary-entries$/,
    permission: ["projects.site_diary", "view"],
    project: projectParam,
  },
  {
    methods: ["GET"],
    pattern: /^\/site-diary-entries\/[^/]+$/,
    permission: ["projects.site_diary", "view"],
    project: projectViaSiteDiaryEntry,
  },

  // --- Messages ---
  {
    methods: ["GET"],
    pattern: /^\/channels$/,
    permission: ["projects.messages", "view"],
    project: projectFromQuery,
  },
  {
    methods: ["GET"],
    pattern: /^\/channels\/unread\/counts$/,
    permission: ["projects.messages", "view"],
  },
  {
    methods: ["GET"],
    pattern: /^\/channels\/[^/]+\/(messages|members)$/,
    permission: ["projects.messages", "view"],
  },
  {
    methods: ["POST"],
    pattern: /^\/channels\/[^/]+\/messages$/,
    permission: ["projects.messages", "send"],
  },
  {
    methods: ["POST"],
    pattern: /^\/channels\/[^/]+\/read$/,
    permission: ["projects.messages", "view"],
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

  const path = req.path;
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

    next();
  } catch (error) {
    console.error("[clientAccess] check failed:", error);
    res.status(500).json({ error: "Access check failed" });
  }
}

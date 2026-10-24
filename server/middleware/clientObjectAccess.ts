import type { Request, Response, NextFunction } from "express";
import { and, eq, inArray, ne, or, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import type { User } from "@shared/schema";
import { storage } from "../storage";
import { PORTAL_KEYS } from "@shared/clientPortalPermissions";

/**
 * Client containment for uploaded files.
 *
 * /objects/* and /uploads/* are served OUTSIDE /api, so clientAccessGate never
 * sees them. Their own guards only check that the file is in the caller's
 * company — and a client's companyId IS the builder's, so on their own those
 * guards let a client fetch any file the builder ever uploaded (bills, cost
 * sheets, other homeowners' documents) given its path.
 *
 * This gate closes that for client sessions only. It is deny-by-default like
 * clientAccessGate: a file is served to a client only when a record the client
 * is already allowed to see through /api references it. Each source mirrors
 * the matching ALLOW_RULES entry — same portal permission, same project scope,
 * same visibility filter — so the file and the record that lists it can never
 * disagree.
 *
 * Team sessions pay nothing: requireAuth has already loaded the user row, and
 * the first line below returns for anyone who is not a client.
 */

/** Characters a stored object or upload path is made of. Anything else is refused, which also keeps LIKE metacharacters out. */
const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/;

/**
 * The path below `/objects/company/<cid>/` ("uploads/<uuid>"), or null.
 *
 * Stored values come in three spellings — company-scoped
 * `/objects/company/<cid>/uploads/<id>`, legacy raw `/objects/uploads/<id>`, and
 * either one prefixed with an absolute origin — so matching is on this tail,
 * always anchored on a leading "/".
 */
export function objectTail(urlPath: string): string | null {
  const m = urlPath.match(/^\/objects\/company\/[^/]+\/(.+)$/);
  if (!m) return null;
  const tail = m[1];
  if (!SAFE_PATH.test(tail) || tail.includes("..")) return null;
  return tail;
}

/** LIKE-escape: `_` is a legal path character but a LIKE wildcard. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A text column that ends with "/<tail>". */
const columnEndsWith = (column: AnyColumn, tail: string): SQL =>
  sql`${column} LIKE ${`%/${likeEscape(tail)}`}`;

/** A json(b) array column holding "/<tail>" as (the end of) a string value. */
const jsonHolds = (column: AnyColumn, tail: string): SQL =>
  sql`${column}::text LIKE ${`%/${likeEscape(tail)}"%`}`;

export interface ClientObjectLookups {
  grantedProjectIds(user: User): Promise<string[]>;
  hasPermission(user: User, key: string): Promise<boolean>;
  selectionOptionFile(projectIds: string[], tail: string): Promise<boolean>;
  reviewDocument(companyId: string, projectIds: string[], tail: string): Promise<boolean>;
  siteDiaryFile(projectIds: string[], tail: string): Promise<boolean>;
  messageAttachment(userId: string, tail: string): Promise<boolean>;
  companyLogo(companyId: string, tail: string): Promise<boolean>;
}

const exists = async (q: Promise<unknown[]>) => (await q).length > 0;

export const dbLookups: ClientObjectLookups = {
  async grantedProjectIds(user) {
    const access = await storage.getUserProjectAccess(user.id);
    return access.map((a) => a.projectId);
  },

  hasPermission: (user, key) => storage.checkUserPermission(user.id, key, "view"),

  // Option images and documents. Hidden options never reach a client
  // (applySelectionVisibility), so neither do their files.
  selectionOptionFile: (projectIds, tail) =>
    exists(
      db
        .select({ id: schema.optionAttachments.id })
        .from(schema.optionAttachments)
        .innerJoin(schema.selectionOptions, eq(schema.selectionOptions.id, schema.optionAttachments.optionId))
        .innerJoin(schema.selections, eq(schema.selections.id, schema.selectionOptions.selectionId))
        .where(
          and(
            inArray(schema.selections.projectId, projectIds),
            eq(schema.selectionOptions.visibleToClient, true),
            columnEndsWith(schema.optionAttachments.filePath, tail),
          ),
        )
        .limit(1),
    ),

  // GET /reviews/:id 404s a draft for a client; its files do the same.
  reviewDocument: (companyId, projectIds, tail) =>
    exists(
      db
        .select({ id: schema.reviewDocuments.id })
        .from(schema.reviewDocuments)
        .innerJoin(schema.reviewItems, eq(schema.reviewItems.id, schema.reviewDocuments.reviewItemId))
        .where(
          and(
            eq(schema.reviewItems.companyId, companyId),
            inArray(schema.reviewItems.projectId, projectIds),
            ne(schema.reviewItems.status, "draft"),
            columnEndsWith(schema.reviewDocuments.filePath, tail),
          ),
        )
        .limit(1),
    ),

  // Only entries ticked "share with client" (isSiteDiaryClientVisible); the
  // client projection passes both photo arrays through.
  siteDiaryFile: (projectIds, tail) =>
    exists(
      db
        .select({ id: schema.siteDiaryEntries.id })
        .from(schema.siteDiaryEntries)
        .where(
          and(
            inArray(schema.siteDiaryEntries.projectId, projectIds),
            eq(schema.siteDiaryEntries.shareWithClient, true),
            or(
              jsonHolds(schema.siteDiaryEntries.overallPhotos, tail),
              jsonHolds(schema.siteDiaryEntries.attachments, tail),
            ),
          ),
        )
        .limit(1),
    ),

  // Same membership test as isChannelMember: the client must be IN the
  // channel the message was posted to.
  messageAttachment: (userId, tail) =>
    exists(
      db
        .select({ id: schema.messageAttachments.id })
        .from(schema.messageAttachments)
        .innerJoin(schema.messages, eq(schema.messages.id, schema.messageAttachments.messageId))
        .innerJoin(
          schema.channelMembers,
          and(
            eq(schema.channelMembers.channelId, schema.messages.channelId),
            eq(schema.channelMembers.userId, userId),
          ),
        )
        .where(
          or(
            columnEndsWith(schema.messageAttachments.fileUrl, tail),
            columnEndsWith(schema.messageAttachments.objectPath, tail),
          ),
        )
        .limit(1),
    ),

  // The builder's letterhead (shapeCompanyForClient passes `logo`).
  companyLogo: async (companyId, tail) =>
    (await exists(
      db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(and(eq(schema.companies.id, companyId), columnEndsWith(schema.companies.logo, tail)))
        .limit(1),
    )) ||
    exists(
      db
        .select({ id: schema.companySettings.id })
        .from(schema.companySettings)
        .where(
          and(eq(schema.companySettings.companyId, companyId), columnEndsWith(schema.companySettings.logoUrl, tail)),
        )
        .limit(1),
    ),
};

/**
 * May this client session receive the file at `urlPath`?
 *
 * /uploads/* is never client-facing — its three subtrees are estimate-note
 * attachments, scope gear photos and contact avatars — so it is refused
 * outright rather than resolved.
 */
export async function isObjectVisibleToClient(
  user: User,
  urlPath: string,
  lookups: ClientObjectLookups = dbLookups,
): Promise<boolean> {
  if (!user.companyId) return false;
  const tail = objectTail(urlPath);
  if (!tail) return false;

  if (await lookups.companyLogo(user.companyId, tail)) return true;

  const can = (key: string) => lookups.hasPermission(user, key);

  if (await can(PORTAL_KEYS.messages)) {
    if (await lookups.messageAttachment(user.id, tail)) return true;
  }

  const projectIds = await lookups.grantedProjectIds(user);
  if (projectIds.length === 0) return false;

  if ((await can(PORTAL_KEYS.selections)) && (await lookups.selectionOptionFile(projectIds, tail))) return true;
  if ((await can(PORTAL_KEYS.reviews)) && (await lookups.reviewDocument(user.companyId, projectIds, tail))) return true;
  if ((await can(PORTAL_KEYS.siteDiary)) && (await lookups.siteDiaryFile(projectIds, tail))) return true;

  return false;
}

/**
 * Mount after requireAuth on /objects/* and /uploads/*. requireAuth sets
 * req.user to the full users row, so userCategory is already in hand.
 */
export function clientObjectGate(lookups: ClientObjectLookups = dbLookups) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user as User | undefined;
    if (!user || user.userCategory !== "client") {
      next();
      return;
    }
    try {
      if (await isObjectVisibleToClient(user, req.path, lookups)) {
        next();
        return;
      }
    } catch (error) {
      console.error("[clientObjectAccess] lookup failed:", error);
      res.status(500).json({ error: "Failed to serve file" });
      return;
    }
    // 404, never 403: whether the file exists is not the client's to learn.
    console.warn("[clientObjectAccess] denied", { path: req.path, userId: user.id });
    res.status(404).json({ error: "Object not found" });
  };
}

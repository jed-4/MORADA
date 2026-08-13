import path from "path";
import fs from "fs";
import type { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import { getSessionCompanyId } from "./auth";

/**
 * Authenticated, ownership-checked serving for the local uploads tree.
 *
 * This replaces an `express.static('/uploads', ...)` mount that sat above
 * setupAuth in index.ts, so every file under it — up to 50 MB of estimate-note
 * attachments, plus gear photos and contact avatars — was fetchable by anyone
 * who knew or guessed a path, with no session at all.
 *
 * The tree is flat: nothing on disk records who owns a file. Ownership is
 * resolved by looking the URL up in the table that references it, which is why
 * this is a handler rather than a static mount with a guard in front.
 */

export const UPLOADS_ROOT = path.resolve(import.meta.dirname, "..", "..", "uploads");

/**
 * Resolves the company that owns a given /uploads path, or null when nothing
 * references it.
 *
 * Each subtree has its own chain:
 *   enote-attachments -> enote -> estimate -> project.companyId  (join)
 *   gear-photos       -> scope_gear_photos.companyId             (column)
 *   contact-avatars   -> contacts.companyId                      (column)
 *
 * An unrecognised subtree returns null and is refused. Serving anything that
 * no table claims is precisely the hole being closed, so there is deliberately
 * no fall-through.
 */
export async function resolveUploadOwner(urlPath: string): Promise<string | null> {
  if (urlPath.startsWith("/uploads/enote-attachments/")) {
    const [row] = await db
      .select({ companyId: schema.projects.companyId })
      .from(schema.enoteAttachments)
      .innerJoin(schema.estimateEnotes, eq(schema.estimateEnotes.id, schema.enoteAttachments.enoteId))
      .innerJoin(schema.estimates, eq(schema.estimates.id, schema.estimateEnotes.estimateId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.estimates.projectId))
      .where(eq(schema.enoteAttachments.fileUrl, urlPath))
      .limit(1);
    return row?.companyId ?? null;
  }

  if (urlPath.startsWith("/uploads/gear-photos/")) {
    const [row] = await db
      .select({ companyId: schema.scopeGearPhotos.companyId })
      .from(schema.scopeGearPhotos)
      .where(eq(schema.scopeGearPhotos.photoUrl, urlPath))
      .limit(1);
    return row?.companyId ?? null;
  }

  if (urlPath.startsWith("/uploads/contact-avatars/")) {
    const [row] = await db
      .select({ companyId: schema.contacts.companyId })
      .from(schema.contacts)
      .where(eq(schema.contacts.avatarUrl, urlPath))
      .limit(1);
    return row?.companyId ?? null;
  }

  return null;
}

/**
 * True when `candidate` resolves to a location inside the uploads root.
 *
 * express.static gave traversal protection for free; a hand-rolled sendFile
 * does not, so `%2e%2e%2f` style escapes have to be refused explicitly. The
 * trailing separator matters: without it, a sibling directory whose name
 * merely starts with "uploads" would pass a bare startsWith.
 */
export function isInsideUploadsRoot(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return resolved === UPLOADS_ROOT || resolved.startsWith(UPLOADS_ROOT + path.sep);
}

/**
 * `resolveOwner` is a parameter with a production default rather than a hard
 * call so the access-control logic can be exercised without a database — the
 * real resolver is a four-table join. Callers in routes.ts pass nothing.
 */
export async function serveUpload(
  req: Request,
  res: Response,
  resolveOwner: (urlPath: string) => Promise<string | null> = resolveUploadOwner,
): Promise<void> {
  // 404 everywhere rather than 403: the existence of another tenant's file is
  // never confirmed, matching the ownership guards in routes.ts.
  const notFound = (): void => {
    res.status(404).json({ error: "Not found" });
  };

  let urlPath: string;
  try {
    // req.path is already URL-decoded by Express, but decoding again catches
    // double-encoded traversal (%252e%252e) before it reaches the filesystem.
    urlPath = decodeURIComponent(req.path);
  } catch {
    return notFound();
  }

  // Normalise to the stored form: rows hold "/uploads/<subtree>/<file>", while
  // req.path here is relative to the mount.
  const fullUrlPath = urlPath.startsWith("/uploads/") ? urlPath : `/uploads${urlPath}`;

  if (fullUrlPath.includes("\0") || fullUrlPath.includes("..")) return notFound();

  const callerCompanyId = getSessionCompanyId(req);
  if (!callerCompanyId) return notFound();

  let ownerCompanyId: string | null;
  try {
    ownerCompanyId = await resolveOwner(fullUrlPath);
  } catch (err) {
    console.error("[uploads] ownership lookup failed:", err);
    res.status(500).json({ error: "Failed to serve file" });
    return;
  }

  if (!ownerCompanyId || ownerCompanyId !== callerCompanyId) return notFound();

  const absolute = path.resolve(UPLOADS_ROOT, "." + fullUrlPath.replace(/^\/uploads/, ""));
  if (!isInsideUploadsRoot(absolute)) return notFound();
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return notFound();

  res.sendFile(absolute, (err) => {
    if (err && !res.headersSent) {
      console.error("[uploads] send failed:", err);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });
}

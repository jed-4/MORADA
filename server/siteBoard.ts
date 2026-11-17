/**
 * The site board: a project's printed QR code and the files it shows.
 *
 * One QR per job opens /portal/project/:token/trades — a public hub with the
 * project's selections and the files switched "on site". The token is
 * `projects.trades_portal_token` (the same one the selections site view has
 * used since #257, so codes already on site keep working).
 *
 * Staff routes manage the project's files (`project_files`, migration 0129).
 * Public routes live under /api/portal/, which the blanket /api auth guard
 * lets through — so every public handler here checks the token itself and
 * only ever serves a file that is (a) in that token's project and (b) on site.
 */
import type { Express, Request, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
// @ts-expect-error -- qrcode ships no types (same as everywhere else it is imported)
import QRCode from "qrcode";
import { db } from "./db";
import {
  projects,
  projectFiles,
  createProjectFileSchema,
  updateProjectFileSchema,
  PROJECT_FILE_DEFAULT_FOLDER,
  type ProjectFile,
} from "@shared/schema";
import { requireAuth, requireTeamMember, getSessionCompanyId } from "./middleware/auth";
import { ObjectNotFoundError, ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";

/** Where printed codes point. A QR on a site fence lives for months, so in
 *  production it must never depend on which host happened to generate it
 *  (a preview or Replit dev URL would be dead by the time anyone scans it).
 *  Off production the request's own origin is used so local testing works. */
export const CANONICAL_APP_URL = "https://app.moradaco.com.au";

export function publicBaseUrl(req: Request): string {
  if (process.env.NODE_ENV === "production") {
    return (process.env.APP_BASE_URL || CANONICAL_APP_URL).replace(/\/+$/, "");
  }
  return String(req.headers.origin || `${req.protocol}://${req.headers.host}`).replace(/\/+$/, "");
}

export function siteBoardUrl(req: Request, token: string): string {
  return `${publicBaseUrl(req)}/portal/project/${token}/trades`;
}

/** A QR PNG. 1000px prints sharp at A4. */
export function qrPng(data: string, width = 1000): Promise<Buffer> {
  return QRCode.toBuffer(data, { width, margin: 2, errorCorrectionLevel: "M" });
}

export function newSiteToken(): string {
  return randomBytes(24).toString("hex");
}

/** The project the caller's company owns, or null (404 — never confirm it exists). */
async function ownedProject(req: Request, projectId: string) {
  const companyId = getSessionCompanyId(req);
  if (!companyId) return null;
  const [row] = await db.select({ id: projects.id, companyId: projects.companyId })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

export async function projectBySiteToken(token: string) {
  if (!token || token.length < 16) return null;
  const [row] = await db.select().from(projects).where(eq(projects.tradesPortalToken, token)).limit(1);
  return row ?? null;
}

const sortFiles = (rows: ProjectFile[]) =>
  [...rows].sort((a, b) =>
    a.folder.localeCompare(b.folder, undefined, { numeric: true, sensitivity: "base" }) ||
    a.sortOrder - b.sortOrder ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

/** What the public page may see of a file: no uploader, no storage path. */
export function publicFileView(f: ProjectFile, token: string) {
  return {
    id: f.id,
    folder: f.folder,
    name: f.name,
    mimeType: f.mimeType,
    fileSize: f.fileSize,
    addedAt: f.createdAt,
    url: `/api/portal/project/${token}/files/${f.id}`,
  };
}

/** `Content-Disposition` safe for any file name (RFC 6266 / 5987). */
function inlineDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function registerSiteBoardRoutes(app: Express) {
  const objectStorage = new ObjectStorageService();

  // ── staff: the project's files ──────────────────────────────────────────
  app.get("/api/projects/:projectId/site-files", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const project = await ownedProject(req, req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const rows = await db.select().from(projectFiles)
        .where(and(eq(projectFiles.projectId, project.id), eq(projectFiles.companyId, project.companyId!)))
        .orderBy(asc(projectFiles.folder), asc(projectFiles.sortOrder), asc(projectFiles.name));
      res.json(sortFiles(rows));
    } catch (error) {
      console.error("[site-board] list files failed:", error);
      res.status(500).json({ error: "Failed to load files" });
    }
  });

  app.post("/api/projects/:projectId/site-files", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const project = await ownedProject(req, req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const parsed = createProjectFileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid file", issues: parsed.error.issues });
      // The upload must sit under the caller's own company prefix — the public
      // route would otherwise stream another company's object by path.
      if (!parsed.data.objectPath.startsWith(`/objects/company/${project.companyId}/`)) {
        return res.status(400).json({ error: "That upload doesn't belong to this company" });
      }
      const [row] = await db.insert(projectFiles).values({
        companyId: project.companyId!,
        projectId: project.id,
        folder: parsed.data.folder || PROJECT_FILE_DEFAULT_FOLDER,
        name: parsed.data.name,
        objectPath: parsed.data.objectPath,
        mimeType: parsed.data.mimeType ?? null,
        fileSize: parsed.data.fileSize ?? null,
        onSite: parsed.data.onSite ?? false,
        uploadedById: (req.user as any)?.id ?? null,
      }).returning();
      res.status(201).json(row);
    } catch (error) {
      console.error("[site-board] add file failed:", error);
      res.status(500).json({ error: "Failed to save the file" });
    }
  });

  app.patch("/api/projects/:projectId/site-files/:fileId", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const project = await ownedProject(req, req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const parsed = updateProjectFileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid change", issues: parsed.error.issues });
      const [row] = await db.update(projectFiles)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(
          eq(projectFiles.id, req.params.fileId),
          eq(projectFiles.projectId, project.id),
          eq(projectFiles.companyId, project.companyId!),
        ))
        .returning();
      if (!row) return res.status(404).json({ error: "File not found" });
      res.json(row);
    } catch (error) {
      console.error("[site-board] update file failed:", error);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  app.delete("/api/projects/:projectId/site-files/:fileId", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const project = await ownedProject(req, req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const [row] = await db.delete(projectFiles)
        .where(and(
          eq(projectFiles.id, req.params.fileId),
          eq(projectFiles.projectId, project.id),
          eq(projectFiles.companyId, project.companyId!),
        ))
        .returning({ id: projectFiles.id });
      if (!row) return res.status(404).json({ error: "File not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[site-board] delete file failed:", error);
      res.status(500).json({ error: "Failed to delete" });
    }
  });

  // ── public: what the printed code shows ──────────────────────────────────
  app.get("/api/portal/project/:token/files", async (req: Request, res: Response) => {
    try {
      const project = await projectBySiteToken(req.params.token);
      if (!project) return res.status(404).json({ error: "Invalid or expired link" });
      const rows = await db.select().from(projectFiles)
        .where(and(eq(projectFiles.projectId, project.id), eq(projectFiles.onSite, true)));
      res.json(sortFiles(rows).map((f) => publicFileView(f, req.params.token)));
    } catch (error) {
      console.error("[site-board] public files failed:", error);
      res.status(500).json({ error: "Failed to load files" });
    }
  });

  app.get("/api/portal/project/:token/files/:fileId", async (req: Request, res: Response) => {
    try {
      const project = await projectBySiteToken(req.params.token);
      if (!project) return res.status(404).json({ error: "Not found" });
      const [file] = await db.select().from(projectFiles)
        .where(and(
          eq(projectFiles.id, req.params.fileId),
          eq(projectFiles.projectId, project.id),
          eq(projectFiles.onSite, true),
        ))
        .limit(1);
      // Belt and braces: the stored path must be under the project's company.
      if (!file || !project.companyId || !file.objectPath.startsWith(`/objects/company/${project.companyId}/`)) {
        return res.status(404).json({ error: "Not found" });
      }
      // Stored as /objects/company/<cid>/uploads/<id>; storage looks up the raw form.
      const objectFile = await objectStorage.getObjectEntityFile(
        file.objectPath.replace(/^\/objects\/company\/[^/]+\//, "/objects/"),
      );
      res.setHeader("Content-Disposition", inlineDisposition(file.name));
      // Short cache: switching a file off site should take effect quickly.
      await objectStorage.downloadObject(objectFile, res, 300);
    } catch (error: any) {
      if (error instanceof ObjectNotFoundError || error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Not found" });
      }
      console.error("[site-board] public file failed:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to load the file" });
    }
  });
}

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
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
// @ts-expect-error -- qrcode ships no types (same as everywhere else it is imported)
import QRCode from "qrcode";
import { db } from "./db";
import {
  projects,
  projectFiles,
  selections,
  companySettings,
  createProjectFileSchema,
  updateProjectFileSchema,
  PROJECT_FILE_DEFAULT_FOLDER,
  type ProjectFile,
} from "@shared/schema";
import { requireAuth, requireTeamMember, requireAdmin, getSessionCompanyId } from "./middleware/auth";
import { verifyUploadGrant } from "./utils/signedGrant";
import {
  DEFAULT_SITE_SIGN_LAYOUT,
  SITE_SIGN_TEMPLATE_MIMES,
  resolveSiteSelectionFields,
  saveSiteSignSchema,
  siteSelectionFieldsSchema,
  siteSignLayoutSchema,
  type SiteSelectionField,
  type SiteSignSettings,
  type SiteSignTemplateMime,
} from "@shared/siteBoard";
import { buildBrandedSign, buildDefaultSign, inspectTemplate } from "./siteSign";
import { z } from "zod";
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

/** Is this option attachment allowed on the site page under the project's
 *  detail settings? Photos and documents are switched separately. */
export function siteAttachmentAllowed(
  a: { fileType?: string | null; mimeType?: string | null; fileName?: string | null },
  fields: Record<SiteSelectionField, boolean>,
): boolean {
  const image =
    String(a.fileType ?? "").toLowerCase() === "image" ||
    String(a.mimeType ?? "").startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|avif|heic)$/i.test(a.fileName ?? "");
  return image ? fields.photos : fields.documents;
}

/** Stored paths are /objects/company/<cid>/uploads/<id>; storage looks up the raw form. */
const rawObjectPath = (p: string) => p.replace(/^\/objects\/company\/[^/]+\//, "/objects/");

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

function logoOf(row: { logoData?: string | null; logoMime?: string | null } | null) {
  if (!row?.logoData || !row.logoMime) return null;
  try {
    return { bytes: Buffer.from(row.logoData.replace(/^data:[^,]*,/, ""), "base64"), mime: row.logoMime };
  } catch {
    return null;
  }
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
      // The upload must be the caller's own — the public route would otherwise
      // stream another company's object by path. The company segment in the
      // path is not proof (the bucket is flat and the segment is stripped on
      // lookup); the signed grant from the upload route is.
      if (
        !parsed.data.objectPath.startsWith(`/objects/company/${project.companyId}/`) ||
        !verifyUploadGrant(parsed.data.uploadGrant, parsed.data.objectPath, project.companyId!)
      ) {
        return res.status(403).json({ error: "That upload doesn't belong to this company" });
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


  // ── staff: which selections and details the site page shows ─────────────
  app.get("/api/projects/:projectId/site-settings", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const project = await ownedProject(req, req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const [row] = await db.select({ fields: projects.siteSelectionFields }).from(projects).where(eq(projects.id, project.id)).limit(1);
      const list = await db.select({
        id: selections.id,
        name: selections.name,
        room: selections.room,
        category: selections.category,
        status: selections.status,
        showOnSite: selections.showOnSite,
      }).from(selections).where(eq(selections.projectId, project.id));
      list.sort((a, b) =>
        String(a.room ?? "").localeCompare(String(b.room ?? ""), undefined, { sensitivity: "base" }) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      res.json({ selectionFields: resolveSiteSelectionFields(row?.fields), selections: list });
    } catch (error) {
      console.error("[site-board] load settings failed:", error);
      res.status(500).json({ error: "Failed to load site settings" });
    }
  });

  app.patch("/api/projects/:projectId/site-settings", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const project = await ownedProject(req, req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const parsed = z.object({ selectionFields: siteSelectionFieldsSchema }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid settings", issues: parsed.error.issues });
      const [row] = await db.select({ fields: projects.siteSelectionFields }).from(projects).where(eq(projects.id, project.id)).limit(1);
      const next = { ...resolveSiteSelectionFields(row?.fields), ...parsed.data.selectionFields };
      await db.update(projects).set({ siteSelectionFields: next }).where(and(eq(projects.id, project.id), eq(projects.companyId, project.companyId!)));
      res.json({ selectionFields: next });
    } catch (error) {
      console.error("[site-board] save settings failed:", error);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  /** One selection, several, or all of a project's on or off the site page. */
  app.patch("/api/projects/:projectId/site-selections", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const project = await ownedProject(req, req.params.projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const parsed = z.object({ ids: z.array(z.string()).min(1).max(1000), showOnSite: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid change", issues: parsed.error.issues });
      const rows = await db.update(selections)
        .set({ showOnSite: parsed.data.showOnSite, updatedAt: new Date() })
        .where(and(eq(selections.projectId, project.id), inArray(selections.id, parsed.data.ids)))
        .returning({ id: selections.id });
      res.json({ updated: rows.length });
    } catch (error) {
      console.error("[site-board] update selections failed:", error);
      res.status(500).json({ error: "Failed to save" });
    }
  });

  // ── staff: the company's branded sign ────────────────────────────────────
  const settingsRow = async (companyId: string) => {
    const [row] = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);
    return row ?? null;
  };
  const signView = (row: Awaited<ReturnType<typeof settingsRow>>): SiteSignSettings => {
    const layout = siteSignLayoutSchema.safeParse(row?.siteSignLayout);
    const mime = (SITE_SIGN_TEMPLATE_MIMES as readonly string[]).includes(row?.siteSignTemplateMime ?? "")
      ? (row!.siteSignTemplateMime as SiteSignTemplateMime) : null;
    return {
      hasTemplate: !!row?.siteSignTemplatePath && !!mime,
      templateName: row?.siteSignTemplateName ?? null,
      templateMime: mime,
      layout: layout.success ? layout.data : DEFAULT_SITE_SIGN_LAYOUT,
    };
  };
  const readObject = async (objectPath: string): Promise<Buffer> => {
    const file = await objectStorage.getObjectEntityFile(rawObjectPath(objectPath));
    const [buf] = await (file as any).download();
    return buf as Buffer;
  };

  app.get("/api/company/site-sign", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const companyId = getSessionCompanyId(req);
      if (!companyId) return res.status(403).json({ error: "No company" });
      res.json(signView(await settingsRow(companyId)));
    } catch (error) {
      console.error("[site-sign] load failed:", error);
      res.status(500).json({ error: "Failed to load the sign design" });
    }
  });

  /** The uploaded design itself, for the box editor's preview. */
  app.get("/api/company/site-sign/template", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const companyId = getSessionCompanyId(req);
      const row = companyId ? await settingsRow(companyId) : null;
      if (!row?.siteSignTemplatePath || !row.siteSignTemplatePath.startsWith(`/objects/company/${companyId}/`)) {
        return res.status(404).json({ error: "No sign design uploaded" });
      }
      const file = await objectStorage.getObjectEntityFile(rawObjectPath(row.siteSignTemplatePath));
      res.setHeader("Content-Disposition", inlineDisposition(row.siteSignTemplateName || "sign"));
      await objectStorage.downloadObject(file, res, 0);
    } catch (error: any) {
      if (error instanceof ObjectNotFoundError || error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Not found" });
      }
      console.error("[site-sign] template failed:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to load the design" });
    }
  });

  app.put("/api/company/site-sign", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = getSessionCompanyId(req);
      if (!companyId) return res.status(403).json({ error: "No company" });
      const parsed = saveSiteSignSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid sign design", issues: parsed.error.issues });
      const { template, layout } = parsed.data;
      const existing = await settingsRow(companyId);
      if (!template && !existing?.siteSignTemplatePath) {
        return res.status(400).json({ error: "Upload a design first" });
      }
      const patch: Partial<typeof companySettings.$inferInsert> = { siteSignLayout: layout };
      if (template) {
        // The company segment in a path is not proof of ownership (the bucket
        // is flat) — the signed grant from the upload route is.
        if (!verifyUploadGrant(template.uploadGrant, template.objectPath, companyId)) {
          return res.status(403).json({ error: "That upload doesn't belong to this company" });
        }
        try {
          await inspectTemplate(await readObject(template.objectPath), template.mimeType);
        } catch {
          return res.status(400).json({ error: "That file couldn't be opened. Export it again as a PDF, PNG or JPG." });
        }
        Object.assign(patch, {
          siteSignTemplatePath: template.objectPath,
          siteSignTemplateName: template.name,
          siteSignTemplateMime: template.mimeType,
        });
      }
      if (existing) {
        await db.update(companySettings).set({ ...patch, updatedAt: new Date() }).where(eq(companySettings.id, existing.id));
      } else {
        await db.insert(companySettings).values({ companyId, ...patch });
      }
      res.json(signView(await settingsRow(companyId)));
    } catch (error) {
      console.error("[site-sign] save failed:", error);
      res.status(500).json({ error: "Failed to save the sign design" });
    }
  });

  app.delete("/api/company/site-sign", requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const companyId = getSessionCompanyId(req);
      if (!companyId) return res.status(403).json({ error: "No company" });
      await db.update(companySettings).set({
        siteSignTemplatePath: null,
        siteSignTemplateName: null,
        siteSignTemplateMime: null,
        updatedAt: new Date(),
      }).where(eq(companySettings.companyId, companyId));
      res.json(signView(await settingsRow(companyId)));
    } catch (error) {
      console.error("[site-sign] remove failed:", error);
      res.status(500).json({ error: "Failed to remove the design" });
    }
  });

  /** The job's printable sign: the company design with the QR stamped in, or
   *  Morada's plain sign. `?download=1` saves instead of opening. */
  app.get("/api/projects/:projectId/site-sign.pdf", requireAuth, requireTeamMember, async (req: Request, res: Response) => {
    try {
      const owned = await ownedProject(req, req.params.projectId);
      if (!owned) return res.status(404).json({ error: "Project not found" });
      const [project] = await db.select().from(projects).where(eq(projects.id, owned.id)).limit(1);
      let token = project.tradesPortalToken;
      if (!token) {
        token = newSiteToken();
        await db.update(projects).set({ tradesPortalToken: token }).where(eq(projects.id, project.id));
      }
      const url = siteBoardUrl(req, token);
      const input = { qrPng: await qrPng(url), projectName: project.name, address: project.location ?? null, url };
      const settings = await settingsRow(owned.companyId!);
      const sign = signView(settings);

      let pdf: Uint8Array;
      let usedTemplate = false;
      if (sign.hasTemplate && settings!.siteSignTemplatePath!.startsWith(`/objects/company/${owned.companyId}/`)) {
        try {
          pdf = await buildBrandedSign(input, {
            bytes: await readObject(settings!.siteSignTemplatePath!),
            mime: sign.templateMime!,
            layout: sign.layout,
          });
          usedTemplate = true;
        } catch (error) {
          // A broken design shouldn't leave a site without a sign.
          console.error("[site-sign] branded sign failed, using the default:", error);
          pdf = await buildDefaultSign(input, logoOf(settings));
        }
      } else {
        pdf = await buildDefaultSign(input, logoOf(settings));
      }

      const fileName = `${project.name} - site QR.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", req.query.download ? inlineDisposition(fileName).replace(/^inline/, "attachment") : inlineDisposition(fileName));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Site-Sign", usedTemplate ? "template" : "default");
      res.end(Buffer.from(pdf));
    } catch (error) {
      console.error("[site-sign] build failed:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to make the sign" });
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

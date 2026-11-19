/**
 * The daily site report: a day on one project, as a one-page PDF for the client.
 *
 *   GET  /api/projects/:projectId/daily-report/summary?date=yyyy-MM-dd
 *        What the report will hold (counts) and who the client is, for the
 *        web dialog's "Email to client" confirmation.
 *   GET  /api/projects/:projectId/daily-report/pdf?date=yyyy-MM-dd[&download=1]
 *        The PDF. The web previews and downloads this; the phone opens it in
 *        DocumentViewer (downloadToCache → WebView → Share).
 *   POST /api/projects/:projectId/daily-report/email  { date, to[], message? }
 *        Renders, emails it as an attachment through sendGenericEmail (Resend,
 *        or the sender's Gmail), and the send lands in the email delivery log.
 *
 * Rendered HERE rather than in the browser like the other documents, because
 * the phone has to open it and React Native cannot run @react-pdf. A server
 * render is still on demand (renderToBuffer over a finished tree) — none of the
 * live-renderer trouble in @react-pdf 4.3.1 applies.
 *
 * Every route: signed in, a team member (clients and suppliers are refused —
 * the client gets the PDF by email), `projects.site_diary` view, and the
 * project must belong to the caller's company (404 otherwise, never 403, so
 * another tenant's project id is never confirmed).
 *
 * Registered from server/index.ts straight after registerRoutes, so it sits
 * behind the same session, auth and client-access gate as every other route.
 */
import type { Express, Request, Response } from "express";
import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { db } from "./db";
import {
  projects,
  contacts,
  companySettings,
  systemConfiguration,
  siteDiaryEntries,
  siteDiaryTemplates,
  timesheets,
  users,
  schedules,
  scheduleItems,
  defects,
  emailDeliveries,
} from "@shared/schema";
import {
  DAILY_REPORT_MAX_PHOTOS,
  activeScheduleRows,
  buildCrewRows,
  defectsForDay,
  entryPhotoPaths,
  entryWeather,
  formatReportDate,
  formatWeather,
  isReportDate,
  localDayOf,
  localDayWindow,
  reportEntry,
  reportFilename,
  splitWorkDone,
  utcDayWindow,
  type DailyReportModel,
  type DailyReportPhoto,
  type TemplateFieldForReport,
} from "@shared/dailyReport";
import { isPlausibleEmail } from "@shared/emailLog";
import { requireAuth, requireTeamMember, requirePermission, getSessionCompanyId } from "./middleware/auth";

const DEFAULT_TZ = "Australia/Sydney";

/* ── Loading ────────────────────────────────────────────────────────────── */

/** The caller's company's project, or null. */
async function ownedProject(projectId: string, companyId: string | undefined) {
  if (!companyId || !projectId) return null;
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

async function companyTimezone(companyId: string): Promise<string> {
  // One row per company since 0124; the company-less row is the fallback.
  const rows = await db
    .select({ companyId: systemConfiguration.companyId, timezone: systemConfiguration.timezone })
    .from(systemConfiguration)
    .where(or(eq(systemConfiguration.companyId, companyId), isNull(systemConfiguration.companyId)));
  const own = rows.find((r) => r.companyId === companyId) ?? rows.find((r) => !r.companyId);
  return own?.timezone || DEFAULT_TZ;
}

async function clientContact(project: { clientId: string | null; companyId: string | null }) {
  if (!project.clientId || !project.companyId) return null;
  const [c] = await db
    .select({ name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.id, project.clientId), eq(contacts.companyId, project.companyId)))
    .limit(1);
  return c ?? null;
}

type Project = NonNullable<Awaited<ReturnType<typeof ownedProject>>>;

/** Strip the company segment from a stored path, refusing another company's. */
function readablePath(objectPath: string, companyId: string): string | null {
  const m = /^\/objects\/company\/([^/]+)\/(.+)$/.exec(objectPath);
  if (m) return m[1] === companyId ? `/objects/${m[2]}` : null;
  return objectPath;
}

/**
 * Photos as PDF-sized JPEG thumbnails. Takes the first `max` that can be read
 * — a missing object is skipped, not fatal — and reports how many were left
 * out so the page can say "+N more".
 */
async function loadPhotos(paths: string[], companyId: string, max: number): Promise<{ photos: DailyReportPhoto[]; more: number }> {
  if (!paths.length) return { photos: [], more: 0 };
  const [{ ObjectStorageService }, sharpMod] = await Promise.all([
    import("./replit_integrations/object_storage/objectStorage"),
    import("sharp"),
  ]);
  const sharp = (sharpMod as any).default ?? sharpMod;
  const oss = new ObjectStorageService();

  const thumb = async (p: string): Promise<DailyReportPhoto | null> => {
    const readable = readablePath(p, companyId);
    if (!readable) return null;
    try {
      const file = await oss.getObjectEntityFile(readable);
      const [bytes] = await file.download();
      // 320×240 is ~4× the printed cell (80×60pt): sharp on paper and on a
      // retina screen, ~15KB each, so twelve keep the email attachment small.
      const out: Buffer = await sharp(bytes)
        .rotate() // honour EXIF orientation — phone photos are often sideways otherwise
        .resize(320, 240, { fit: "cover", position: "attention" })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
      return { src: `data:image/jpeg;base64,${out.toString("base64")}` };
    } catch (err: any) {
      console.warn("[daily-report] photo skipped:", p, err?.message);
      return null;
    }
  };

  // A few spares so one unreadable photo doesn't leave a hole in the grid.
  const attempt = paths.slice(0, max + 4);
  const results = await Promise.all(attempt.map(thumb));
  const photos = results.filter((r): r is DailyReportPhoto => !!r).slice(0, max);
  return { photos, more: paths.length - photos.length };
}

async function logoSrc(settings: { logoData: string | null; logoMime: string | null } | undefined): Promise<string | null> {
  if (!settings?.logoData) return null;
  try {
    const raw = Buffer.from(settings.logoData, "base64");
    // @react-pdf draws PNG and JPEG only; anything else (SVG, WebP) goes
    // through sharp first rather than throwing the whole render away.
    if (settings.logoMime === "image/png" || settings.logoMime === "image/jpeg") {
      return `data:${settings.logoMime};base64,${settings.logoData}`;
    }
    const sharpMod: any = await import("sharp");
    const sharp = sharpMod.default ?? sharpMod;
    const png: Buffer = await sharp(raw).resize(240, 240, { fit: "inside" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null; // initials tile instead
  }
}

/**
 * Everything the PDF prints for one day. Queries run in parallel — the
 * database is ~400ms away and these are independent.
 */
export async function buildDailyReportModel(
  project: Project,
  companyId: string,
  day: string,
  tz: string,
  opts: { images?: boolean } = {},
): Promise<DailyReportModel> {
  const images = opts.images ?? true;
  const localDay = localDayWindow(day, tz);
  const utcDay = utcDayWindow(day);

  const [settingsRow, client, entries, templates, sheets, projectSchedules, defectRows] = await Promise.all([
    db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1).then((r) => r[0]),
    clientContact(project),
    db.select().from(siteDiaryEntries).where(and(
      eq(siteDiaryEntries.projectId, project.id),
      gte(siteDiaryEntries.entryDateTime, localDay.start),
      lt(siteDiaryEntries.entryDateTime, localDay.end),
    )).orderBy(siteDiaryEntries.entryDateTime),
    db.select({ id: siteDiaryTemplates.id, fields: siteDiaryTemplates.fields })
      .from(siteDiaryTemplates)
      .where(eq(siteDiaryTemplates.companyId, companyId)),
    // Allow-listed columns: the rate and total never leave the database here.
    db.select({
      userId: timesheets.userId,
      date: timesheets.date,
      duration: timesheets.duration,
      status: timesheets.status,
      isActive: timesheets.isActive,
    }).from(timesheets).where(and(
      eq(timesheets.projectId, project.id),
      gte(timesheets.date, utcDay.start),
      lt(timesheets.date, utcDay.end),
    )),
    db.select({ id: schedules.id }).from(schedules).where(eq(schedules.projectId, project.id)),
    db.select({
      title: defects.title,
      location: defects.location,
      dateIdentified: defects.dateIdentified,
      dateResolved: defects.dateResolved,
    }).from(defects).where(and(
      eq(defects.projectId, project.id),
      or(
        and(gte(defects.dateIdentified, localDay.start), lt(defects.dateIdentified, localDay.end)),
        and(gte(defects.dateResolved, localDay.start), lt(defects.dateResolved, localDay.end)),
      ),
    )),
  ]);

  const userIds = Array.from(new Set(sheets.map((s) => s.userId)));
  const [people, items] = await Promise.all([
    userIds.length
      ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(and(inArray(users.id, userIds), eq(users.companyId, companyId)))
      : Promise.resolve([]),
    projectSchedules.length
      ? db.select({
        id: scheduleItems.id,
        name: scheduleItems.name,
        type: scheduleItems.type,
        status: scheduleItems.status,
        startDate: scheduleItems.startDate,
        endDate: scheduleItems.endDate,
        progressPercent: scheduleItems.progressPercent,
        assignedToName: scheduleItems.assignedToName,
        parentItemId: scheduleItems.parentItemId,
      }).from(scheduleItems).where(and(
        inArray(scheduleItems.scheduleId, projectSchedules.map((s) => s.id)),
        lt(scheduleItems.startDate, utcDay.end),
        gte(scheduleItems.endDate, utcDay.start),
      ))
      : Promise.resolve([]),
  ]);

  const names = new Map<string, string>();
  for (const p of people) {
    const n = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    if (n) names.set(p.id, n);
  }
  const crew = buildCrewRows(sheets, names, day);

  const fieldsByTemplate = new Map<string, TemplateFieldForReport[]>();
  for (const t of templates) fieldsByTemplate.set(t.id, (t.fields as TemplateFieldForReport[]) || []);
  const split = splitWorkDone(entries.map((e) => reportEntry(e, e.templateId ? fieldsByTemplate.get(e.templateId) ?? null : null, tz)));

  // Weather: what the diary recorded. With nothing recorded and the report
  // being for today, the site forecast is better than a blank.
  const recorded = Array.from(new Set(entries.map((e) => formatWeather(entryWeather(e))).filter(Boolean))) as string[];
  let weather: string | null = recorded.join("; ") || null;
  if (!weather && project.location && day === localDayOf(new Date(), tz)) {
    try {
      const { getWeatherForProject } = await import("./services/weather");
      const w = await Promise.race([
        getWeatherForProject(project.id, project.location),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
      ]);
      weather = `${w.description}, ${Math.round(w.tempMin)}–${Math.round(w.tempMax)}°C (forecast)`;
    } catch {
      /* leave it "Not recorded" */
    }
  }

  const allPhotos: string[] = [];
  for (const e of entries) for (const p of entryPhotoPaths(e)) if (!allPhotos.includes(p)) allPhotos.push(p);
  // The summary only needs counts — skip downloading and resizing photos.
  const [{ photos, more }, logo] = images
    ? await Promise.all([loadPhotos(allPhotos, companyId, DAILY_REPORT_MAX_PHOTOS), logoSrc(settingsRow)])
    : [{ photos: [] as DailyReportPhoto[], more: allPhotos.length }, null];

  const { raised, closed } = defectsForDay(defectRows, day, tz);
  const contactLine = [settingsRow?.phone, settingsRow?.email].filter(Boolean).join(" · ");

  return {
    date: day,
    dateLabel: formatReportDate(day),
    company: {
      name: settingsRow?.companyName || "Your builder",
      logoSrc: logo,
      brandColor: settingsRow?.brandColor || null,
      variant: settingsRow?.documentStyle === "style2" ? "brand" : "light",
      contactLines: [settingsRow?.address || "", contactLine].filter(Boolean),
    },
    project: { name: project.name, address: project.location || null, clientName: client?.name || null },
    weather,
    workDone: split.workDone,
    entries: split.entries,
    crew,
    crewTotalHours: Math.round(crew.reduce((s, c) => s + c.hours, 0) * 100) / 100,
    schedule: activeScheduleRows(items, day),
    defectsRaised: raised,
    defectsClosed: closed,
    photos,
    morePhotos: more,
  };
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

/**
 * fontkit resolves the registered "/fonts/…" paths against the FILESYSTEM
 * root under Node, so point it at a real directory before the document module
 * (and with it registerPdfFonts) is first evaluated. Hence the dynamic import.
 */
function ensureFontDir() {
  if (process.env.PDF_FONT_DIR) return;
  const candidates = [
    path.resolve(process.cwd(), "client/public/fonts"),
    path.resolve(process.cwd(), "dist/public/fonts"),
  ];
  const found = candidates.find((d) => fs.existsSync(path.join(d, "Inter-400.woff")));
  if (found) process.env.PDF_FONT_DIR = found;
}

export async function renderDailyReportPdf(model: DailyReportModel): Promise<Buffer> {
  ensureFontDir();
  const React = await import("react");
  // The kit's .tsx files compile to classic React.createElement under both tsx
  // (dev) and esbuild (the production bundle) with this repo's tsconfig
  // ("jsx": "preserve" is for Vite), and none of them import React. Without a
  // global React the first element throws "React is not defined".
  (globalThis as any).React ??= (React as any).default ?? React;
  const [{ renderToBuffer }, { DailyReportDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../client/src/components/site-diary/pdf/DailyReportDocument"),
  ]);
  const element = React.createElement(DailyReportDocument, { model });
  return renderToBuffer(element as any);
}

/* ── Routes ─────────────────────────────────────────────────────────────── */

async function resolveRequest(req: Request, res: Response, dateValue: unknown) {
  const companyId = getSessionCompanyId(req);
  const project = await ownedProject(String(req.params.projectId || ""), companyId);
  if (!project || !companyId) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  const tz = await companyTimezone(companyId);
  const day = dateValue === undefined || dateValue === "" ? localDayOf(new Date(), tz) : dateValue;
  if (!isReportDate(day)) {
    res.status(400).json({ error: "date must be yyyy-MM-dd" });
    return null;
  }
  return { companyId, project, tz, day };
}

export function registerDailyReportRoutes(app: Express) {
  const guard = [requireAuth, requireTeamMember, requirePermission("projects.site_diary", "view")];

  app.get("/api/projects/:projectId/daily-report/summary", ...guard, async (req: Request, res: Response) => {
    try {
      const ctx = await resolveRequest(req, res, req.query.date);
      if (!ctx) return;
      const [model, client] = await Promise.all([
        buildDailyReportModel(ctx.project, ctx.companyId, ctx.day, ctx.tz, { images: false }),
        clientContact(ctx.project),
      ]);
      res.json({
        date: ctx.day,
        dateLabel: model.dateLabel,
        filename: reportFilename(ctx.project.name, ctx.day),
        counts: {
          entries: model.entries.length,
          photos: model.photos.length + model.morePhotos,
          crew: model.crew.length,
          schedule: model.schedule.length,
          defects: model.defectsRaised.length + model.defectsClosed.length,
        },
        client: client ? { name: client.name, email: client.email || null } : null,
      });
    } catch (err: any) {
      console.error("[daily-report] summary failed:", err);
      res.status(500).json({ error: "Could not build the daily report" });
    }
  });

  app.get("/api/projects/:projectId/daily-report/pdf", ...guard, async (req: Request, res: Response) => {
    try {
      const ctx = await resolveRequest(req, res, req.query.date);
      if (!ctx) return;
      const model = await buildDailyReportModel(ctx.project, ctx.companyId, ctx.day, ctx.tz);
      const pdf = await renderDailyReportPdf(model);
      const filename = reportFilename(ctx.project.name, ctx.day);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.send(pdf);
    } catch (err: any) {
      console.error("[daily-report] render failed:", err);
      res.status(500).json({ error: "Could not build the daily report" });
    }
  });

  app.post("/api/projects/:projectId/daily-report/email", ...guard, async (req: Request, res: Response) => {
    try {
      const ctx = await resolveRequest(req, res, req.body?.date);
      if (!ctx) return;
      // The office confirms the address in the dialog; the server still
      // insists on a real one and a short list. It is the client's report, not
      // a mailing list.
      const raw: unknown[] = Array.isArray(req.body?.to) ? req.body.to : [req.body?.to];
      const to = Array.from(new Set(raw.map((e) => String(e ?? "").trim()).filter(Boolean)));
      if (!to.length || to.some((e) => !isPlausibleEmail(e))) {
        return res.status(400).json({ error: "Enter a valid email address." });
      }
      if (to.length > 5) return res.status(400).json({ error: "Send to at most 5 addresses." });
      const message = typeof req.body?.message === "string" ? req.body.message.slice(0, 5000) : "";

      const model = await buildDailyReportModel(ctx.project, ctx.companyId, ctx.day, ctx.tz);
      const pdf = await renderDailyReportPdf(model);
      const filename = reportFilename(ctx.project.name, ctx.day);

      const [{ renderClientEmail }, { sendGenericEmail }] = await Promise.all([
        import("./services/clientEmailShell"),
        import("./utils/email"),
      ]);
      const [settings] = await db.select().from(companySettings).where(eq(companySettings.companyId, ctx.companyId)).limit(1);
      const user = req.user as any;
      const senderName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;
      const client = await clientContact(ctx.project);
      const greeting = client?.name ? `Hi ${client.name.split(/\s+/)[0]},` : "Hi,";
      const body = message.trim() ||
        `${greeting}\n\nAttached is the daily site report for ${ctx.project.name} on ${model.dateLabel}.`;
      const html = renderClientEmail({
        brand: {
          companyName: settings?.companyName,
          logoUrl: settings?.logoUrl,
          brandColor: settings?.brandColor,
          phone: settings?.phone,
          email: settings?.email,
          website: settings?.website,
          address: settings?.address,
        },
        body,
        sender: { name: senderName, email: user?.email ?? null },
      });

      const result = await sendGenericEmail({
        to,
        subject: `Daily site report — ${ctx.project.name} — ${model.dateLabel}`,
        html,
        text: body,
        from: `${settings?.companyName || "Morada"} via Morada <noreply@moradaco.com.au>`,
        replyTo: user?.email || settings?.email || undefined,
        userId: user?.id,
        attachments: [{ filename, content: pdf.toString("base64"), mimeType: "application/pdf" }],
        context: { type: "daily_report", id: ctx.project.id, companyId: ctx.companyId },
      });

      // The log resolves a project from the context document's project_id;
      // the context here IS the project, so set it directly.
      if (result.deliveryId) {
        await db.update(emailDeliveries)
          .set({ projectId: ctx.project.id } as any)
          .where(and(eq(emailDeliveries.id, result.deliveryId), eq(emailDeliveries.companyId, ctx.companyId)))
          .catch((e: any) => console.warn("[daily-report] could not tag delivery with project:", e?.message));
      }
      res.json({ ok: true, to, deliveryId: result.deliveryId ?? null, sentVia: result.sentVia });
    } catch (err: any) {
      console.error("[daily-report] email failed:", err);
      res.status(502).json({ error: err?.message ? `Email not sent: ${err.message}` : "Email not sent" });
    }
  });
}

import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import { storage } from "../storage";
import { sendGenericEmail } from "../utils/email";
import { renderClientEmail } from "./clientEmailShell";
import {
  DEFAULT_VARIATION_REMINDER_TEMPLATES,
  renderVariationReminderText,
  pickVariationReminder,
} from "@shared/variationReminders";
import type { VariationReminderTemplate, InsertVariationReminderTemplate } from "@shared/schema";

/**
 * Chases a client who hasn't signed a variation. Built on the same two rules as
 * the proposal and RFQ schedulers:
 *
 *  - only variations still awaiting the client are chased: status "pending",
 *    sent through the portal, not signed, chasing switched on. Filtered in SQL,
 *    so a variation the client has signed or rejected can never be emailed.
 *  - a reminder is claimed by inserting its log row BEFORE the email goes. The
 *    unique (variation, template, email) index makes that insert the lock, so a
 *    retry, an overlapping tick or a second app instance cannot double-send.
 *
 * Chasing is opt-in per variation (variations.reminders_enabled, default off).
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly; each reminder fires once
const STARTUP_DELAY_MS = 195_000; // stagger off the RFQ and proposal sweeps
let started = false;

// ── Templates ───────────────────────────────────────────────────────────────

/** The company's steps, seeding the defaults the first time they're asked for. */
export async function getVariationReminderTemplates(companyId: string): Promise<VariationReminderTemplate[]> {
  const read = () =>
    db.select().from(schema.variationReminderTemplates)
      .where(eq(schema.variationReminderTemplates.companyId, companyId))
      .orderBy(asc(schema.variationReminderTemplates.displayOrder), asc(schema.variationReminderTemplates.createdAt));
  const existing = await read();
  if (existing.length > 0) return existing;
  const seeded = await db.insert(schema.variationReminderTemplates)
    .values(DEFAULT_VARIATION_REMINDER_TEMPLATES.map((t) => ({ ...t, companyId })))
    .onConflictDoNothing()
    .returning();
  return seeded.length > 0 ? seeded : read();
}

export async function getVariationReminderTemplate(id: string, companyId: string) {
  const [row] = await db.select().from(schema.variationReminderTemplates)
    .where(and(eq(schema.variationReminderTemplates.id, id), eq(schema.variationReminderTemplates.companyId, companyId)))
    .limit(1);
  return row;
}

export async function createVariationReminderTemplate(companyId: string, t: InsertVariationReminderTemplate) {
  const [row] = await db.insert(schema.variationReminderTemplates).values({ ...(t as any), companyId }).returning();
  return row;
}

export async function updateVariationReminderTemplate(id: string, companyId: string, t: Partial<InsertVariationReminderTemplate>) {
  const [row] = await db.update(schema.variationReminderTemplates)
    .set({ ...(t as any), updatedAt: new Date() })
    .where(and(eq(schema.variationReminderTemplates.id, id), eq(schema.variationReminderTemplates.companyId, companyId)))
    .returning();
  return row;
}

export async function deleteVariationReminderTemplate(id: string, companyId: string) {
  const rows = await db.delete(schema.variationReminderTemplates)
    .where(and(eq(schema.variationReminderTemplates.id, id), eq(schema.variationReminderTemplates.companyId, companyId)))
    .returning();
  return rows.length > 0;
}

// ── Log ─────────────────────────────────────────────────────────────────────

export async function getVariationReminderLog(variationId: string) {
  return db.select().from(schema.variationReminderLog)
    .where(eq(schema.variationReminderLog.variationId, variationId))
    .orderBy(desc(schema.variationReminderLog.sentAt));
}

async function claim(entry: typeof schema.variationReminderLog.$inferInsert) {
  const [row] = await db.insert(schema.variationReminderLog).values(entry).onConflictDoNothing().returning();
  return row ?? null;
}

// ── Who and what ────────────────────────────────────────────────────────────

/** Who the variation actually went to: the latest archived send's recipients. */
export async function variationRecipients(variationId: string): Promise<Array<{ name?: string; email: string }>> {
  const [send] = await db.select({ sentTo: schema.variationSends.sentTo })
    .from(schema.variationSends)
    .where(eq(schema.variationSends.variationId, variationId))
    .orderBy(desc(schema.variationSends.sentAt))
    .limit(1);
  const list = Array.isArray(send?.sentTo) ? send!.sentTo : [];
  return list.filter((r) => r && typeof r.email === "string" && r.email.includes("@"));
}

export async function sendVariationReminder({
  variation,
  template,
  recipient,
  companyId,
  force = false,
}: {
  variation: schema.Variation;
  template: VariationReminderTemplate;
  recipient: { name?: string; email: string };
  companyId: string;
  /** "Send now" from the page — skips the once-only claim. */
  force?: boolean;
}): Promise<{ email: string; status: "sent" | "failed" | "skipped"; error?: string }> {
  if (!recipient.email) return { email: "", status: "skipped", error: "No email address" };
  if (!(variation as any).portalToken) return { email: recipient.email, status: "skipped", error: "Not sent through the portal" };

  const [settings, project, creator] = await Promise.all([
    storage.getCompanySettings(companyId).catch(() => undefined),
    storage.getProject(variation.projectId).catch(() => undefined),
    (variation as any).createdById ? storage.getUser((variation as any).createdById).catch(() => undefined) : undefined,
  ]);
  let clientName = recipient.name || null;
  if (!clientName && (project as any)?.clientId) {
    const client = await storage.getContact((project as any).clientId, companyId).catch(() => undefined);
    clientName = (client as any)?.firstName || (client as any)?.name || null;
  }
  const senderName = creator ? [creator.firstName, creator.lastName].filter(Boolean).join(" ") || null : null;

  const ctx = {
    variation: variation as any,
    clientName,
    senderName,
    companyName: settings?.companyName ?? null,
    projectName: project?.name ?? null,
  };
  const subject = renderVariationReminderText(template.subject, ctx);
  const body = renderVariationReminderText(template.body, ctx);

  let logId: string | null = null;
  if (!force) {
    const row = await claim({
      variationId: variation.id,
      templateId: template.id,
      toEmail: recipient.email,
      subject,
      body,
      status: "sent",
    });
    if (!row) return { email: recipient.email, status: "skipped", error: "Already sent" };
    logId = row.id;
  }

  try {
    const base = (process.env.APP_BASE_URL || "https://app.moradaco.com.au").replace(/\/$/, "");
    const html = renderClientEmail({
      brand: {
        companyName: settings?.companyName,
        logoUrl: (settings as any)?.logoUrl,
        brandColor: (settings as any)?.brandColor,
        phone: (settings as any)?.phone,
        email: (settings as any)?.email,
        address: (settings as any)?.address,
      },
      body,
      cta: { href: `${base}/portal/variation/${(variation as any).portalToken}`, label: "Review and approve" },
      note: null,
      sender: { name: senderName, email: creator?.email ?? null },
    });
    await sendGenericEmail({
      to: recipient.email,
      subject,
      html,
      from: `${settings?.companyName || "Morada"} via Morada <noreply@moradaco.com.au>`,
      ...(creator?.email ? { replyTo: creator.email } : {}),
      context: { type: "variation_reminder", id: variation.id, companyId },
    } as any);
    if (force) {
      // A manual send is still recorded, just not as the once-only claim.
      await db.insert(schema.variationReminderLog).values({
        variationId: variation.id, templateId: null, toEmail: recipient.email, subject, body, status: "sent",
      }).catch(() => undefined);
    }
    return { email: recipient.email, status: "sent" };
  } catch (error: any) {
    // The claim stays, marked failed: a bad address is not retried every hour
    // forever, and the failure stays visible in the history.
    if (logId) {
      await db.update(schema.variationReminderLog)
        .set({ status: "failed", error: error?.message || "Send failed" })
        .where(eq(schema.variationReminderLog.id, logId));
    }
    return { email: recipient.email, status: "failed", error: error?.message };
  }
}

// ── Sweep ───────────────────────────────────────────────────────────────────

/** Variations out with a client, unsigned, with chasing on — and their company. */
async function workList() {
  return db
    .select({ variation: schema.variations, companyId: schema.projects.companyId })
    .from(schema.variations)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.variations.projectId))
    .where(and(
      eq(schema.variations.remindersEnabled, true),
      eq(schema.variations.status, "pending"),
      isNotNull(schema.variations.portalSentAt),
      isNotNull(schema.variations.portalToken),
      sql`${schema.variations.clientSignedDate} IS NULL`,
    ));
}

export async function sweepVariationReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
  let checked = 0;
  let sent = 0;
  const rows = await workList();
  const byCompany = new Map<string, schema.Variation[]>();
  for (const r of rows) {
    if (!r.companyId) continue;
    const list = byCompany.get(r.companyId);
    if (list) list.push(r.variation);
    else byCompany.set(r.companyId, [r.variation]);
  }

  for (const [companyId, variations] of Array.from(byCompany.entries())) {
    const templates = (await getVariationReminderTemplates(companyId).catch(() => [])).filter((t) => t.enabled);
    if (templates.length === 0) continue;
    for (const variation of variations) {
      checked++;
      const recipients = await variationRecipients(variation.id);
      if (recipients.length === 0) continue; // nobody recorded — don't guess
      // Which steps are due now and haven't gone yet. When several are —
      // chasing switched on for a variation sent weeks ago — only the LATEST
      // goes; the earlier ones are logged as skipped so they never send. A
      // client should get one email, not the whole sequence at once.
      const done = new Set(
        (await getVariationReminderLog(variation.id)).map((e) => e.templateId).filter(Boolean) as string[],
      );
      const { send: latest, skip } = pickVariationReminder(templates, done, {
        sentAt: (variation as any).portalSentAt,
        approvalDeadline: (variation as any).approvalDeadline,
      }, now);
      if (!latest) continue;
      for (const t of skip) {
        for (const r of recipients) {
          await claim({ variationId: variation.id, templateId: t.id, toEmail: r.email, status: "skipped",
            error: `Skipped — "${latest.name}" was due as well, so only that one was sent` });
        }
      }
      for (const recipient of recipients) {
        const result = await sendVariationReminder({ variation, template: latest, recipient, companyId });
        if (result.status === "sent") sent++;
      }
    }
  }
  return { checked, sent };
}

export function startVariationReminderScheduler(): void {
  if (started) return;
  started = true;
  const run = () => {
    sweepVariationReminders()
      .then(({ checked, sent }) => {
        if (checked > 0 || sent > 0) console.log(`[VariationReminders] swept ${checked} variation(s), sent ${sent} reminder(s)`);
      })
      .catch((e) => console.error("[VariationReminders]", e));
  };
  setTimeout(run, STARTUP_DELAY_MS);
  setInterval(run, CHECK_INTERVAL_MS);
  console.log("[VariationReminders] scheduler started (hourly)");
}

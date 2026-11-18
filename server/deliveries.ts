/**
 * Delivery check-in against a purchase order (migration 0134).
 *
 * Site crew open a job's POs on the phone, record what turned up and
 * photograph the docket. These routes sit deliberately OUTSIDE the PO money
 * gate (server/poAccessPolicy.ts, mounted on /api/purchase-orders): a site
 * supervisor holds no financial.purchase_orders permission, and should not
 * need it to say "the timber arrived". In exchange, everything here is
 * price-free — every response goes through the projectors in
 * shared/deliveries.ts, which build their output from a whitelist.
 * server/__tests__/delivery-check-in.test.ts fails if a handler returns
 * anything else.
 *
 * Access: projects.deliveries view (read) / add (check in), team members
 * only. Clients are refused by clientAccessGate (deny by default) and
 * suppliers by requireTeamMember. Every lookup is scoped to the caller's
 * company; a PO or project in another company is a 404.
 *
 * The office side (what the delivered goods are worth, against the bill) is
 * GET /api/purchase-orders/:id/delivery-summary in routes.ts, behind the
 * normal PO gate.
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "./db";
import {
  companySettings,
  projects,
  purchaseOrders,
  purchaseOrderItems,
  purchaseOrderAttachments,
  purchaseOrderDeliveries,
  purchaseOrderDeliveryItems,
  bills,
  type PurchaseOrder,
  type PurchaseOrderDelivery,
} from "@shared/schema";
import {
  DELIVERY_EXCLUDED_PO_STATUSES,
  checkInHasIssues,
  computeDeliveryStatus,
  computeLineProgress,
  parseCheckInRequest,
  projectDeliveryPO,
  projectDeliveryRecord,
  receivedValueCents,
  type DeliveryPO,
  type DeliveryRecord,
} from "@shared/deliveries";
import { requireAuth, requirePermission, requireTeamMember, getSessionCompanyId } from "./middleware/auth";
import { storage } from "./storage";
import { emitNotification } from "./socketManager";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export const DELIVERIES_MOUNT = "/api/deliveries";

async function docketPhotoRequired(companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ required: companySettings.deliveryDocketPhotoRequired })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);
  return row?.required ?? true;
}

/** The PO, if it is in the caller's company and offered for check-in. */
async function ownedPO(companyId: string, poId: string): Promise<PurchaseOrder | null> {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.companyId, companyId)))
    .limit(1);
  if (!po || DELIVERY_EXCLUDED_PO_STATUSES.includes(po.status)) return null;
  return po;
}

/** Lines, deliveries and delivery items for a set of POs, in four queries total. */
async function loadDeliveryData(conn: Db, poIds: string[]) {
  if (poIds.length === 0) return { lines: [], deliveries: [], items: [], dockets: [] };
  const lines = await conn
    .select({
      id: purchaseOrderItems.id,
      purchaseOrderId: purchaseOrderItems.purchaseOrderId,
      description: purchaseOrderItems.description,
      unit: purchaseOrderItems.unit,
      quantity: purchaseOrderItems.quantity,
      displayOrder: purchaseOrderItems.displayOrder,
    })
    .from(purchaseOrderItems)
    .where(inArray(purchaseOrderItems.purchaseOrderId, poIds));
  const deliveries = await conn
    .select()
    .from(purchaseOrderDeliveries)
    .where(inArray(purchaseOrderDeliveries.purchaseOrderId, poIds))
    .orderBy(desc(purchaseOrderDeliveries.receivedAt));
  const deliveryIds = deliveries.map((d) => d.id);
  const items = deliveryIds.length
    ? await conn.select().from(purchaseOrderDeliveryItems).where(inArray(purchaseOrderDeliveryItems.deliveryId, deliveryIds))
    : [];
  const dockets = deliveryIds.length
    ? await conn
        .select({ deliveryId: purchaseOrderAttachments.deliveryId, fileUrl: purchaseOrderAttachments.fileUrl })
        .from(purchaseOrderAttachments)
        .where(and(inArray(purchaseOrderAttachments.deliveryId, deliveryIds), eq(purchaseOrderAttachments.kind, "docket")))
    : [];
  return { lines, deliveries, items, dockets };
}

type Loaded = Awaited<ReturnType<typeof loadDeliveryData>>;

function poView(po: PurchaseOrder, data: Loaded): DeliveryPO {
  const deliveries = data.deliveries.filter((d) => d.purchaseOrderId === po.id);
  const ids = new Set(deliveries.map((d) => d.id));
  return projectDeliveryPO(
    po,
    data.lines.filter((l) => l.purchaseOrderId === po.id),
    data.items.filter((i) => ids.has(i.deliveryId)),
    deliveries,
  );
}

function recordView(delivery: PurchaseOrderDelivery, data: Loaded): DeliveryRecord {
  return projectDeliveryRecord(
    delivery,
    data.items.filter((i) => i.deliveryId === delivery.id),
    data.dockets.filter((d) => d.deliveryId === delivery.id).map((d) => d.fileUrl),
  );
}

/** Recompute and store a PO's delivery status from its check-ins. */
export async function refreshDeliveryStatus(conn: Db, po: PurchaseOrder): Promise<string> {
  const data = await loadDeliveryData(conn, [po.id]);
  const progress = computeLineProgress(data.lines, data.items);
  const status = computeDeliveryStatus(progress, data.deliveries);
  if (status !== po.deliveryStatus) {
    await conn
      .update(purchaseOrders)
      .set({ deliveryStatus: status })
      .where(and(eq(purchaseOrders.id, po.id), eq(purchaseOrders.companyId, po.companyId)));
  }
  return status;
}

async function replay(res: Response, po: PurchaseOrder, deliveryId: string) {
  const data = await loadDeliveryData(db, [po.id]);
  const delivery = data.deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return res.status(409).json({ error: "Check-in already recorded" });
  return res.status(200).json({ delivery: recordView(delivery, data), po: poView(po, data), replayed: true });
}

function displayName(user: any): string | null {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return name || user?.username || null;
}

export function registerDeliveryRoutes(app: Express) {
  // The job's POs, with every line and what is still to come. One call so the
  // phone can cache it whole and check in underground.
  app.get(
    `${DELIVERIES_MOUNT}/projects/:projectId/pos`,
    requireAuth,
    requireTeamMember,
    requirePermission("projects.deliveries", "view"),
    async (req: Request, res: Response) => {
      try {
        const companyId = getSessionCompanyId(req);
        if (!companyId) return res.status(401).json({ error: "Not authenticated" });
        const [project] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, req.params.projectId), eq(projects.companyId, companyId)))
          .limit(1);
        if (!project) return res.status(404).json({ error: "Project not found" });

        const pos = await db
          .select()
          .from(purchaseOrders)
          .where(and(
            eq(purchaseOrders.projectId, project.id),
            eq(purchaseOrders.companyId, companyId),
            notInArray(purchaseOrders.status, DELIVERY_EXCLUDED_PO_STATUSES as any),
          ))
          .orderBy(desc(purchaseOrders.poDate));
        const [data, required] = await Promise.all([
          loadDeliveryData(db, pos.map((p) => p.id)),
          docketPhotoRequired(companyId),
        ]);
        res.json({
          projectId: project.id,
          docketPhotoRequired: required,
          purchaseOrders: pos.map((po) => poView(po, data)),
        });
      } catch (error) {
        console.error("[GET /api/deliveries/projects/:projectId/pos]", error);
        res.status(500).json({ error: "Failed to load purchase orders" });
      }
    },
  );

  // One PO: its lines with ordered / received / outstanding, and past check-ins.
  app.get(
    `${DELIVERIES_MOUNT}/pos/:poId`,
    requireAuth,
    requireTeamMember,
    requirePermission("projects.deliveries", "view"),
    async (req: Request, res: Response) => {
      try {
        const companyId = getSessionCompanyId(req);
        if (!companyId) return res.status(401).json({ error: "Not authenticated" });
        const po = await ownedPO(companyId, req.params.poId);
        if (!po) return res.status(404).json({ error: "Purchase order not found" });
        const [data, required] = await Promise.all([loadDeliveryData(db, [po.id]), docketPhotoRequired(companyId)]);
        res.json({
          docketPhotoRequired: required,
          po: poView(po, data),
          deliveries: data.deliveries.map((d) => recordView(d, data)),
        });
      } catch (error) {
        console.error("[GET /api/deliveries/pos/:poId]", error);
        res.status(500).json({ error: "Failed to load purchase order" });
      }
    },
  );

  // Record a delivery. Idempotent on clientRequestId: the phone queues
  // offline and retries, and a retry of a saved check-in returns it (200).
  app.post(
    `${DELIVERIES_MOUNT}/pos/:poId/check-ins`,
    requireAuth,
    requireTeamMember,
    requirePermission("projects.deliveries", "add"),
    async (req: Request, res: Response) => {
      try {
        const companyId = getSessionCompanyId(req);
        const user = req.user as any;
        if (!companyId || !user?.id) return res.status(401).json({ error: "Not authenticated" });
        const po = await ownedPO(companyId, req.params.poId);
        if (!po) return res.status(404).json({ error: "Purchase order not found" });

        const requestId = typeof req.body?.clientRequestId === "string" ? req.body.clientRequestId.trim() : "";
        if (requestId) {
          const [existing] = await db
            .select({ id: purchaseOrderDeliveries.id, purchaseOrderId: purchaseOrderDeliveries.purchaseOrderId })
            .from(purchaseOrderDeliveries)
            .where(and(
              eq(purchaseOrderDeliveries.projectId, po.projectId),
              eq(purchaseOrderDeliveries.clientRequestId, requestId),
              eq(purchaseOrderDeliveries.companyId, companyId),
            ))
            .limit(1);
          if (existing) {
            if (existing.purchaseOrderId !== po.id) return res.status(409).json({ error: "That check-in was for another purchase order" });
            return replay(res, po, existing.id);
          }
        }

        const lines = await db
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.purchaseOrderId, po.id));
        const parsed = parseCheckInRequest(req.body, {
          companyId,
          lineIds: new Set(lines.map((l) => l.id)),
          docketPhotoRequired: await docketPhotoRequired(companyId),
        });
        if (!parsed.ok) return res.status(400).json({ error: parsed.error, code: parsed.code });
        const input = parsed.value;
        const lineById = new Map(lines.map((l) => [l.id, l]));
        const hasIssues = checkInHasIssues(input.items);

        let deliveryId: string;
        try {
          deliveryId = await db.transaction(async (tx) => {
            const [delivery] = await tx
              .insert(purchaseOrderDeliveries)
              .values({
                companyId,
                projectId: po.projectId,
                purchaseOrderId: po.id,
                receivedAt: input.receivedAt,
                receivedById: user.id,
                receivedByName: displayName(user),
                docketNumber: input.docketNumber,
                notes: input.notes,
                hasIssues,
                clientRequestId: input.clientRequestId,
              })
              .returning();
            await tx.insert(purchaseOrderDeliveryItems).values(
              input.items.map((it) => {
                const line = lineById.get(it.purchaseOrderItemId)!;
                return {
                  deliveryId: delivery.id,
                  purchaseOrderItemId: line.id,
                  descriptionSnapshot: line.description,
                  qtyOrderedSnapshot: String(line.quantity ?? "0"),
                  qtyReceived: String(it.qtyReceived),
                  condition: it.condition,
                  note: it.note,
                  photoUrls: it.photoUrls,
                };
              }),
            );
            // Photos also land on the PO's attachments, so the office sees the
            // docket and the damage beside the bill.
            const stamp = input.receivedAt.toISOString().slice(0, 10);
            const photos = [
              ...input.docketPhotoUrls.map((url, i) => ({ url, kind: "docket", name: `Docket ${input.docketNumber ?? stamp}${input.docketPhotoUrls.length > 1 ? ` (${i + 1})` : ""}.jpg` })),
              ...input.items.flatMap((it) =>
                it.photoUrls.map((url, i) => ({
                  url,
                  kind: "damage",
                  name: `Delivery ${stamp} — ${lineById.get(it.purchaseOrderItemId)!.description.slice(0, 60)}${it.photoUrls.length > 1 ? ` (${i + 1})` : ""}.jpg`,
                })),
              ),
            ];
            if (photos.length) {
              await tx.insert(purchaseOrderAttachments).values(
                photos.map((p) => ({
                  purchaseOrderId: po.id,
                  fileName: p.name,
                  fileUrl: p.url,
                  fileType: "image/jpeg",
                  uploadedById: user.id,
                  deliveryId: delivery.id,
                  kind: p.kind,
                })),
              );
            }
            await refreshDeliveryStatus(tx, po);
            return delivery.id;
          });
        } catch (err: any) {
          // Two retries racing: the unique (project, clientRequestId) refused one.
          if (err?.code === "23505") {
            const [existing] = await db
              .select({ id: purchaseOrderDeliveries.id })
              .from(purchaseOrderDeliveries)
              .where(and(
                eq(purchaseOrderDeliveries.projectId, po.projectId),
                eq(purchaseOrderDeliveries.clientRequestId, input.clientRequestId),
                eq(purchaseOrderDeliveries.companyId, companyId),
              ))
              .limit(1);
            if (existing) return replay(res, po, existing.id);
          }
          throw err;
        }

        const [fresh] = await db
          .select()
          .from(purchaseOrders)
          .where(and(eq(purchaseOrders.id, po.id), eq(purchaseOrders.companyId, companyId)));
        const data = await loadDeliveryData(db, [po.id]);
        const delivery = data.deliveries.find((d) => d.id === deliveryId)!;

        if (hasIssues && po.createdById && po.createdById !== user.id) {
          void notifyIssue(po, companyId, user).catch((e) => console.error("[deliveries] notify failed:", e));
        }

        res.status(201).json({ delivery: recordView(delivery, data), po: poView(fresh ?? po, data), replayed: false });
      } catch (error) {
        console.error("[POST /api/deliveries/pos/:poId/check-ins]", error);
        res.status(500).json({ error: "Failed to record the delivery" });
      }
    },
  );
}

/** Tell whoever raised the PO. In-app + socket here; storage pushes to the phone. */
async function notifyIssue(po: PurchaseOrder, companyId: string, user: any) {
  const who = displayName(user) || "Site";
  const notification = await storage.createNotification({
    userId: po.createdById,
    companyId,
    type: "delivery_issue",
    title: `Delivery issue — ${po.poNumber}`,
    message: `${who} checked in a delivery from ${po.supplierName || "the supplier"} with a problem. Check it before the bill is approved.`,
    link: `/purchase-orders/${po.id}`,
    entityType: "purchase_order",
    entityId: po.id,
    isRead: false,
    createdByUserId: user.id,
  } as any);
  emitNotification(po.createdById, notification);
}

/**
 * The office's view of a PO's deliveries in money: roughly what has arrived
 * (received quantity × unit price, inc GST) against what has been billed.
 * NOT for the crew — served from /api/purchase-orders/:id/delivery-summary,
 * behind the PO gate. Null when the PO is not in this company.
 */
export async function deliverySummaryFor(companyId: string, poId: string) {
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.companyId, companyId)))
    .limit(1);
  if (!po) return null;
  const pricedLines = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
  const data = await loadDeliveryData(db, [po.id]);
  const progress = computeLineProgress(pricedLines, data.items);
  const billed = await db
    .select({ total: bills.total })
    .from(bills)
    .where(and(eq(bills.matchedSitePOId, po.id), eq(bills.companyId, companyId)));
  return {
    purchaseOrderId: po.id,
    deliveryStatus: computeDeliveryStatus(progress, data.deliveries),
    poTotalCents: po.total,
    receivedValueCents: receivedValueCents(pricedLines, progress, po.gstMode),
    billedCents: billed.reduce((s, b) => s + (b.total || 0), 0),
    deliveryCount: data.deliveries.length,
    issueCount: data.deliveries.filter((d) => d.hasIssues).length,
    lastDeliveryAt: data.deliveries[0]?.receivedAt ?? null,
    lines: progress,
    deliveries: data.deliveries.map((d) => recordView(d, data)),
  };
}

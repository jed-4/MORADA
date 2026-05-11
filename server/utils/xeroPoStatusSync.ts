import { storage } from "../storage";
import { xeroService } from "../services/xeroService";

export type XeroPoStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "AUTHORISED"
  | "BILLED"
  | "DELETED";

export type BuildProPoStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "acknowledged"
  | "accepted"
  | "partially_received"
  | "completed"
  | "billed"
  | "cancelled";

export function mapXeroPoStatusToBuildPro(
  xeroStatus: string | null | undefined,
  currentBuildProStatus?: BuildProPoStatus | string,
): BuildProPoStatus | null {
  if (!xeroStatus) return null;
  const s = xeroStatus.toUpperCase();
  switch (s) {
    case "DRAFT":
      return "draft";
    case "SUBMITTED":
      return "pending_approval";
    case "AUTHORISED":
      return "sent";
    case "BILLED":
      return "billed";
    case "DELETED":
      return "cancelled";
    default:
      return null;
  }
}

export interface SyncResult {
  poId: string;
  xeroStatus: string | null;
  buildProStatus: string | null;
  changed: boolean;
  error?: string;
}

export async function syncOneXeroPurchaseOrder(
  poId: string,
  connectionId: string,
): Promise<SyncResult> {
  const po = await storage.getPurchaseOrder(poId);
  if (!po) {
    return { poId, xeroStatus: null, buildProStatus: null, changed: false, error: "PO not found" };
  }
  if (!(po as any).xeroPurchaseOrderId) {
    return { poId, xeroStatus: null, buildProStatus: po.status, changed: false, error: "Not linked to Xero" };
  }

  let xeroPo: any;
  try {
    xeroPo = await xeroService.getPurchaseOrder(
      connectionId,
      (po as any).xeroPurchaseOrderId,
    );
  } catch (err: any) {
    return {
      poId,
      xeroStatus: null,
      buildProStatus: po.status,
      changed: false,
      error: err?.message || "Xero fetch failed",
    };
  }

  const xeroStatus: string | null = xeroPo?.Status ?? null;
  const mapped = mapXeroPoStatusToBuildPro(xeroStatus, po.status as any);

  const updates: Record<string, any> = {
    xeroLastSyncAt: new Date(),
  };
  if (xeroStatus) updates.xeroStatus = xeroStatus;
  let changed = false;

  // Only auto-promote BuildPro status if the Xero status maps cleanly AND
  // the BuildPro PO is not already in a terminal/post-PO state we don't
  // want to override (completed, partially_received). Cancelled and billed
  // from Xero always win.
  if (mapped) {
    const current = po.status as string;
    // Protect BuildPro states that represent user intent past Xero's
    // current step. e.g. user marked the PO 'sent' locally even though
    // Xero still has it as DRAFT — don't downgrade. Xero BILLED/DELETED
    // still override below.
    const protectedStates = new Set([
      "sent",
      "acknowledged",
      "accepted",
      "partially_received",
      "completed",
    ]);
    const xeroForcesOverride = mapped === "cancelled" || mapped === "billed";
    if (mapped !== current && (xeroForcesOverride || !protectedStates.has(current))) {
      updates.status = mapped;
      changed = true;
    }
  }

  if (xeroStatus && xeroStatus !== (po as any).xeroStatus) {
    changed = true;
  }

  try {
    await storage.updatePurchaseOrder(poId, updates as any);
  } catch (err: any) {
    return {
      poId,
      xeroStatus,
      buildProStatus: updates.status ?? po.status,
      changed: false,
      error: err?.message || "DB update failed",
    };
  }

  return {
    poId,
    xeroStatus,
    buildProStatus: updates.status ?? po.status,
    changed,
  };
}

let lastPollAt = 0;
const POLL_INTERVAL_MS = 10 * 60 * 1000;

export async function pollXeroPurchaseOrderStatuses(): Promise<void> {
  const now = Date.now();
  if (now - lastPollAt < POLL_INTERVAL_MS) return;
  lastPollAt = now;

  try {
    console.log("[XeroPoSync] Polling Xero for linked PO status updates...");
    const { db } = await import("../db");
    const { xeroConnections, purchaseOrders } = await import("@shared/schema");
    const { and, isNotNull, ne, sql } = await import("drizzle-orm");

    const allConnections = await db.select().from(xeroConnections);
    let totalChecked = 0;
    let totalChanged = 0;

    for (const connection of allConnections) {
      const companyId = connection.companyId;
      // Only POs that are linked to Xero and not yet in a final BuildPro state.
      const rows = await db
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(
          and(
            isNotNull(purchaseOrders.xeroPurchaseOrderId),
            ne(purchaseOrders.companyId, "" as any),
            sql`${purchaseOrders.companyId} = ${companyId}`,
            sql`${purchaseOrders.status} NOT IN ('billed','cancelled','completed')`,
          ),
        );

      for (const row of rows) {
        totalChecked++;
        try {
          const result = await syncOneXeroPurchaseOrder(row.id, connection.id);
          if (result.changed) totalChanged++;
        } catch (err) {
          console.error(`[XeroPoSync] Failed to sync PO ${row.id}:`, err);
        }
      }
    }

    console.log(
      `[XeroPoSync] Poll complete: ${totalChecked} checked, ${totalChanged} updated.`,
    );
  } catch (err) {
    console.error("[XeroPoSync] Poll failed:", err);
  }
}

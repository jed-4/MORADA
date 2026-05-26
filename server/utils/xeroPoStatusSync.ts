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
  | "sent"
  | "invoiced"
  | "partially_paid"
  | "paid"
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
      // SUBMITTED in Xero means "awaiting approval" — BuildPro has no
      // pending_approval state anymore (task #296). Map to "sent" since
      // the PO has left the Draft stage.
      return "sent";
    case "AUTHORISED":
      return "sent";
    case "BILLED":
      // Xero "BILLED" means a bill exists against the PO. In BuildPro
      // collapsed flow that's "invoiced".
      return "invoiced";
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
  // the BuildPro PO is not already in a state past the one Xero reports.
  // Cancelled and invoiced from Xero always win.
  if (mapped) {
    const current = po.status as string;
    // Protect BuildPro states that represent user intent past Xero's
    // current step. e.g. user already marked the PO 'invoiced'/'paid'
    // locally; don't downgrade it to 'sent' just because Xero is still
    // at AUTHORISED. Xero BILLED/DELETED still override below.
    const protectedStates = new Set([
      "sent",
      "invoiced",
      "partially_paid",
      "paid",
      "cancelled",
    ]);
    // Only "cancelled" from Xero is allowed to force-override a protected
    // local state. "invoiced" must NOT downgrade local 'partially_paid' or
    // 'paid' — those represent payment progress Xero's PO endpoint does
    // not track. Use a monotonic rank so Xero can only ever move the PO
    // forward (or to cancelled).
    const rank: Record<string, number> = {
      draft: 0,
      sent: 1,
      invoiced: 2,
      partially_paid: 3,
      paid: 4,
      cancelled: 99,
    };
    const xeroForcesOverride = mapped === "cancelled";
    const currentRank = rank[current] ?? 0;
    const mappedRank = rank[mapped] ?? 0;
    const canPromote = mappedRank > currentRank && !protectedStates.has(current);
    if (mapped !== current && (xeroForcesOverride || canPromote)) {
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
            sql`${purchaseOrders.status} NOT IN ('paid','cancelled')`,
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

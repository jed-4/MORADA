/**
 * Who may do what to a purchase order. Pure, so it can be tested without a
 * database: requirePermission and userHasPermission both pass everything in
 * development, which means a browser on dev can never exercise this.
 *
 * financial.purchase_orders is the rule. The exceptions are deliberate:
 * - Site POs are raised on site by people who hold no PO permission (a Site
 *   Supervisor has none by default). They keep full control of their OWN site
 *   POs and see nobody else's.
 * - The supplier named on a PO can read that PO.
 * - The bill screens pick from the PO list, so financial.bills can read.
 */
export type POAction = "view" | "add" | "edit" | "delete" | "send";

export const PO_MOUNT = "/api/purchase-orders";
export const PO_MOUNTS = [
  PO_MOUNT,
  "/api/purchase-order-items",
  "/api/purchase-order-attachments",
  "/api/purchase-order-templates",
];

/** The action a request needs. (The trade's accept link lives under /api/portal/po.) */
export function poActionFor(method: string, baseUrl: string, path: string): POAction | null {
  const segs = path.split("/").filter(Boolean);
  if (method === "GET" || method === "HEAD") return "view";
  if (baseUrl !== PO_MOUNT) return "edit";
  if (method === "DELETE") return segs.length === 1 ? "delete" : "edit";
  if (method === "POST") {
    if (segs.length === 0 || segs[0] === "generate-from-timesheets") return "add";
    if (segs[1] === "duplicate") return "add";
    if (segs[1] === "send") return "send";
  }
  return "edit";
}

export interface POGateInput {
  action: POAction;
  baseUrl: string;
  path: string;
  body?: any;
  user: { id: string; companyId: string; userCategory?: string | null };
  /** Holds financial.purchase_orders for this action. */
  hasPOPermission: boolean;
  /** Holds financial.bills view. */
  hasBillView: boolean;
  /** The PO the path names, when it names one. */
  po?: { companyId: string; poType: string; createdById: string; supplierUserId?: string | null } | null;
}

export type POGateResult = "full" | "limited" | "deny";

/**
 * full    = the route behaves as normal.
 * limited = allowed, but a list must be narrowed to the user's own POs.
 * deny    = 403.
 */
export function decidePOAccess(i: POGateInput): POGateResult {
  if (i.hasPOPermission) return "full";
  if (i.action === "view" && i.hasBillView) return "full";
  if (i.baseUrl !== PO_MOUNT) return "deny";

  const segs = i.path.split("/").filter(Boolean);
  const isTeam = i.user.userCategory === "team";

  if (segs.length === 0) {
    if (i.action === "view") return "limited";
    const type = i.body?.type || i.body?.poType;
    return i.action === "add" && isTeam && type === "site" ? "limited" : "deny";
  }
  if (segs[0] === "next-number") return isTeam && segs[1] === "site" ? "limited" : "deny";

  const po = i.po;
  if (!po || po.companyId !== i.user.companyId) return "deny";
  if (po.poType === "site" && po.createdById === i.user.id) return "limited";
  if (i.action === "view" && po.supplierUserId === i.user.id) return "limited";
  return "deny";
}

/** What a user without PO permission gets from the list. */
export function narrowPOList<T extends { poType: string; createdById: string; supplierUserId?: string | null }>(
  pos: T[],
  userId: string,
): T[] {
  return pos.filter(
    (po) => (po.poType === "site" && po.createdById === userId) || po.supplierUserId === userId,
  );
}

/** Set by the server, never by a request body. */
export const PO_SERVER_MANAGED_FIELDS = [
  "approvedById", "approvedAt", "sentAt", "sentToEmail", "matchedBillId", "matchedAt",
  "xeroPurchaseOrderId", "xeroPurchaseOrderNumber", "xeroStatus", "xeroLastSyncAt",
] as const;

// Delivery check-in against a purchase order: the pure half.
//
// Site crew record what turned up — how many of each PO line, in what
// condition, the docket number and a photo of the docket. Everything here is
// pure so it can be tested without a database, and the server serialises
// every /api/deliveries response through the projectors below.
//
// THE RULE: crew see items and quantities, never prices. The projectors build
// their output from an explicit whitelist, so a price column added to
// purchase_orders or purchase_order_items later cannot leak through them.
// server/__tests__/delivery-check-in.test.ts holds that line.
//
// What counts as received: a line checked in as "ok" or "short" counts its
// quantity toward the order. "damaged" and "wrong" are recorded, but do not
// count — those goods have to be replaced, so the line stays outstanding.

import { computePOTotalsCents } from "./poTotals";

export const DELIVERY_STATUSES = ["none", "partial", "delivered", "issues"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_CONDITIONS = ["ok", "short", "damaged", "wrong"] as const;
export type DeliveryCondition = (typeof DELIVERY_CONDITIONS)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  none: "Not delivered",
  partial: "Part delivered",
  delivered: "Delivered",
  issues: "Delivery issues",
};

export const DELIVERY_CONDITION_LABELS: Record<DeliveryCondition, string> = {
  ok: "OK",
  short: "Short",
  damaged: "Damaged",
  wrong: "Wrong item",
};

/** POs in these money statuses are never offered for check-in. */
export const DELIVERY_EXCLUDED_PO_STATUSES = ["draft", "cancelled"];

/** numeric(10,2) comes back from Drizzle as a string. */
export function qty(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function countsAsReceived(condition: string | null | undefined): boolean {
  return condition === "ok" || condition === "short";
}

// ── Inputs (the subset of DB rows this module reads) ────────────────────────

export interface POLineInput {
  id: string;
  description: string;
  unit?: string | null;
  quantity: string | number | null;
  displayOrder?: number | null;
}

export interface DeliveryItemInput {
  id?: string;
  deliveryId?: string;
  purchaseOrderItemId: string | null;
  descriptionSnapshot?: string | null;
  qtyOrderedSnapshot?: string | number | null;
  qtyReceived: string | number | null;
  condition: string;
  note?: string | null;
  photoUrls?: unknown;
}

export interface DeliveryInput {
  id: string;
  purchaseOrderId: string;
  receivedAt: Date | string;
  receivedByName?: string | null;
  docketNumber?: string | null;
  notes?: string | null;
  hasIssues: boolean;
  createdAt: Date | string;
}

export interface POInput {
  id: string;
  projectId: string;
  poNumber: string;
  title?: string | null;
  supplierName?: string | null;
  status: string;
  requiredByDate?: Date | string | null;
  deliveryAddress?: string | null;
  deliveryInstructions?: string | null;
}

// ── Outputs (price-free) ────────────────────────────────────────────────────

export interface DeliveryLine {
  id: string;
  description: string;
  unit: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  qtyOutstanding: number;
}

export interface DeliveryPO {
  id: string;
  projectId: string;
  poNumber: string;
  title: string | null;
  supplierName: string | null;
  status: string;
  requiredByDate: string | null;
  deliveryAddress: string | null;
  deliveryInstructions: string | null;
  deliveryStatus: DeliveryStatus;
  lastDeliveryAt: string | null;
  lineCount: number;
  outstandingLineCount: number;
  lines: DeliveryLine[];
}

export interface DeliveryRecordItem {
  id: string;
  purchaseOrderItemId: string | null;
  description: string;
  qtyOrdered: number;
  qtyReceived: number;
  condition: DeliveryCondition;
  note: string | null;
  photoUrls: string[];
}

export interface DeliveryRecord {
  id: string;
  purchaseOrderId: string;
  receivedAt: string;
  receivedByName: string | null;
  docketNumber: string | null;
  notes: string | null;
  hasIssues: boolean;
  docketPhotoUrls: string[];
  createdAt: string;
  items: DeliveryRecordItem[];
}

const iso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString();

const stringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const asCondition = (c: string): DeliveryCondition =>
  (DELIVERY_CONDITIONS as readonly string[]).includes(c) ? (c as DeliveryCondition) : "ok";

// ── Progress & status ───────────────────────────────────────────────────────

/** Ordered / received / outstanding per PO line, in display order. */
export function computeLineProgress(lines: POLineInput[], items: DeliveryItemInput[]): DeliveryLine[] {
  const received = new Map<string, number>();
  for (const it of items) {
    if (!it.purchaseOrderItemId || !countsAsReceived(it.condition)) continue;
    received.set(it.purchaseOrderItemId, (received.get(it.purchaseOrderItemId) ?? 0) + qty(it.qtyReceived));
  }
  return [...lines]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map((line) => {
      const ordered = qty(line.quantity);
      const got = qty(received.get(line.id) ?? 0);
      return {
        id: line.id,
        description: line.description,
        unit: line.unit ?? null,
        qtyOrdered: ordered,
        qtyReceived: got,
        qtyOutstanding: Math.max(0, qty(ordered - got)),
      };
    });
}

/**
 * none      — nothing checked in yet
 * delivered — every ordered line is in full (earlier issues made good count)
 * issues    — not complete, and a check-in reported a problem
 * partial   — not complete, no problem reported
 */
export function computeDeliveryStatus(
  progress: DeliveryLine[],
  deliveries: Array<{ hasIssues: boolean }>,
): DeliveryStatus {
  if (deliveries.length === 0) return "none";
  const ordered = progress.filter((l) => l.qtyOrdered > 0);
  const complete = ordered.length > 0
    ? ordered.every((l) => l.qtyOutstanding <= 0)
    : !deliveries.some((d) => d.hasIssues);
  if (complete) return "delivered";
  if (deliveries.some((d) => d.hasIssues)) return "issues";
  return "partial";
}

// ── Projectors: the ONLY shapes /api/deliveries returns ─────────────────────

export function projectDeliveryPO(
  po: POInput,
  lines: POLineInput[],
  deliveryItems: DeliveryItemInput[],
  deliveries: Array<{ hasIssues: boolean; receivedAt: Date | string }>,
): DeliveryPO {
  const progress = computeLineProgress(lines, deliveryItems);
  const last = deliveries
    .map((d) => new Date(d.receivedAt).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  return {
    id: po.id,
    projectId: po.projectId,
    poNumber: po.poNumber,
    title: po.title ?? null,
    supplierName: po.supplierName ?? null,
    status: po.status,
    requiredByDate: iso(po.requiredByDate ?? null),
    deliveryAddress: po.deliveryAddress ?? null,
    deliveryInstructions: po.deliveryInstructions ?? null,
    deliveryStatus: computeDeliveryStatus(progress, deliveries),
    lastDeliveryAt: last != null ? new Date(last).toISOString() : null,
    lineCount: progress.length,
    outstandingLineCount: progress.filter((l) => l.qtyOutstanding > 0).length,
    lines: progress,
  };
}

export function projectDeliveryRecord(
  delivery: DeliveryInput,
  items: DeliveryItemInput[],
  docketPhotoUrls: string[],
): DeliveryRecord {
  return {
    id: delivery.id,
    purchaseOrderId: delivery.purchaseOrderId,
    receivedAt: iso(delivery.receivedAt)!,
    receivedByName: delivery.receivedByName ?? null,
    docketNumber: delivery.docketNumber ?? null,
    notes: delivery.notes ?? null,
    hasIssues: !!delivery.hasIssues,
    docketPhotoUrls: stringList(docketPhotoUrls),
    createdAt: iso(delivery.createdAt)!,
    items: items.map((it) => ({
      id: String(it.id ?? ""),
      purchaseOrderItemId: it.purchaseOrderItemId ?? null,
      description: it.descriptionSnapshot ?? "",
      qtyOrdered: qty(it.qtyOrderedSnapshot),
      qtyReceived: qty(it.qtyReceived),
      condition: asCondition(it.condition),
      note: it.note ?? null,
      photoUrls: stringList(it.photoUrls),
    })),
  };
}

// ── Check-in request validation ─────────────────────────────────────────────

export interface CheckInItemRequest {
  purchaseOrderItemId: string;
  qtyReceived: number;
  condition: DeliveryCondition;
  note: string | null;
  photoUrls: string[];
}

export interface CheckInRequest {
  clientRequestId: string;
  receivedAt: Date;
  docketNumber: string | null;
  notes: string | null;
  docketPhotoUrls: string[];
  items: CheckInItemRequest[];
}

export type CheckInParse =
  | { ok: true; value: CheckInRequest }
  | { ok: false; error: string; code: string };

/** A photo must be one this company uploaded through the normal upload routes. */
export function isCompanyObjectPath(path: unknown, companyId: string): path is string {
  if (typeof path !== "string" || !companyId) return false;
  const prefix = `/objects/company/${companyId}/`;
  return path.startsWith(prefix) && path.length > prefix.length && !path.includes("..") && !/[\s?#]/.test(path);
}

const trimOrNull = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

export function parseCheckInRequest(
  body: any,
  opts: { companyId: string; lineIds: Set<string>; docketPhotoRequired: boolean; now?: Date },
): CheckInParse {
  const fail = (error: string, code: string): CheckInParse => ({ ok: false, error, code });
  if (!body || typeof body !== "object") return fail("Missing check-in", "BAD_REQUEST");

  const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId.trim() : "";
  if (!clientRequestId || clientRequestId.length > 100) return fail("clientRequestId is required", "BAD_REQUEST");

  const now = opts.now ?? new Date();
  let receivedAt = now;
  if (body.receivedAt != null) {
    const d = new Date(body.receivedAt);
    if (Number.isNaN(d.getTime())) return fail("receivedAt is not a date", "BAD_REQUEST");
    // A phone clock a few minutes fast is fine; a date in the future is not.
    receivedAt = d.getTime() > now.getTime() + 10 * 60_000 ? now : d;
  }

  const photoList = (v: unknown): string[] | null => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.length > 20) return null;
    return v.every((p) => isCompanyObjectPath(p, opts.companyId)) ? (v as string[]) : null;
  };

  const docketPhotoUrls = photoList(body.docketPhotoUrls);
  if (!docketPhotoUrls) return fail("A photo was not uploaded to this company", "BAD_PHOTO_PATH");
  if (opts.docketPhotoRequired && docketPhotoUrls.length === 0) {
    return fail("A photo of the delivery docket is required", "DOCKET_PHOTO_REQUIRED");
  }

  if (!Array.isArray(body.items) || body.items.length === 0) return fail("Nothing was checked in", "NO_ITEMS");
  const seen = new Set<string>();
  const items: CheckInItemRequest[] = [];
  for (const raw of body.items) {
    const lineId = typeof raw?.purchaseOrderItemId === "string" ? raw.purchaseOrderItemId : "";
    if (!opts.lineIds.has(lineId)) return fail("A line is not on this purchase order", "BAD_LINE");
    if (seen.has(lineId)) return fail("A line was checked in twice", "BAD_LINE");
    seen.add(lineId);
    const q = typeof raw.qtyReceived === "number" ? raw.qtyReceived : parseFloat(raw.qtyReceived);
    if (!Number.isFinite(q) || q < 0 || q > 99_999_999) return fail("Quantity must be zero or more", "BAD_QTY");
    const condition = raw.condition ?? "ok";
    if (!(DELIVERY_CONDITIONS as readonly string[]).includes(condition)) return fail("Unknown condition", "BAD_CONDITION");
    const photoUrls = photoList(raw.photoUrls);
    if (!photoUrls) return fail("A photo was not uploaded to this company", "BAD_PHOTO_PATH");
    items.push({
      purchaseOrderItemId: lineId,
      qtyReceived: qty(q),
      condition,
      note: trimOrNull(raw.note, 2000),
      photoUrls,
    });
  }

  return {
    ok: true,
    value: {
      clientRequestId,
      receivedAt,
      docketNumber: trimOrNull(body.docketNumber, 100),
      notes: trimOrNull(body.notes, 4000),
      docketPhotoUrls,
      items,
    },
  };
}

export function checkInHasIssues(items: Array<{ condition: string }>): boolean {
  return items.some((i) => i.condition !== "ok");
}

// ── Money side (office only — never under /api/deliveries) ──────────────────

/**
 * Roughly what has arrived, in cents inc GST: received quantity (capped at the
 * ordered quantity) × the line's unit price, through the same GST rule as the
 * PO header. A lump-sum line with no unit price uses total ÷ quantity.
 */
export function receivedValueCents(
  lines: Array<POLineInput & { unitPrice?: number | null; total?: number | null; isGstFree?: boolean | null }>,
  progress: DeliveryLine[],
  gstMode: string | null | undefined,
): number {
  const byId = new Map(progress.map((p) => [p.id, p]));
  const priced = lines.map((line) => {
    const ordered = qty(line.quantity);
    const got = Math.min(byId.get(line.id)?.qtyReceived ?? 0, ordered);
    const unit = line.unitPrice || (ordered > 0 ? (line.total || 0) / ordered : 0);
    return { quantity: got, unitPrice: unit, total: null, isGstFree: line.isGstFree };
  });
  return computePOTotalsCents(priced, gstMode).total;
}

// ── "Copy to supplier email" ────────────────────────────────────────────────

export function supplierIssueEmail(input: {
  poNumber: string;
  supplierName?: string | null;
  projectName?: string | null;
  deliveryAddress?: string | null;
  delivery: Pick<DeliveryRecord, "receivedAt" | "docketNumber" | "notes" | "items">;
  senderName?: string | null;
}): { subject: string; body: string } {
  const d = input.delivery;
  const when = new Date(d.receivedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  const problems = d.items.filter((i) => i.condition !== "ok");
  const lines = problems.map((i) => {
    const what = DELIVERY_CONDITION_LABELS[i.condition] ?? i.condition;
    const counts = `${i.qtyReceived} received of ${i.qtyOrdered} ordered`;
    return `- ${i.description}: ${what} (${counts})${i.note ? ` — ${i.note}` : ""}`;
  });
  const subject = `Delivery issue — ${input.poNumber}${d.docketNumber ? `, docket ${d.docketNumber}` : ""}`;
  const body = [
    `Hi${input.supplierName ? ` ${input.supplierName}` : ""},`,
    "",
    `We received a delivery against purchase order ${input.poNumber} on ${when}${input.projectName ? ` for ${input.projectName}` : ""}${input.deliveryAddress ? ` (${input.deliveryAddress})` : ""}, and there was a problem with it:`,
    "",
    ...(lines.length ? lines : ["- (see notes below)"]),
    ...(d.docketNumber ? ["", `Docket number: ${d.docketNumber}`] : []),
    ...(d.notes ? ["", `Notes: ${d.notes}`] : []),
    "",
    "Could you please arrange a replacement or credit and let us know when to expect it?",
    "",
    "Thanks,",
    input.senderName || "",
  ].join("\n").trimEnd();
  return { subject, body };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../services/api';

// Delivery check-in against a purchase order — types, the per-project offline
// cache and the "waiting to send" overlay shared by the list and check-in
// screens and the offline queue.
//
// Crew see items and quantities only: the API sends no prices and nothing
// here may add any.
//
// This file must not import services/offlineQueue (the queue imports it).

export type DeliveryStatus = 'none' | 'partial' | 'delivered' | 'issues';
export type DeliveryCondition = 'ok' | 'short' | 'damaged' | 'wrong';

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
  /** PO status — informational only. */
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

export interface ProjectDeliveriesResponse {
  projectId: string;
  docketPhotoRequired: boolean;
  purchaseOrders: DeliveryPO[];
}

export interface PODeliveriesResponse {
  docketPhotoRequired: boolean;
  po: DeliveryPO;
  /** Newest first. */
  deliveries: DeliveryRecord[];
}

/**
 * Payload of a queued 'create-delivery' action (see sendDelivery in
 * offlineQueue). Same resume rule as a defect: each photo's objectPath, then
 * `deliveryId`, is saved the moment that step succeeds, so a retry never
 * uploads a photo twice; the POST carries `clientRequestId`, which the server
 * answers with the delivery it already saved (replayed: true).
 */
export interface DeliveryPayload {
  projectId: string;
  poId: string;
  /** uuid, made once on the phone when Submit is first tapped. */
  clientRequestId: string;
  /** When it actually arrived (the tap time), ISO. */
  receivedAt: string;
  docketNumber: string | null;
  notes: string | null;
  /** Local URIs should come from persistPhoto(). */
  docketPhotos: Array<{ uri: string; objectPath?: string }>;
  items: Array<{
    purchaseOrderItemId: string;
    qtyReceived: number;
    condition: DeliveryCondition;
    note: string | null;
    photos: Array<{ uri: string; objectPath?: string }>;
  }>;
  /** Set once the check-in exists on the server. */
  deliveryId?: string;
  /** Shown in "waiting to send" lists, e.g. "Delivery · PO-0042". */
  label?: string;
}

export const CONDITIONS: DeliveryCondition[] = ['ok', 'short', 'damaged', 'wrong'];

export const CONDITION_LABEL: Record<DeliveryCondition, string> = {
  ok: 'OK',
  short: 'Short',
  damaged: 'Damaged',
  wrong: 'Wrong item',
};

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  none: 'Not delivered',
  partial: 'Part delivered',
  delivered: 'Delivered',
  issues: 'Issues',
};

/** Theme token keys for a status chip: [text, background]. */
export const STATUS_TONE: Record<DeliveryStatus, ['statusInfo' | 'statusWarning' | 'statusSuccess' | 'statusDanger', 'statusInfoBg' | 'statusWarningBg' | 'statusSuccessBg' | 'statusDangerBg']> = {
  none: ['statusInfo', 'statusInfoBg'],
  partial: ['statusWarning', 'statusWarningBg'],
  delivered: ['statusSuccess', 'statusSuccessBg'],
  issues: ['statusDanger', 'statusDangerBg'],
};

/** List order: outstanding work first, fully delivered at the bottom. */
const STATUS_RANK: Record<DeliveryStatus, number> = { issues: 0, partial: 1, none: 2, delivered: 3 };

export function sortPOs(list: DeliveryPO[]): DeliveryPO[] {
  return [...list].sort((a, b) => {
    const r = STATUS_RANK[a.deliveryStatus] - STATUS_RANK[b.deliveryStatus];
    if (r) return r;
    // Soonest required first; no date after dated ones.
    const ad = a.requiredByDate ?? '9999';
    const bd = b.requiredByDate ?? '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.poNumber.localeCompare(b.poNumber, undefined, { numeric: true });
  });
}

/** "12", "2.5" — quantities can be fractional (m³, lm). */
export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

// ── Offline cache (per project) ───────────────────────────────────────────
// The server's answer is stored as-is. Check-ins still waiting in the
// offline queue are laid over it on read (applyPendingDeliveries), so the
// reduced outstanding survives a refresh that lands before the queue sends.

const cacheKey = (projectId: string) => `deliveries:pos:${projectId}`;

export async function readDeliveriesCache(projectId: string): Promise<ProjectDeliveriesResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(projectId));
    return raw ? (JSON.parse(raw) as ProjectDeliveriesResponse) : null;
  } catch {
    return null;
  }
}

async function writeDeliveriesCache(projectId: string, data: ProjectDeliveriesResponse): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(projectId), JSON.stringify(data));
  } catch {
    // Best effort.
  }
}

/** Fetch the project's POs and save them for no-signal use. Throws when offline. */
export async function loadDeliveries(projectId: string): Promise<ProjectDeliveriesResponse> {
  const res = await apiFetch<ProjectDeliveriesResponse>(`/api/deliveries/projects/${projectId}/pos`);
  const data: ProjectDeliveriesResponse = {
    projectId,
    docketPhotoRequired: res?.docketPhotoRequired !== false,
    purchaseOrders: Array.isArray(res?.purchaseOrders) ? res.purchaseOrders : [],
  };
  await writeDeliveriesCache(projectId, data);
  return data;
}

/**
 * Swap one PO in the project cache for a fresher copy (from GET /pos/:id or a
 * check-in response). Optionally updates docketPhotoRequired too.
 */
export async function storeDeliveryPO(projectId: string, po: DeliveryPO, docketPhotoRequired?: boolean): Promise<void> {
  if (!po?.id) return;
  const cached = await readDeliveriesCache(projectId);
  const list = cached?.purchaseOrders ?? [];
  const i = list.findIndex((p) => p.id === po.id);
  const next = i === -1 ? [...list, po] : list.map((p, j) => (j === i ? po : p));
  await writeDeliveriesCache(projectId, {
    projectId,
    docketPhotoRequired: docketPhotoRequired ?? cached?.docketPhotoRequired ?? true,
    purchaseOrders: next,
  });
}

/**
 * Lay check-ins still in the offline queue over a PO list: received goes up,
 * outstanding comes down, status follows. Payloads whose `deliveryId` is set
 * already reached the server (the fresh list includes them) and are skipped.
 */
export function applyPendingDeliveries(pos: DeliveryPO[], pending: DeliveryPayload[]): DeliveryPO[] {
  const live = pending.filter((p) => !p.deliveryId);
  if (!live.length) return pos;
  return pos.map((po) => {
    const mine = live.filter((p) => p.poId === po.id);
    if (!mine.length) return po;
    let issues = po.deliveryStatus === 'issues';
    const lines = po.lines.map((line) => {
      let received = line.qtyReceived;
      for (const p of mine) {
        for (const item of p.items) {
          if (item.purchaseOrderItemId !== line.id) continue;
          received += item.qtyReceived || 0;
          if (item.condition !== 'ok') issues = true;
        }
      }
      return { ...line, qtyReceived: received, qtyOutstanding: Math.max(0, line.qtyOrdered - received) };
    });
    const outstandingLineCount = lines.filter((l) => l.qtyOutstanding > 0).length;
    const anyReceived = lines.some((l) => l.qtyReceived > 0);
    const deliveryStatus: DeliveryStatus = issues
      ? 'issues'
      : outstandingLineCount === 0 && lines.length > 0
        ? 'delivered'
        : anyReceived
          ? 'partial'
          : 'none';
    const lastAt = mine.map((p) => p.receivedAt).sort().pop() ?? null;
    return {
      ...po,
      lines,
      outstandingLineCount,
      deliveryStatus,
      lastDeliveryAt: lastAt && (!po.lastDeliveryAt || lastAt > po.lastDeliveryAt) ? lastAt : po.lastDeliveryAt,
    };
  });
}

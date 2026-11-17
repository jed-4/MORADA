import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiRequest, uploadPhoto, uploadFileFromUri, attachFileToBill, isPermanentError } from './api';
import { removeOfflineDiaryEntry } from './diaryOffline';
import { deletePersistedPhoto } from '../lib/photos';

const QUEUE_KEY = 'buildpro_offline_queue';
const MAX_RETRIES = 5;

export interface QueuedAction {
  id: string;
  type: 'clock-in' | 'clock-out' | 'log-hours' | 'edit-timesheet' | 'delete-timesheet' | 'create-diary-entry' | 'edit-diary-entry' | 'delete-diary-entry' | 'update-checklist-item' | 'complete-checklist' | 'create-receipt';
  payload: any;
  photoUri?: string;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

/**
 * Payload of a queued 'create-receipt' action (see sendReceipt). `photos`,
 * `billId` and `attached` are filled in as each step succeeds and saved
 * straight away, so a retry carries on from where the last attempt stopped
 * instead of uploading twice or creating a second bill.
 */
export interface ReceiptPayload {
  /** POST /api/bills body, without objectPath. */
  bill: Record<string, any>;
  /** One per page, in order. Local URIs should come from persistPhoto(). */
  photos: Array<{ uri: string; objectPath?: string }>;
  /** Set once the bill exists on the server. */
  billId?: string;
  /** How many of pages 2+ have been attached to the bill. */
  attached?: number;
  /** Shown in "waiting to send" lists, e.g. "Receipt · $42.50". */
  label?: string;
}

const pageFileName = (index: number) => `receipt_${Date.now()}_p${index + 1}.jpg`;

/**
 * Create a receipt bill with every page attached. Page 1 rides inline on
 * POST /api/bills (the server attaches it); pages 2+ go through POST
 * /api/bills/:id/attachments, which appends to the same attachments list, so
 * the bill shows every page. Pages without an objectPath are uploaded first.
 *
 * Mutates `payload` as it goes and calls `onStep` after each step, so the
 * caller can save progress. Throws on the first failure; calling it again with
 * the same payload resumes. Returns the bill id.
 */
export const sendReceipt = async (
  payload: ReceiptPayload,
  onStep?: () => Promise<void> | void,
): Promise<string | undefined> => {
  for (let i = 0; i < payload.photos.length; i++) {
    const photo = payload.photos[i];
    if (photo.objectPath) continue;
    const { objectPath } = await uploadFileFromUri(photo.uri, pageFileName(i), 'image/jpeg');
    photo.objectPath = objectPath;
    await onStep?.();
  }

  if (!payload.billId) {
    const first = payload.photos[0]?.objectPath;
    const res = await apiRequest('/api/bills', 'POST', {
      ...payload.bill,
      ...(first ? { objectPath: first } : {}),
    });
    const created = await res.json().catch(() => null);
    payload.billId = created?.id;
    payload.attached = 0;
    await onStep?.();
  }

  const rest = payload.photos.slice(1);
  if (payload.billId) {
    for (let i = payload.attached || 0; i < rest.length; i++) {
      const objectPath = rest[i].objectPath;
      if (objectPath) {
        await attachFileToBill(payload.billId, objectPath, objectPath.split('/').pop() || pageFileName(i + 1));
      }
      payload.attached = i + 1;
      await onStep?.();
    }
  }
  return payload.billId;
};

let syncListeners: Array<() => void> = [];

export const addSyncListener = (listener: () => void) => {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
};

const notifyListeners = () => {
  syncListeners.forEach(l => l());
};

export const getQueue = async (): Promise<QueuedAction[]> => {
  try {
    const data = await AsyncStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveQueue = async (queue: QueuedAction[]): Promise<void> => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  notifyListeners();
};

export const addToQueue = async (action: Omit<QueuedAction, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<void> => {
  const queue = await getQueue();
  const newAction: QueuedAction = {
    ...action,
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };
  queue.push(newAction);
  await saveQueue(queue);
};

/**
 * Save one action's current state mid-drain. A multi-step action (a receipt:
 * upload pages, create the bill, attach pages) records each finished step
 * here, so the app being killed half-way can't make the next drain repeat a
 * step that already reached the server.
 */
const checkpointAction = async (action: QueuedAction): Promise<void> => {
  try {
    const queue = await getQueue();
    const i = queue.findIndex(a => a.id === action.id);
    if (i === -1) return;
    queue[i] = action;
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Best effort: the drain still saves the whole queue at the end.
  }
};

export const isOnline = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return !!(state.isConnected && state.isInternetReachable !== false);
};

const isLocalUri = (val: unknown): val is string =>
  typeof val === 'string' && (val.startsWith('file://') || val.startsWith('content://'));

/**
 * Upload any device-local photo URIs in a diary payload, replacing them
 * with server object paths. THROWS on upload failure — a local URI must never
 * be persisted to the server (it can't render on any other device).
 */
const uploadDiaryAssets = async (entryData: any): Promise<any> => {
  const fieldValues = { ...(entryData.fieldValues || {}) };
  for (const [key, val] of Object.entries(fieldValues)) {
    if (key.startsWith('_')) continue; // internal keys are not photo arrays
    if (Array.isArray(val)) {
      fieldValues[key] = await Promise.all(
        val.map(async (uri: any) => {
          if (!isLocalUri(uri)) return uri;
          const { objectPath } = await uploadPhoto(uri);
          return objectPath;
        }),
      );
    }
  }

  let overallPhotos = entryData.overallPhotos;
  if (Array.isArray(overallPhotos)) {
    overallPhotos = await Promise.all(
      overallPhotos.map(async (uri: string) => {
        if (!isLocalUri(uri)) return uri;
        const { objectPath } = await uploadPhoto(uri);
        return objectPath;
      }),
    );
  }

  return { ...entryData, fieldValues, overallPhotos };
};

type ProcessResult = 'success' | 'retry' | 'permanent';

const processAction = async (action: QueuedAction): Promise<ProcessResult> => {
  try {
    switch (action.type) {
      case 'clock-in': {
        await apiRequest('/api/timesheets/clock-in', 'POST', {
          projectId: action.payload.projectId,
          costCodeId: action.payload.costCodeId,
        });
        return 'success';
      }
      case 'clock-out': {
        await apiRequest('/api/timesheets/clock-out', 'POST', {
          timesheetId: action.payload.timesheetId,
        });
        return 'success';
      }
      case 'log-hours': {
        const res = await apiRequest('/api/timesheets', 'POST', action.payload);
        const created = await res.json();
        if (action.payload.costCodeId && created?.id) {
          await apiRequest(`/api/timesheets/${created.id}/cost-codes`, 'POST', {
            costCodeId: action.payload.costCodeId,
            duration: action.payload.duration || '0',
            hourlyRate: action.payload.hourlyRate || '0',
          });
        }
        return 'success';
      }
      case 'edit-timesheet': {
        const { id, ...data } = action.payload;
        await apiRequest(`/api/timesheets/${id}`, 'PATCH', data);
        return 'success';
      }
      case 'delete-timesheet': {
        await apiRequest(`/api/timesheets/${action.payload.id}`, 'DELETE');
        return 'success';
      }
      case 'create-diary-entry': {
        const { localPhotos, _offlineId, _storageKey, ...entryData } = action.payload;
        const uploaded = await uploadDiaryAssets(entryData);
        await apiRequest('/api/site-diary-entries', 'POST', uploaded);
        // Entry is on the server — drop the local offline copy it mirrored.
        if (_offlineId && _storageKey) {
          await removeOfflineDiaryEntry(_storageKey, _offlineId);
        }
        return 'success';
      }
      case 'edit-diary-entry': {
        const { id, _offlineId, _storageKey, ...data } = action.payload;
        const uploaded = await uploadDiaryAssets(data);
        await apiRequest(`/api/site-diary-entries/${id}`, 'PATCH', uploaded);
        if (_offlineId && _storageKey) {
          await removeOfflineDiaryEntry(_storageKey, _offlineId);
        }
        return 'success';
      }
      case 'delete-diary-entry': {
        await apiRequest(`/api/site-diary-entries/${action.payload.id}`, 'DELETE');
        return 'success';
      }
      case 'update-checklist-item': {
        const { id, ...data } = action.payload;
        await apiRequest(`/api/checklist-instance-items/${id}`, 'PATCH', data);
        return 'success';
      }
      case 'complete-checklist': {
        const { id, ...data } = action.payload;
        await apiRequest(`/api/checklist-instances/${id}`, 'PATCH', data);
        return 'success';
      }
      case 'create-receipt': {
        const payload = action.payload as ReceiptPayload;
        await sendReceipt(payload, () => checkpointAction(action));
        // Sent: the permanent copies made for the queue can go.
        await Promise.all(payload.photos.map(p => deletePersistedPhoto(p.uri)));
        return 'success';
      }
      default:
        return 'permanent';
    }
  } catch (err) {
    console.warn(`[OfflineQueue] Failed to process action ${action.type}:`, err);
    if (isPermanentError(err)) {
      action.error = err instanceof Error ? err.message : 'Rejected by server';
      return 'permanent';
    }
    return 'retry';
  }
};

let syncInFlight: Promise<{ synced: number; failed: number }> | null = null;

// Separate from syncListeners: screens that reload on every queue change
// shouldn't also reload when a drain merely starts or stops.
let syncStateListeners: Array<() => void> = [];
const notifySyncState = () => syncStateListeners.forEach(l => l());

/** True while the queue is being sent. */
export const isSyncing = () => syncInFlight != null;

/**
 * Drain the queue. Concurrent calls share one drain (no double-processing —
 * a duplicate clock-in was previously possible when a NetInfo listener and a
 * screen-level sync fired together).
 */
export const syncQueue = (): Promise<{ synced: number; failed: number }> => {
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSyncQueue().finally(() => {
    syncInFlight = null;
    notifySyncState();
  });
  notifySyncState();
  return syncInFlight;
};

const doSyncQueue = async (): Promise<{ synced: number; failed: number }> => {
  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0 };

  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    if (action.status === 'failed') {
      // Already exhausted or permanently rejected — keep for user review.
      remaining.push(action);
      continue;
    }
    const result = await processAction(action);
    if (result === 'success') {
      synced++;
    } else if (result === 'permanent') {
      // Server rejected it — retrying is pointless.
      action.status = 'failed';
      action.error = action.error || 'Rejected by server';
      failed++;
      remaining.push(action);
    } else {
      action.retryCount++;
      if (action.retryCount >= MAX_RETRIES) {
        action.status = 'failed';
        action.error = 'Max retries exceeded';
        failed++;
      } else {
        action.status = 'pending';
      }
      remaining.push(action);
    }
  }

  // Keep anything queued WHILE this drain ran: it isn't in `queue`, and
  // saving `remaining` alone used to drop it.
  const known = new Set(queue.map(a => a.id));
  const addedMeanwhile = (await getQueue()).filter(a => !known.has(a.id));
  await saveQueue([...remaining, ...addedMeanwhile]);
  return { synced, failed };
};

export const clearFailedActions = async (): Promise<void> => {
  const queue = await getQueue();
  const remaining = queue.filter(a => a.status !== 'failed');
  await saveQueue(remaining);
};

export const getFailedActions = async (): Promise<QueuedAction[]> => {
  const queue = await getQueue();
  return queue.filter(a => a.status === 'failed');
};

/** Re-queue failed actions for another round of retries. */
export const retryFailedActions = async (): Promise<void> => {
  const queue = await getQueue();
  for (const action of queue) {
    if (action.status === 'failed') {
      action.status = 'pending';
      action.retryCount = 0;
      action.error = undefined;
    }
  }
  await saveQueue(queue);
};

export const getQueueCount = async (): Promise<number> => {
  const queue = await getQueue();
  return queue.filter(a => a.status !== 'failed').length;
};

/** Put specific failed actions back in line and try to send them now. */
export const retryQueuedActions = async (ids: string[]): Promise<void> => {
  const wanted = new Set(ids);
  const queue = await getQueue();
  for (const action of queue) {
    if (wanted.has(action.id) && action.status === 'failed') {
      action.status = 'pending';
      action.retryCount = 0;
      action.error = undefined;
    }
  }
  await saveQueue(queue);
  await syncQueue();
};

// ── Pending uploads ───────────────────────────────────────────────────────

/** A queued action that carries photos (or a receipt) not yet on the server. */
export interface PendingUpload {
  id: string;
  type: QueuedAction['type'];
  /** 'waiting' = queued, sends when online; 'sending' = a drain is running; 'failed' = gave up, needs Retry. */
  status: 'waiting' | 'sending' | 'failed';
  /** Photos in it still only on this device. */
  photoCount: number;
  /** Human label, e.g. "Receipt · $42.50" or "Site diary entry". */
  label: string;
  projectId?: string;
  error?: string;
  createdAt: string;
}

const countLocalPhotos = (action: QueuedAction): number => {
  const p = action.payload || {};
  if (action.type === 'create-receipt') {
    return ((p as ReceiptPayload).photos || []).filter(ph => !ph.objectPath).length;
  }
  let n = action.photoUri && isLocalUri(action.photoUri) ? 1 : 0;
  if (Array.isArray(p.overallPhotos)) n += p.overallPhotos.filter(isLocalUri).length;
  if (p.fieldValues && typeof p.fieldValues === 'object') {
    for (const [key, val] of Object.entries(p.fieldValues)) {
      if (!key.startsWith('_') && Array.isArray(val)) n += val.filter(isLocalUri).length;
    }
  }
  return n;
};

const labelFor = (action: QueuedAction): string => {
  switch (action.type) {
    case 'create-receipt': return (action.payload as ReceiptPayload)?.label || 'Receipt';
    case 'create-diary-entry':
    case 'edit-diary-entry': return 'Site diary entry';
    case 'update-checklist-item':
    case 'complete-checklist': return 'Checklist';
    default: return 'Change';
  }
};

const toPendingUploads = (queue: QueuedAction[], syncing: boolean): PendingUpload[] =>
  queue
    .map(action => ({ action, photoCount: countLocalPhotos(action) }))
    .filter(({ action, photoCount }) => photoCount > 0 || action.type === 'create-receipt')
    .map(({ action, photoCount }): PendingUpload => ({
      id: action.id,
      type: action.type,
      status: action.status === 'failed' ? 'failed' : syncing ? 'sending' : 'waiting',
      photoCount,
      label: labelFor(action),
      projectId: action.payload?.projectId ?? action.payload?.bill?.projectId,
      error: action.error,
      createdAt: action.createdAt,
    }));

/**
 * Live list of photo uploads sitting in the offline queue ("waiting to send"),
 * for any screen to show. Re-reads whenever the queue changes or a drain
 * starts/stops. Optional filters narrow it to one project and/or action types.
 *
 *   const { waiting, failed, items, retry } = usePendingUploads({ projectId, types: ['create-receipt'] });
 */
export function usePendingUploads(filter: { projectId?: string; types?: QueuedAction['type'][] } = {}) {
  const [all, setAll] = useState<PendingUpload[]>([]);
  const { projectId } = filter;
  const typesKey = (filter.types || []).join(',');

  useEffect(() => {
    let alive = true;
    const load = () => {
      getQueue().then(queue => {
        if (alive) setAll(toPendingUploads(queue, isSyncing()));
      });
    };
    load();
    const offQueue = addSyncListener(load);
    syncStateListeners.push(load);
    return () => {
      alive = false;
      offQueue();
      syncStateListeners = syncStateListeners.filter(l => l !== load);
    };
  }, []);

  const items = useMemo(() => {
    const types = typesKey ? typesKey.split(',') : null;
    return all.filter(u =>
      (!projectId || u.projectId === projectId) && (!types || types.includes(u.type)),
    );
  }, [all, projectId, typesKey]);

  /** Retry this list's failed items, then send everything waiting. */
  const retry = useCallback(async () => {
    const failedIds = items.filter(u => u.status === 'failed').map(u => u.id);
    if (failedIds.length) await retryQueuedActions(failedIds);
    else await syncQueue();
  }, [items]);

  return {
    items,
    /** Waiting or sending. */
    waiting: items.filter(u => u.status !== 'failed').length,
    failed: items.filter(u => u.status === 'failed').length,
    sending: items.some(u => u.status === 'sending'),
    retry,
  };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiRequest, uploadPhoto, isPermanentError } from './api';
import { removeOfflineDiaryEntry } from './diaryOffline';

const QUEUE_KEY = 'buildpro_offline_queue';
const MAX_RETRIES = 5;

export interface QueuedAction {
  id: string;
  type: 'clock-in' | 'clock-out' | 'log-hours' | 'edit-timesheet' | 'delete-timesheet' | 'create-diary-entry' | 'edit-diary-entry' | 'delete-diary-entry' | 'update-checklist-item' | 'complete-checklist';
  payload: any;
  photoUri?: string;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

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

/**
 * Drain the queue. Concurrent calls share one drain (no double-processing —
 * a duplicate clock-in was previously possible when a NetInfo listener and a
 * screen-level sync fired together).
 */
export const syncQueue = (): Promise<{ synced: number; failed: number }> => {
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSyncQueue().finally(() => {
    syncInFlight = null;
  });
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

  await saveQueue(remaining);
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

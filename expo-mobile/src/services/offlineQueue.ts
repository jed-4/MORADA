import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiRequest, uploadPhoto } from './api';

const QUEUE_KEY = 'buildpro_offline_queue';

export interface QueuedAction {
  id: string;
  type: 'clock-in' | 'clock-out' | 'log-hours' | 'edit-timesheet' | 'delete-timesheet' | 'create-diary-entry' | 'edit-diary-entry' | 'delete-diary-entry';
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

const processAction = async (action: QueuedAction): Promise<boolean> => {
  try {
    switch (action.type) {
      case 'clock-in': {
        const res = await apiRequest('/api/timesheets/clock-in', 'POST', {
          projectId: action.payload.projectId,
          costCodeId: action.payload.costCodeId,
        });
        if (!res.ok) throw new Error('Clock-in failed');
        const timesheet = await res.json();

        if (action.photoUri && timesheet?.id) {
          try {
            const { objectPath } = await uploadPhoto(action.photoUri);
            const attachments = [{
              type: 'photo',
              path: objectPath,
              name: `Site photo - ${new Date().toLocaleDateString()}`,
              uploadedAt: new Date().toISOString(),
            }];
            await apiRequest(`/api/timesheets/${timesheet.id}`, 'PATCH', { attachments });
          } catch {
            // Photo failed but clock-in succeeded
          }
        }
        return true;
      }
      case 'clock-out': {
        const res = await apiRequest('/api/timesheets/clock-out', 'POST', {
          timesheetId: action.payload.timesheetId,
        });
        if (!res.ok) throw new Error('Clock-out failed');
        return true;
      }
      case 'log-hours': {
        const res = await apiRequest('/api/timesheets', 'POST', action.payload);
        if (!res.ok) throw new Error('Log hours failed');
        const created = await res.json();
        if (action.payload.costCodeId && created?.id) {
          await apiRequest(`/api/timesheets/${created.id}/cost-codes`, 'POST', {
            costCodeId: action.payload.costCodeId,
            duration: action.payload.duration || '0',
            hourlyRate: action.payload.hourlyRate || '0',
          });
        }
        return true;
      }
      case 'edit-timesheet': {
        const { id, ...data } = action.payload;
        const res = await apiRequest(`/api/timesheets/${id}`, 'PATCH', data);
        if (!res.ok) throw new Error('Edit failed');
        return true;
      }
      case 'delete-timesheet': {
        const res = await apiRequest(`/api/timesheets/${action.payload.id}`, 'DELETE');
        if (!res.ok) throw new Error('Delete failed');
        return true;
      }
      case 'create-diary-entry': {
        const { localPhotos, ...entryData } = action.payload;
        const fieldValues = { ...entryData.fieldValues };
        for (const [key, val] of Object.entries(fieldValues)) {
          if (Array.isArray(val)) {
            const uploaded: string[] = [];
            for (const uri of val) {
              if (typeof uri === 'string' && (uri.startsWith('file://') || uri.startsWith('content://'))) {
                try {
                  const { objectPath } = await uploadPhoto(uri);
                  uploaded.push(objectPath);
                } catch { uploaded.push(uri); }
              } else { uploaded.push(uri); }
            }
            fieldValues[key] = uploaded;
          }
        }
        let overallPhotos: string[] = [];
        if (entryData.overallPhotos?.length) {
          for (const uri of entryData.overallPhotos) {
            if (uri.startsWith('file://') || uri.startsWith('content://')) {
              try { const { objectPath } = await uploadPhoto(uri); overallPhotos.push(objectPath); }
              catch { overallPhotos.push(uri); }
            } else { overallPhotos.push(uri); }
          }
        }
        const res = await apiRequest('/api/site-diary-entries', 'POST', { ...entryData, fieldValues, overallPhotos });
        if (!res.ok) throw new Error('Create diary entry failed');
        return true;
      }
      case 'edit-diary-entry': {
        const { id, ...data } = action.payload;
        const res = await apiRequest(`/api/site-diary-entries/${id}`, 'PATCH', data);
        if (!res.ok) throw new Error('Edit diary entry failed');
        return true;
      }
      case 'delete-diary-entry': {
        const res = await apiRequest(`/api/site-diary-entries/${action.payload.id}`, 'DELETE');
        if (!res.ok) throw new Error('Delete diary entry failed');
        return true;
      }
      default:
        return false;
    }
  } catch (err) {
    console.warn(`[OfflineQueue] Failed to process action ${action.type}:`, err);
    return false;
  }
};

export const syncQueue = async (): Promise<{ synced: number; failed: number }> => {
  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0 };

  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    const success = await processAction(action);
    if (success) {
      synced++;
    } else {
      action.retryCount++;
      if (action.retryCount >= 5) {
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

export const getQueueCount = async (): Promise<number> => {
  const queue = await getQueue();
  return queue.filter(a => a.status !== 'failed').length;
};

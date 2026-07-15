import AsyncStorage from '@react-native-async-storage/async-storage';

// Local store for diary entries created/edited offline, displayed alongside
// server entries until the offline queue syncs them. Two screens keep separate
// stores (global list vs per-project), so helpers take the storage key.

export const DIARY_LIST_OFFLINE_KEY = 'buildpro_diary_list_offline';
export const DIARY_PROJECT_OFFLINE_KEY = 'buildpro_diary_offline';

export async function getOfflineDiaryEntries(storageKey: string): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(storageKey);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveOfflineDiaryEntries(storageKey: string, entries: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(entries));
  } catch {
    // best-effort; the entry is still queued for sync
  }
}

export async function removeOfflineDiaryEntry(storageKey: string, entryId: string): Promise<void> {
  const entries = await getOfflineDiaryEntries(storageKey);
  const remaining = entries.filter((e) => e?.id !== entryId);
  if (remaining.length !== entries.length) {
    await saveOfflineDiaryEntries(storageKey, remaining);
  }
}

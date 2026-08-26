import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Selection } from '../lib/selections';

/**
 * Per-project cache of the selections payload, persisted to disk.
 *
 * The spec sheet is the one screen that has to work with no signal — a trade
 * checking which tile goes on the wall is often standing in a concrete box.
 * services/cache.ts is in-memory only and dies with the process, so this uses
 * AsyncStorage: open the app in a basement and the last-seen spec is there.
 *
 * Cached rows are already redacted for the user who fetched them (the server
 * strips costs and unapproved selections per role). They are namespaced by
 * user so a shared device can't serve one person's payload to another.
 */

const KEY_PREFIX = 'morada_selections_v1';

interface CachedPayload {
  savedAt: number;
  selections: Selection[];
}

function cacheKey(userId: string, projectId: string): string {
  return `${KEY_PREFIX}:${userId}:${projectId}`;
}

export interface CachedSelections {
  selections: Selection[];
  savedAt: Date;
}

export async function readCachedSelections(
  userId: string | undefined,
  projectId: string,
): Promise<CachedSelections | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!parsed || !Array.isArray(parsed.selections)) return null;
    return { selections: parsed.selections, savedAt: new Date(parsed.savedAt) };
  } catch {
    return null;
  }
}

export async function writeCachedSelections(
  userId: string | undefined,
  projectId: string,
  selections: Selection[],
): Promise<void> {
  if (!userId) return;
  try {
    const payload: CachedPayload = { savedAt: Date.now(), selections };
    await AsyncStorage.setItem(cacheKey(userId, projectId), JSON.stringify(payload));
  } catch {
    // Best-effort: a failed write only costs an offline read later.
  }
}

/** Drops every cached project for every user — used on logout. */
export async function clearCachedSelections(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(KEY_PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    // Best-effort.
  }
}

/** "Updated just now" / "Offline — last updated 2h ago". */
export function describeAge(savedAt: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

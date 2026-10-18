import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getChosenOption, type Selection } from '../lib/selections';
import { getAuthedImageSource } from './api';

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
  photoIndex.clear();
  try {
    if (PHOTO_DIR) await FileSystem.deleteAsync(PHOTO_DIR, { idempotent: true });
  } catch {
    // Best-effort.
  }
}

// ── Photos ────────────────────────────────────────────────────────────────
//
// The JSON above survives a basement; the photos didn't — they were remote
// URLs, so offline the spec sheet showed grey boxes. The photos of each
// selection's CHOSEN option (the ones a trade builds to) are now downloaded to
// the app's cache directory when the list loads, and served from disk from
// then on. Uploads are immutable (a new photo gets a new path), so a cached
// file never goes stale.

const PHOTO_DIR = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}selection-photos/` : null;
const PHOTO_INDEX_KEY = `${KEY_PREFIX}:photos`;
/** Plenty for a job's chosen products; keeps the cache from growing forever. */
const MAX_CACHED_PHOTOS = 200;
const PHOTOS_PER_OPTION = 4;

const photoIndex = new Map<string, string>();
let indexLoaded: Promise<void> | null = null;

function loadPhotoIndex(): Promise<void> {
  if (!indexLoaded) {
    indexLoaded = (async () => {
      try {
        const raw = await AsyncStorage.getItem(PHOTO_INDEX_KEY);
        const entries = raw ? (JSON.parse(raw) as [string, string][]) : [];
        for (const [path, uri] of entries) photoIndex.set(path, uri);
      } catch {
        // Start empty.
      }
    })();
  }
  return indexLoaded;
}
// Warm the index at startup so the first render can already use local files.
loadPhotoIndex();

/** A local copy of this photo if one has been downloaded, else the remote source. */
export function selectionPhotoSource(filePath: string): { uri: string; headers?: Record<string, string> } {
  const local = photoIndex.get(filePath);
  return local ? { uri: local } : getAuthedImageSource(filePath);
}

/** Download the chosen options' photos for offline use. Never throws. */
export async function cacheSelectionPhotos(selections: Selection[]): Promise<void> {
  if (!PHOTO_DIR) return;
  try {
    await loadPhotoIndex();
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
    const wanted: string[] = [];
    for (const selection of selections) {
      const chosen = getChosenOption(selection);
      const photos = (chosen?.attachments ?? []).filter((a) => a.fileType?.toLowerCase() === 'image');
      for (const photo of photos.slice(0, PHOTOS_PER_OPTION)) {
        if (!photoIndex.has(photo.filePath)) wanted.push(photo.filePath);
      }
    }
    if (wanted.length === 0) return;

    let changed = false;
    for (const filePath of wanted) {
      if (photoIndex.size >= MAX_CACHED_PHOTOS) break;
      const source = getAuthedImageSource(filePath);
      const name = filePath.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120);
      try {
        const result = await FileSystem.downloadAsync(source.uri, `${PHOTO_DIR}${name}`, {
          headers: source.headers,
        });
        if (result.status >= 200 && result.status < 300) {
          photoIndex.set(filePath, result.uri);
          changed = true;
        }
      } catch {
        // No signal or a missing file: try again next time the list loads.
      }
    }
    if (changed) {
      await AsyncStorage.setItem(PHOTO_INDEX_KEY, JSON.stringify(Array.from(photoIndex.entries())));
    }
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

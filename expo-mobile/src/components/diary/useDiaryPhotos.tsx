import { useCallback, useMemo } from 'react';
import { usePhotoUploads, PhotoUploadError, type PhotoUploadItem } from '../../lib/photosUpload';
import { isPhotoMarkupAvailable, persistPhoto } from '../../lib/photos';
import { usePhotoMarkup } from '../photo/PhotoMarkup';

// Photo uploads + markup for the site diary entry form (SiteDiaryScreen and
// SiteDiaryListScreen).
//
// The form keeps its photos as plain strings — a device-local file:// URI for
// a new photo, a server object path for one already saved — in
// `fieldValues[fieldId]` and `overallPhotos`. This hook shadows the LOCAL
// ones with usePhotoUploads items (matched by URI), so each thumbnail can show
// its progress ring / Retry / "Waiting to send", and a save only sends the
// photos that haven't gone up yet.
//
//   const dp = useDiaryPhotos();
//   dp.track([uri]);                         // after camera / picker
//   const edited = await dp.markup(uri);     // swap the uri in form state if non-null
//   const map = await dp.uploadLocal(collectLocalPhotoUris(payload));  // throws PhotoUploadError
//   const body = mapPhotoUris(payload, map);
//   ...
//   {dp.markupElement}                       // render once inside the form's Modal

export const isLocalPhotoUri = (val: unknown): val is string =>
  typeof val === 'string' && (val.startsWith('file://') || val.startsWith('content://'));

/** Every device-local photo URI in a diary payload (template photo fields + overall photos). */
export function collectLocalPhotoUris(payload: { fieldValues?: Record<string, any>; overallPhotos?: string[] }): string[] {
  const out: string[] = [];
  for (const [key, val] of Object.entries(payload.fieldValues || {})) {
    if (key.startsWith('_') || !Array.isArray(val)) continue; // internal keys are not photo arrays
    for (const v of val) if (isLocalPhotoUri(v)) out.push(v);
  }
  for (const v of payload.overallPhotos || []) if (isLocalPhotoUri(v)) out.push(v);
  return out;
}

/** Copy of a diary payload with each photo URI found in `map` replaced. */
export function mapPhotoUris<T extends { fieldValues?: Record<string, any>; overallPhotos?: string[] }>(
  payload: T,
  map: Map<string, string>,
): T {
  const swap = (v: any) => (typeof v === 'string' && map.has(v) ? map.get(v)! : v);
  const fieldValues: Record<string, any> = {};
  for (const [key, val] of Object.entries(payload.fieldValues || {})) {
    fieldValues[key] = !key.startsWith('_') && Array.isArray(val) ? val.map(swap) : val;
  }
  return {
    ...payload,
    fieldValues,
    overallPhotos: (payload.overallPhotos || []).map(swap),
  };
}

export function useDiaryPhotos() {
  const uploads = usePhotoUploads();
  const { markupPhoto, markupElement } = usePhotoMarkup();
  // An OTA update on an older binary may lack react-native-view-shot.
  const canMarkup = useMemo(() => isPhotoMarkupAvailable(), []);
  const { items, snapshot, add, replace, remove, clear, markQueued, upload } = uploads;

  const itemFor = useCallback(
    (uri: string): PhotoUploadItem | undefined => items.find(p => p.uri === uri),
    [items],
  );

  /** Start tracking new local photos. Server paths and known URIs are ignored. */
  const track = useCallback((uris: string[], opts: { queued?: boolean } = {}) => {
    const known = new Set(snapshot().map(p => p.uri));
    const fresh = uris.filter(u => isLocalPhotoUri(u) && !known.has(u));
    if (fresh.length) add(fresh);
    // A photo of an entry already waiting in the offline queue.
    if (opts.queued) markQueued();
  }, [snapshot, add, markQueued]);

  const untrack = useCallback((uri: string) => {
    const item = snapshot().find(p => p.uri === uri);
    if (item) remove(item.id);
  }, [snapshot, remove]);

  /**
   * Open the markup editor on a local photo. Resolves with the new file URI
   * (the caller swaps it into the form at the same place), or null.
   */
  const markup = useCallback(async (uri: string): Promise<string | null> => {
    if (!isLocalPhotoUri(uri)) return null;
    const edited = await markupPhoto(uri);
    if (!edited) return null;
    const item = snapshot().find(p => p.uri === uri);
    if (item) replace(item.id, edited);
    else add([edited]);
    return edited;
  }, [markupPhoto, snapshot, replace, add]);

  const retry = useCallback((uri: string) => {
    const item = snapshot().find(p => p.uri === uri);
    if (item) upload(item.id).catch(() => {});
  }, [snapshot, upload]);

  /**
   * Upload these local photos one at a time (each with its own ring) and
   * return local URI → server object path. A photo that already went up on
   * an earlier attempt isn't sent again. Keeps going past a failure, then
   * throws PhotoUploadError.
   */
  const uploadLocal = useCallback(async (uris: string[]): Promise<Map<string, string>> => {
    track(uris);
    const map = new Map<string, string>();
    let failed = 0;
    let firstError: unknown;
    for (const uri of uris) {
      if (map.has(uri)) continue;
      const item = snapshot().find(p => p.uri === uri);
      if (!item) continue;
      try {
        map.set(uri, await upload(item.id));
      } catch (err) {
        failed++;
        if (firstError === undefined) firstError = err;
      }
    }
    if (failed) throw new PhotoUploadError(failed, firstError);
    return map;
  }, [track, snapshot, upload]);

  /**
   * Get the form's photos ready to wait in the offline queue: a photo that
   * already uploaded is swapped for its object path (so the queue doesn't
   * send it twice), the rest are copied out of the cache directory (iOS may
   * empty it while the app is closed). Marks them "Waiting to send".
   * Returns the URI map and the persisted copies (deleted once sent).
   */
  const prepareForQueue = useCallback(async (uris: string[]) => {
    const map = new Map<string, string>();
    const persisted: string[] = [];
    for (const uri of uris) {
      if (map.has(uri)) continue;
      const item = snapshot().find(p => p.uri === uri);
      if (item?.status === 'done' && item.objectPath) {
        map.set(uri, item.objectPath);
        continue;
      }
      try {
        const kept = await persistPhoto(uri);
        map.set(uri, kept);
        if (kept !== uri) persisted.push(kept);
      } catch {
        // Couldn't copy it: queue the original and hope the cache survives.
      }
    }
    markQueued();
    return { map, persisted };
  }, [snapshot, markQueued]);

  return {
    items,
    itemFor,
    track,
    untrack,
    markup,
    canMarkup,
    retry,
    uploadLocal,
    prepareForQueue,
    reset: clear,
    isUploading: uploads.isUploading,
    markupElement,
  };
}

export type DiaryPhotos = ReturnType<typeof useDiaryPhotos>;

import { useCallback, useRef, useState } from 'react';
import { uploadFileFromUri, type UploadProgressHandler } from '../services/api';

// Per-photo upload state for a screen that sends one or more photos — drives
// <UploadProgress> on each thumbnail.
//
//   const photos = usePhotoUploads();
//   photos.add([uri]);                          // after camera / picker / scan
//   photos.replace(id, newUri);                 // after markupPhoto()
//   const paths = await photos.uploadAll();     // throws PhotoUploadError
//   <UploadProgress status={p.status} progress={p.progress} onRetry={() => photos.upload(p.id)} />
//
// Photos upload one at a time: on a site 4G connection, parallel uploads just
// share the same bandwidth and all finish late. A photo that already uploaded
// keeps its objectPath, so uploadAll() after a failure only sends the rest.

export type PhotoUploadStatus = 'idle' | 'uploading' | 'done' | 'failed' | 'queued';

export interface PhotoUploadItem {
  id: string;
  /** Local file:// URI. */
  uri: string;
  status: PhotoUploadStatus;
  /** 0..1 while uploading; 1 when done. */
  progress: number;
  /** Server object path once uploaded. */
  objectPath?: string;
  error?: string;
}

/** Sends one file and resolves with its server object path. */
export type PhotoUploader = (uri: string, onProgress: UploadProgressHandler) => Promise<{ objectPath: string }>;

/** Default uploader: presigned PUT (team sessions). Clients pass uploadPhotoViaServer. */
export const defaultPhotoUploader: PhotoUploader = (uri, onProgress) =>
  uploadFileFromUri(uri, `photo_${Date.now()}.jpg`, 'image/jpeg', onProgress);

/** Thrown by uploadAll when at least one photo failed. `cause` is the first error. */
export class PhotoUploadError extends Error {
  failedCount: number;
  cause: unknown;
  constructor(failedCount: number, cause: unknown) {
    super(
      failedCount === 1
        ? "A photo couldn't be uploaded."
        : `${failedCount} photos couldn't be uploaded.`,
    );
    this.name = 'PhotoUploadError';
    this.failedCount = failedCount;
    this.cause = cause;
  }
}

const newId = () => `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function usePhotoUploads(options: { uploader?: PhotoUploader } = {}) {
  const uploader = options.uploader || defaultPhotoUploader;
  const [items, setItemsState] = useState<PhotoUploadItem[]>([]);
  // Mirror for the async upload loop, which must see the latest list.
  const itemsRef = useRef<PhotoUploadItem[]>([]);
  const inFlight = useRef(new Map<string, Promise<string>>());

  const setItems = useCallback((next: (prev: PhotoUploadItem[]) => PhotoUploadItem[]) => {
    itemsRef.current = next(itemsRef.current);
    setItemsState(itemsRef.current);
  }, []);

  const patch = useCallback((id: string, changes: Partial<PhotoUploadItem>) => {
    setItems(prev => prev.map(p => (p.id === id ? { ...p, ...changes } : p)));
  }, [setItems]);

  /** Append photos. Returns their ids. */
  const add = useCallback((uris: string[]) => {
    const added = uris.map(uri => ({ id: newId(), uri, status: 'idle' as const, progress: 0 }));
    setItems(prev => [...prev, ...added]);
    return added.map(a => a.id);
  }, [setItems]);

  /** Swap a photo's file (e.g. after markup). It will upload again. */
  const replace = useCallback((id: string, uri: string) => {
    patch(id, { uri, status: 'idle', progress: 0, objectPath: undefined, error: undefined });
  }, [patch]);

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(p => p.id !== id));
  }, [setItems]);

  const clear = useCallback(() => setItems(() => []), [setItems]);

  /** Mark every photo not yet uploaded as waiting in the offline queue. */
  const markQueued = useCallback(() => {
    setItems(prev => prev.map(p => (p.status === 'done' ? p : { ...p, status: 'queued', error: undefined })));
  }, [setItems]);

  /** Upload one photo (or return its objectPath if it already went). Throws on failure. */
  const upload = useCallback((id: string): Promise<string> => {
    const item = itemsRef.current.find(p => p.id === id);
    if (!item) return Promise.reject(new Error('Photo not found'));
    if (item.status === 'done' && item.objectPath) return Promise.resolve(item.objectPath);
    const running = inFlight.current.get(id);
    if (running) return running;

    const uri = item.uri;
    patch(id, { status: 'uploading', progress: 0, error: undefined });
    const job = uploader(uri, fraction => {
      // Ignore late progress from a photo that was replaced or removed.
      const current = itemsRef.current.find(p => p.id === id);
      if (current?.uri === uri && current.status === 'uploading') patch(id, { progress: fraction });
    })
      .then(({ objectPath }) => {
        const current = itemsRef.current.find(p => p.id === id);
        if (current?.uri === uri) patch(id, { status: 'done', progress: 1, objectPath });
        return objectPath;
      })
      .catch((err: unknown) => {
        const current = itemsRef.current.find(p => p.id === id);
        if (current?.uri === uri) {
          patch(id, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' });
        }
        throw err;
      })
      .finally(() => {
        inFlight.current.delete(id);
      });
    inFlight.current.set(id, job);
    return job;
  }, [patch, uploader]);

  /**
   * Upload every photo in order and return their objectPaths in the same
   * order. Keeps going past a failure so one bad photo doesn't hold up the
   * rest, then throws PhotoUploadError if any failed.
   */
  const uploadAll = useCallback(async (): Promise<string[]> => {
    const paths: string[] = [];
    let failedCount = 0;
    let firstError: unknown;
    for (const item of [...itemsRef.current]) {
      try {
        paths.push(await upload(item.id));
      } catch (err) {
        failedCount++;
        if (firstError === undefined) firstError = err;
      }
    }
    if (failedCount) throw new PhotoUploadError(failedCount, firstError);
    return paths;
  }, [upload]);

  /** The current list, read now — for async code holding an older render's `items`. */
  const snapshot = useCallback(() => itemsRef.current, []);

  return {
    items,
    snapshot,
    add,
    replace,
    remove,
    clear,
    markQueued,
    upload,
    uploadAll,
    isUploading: items.some(p => p.status === 'uploading'),
  };
}

import { getAuthedImageSource } from '../../services/api';

// Diary photos come in every shape they have ever been stored in:
//   - a server object path            "/objects/company/<id>/uploads/..."
//   - a web photo-gallery file object { name, objectPath, size, contentType, uploadedAt }
//   - an old serving URL wrapping the encoded path ".../api/uploads/serve/<enc>"
//     (no server route serves that, so it is unwrapped back to the path)
//   - a device-local photo not sent yet "file://..." / "content://..."
// These helpers turn any of them into one display path, and that path into an
// <Image> source: /objects photos get the mobile session headers (same as
// defects, messages and selections via getAuthedImageSource); local files
// are shown as they are. Display only — saved values are never rewritten.

const isLocal = (s: string) =>
  s.startsWith('file://') || s.startsWith('content://') || s.startsWith('ph://') || s.startsWith('assets-library://') || s.startsWith('data:');

/** One photo value → a path / URI string to show, or null if it isn't one. */
export function diaryPhotoPath(v: unknown): string | null {
  let s: string | null = null;
  if (typeof v === 'string') s = v;
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const p = o.objectPath ?? o.url ?? o.uri;
    if (typeof p === 'string') s = p;
  }
  if (!s) return null;
  const wrapped = /\/api\/uploads\/(?:serve|file)\/([^?#]+)/.exec(s);
  if (wrapped) {
    try {
      s = decodeURIComponent(wrapped[1]);
    } catch {
      return null;
    }
  }
  return s || null;
}

/** A stored photo array (any shapes) → display paths. Non-arrays give []. */
export function diaryPhotoList(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  const out: string[] = [];
  for (const v of val) {
    const p = diaryPhotoPath(v);
    if (p) out.push(p);
  }
  return out;
}

/** True when a field value looks like a photo array (strings or file objects). */
export function isDiaryPhotoArray(val: unknown): val is unknown[] {
  if (!Array.isArray(val) || val.length === 0) return false;
  const first = val[0];
  if (typeof first === 'string') return first.startsWith('http') || first.startsWith('file') || first.startsWith('content') || first.startsWith('/');
  return !!first && typeof first === 'object' && typeof (first as any).objectPath === 'string';
}

/** <Image> source for a display path: local files as-is, server photos signed in. */
export function diaryPhotoSource(path: string): { uri: string; headers?: Record<string, string> } {
  if (isLocal(path)) return { uri: path };
  return getAuthedImageSource(path);
}

/**
 * Before a save: a photo field the web wrote as file objects stays all file
 * objects. Existing objects are passed through untouched; a photo added on
 * the phone (now a server object path string) is wrapped in the same shape
 * the web's photo-gallery upload writes, so the web form can still read the
 * field. Fields of plain strings (the mobile format) are left alone.
 */
export function withPhotoObjectsPreserved<T extends { fieldValues?: Record<string, any> }>(payload: T): T {
  if (!payload.fieldValues) return payload;
  const fieldValues: Record<string, any> = {};
  for (const [key, val] of Object.entries(payload.fieldValues)) {
    const hasObjects =
      !key.startsWith('_') && Array.isArray(val) && val.some(v => v && typeof v === 'object' && typeof v.objectPath === 'string');
    fieldValues[key] = hasObjects
      ? (val as unknown[]).map(v =>
          typeof v === 'string' && v.startsWith('/objects/')
            ? {
                name: v.split('/').pop() || 'photo.jpg',
                objectPath: v,
                size: 0,
                contentType: 'image/jpeg',
                uploadedAt: new Date().toISOString(),
              }
            : v,
        )
      : val;
  }
  return { ...payload, fieldValues };
}

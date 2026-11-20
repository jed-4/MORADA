import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { cacheDirectory, copyAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

// Share into Morada (#44): files handed over by the iOS share extension
// (expo-share-intent) are turned into plain local files the existing capture
// flows already understand.
//
// - Copied out of the App Group container into our own cache first: the
//   extension's copies are cleared with the share intent, and the screens
//   keep the URIs for as long as the form is open.
// - Photos are re-saved as JPEG (expo-image-manipulator) when the binary has
//   it: Photos hands over HEIC originals, and every upload path labels photos
//   image/jpeg. Without the module they pass through untouched.

/** The fields we read from expo-share-intent's ShareIntentFile. */
export interface IncomingFile {
  path: string;
  fileName?: string | null;
  mimeType?: string | null;
  width?: number | null;
}

export interface SharedFiles {
  /** Local JPEG (or original) photo URIs. */
  images: string[];
  /** Local PDF URIs (receipts only). */
  pdfs: string[];
  /** Files that are neither — videos, Word docs… */
  skipped: number;
}

/** Largest side we keep — a phone photo is ~4000px; the camera flows use quality 0.7–0.85 too. */
const MAX_WIDTH = 2400;
const SHARE_DIR = `${cacheDirectory}shared-in/`;

export const isPdfUri = (uri: string) => /\.pdf$/i.test(uri.split('?')[0]);

const isPdf = (f: IncomingFile) =>
  f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.fileName || f.path);
const isImage = (f: IncomingFile) =>
  (f.mimeType || '').startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.fileName || f.path);

const toFileUri = (p: string) => (p.startsWith('file://') || p.startsWith('content://') ? p : `file://${p}`);

type Manipulator = typeof import('expo-image-manipulator');
let manipulator: Manipulator | null | undefined;
function imageManipulator(): Manipulator | null {
  if (manipulator !== undefined) return manipulator;
  manipulator = null;
  if (Platform.OS === 'web') return null;
  try {
    if (requireOptionalNativeModule('ExpoImageManipulator')) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      manipulator = require('expo-image-manipulator') as Manipulator;
    }
  } catch {
    manipulator = null;
  }
  return manipulator;
}

async function toJpeg(uri: string, width: number | null | undefined): Promise<string> {
  const mod = imageManipulator();
  if (!mod) return uri;
  try {
    const ctx = mod.ImageManipulator.manipulate(uri);
    if (width && width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: 0.8, format: mod.SaveFormat.JPEG });
    return saved.uri;
  } catch (e) {
    console.warn('Share: JPEG conversion failed, using the original', e);
    return uri;
  }
}

async function copyIn(uri: string, ext: string): Promise<string> {
  await makeDirectoryAsync(SHARE_DIR, { intermediates: true }).catch(() => {});
  const to = `${SHARE_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await copyAsync({ from: uri, to });
  return to;
}

export async function prepareSharedFiles(files: IncomingFile[]): Promise<SharedFiles> {
  const out: SharedFiles = { images: [], pdfs: [], skipped: 0 };
  for (const f of files) {
    if (!f?.path) continue;
    const src = toFileUri(f.path);
    try {
      if (isPdf(f)) {
        out.pdfs.push(await copyIn(src, 'pdf'));
      } else if (isImage(f)) {
        const ext = ((f.fileName || f.path).split('?')[0].match(/\.([a-z0-9]+)$/i)?.[1] || 'jpg').toLowerCase();
        const local = await copyIn(src, ext);
        out.images.push(await toJpeg(local, f.width));
      } else {
        out.skipped += 1;
      }
    } catch (e) {
      console.warn('Share: could not read a shared file', e);
      out.skipped += 1;
    }
  }
  return out;
}

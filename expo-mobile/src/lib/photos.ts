import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { copyAsync, deleteAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';

// Photo capture helpers shared by every screen that takes pictures.
//
// Document scanner: react-native-document-scanner-plugin opens the iOS
// VisionKit document camera (Android: Google ML Kit document scanner). It finds
// the page edges, crops, fixes perspective and allows several pages per scan.
// It is a NATIVE module: a binary built before it was added (and Expo Go) does
// not have it, and the library looks its native half up with getEnforcing —
// which THROWS at import time when the module is missing. So it is never
// imported at the top of a file: ask isDocumentScannerAvailable() first, and
// scanDocument() requires the library only once the native half is known to
// be there. An OTA update that reaches an older binary then simply hides Scan.

const SCANNER_MODULE = 'DocumentScanner';

/** True when this binary includes the native document scanner. */
export function isDocumentScannerAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return TurboModuleRegistry.get(SCANNER_MODULE) != null;
  } catch {
    return false;
  }
}

/**
 * Open the document scanner. Resolves with one local `file://` JPEG per
 * scanned page (cropped and flattened), in page order, or `null` when the
 * person cancels or the scanner isn't in this build. Throws only if the
 * scanner itself fails — callers can fall back to the plain camera.
 *
 * The scanner asks for camera access itself (NSCameraUsageDescription is
 * already set by the expo-image-picker plugin in app.config.js).
 */
export async function scanDocument(options: { maxPages?: number } = {}): Promise<string[] | null> {
  if (!isDocumentScannerAvailable()) return null;
  // Required lazily — see the note at the top of this file.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-document-scanner-plugin') as typeof import('react-native-document-scanner-plugin');
  const result = await mod.default.scanDocument({
    // 100 makes multi-megabyte pages for no visible gain on a receipt.
    croppedImageQuality: 85,
    responseType: mod.ResponseType.ImageFilePath,
    // Android only — VisionKit has no page limit.
    ...(options.maxPages ? { maxNumDocuments: options.maxPages } : {}),
  });
  if (result.status !== mod.ScanDocumentResponseStatus.Success) return null;
  const pages = (result.scannedImages || []).map(toFileUri);
  return pages.length ? pages : null;
}

/**
 * True when this binary includes react-native-view-shot, which PhotoMarkup
 * needs to save. Older binaries (and Expo Go) don't: hide "Mark up" there.
 */
export function isPhotoMarkupAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return (TurboModuleRegistry.get('RNViewShot') ?? NativeModules.RNViewShot) != null;
  } catch {
    return false;
  }
}

const toFileUri = (path: string) =>
  path.startsWith('file://') || path.startsWith('content://') ? path : `file://${path}`;

// ── Keeping photos for the offline queue ──────────────────────────────────
// The camera, picker and markup editor all write to the CACHE directory,
// which iOS may empty while the app is closed. A photo that has to wait in
// the offline queue is copied somewhere permanent first, and deleted again
// once it has been sent.

const PENDING_DIR = `${documentDirectory}pending-uploads/`;

/** Copy a photo somewhere it survives an app restart. Returns the new URI. */
export async function persistPhoto(uri: string): Promise<string> {
  if (uri.startsWith(PENDING_DIR)) return uri;
  await makeDirectoryAsync(PENDING_DIR, { intermediates: true }).catch(() => {});
  const ext = (uri.split('?')[0].match(/\.(jpe?g|png|heic|webp|pdf)$/i)?.[1] || 'jpg').toLowerCase();
  const to = `${PENDING_DIR}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await copyAsync({ from: uri, to });
  return to;
}

/** Delete a photo made by persistPhoto. Anything else is left alone. */
export async function deletePersistedPhoto(uri: string): Promise<void> {
  if (!uri.startsWith(PENDING_DIR)) return;
  await deleteAsync(uri, { idempotent: true }).catch(() => {});
}

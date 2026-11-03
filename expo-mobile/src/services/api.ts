import * as SecureStore from 'expo-secure-store';
import { uploadAsync, FileSystemUploadType, downloadAsync, cacheDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://buildpro4.replit.app';

const REQUEST_TIMEOUT_MS = 30_000;

let sessionId: string | null = null;

// Registered by AuthContext. Invoked when a request with a session gets a 401
// back — the session is dead, so the app should return to the login screen.
let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** True when the error is a server rejection (4xx) that retrying won't fix. */
export const isPermanentError = (err: unknown): boolean =>
  err instanceof ApiError &&
  err.status >= 400 &&
  err.status < 500 &&
  err.status !== 408 &&
  err.status !== 429;

export const loadSession = async () => {
  try {
    sessionId = await SecureStore.getItemAsync('session_id');
  } catch {
    sessionId = null;
  }
};

export const saveSession = async (sid: string) => {
  sessionId = sid;
  try {
    await SecureStore.setItemAsync('session_id', sid);
  } catch (e) {
    console.warn('Failed to save session:', e);
  }
};

export const clearSession = async () => {
  sessionId = null;
  try {
    await SecureStore.deleteItemAsync('session_id');
  } catch (e) {
    console.warn('Failed to clear session:', e);
  }
};

export const getSessionId = () => sessionId;

/**
 * Make an API request. Throws ApiError (with the server's message and HTTP
 * status) on any non-2xx response, and a plain Error on network failure or
 * timeout — callers can assume the request succeeded if it returns.
 *
 * A 401 on an authenticated non-auth request means the session has expired:
 * the registered unauthorized handler is invoked so the app returns to login.
 */
export const apiRequest = async (
  path: string,
  method: string = 'GET',
  body?: any,
): Promise<Response> => {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client': 'mobile',
  };

  if (sessionId) {
    headers['X-Session-ID'] = sessionId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const config: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({} as any));
    const message =
      errBody.message || errBody.error || `Request failed (${response.status})`;

    if (
      response.status === 401 &&
      sessionId &&
      !path.startsWith('/api/auth/')
    ) {
      onUnauthorized?.();
    }

    throw new ApiError(response.status, message);
  }

  return response;
};

export const apiFetch = async <T>(path: string): Promise<T> => {
  const response = await apiRequest(path);
  return response.json();
};

/**
 * Source object for RN <Image> pointing at an API-served asset. Attaches the
 * session header ONLY for URLs on our own API host — never leak the session
 * to third-party hosts (e.g. external images embedded in notes).
 */
export const getAuthedImageSource = (uri: string): { uri: string; headers?: Record<string, string> } => {
  const absolute = uri.startsWith('http') ? uri : `${API_BASE_URL}${uri}`;
  if (absolute.startsWith(API_BASE_URL) && sessionId) {
    return { uri: absolute, headers: { 'X-Session-ID': sessionId } };
  }
  return { uri: absolute };
};

const uploadViaPresignedUrl = async (
  localUri: string,
  name: string,
  contentType: string,
): Promise<{ uploadURL: string; objectPath: string }> => {
  const presignRes = await apiRequest('/api/uploads/request-url', 'POST', {
    name,
    contentType,
  });
  const { uploadURL, objectPath } = await presignRes.json();

  const uploadResult = await uploadAsync(uploadURL, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  });
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Failed to upload file: ${uploadResult.status}`);
  }

  return { uploadURL, objectPath };
};

/**
 * Upload through the server (multipart POST /api/uploads/file) instead of a
 * presigned URL. This is the only upload route a CLIENT session may use — the
 * presigned /api/uploads/request-url is team-only — so client mode sends
 * message photos this way. Same { objectPath } result as the presigned flow.
 */
export const uploadPhotoViaServer = async (localUri: string): Promise<{ objectPath: string }> => {
  const headers: Record<string, string> = { 'X-Client': 'mobile' };
  if (sessionId) headers['X-Session-ID'] = sessionId;
  const result = await uploadAsync(`${API_BASE_URL}/api/uploads/file`, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: 'image/jpeg',
    headers,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Failed to upload photo: ${result.status}`);
  }
  const body = JSON.parse(result.body);
  return { objectPath: body.objectPath };
};

/** Thrown by downloadToCache when the server has no such file (404). */
export class FileNotFoundError extends Error {}

/**
 * Download a session-protected file (an /objects/... path or an /api/...
 * route) into the app's cache and return its local URI. The session header
 * goes only to our own API host, same rule as getAuthedImageSource.
 *
 * Documents are fetched fresh on every open rather than served from a cache:
 * a variation's archived PDF changes when it is signed, and a stale copy of
 * a document someone is about to rely on is worse than a short wait.
 */
export const downloadToCache = async (pathOrUrl: string, fileName: string): Promise<string> => {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE_URL}${pathOrUrl}`;
  const headers: Record<string, string> = { 'X-Client': 'mobile' };
  if (sessionId && url.startsWith(API_BASE_URL)) headers['X-Session-ID'] = sessionId;

  const dir = `${cacheDirectory}documents/`;
  await makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  // A unique folder per download keeps the real file name (the share sheet and
  // "Save to Files" use it) without two documents overwriting each other.
  const folder = `${dir}${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
  await makeDirectoryAsync(folder, { intermediates: true });
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'document';

  const result = await downloadAsync(url, `${folder}${safeName}`, { headers });
  if (result.status === 404) throw new FileNotFoundError('This document is no longer available.');
  if (result.status === 401) {
    onUnauthorized?.();
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Couldn't download the document (${result.status}).`);
  }
  return result.uri;
};

export const uploadPhoto = (localUri: string) =>
  uploadViaPresignedUrl(localUri, `photo-${Date.now()}.jpg`, 'image/jpeg');

export const uploadFileFromUri = (localUri: string, fileName: string, contentType: string) =>
  uploadViaPresignedUrl(localUri, fileName, contentType);

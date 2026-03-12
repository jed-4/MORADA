import * as SecureStore from 'expo-secure-store';
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://buildpro4.replit.app';

let sessionId: string | null = null;

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

  const config: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  return fetch(url, config);
};

export const apiFetch = async <T>(path: string): Promise<T> => {
  const response = await apiRequest(path);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }
  return response.json();
};

export const uploadPhoto = async (localUri: string): Promise<{ uploadURL: string; objectPath: string }> => {
  const presignRes = await apiRequest('/api/uploads/request-url', 'POST', {
    name: `photo-${Date.now()}.jpg`,
    contentType: 'image/jpeg',
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { uploadURL, objectPath } = await presignRes.json();

  const uploadResult = await uploadAsync(uploadURL, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Failed to upload photo: ${uploadResult.status}`);
  }

  return { uploadURL, objectPath };
};

export const uploadFileFromUri = async (localUri: string, fileName: string, contentType: string): Promise<{ uploadURL: string; objectPath: string }> => {
  const presignRes = await apiRequest('/api/uploads/request-url', 'POST', {
    name: fileName,
    contentType,
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
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

export const uploadAudio = async (localUri: string): Promise<{ uploadURL: string; objectPath: string }> => {
  const presignRes = await apiRequest('/api/uploads/request-url', 'POST', {
    name: `voice-note-${Date.now()}.m4a`,
    contentType: 'audio/mp4',
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { uploadURL, objectPath } = await presignRes.json();

  const uploadResult = await uploadAsync(uploadURL, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'audio/mp4' },
  });
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Failed to upload audio: ${uploadResult.status}`);
  }

  return { uploadURL, objectPath };
};

import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://f6c0d5f3-bcae-4964-ad47-5aab092fe0d5-00-3jcmfeohwi5r5.kirk.replit.dev';

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
    name: `timesheet-photo-${Date.now()}.jpg`,
    contentType: 'image/jpeg',
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { uploadURL, objectPath } = await presignRes.json();

  const photoResponse = await fetch(localUri);
  const blob = await photoResponse.blob();

  const uploadRes = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!uploadRes.ok) throw new Error('Failed to upload photo');

  return { uploadURL, objectPath };
};

export const uploadFileFromUri = async (localUri: string, fileName: string, contentType: string): Promise<{ uploadURL: string; objectPath: string }> => {
  const presignRes = await apiRequest('/api/uploads/request-url', 'POST', {
    name: fileName,
    contentType,
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { uploadURL, objectPath } = await presignRes.json();

  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();

  const uploadRes = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadRes.ok) throw new Error('Failed to upload file');

  return { uploadURL, objectPath };
};

export const uploadAudio = async (localUri: string): Promise<{ uploadURL: string; objectPath: string }> => {
  const presignRes = await apiRequest('/api/uploads/request-url', 'POST', {
    name: `voice-note-${Date.now()}.m4a`,
    contentType: 'audio/mp4',
  });
  if (!presignRes.ok) throw new Error('Failed to get upload URL');
  const { uploadURL, objectPath } = await presignRes.json();

  const audioResponse = await fetch(localUri);
  const blob = await audioResponse.blob();

  const uploadRes = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/mp4' },
    body: blob,
  });
  if (!uploadRes.ok) throw new Error('Failed to upload audio');

  return { uploadURL, objectPath };
};

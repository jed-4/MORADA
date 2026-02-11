import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = 'https://buildpro4.replit.app';

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

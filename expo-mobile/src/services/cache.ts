const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: any;
  ts: number;
}

const store: Record<string, CacheEntry> = {};

export function getCached<T>(key: string): T | null {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    delete store[key];
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: any): void {
  store[key] = { data, ts: Date.now() };
}

export function clearCache(key?: string): void {
  if (key) {
    delete store[key];
  } else {
    Object.keys(store).forEach(k => delete store[k]);
  }
}

export async function fetchCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  forceRefresh = false
): Promise<T> {
  if (!forceRefresh) {
    const cached = getCached<T>(key);
    if (cached !== null) return cached;
  }
  const data = await fetcher();
  setCached(key, data);
  return data;
}

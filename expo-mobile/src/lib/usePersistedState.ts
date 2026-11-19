import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useState that is remembered between app launches (filters, selected tab,
 * view mode). Starts at `initial`, then swaps in the saved value once it has
 * loaded — keep it for small UI preferences, never for data.
 *
 * Keys are namespaced `ui:` so they are easy to find and clear. Values must be
 * JSON-serialisable. Storage failures are ignored (it is a convenience).
 */
export function usePersistedState<T>(key: string, initial: T) {
  const storageKey = `ui:${key}`;
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loaded.current = false;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return;
        if (raw != null) {
          try {
            setValue(JSON.parse(raw) as T);
          } catch {
            // Corrupt or old-format value: keep the default.
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) loaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        AsyncStorage.setItem(storageKey, JSON.stringify(resolved)).catch(() => {});
        return resolved;
      });
    },
    [storageKey],
  );

  return [value, set] as const;
}

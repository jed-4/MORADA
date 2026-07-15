import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Poll `fn` every `intervalMs` while the app is foregrounded.
 *
 * - Pauses when the app is backgrounded, fires immediately on return.
 * - Guards against overlap: a tick is skipped while the previous call is
 *   still in flight (slow networks no longer stack concurrent requests).
 * - `enabled: false` stops polling entirely (e.g. while a screen is unfocused).
 */
export function usePolling(fn: () => Promise<unknown> | void, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;
    let cancelled = false;

    const tick = async () => {
      if (inFlight || cancelled || AppState.currentState !== 'active') return;
      inFlight = true;
      try {
        await fnRef.current();
      } catch {
        // polling is best-effort; the next tick retries
      } finally {
        inFlight = false;
      }
    };

    const start = () => {
      if (interval) return;
      tick();
      interval = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    start();

    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [intervalMs, enabled]);
}

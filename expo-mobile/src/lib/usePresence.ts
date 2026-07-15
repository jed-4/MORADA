import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api';
import { onSocketEvent, onSocketConnectionChange, isSocketConnected } from '../services/socket';

// Company presence: which teammates currently have at least one live socket.
//
// Server contract (server/socketManager.ts):
//   - GET /api/presence -> { userIds: string[] }  — initial snapshot for the
//     caller's company (server/routes.ts, next to the channel read endpoint).
//   - socket `presence_changed` { userId, online } — emitted to the company room
//     only on real transitions (first socket connect / last socket disconnect),
//     so multi-device sessions don't flap.
//
// Fail-silent like the rest of the socket layer: if presence can't be fetched
// the set is simply empty and no dots render. Presence is re-snapshotted on
// every socket (re)connect, because transitions that happened while we were
// disconnected were never delivered.

export function usePresence(enabled = true): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());

  const snapshot = useCallback(async () => {
    try {
      const res = await apiFetch<{ userIds: string[] }>('/api/presence');
      setOnline(new Set(res?.userIds || []));
    } catch {
      // non-critical: no dots rather than a broken screen
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (isSocketConnected()) snapshot();

    const unsubConn = onSocketConnectionChange(connected => {
      // A reconnect means we may have missed transitions — resync from scratch.
      if (connected) snapshot();
      else setOnline(new Set());
    });

    const unsubPresence = onSocketEvent(
      'presence_changed',
      (payload: { userId?: string; online?: boolean }) => {
        if (!payload?.userId || typeof payload.online !== 'boolean') return;
        setOnline(prev => {
          const has = prev.has(payload.userId!);
          if (payload.online === has) return prev; // no-op keeps referential equality
          const next = new Set(prev);
          if (payload.online) next.add(payload.userId!);
          else next.delete(payload.userId!);
          return next;
        });
      }
    );

    return () => {
      unsubConn();
      unsubPresence();
    };
  }, [enabled, snapshot]);

  return online;
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { emitSocketEvent, onSocketEvent } from '../services/socket';

// Typing indicators.
//
// Server contract (server/socketManager.ts ~lines 129-143), verified against the
// live socket manager (server/messaging/socket.ts is dead code — nothing imports it):
//   - client emits `typing_start` / `typing_stop` with a bare channelId string
//   - server re-broadcasts to the rest of the channel room as
//     `user_typing` / `user_stopped_typing` with { channelId, userId }
//   - server drops the event unless the socket is already in `channel:<id>`,
//     which is why the screen emits `join_channel` on mount.
// The sender is excluded server-side via socket.to(...), but we also ignore our
// own userId defensively.

const REEMIT_MS = 3000; // re-assert typing_start at most this often while typing
const IDLE_STOP_MS = 4000; // stop typing after this long without a keystroke
const STALE_MS = 6000; // drop a remote typer we haven't heard from in this long

/** Emit side: call setTyping(true/false) as the composer text changes. */
export function useTypingEmitter(channelId: string) {
  const lastEmitRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  const stop = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (!activeRef.current) return;
    activeRef.current = false;
    lastEmitRef.current = 0;
    emitSocketEvent('typing_stop', channelId);
  }, [channelId]);

  const setTyping = useCallback(
    (typing: boolean) => {
      if (!typing) {
        stop();
        return;
      }
      const now = Date.now();
      // Throttle: only re-assert every REEMIT_MS while the user keeps typing.
      if (!activeRef.current || now - lastEmitRef.current >= REEMIT_MS) {
        activeRef.current = true;
        lastEmitRef.current = now;
        emitSocketEvent('typing_start', channelId);
      }
      // Each keystroke pushes the idle deadline out.
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(stop, IDLE_STOP_MS);
    },
    [channelId, stop]
  );

  // Leaving the thread (or switching channels) must never strand a typing flag.
  useEffect(() => stop, [stop]);

  return { setTyping, stopTyping: stop };
}

/** Receive side: the set of *other* user IDs currently typing in this channel. */
export function useTypingUsers(channelId: string, selfUserId?: string): string[] {
  const [typers, setTypers] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsubStart = onSocketEvent('user_typing', (p: { channelId?: string; userId?: string }) => {
      if (p?.channelId !== channelId || !p?.userId || p.userId === selfUserId) return;
      setTypers(prev => ({ ...prev, [p.userId!]: Date.now() }));
    });
    const unsubStop = onSocketEvent('user_stopped_typing', (p: { channelId?: string; userId?: string }) => {
      if (p?.channelId !== channelId || !p?.userId) return;
      setTypers(prev => {
        if (!(p.userId! in prev)) return prev;
        const next = { ...prev };
        delete next[p.userId!];
        return next;
      });
    });
    return () => {
      unsubStart();
      unsubStop();
    };
  }, [channelId, selfUserId]);

  // A `typing_stop` can be lost (drop, backgrounded sender, crash) — expire any
  // typer we haven't had a refresh from, so the row can never stick forever.
  useEffect(() => {
    if (Object.keys(typers).length === 0) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - STALE_MS;
      setTypers(prev => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [id, at] of Object.entries(prev)) {
          if (at >= cutoff) next[id] = at;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typers]);

  // Channel switches must not leak typers across threads.
  useEffect(() => {
    setTypers({});
  }, [channelId]);

  return Object.keys(typers);
}

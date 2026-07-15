import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL, getSessionId } from './api';

// Real-time layer (Socket.IO). Auth mirrors the REST client: the session id is
// sent as an X-Session-ID / X-Client header pair (plus the auth payload for
// good measure) so the server's socket handshake resolves the same session as
// REST requests do.
//
// Fail-silent by design: screens fall back to polling whenever the socket is
// down, so connection problems are never surfaced to the UI. Lifecycle is
// managed by AuthContext (connect on login/startup, disconnect on logout),
// like syncService.

type SocketHandler = (...args: any[]) => void;

let socket: Socket | null = null;
let appStateSub: { remove: () => void } | null = null;

// Handlers registered via onSocketEvent — kept here so subscriptions made
// before connectSocket() (or across reconnect cycles) are never lost.
const eventHandlers = new Map<string, Set<SocketHandler>>();
const connectionListeners = new Set<(connected: boolean) => void>();

function notifyConnection(connected: boolean) {
  for (const listener of connectionListeners) {
    try {
      listener(connected);
    } catch {
      // listeners must never break the socket layer
    }
  }
}

export function connectSocket(): void {
  if (socket) return;
  const sessionId = getSessionId();
  if (!sessionId) return;

  try {
    socket = io(API_BASE_URL, {
      path: '/socket.io/',
      transports: ['websocket'],
      auth: { sessionId },
      extraHeaders: { 'X-Session-ID': sessionId, 'X-Client': 'mobile' },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
    });
  } catch {
    socket = null;
    return;
  }

  socket.on('connect', () => notifyConnection(true));
  socket.on('disconnect', () => notifyConnection(false));
  socket.on('connect_error', () => {
    // Silent: socket.io keeps retrying with backoff; polling covers the gap.
  });

  for (const [event, handlers] of eventHandlers) {
    for (const handler of handlers) socket.on(event, handler);
  }

  // Sockets can die quietly while backgrounded — kick a reconnect on return
  // to foreground (no-op if socket.io already reconnected on its own).
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active' && socket && !socket.connected) socket.connect();
  });
}

export function disconnectSocket(): void {
  appStateSub?.remove();
  appStateSub = null;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  notifyConnection(false);
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

/** Subscribe to a server-sent event. Returns an unsubscribe function. */
export function onSocketEvent(event: string, handler: SocketHandler): () => void {
  if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
  eventHandlers.get(event)!.add(handler);
  socket?.on(event, handler);
  return () => {
    eventHandlers.get(event)?.delete(handler);
    socket?.off(event, handler);
  };
}

/** Emit a client event. Silently dropped while disconnected. */
export function emitSocketEvent(event: string, ...args: unknown[]): void {
  if (socket?.connected) socket.emit(event, ...args);
}

/** Subscribe to connection-state changes. Returns an unsubscribe function. */
export function onSocketConnectionChange(listener: (connected: boolean) => void): () => void {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
}

/** React hook: true while the socket is connected (drives poll fallback). */
export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(isSocketConnected());
  useEffect(() => {
    setConnected(isSocketConnected());
    return onSocketConnectionChange(setConnected);
  }, []);
  return connected;
}

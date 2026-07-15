import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncQueue } from './offlineQueue';

// App-level offline sync. Previously the queue only drained while the
// Timesheets screen was open — diary entries and checklist changes queued
// from other screens waited indefinitely. This service drains the queue
// whenever connectivity returns or the app comes to the foreground,
// regardless of which screen is showing.

let netInfoUnsub: (() => void) | null = null;
let appStateSub: { remove: () => void } | null = null;

export function startSyncService(): void {
  if (netInfoUnsub) return; // already running

  netInfoUnsub = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      syncQueue();
    }
  });

  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      syncQueue();
    }
  });

  syncQueue();
}

export function stopSyncService(): void {
  netInfoUnsub?.();
  netInfoUnsub = null;
  appStateSub?.remove();
  appStateSub = null;
}

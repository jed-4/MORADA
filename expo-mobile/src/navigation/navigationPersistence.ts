import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { NavigationState } from '@react-navigation/native';

/**
 * "Remember where you were": the app reopens on the same tab, project and
 * screen after it has been closed (or killed by iOS in the background).
 *
 * - Team (builder) mode only, and per user: someone else signing in on the
 *   phone never lands on your screens.
 * - Keyed by app version: a new build may rename screens, and restoring a
 *   route that no longer exists would break navigation.
 * - Forgotten after MAX_AGE_MS so a phone picked up next week starts fresh.
 * - A push-notification tap still wins: it navigates after launch.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 500;

const keyFor = (userId: string) => `nav:state:${Constants.expoConfig?.version ?? 'dev'}:${userId}`;

export function useRestoredNavigationState(userId: string | undefined, authLoading: boolean) {
  const [ready, setReady] = useState(false);
  const [initialState, setInitialState] = useState<NavigationState | undefined>();
  const userRef = useRef(userId);
  userRef.current = userId;

  // Restore once, at launch, after the stored session has been checked.
  useEffect(() => {
    if (ready || authLoading) return;
    if (!userId) {
      setReady(true);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(keyFor(userId))
      .then((raw) => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as { savedAt: number; state: NavigationState };
        if (saved?.state && Date.now() - saved.savedAt < MAX_AGE_MS) setInitialState(saved.state);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, authLoading, userId]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback((state: NavigationState | undefined) => {
    const uid = userRef.current;
    if (!uid || !state) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      AsyncStorage.setItem(keyFor(uid), JSON.stringify({ savedAt: Date.now(), state })).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, []);

  return { ready, initialState, save };
}

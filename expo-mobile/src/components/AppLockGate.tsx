import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, radius, fonts } from '../theme';
import { haptic } from '../lib/haptics';
import { authenticate, getBiometricSupport, RELOCK_AFTER_MS, setAppLockedNow, useAppLockEnabled } from '../lib/appLock';

/**
 * Face ID lock (#50). Mounted ONCE around the navigator in App.tsx.
 *
 * Fold-safe: `children` (the navigator) are always rendered, in the same
 * place, locked or not — the lock is a cover drawn on top, never a swap of
 * the tree. Swapping would remount the navigator and every open screen,
 * which on the iPhone Duo also happens to be what a live resize must never do.
 *
 * The cover is a full-screen Modal so it sits above other open modals (a diary
 * entry form, a sheet) as well as the screens.
 *
 * Locks:
 *  - on a cold start, once a stored session is found (never on the sign-in
 *    screen — signed out, nothing locks);
 *  - when the app comes back after more than RELOCK_AFTER_MS in the background.
 * The Face ID sheet itself only makes the app "inactive", so it never re-locks.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { isAuthenticated, isLoading, logout } = useAuth();
  const enabled = useAppLockEnabled();
  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState('Face ID');
  const coldStartChecked = useRef(false);
  const backgroundAt = useRef<number | null>(null);
  const prompting = useRef(false);

  // Cold start: lock once the stored session has been validated.
  useEffect(() => {
    if (coldStartChecked.current || enabled === null || isLoading) return;
    coldStartChecked.current = true;
    if (enabled && isAuthenticated) setLocked(true);
  }, [enabled, isLoading, isAuthenticated]);

  // Signed out, or the setting switched off: never stay locked.
  useEffect(() => {
    if (!isAuthenticated || enabled === false) setLocked(false);
  }, [isAuthenticated, enabled]);

  useEffect(() => {
    if (enabled) getBiometricSupport().then(s => setLabel(s.label)).catch(() => {});
  }, [enabled]);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      const ok = await authenticate('Unlock Morada');
      if (ok) {
        haptic.success();
        setLocked(false);
      }
    } finally {
      prompting.current = false;
    }
  }, []);

  // Relock after a long time in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundAt.current = Date.now();
      } else if (next === 'active') {
        const away = backgroundAt.current;
        backgroundAt.current = null;
        if (enabled && isAuthenticated && away != null && Date.now() - away > RELOCK_AFTER_MS) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [enabled, isAuthenticated]);

  // Ask straight away whenever the cover goes up (and the app is in front —
  // Face ID can't be shown from the background).
  useEffect(() => {
    if (!locked) return;
    if (AppState.currentState === 'active') {
      unlock();
      return;
    }
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        sub.remove();
        unlock();
      }
    });
    return () => sub.remove();
  }, [locked, unlock]);

  // Until the preference has loaded, a signed-in app shows the cover rather
  // than flashing its content for a frame.
  const covered = locked || (enabled === null && isAuthenticated);
  useEffect(() => {
    setAppLockedNow(covered);
  }, [covered]);

  return (
    <View style={styles.root}>
      {children}
      <Modal visible={covered} animationType="none" presentationStyle="fullScreen" onRequestClose={() => {}}>
        <View style={[styles.cover, { backgroundColor: theme.background }]}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Morada is locked</Text>
          {locked && (
            <>
              <Pressable
                onPress={() => { haptic.light(); unlock(); }}
                style={[styles.unlockBtn, { backgroundColor: theme.primary }]}
                accessibilityRole="button"
                accessibilityLabel={`Unlock with ${label}`}
              >
                <Ionicons name={label === 'Face ID' ? 'scan-outline' : 'finger-print-outline'} size={20} color="#fff" />
                <Text style={styles.unlockText}>Unlock with {label}</Text>
              </Pressable>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                You can use your phone's passcode if {label} doesn't work.
              </Text>
              <Pressable
                onPress={() => { haptic.warning(); setLocked(false); logout(); }}
                hitSlop={10}
                accessibilityRole="button"
                style={styles.signOut}
              >
                <Text style={[styles.signOutText, { color: theme.primary }]}>Sign out instead</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cover: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  logo: { width: 88, height: 88, borderRadius: 20, marginBottom: 6 },
  title: { fontSize: 20, fontFamily: fonts.bold },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    minHeight: 50,
    borderRadius: radius.xl,
    marginTop: 10,
  },
  unlockText: { color: '#fff', fontSize: 16, fontFamily: fonts.semibold },
  hint: { fontSize: 13, textAlign: 'center' },
  signOut: { marginTop: 18 },
  signOutText: { fontSize: 14, fontFamily: fonts.semibold },
});

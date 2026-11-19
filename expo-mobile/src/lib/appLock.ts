import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Face ID lock (#50): optional, per device.
//
// - The preference lives on this phone only (AsyncStorage), never on the
//   server — a second phone, or the same person on a shared phone, decides
//   for itself.
// - expo-local-authentication is a NATIVE module. A binary built before it
//   was added (or Expo Go) doesn't have it, and the library's import calls
//   requireNativeModule, which throws. So it is only required once the native
//   half is known to be there; without it the setting reads "not available"
//   and nothing ever locks.

const PREF_KEY = 'security:requireFaceId';
const NATIVE_MODULE = 'ExpoLocalAuthentication';

/** Lock again when the app comes back after more than this in the background. */
export const RELOCK_AFTER_MS = 5 * 60 * 1000;

type LocalAuth = typeof import('expo-local-authentication');

let cachedModule: LocalAuth | null | undefined;
function localAuth(): LocalAuth | null {
  if (cachedModule !== undefined) return cachedModule;
  cachedModule = null;
  if (Platform.OS === 'web') return null;
  try {
    if (requireOptionalNativeModule(NATIVE_MODULE)) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cachedModule = require('expo-local-authentication') as LocalAuth;
    }
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export interface BiometricSupport {
  /** True when the lock can be switched on. */
  available: boolean;
  /** "Face ID", "Touch ID" or "Biometrics" — for labels. */
  label: string;
  /** Why it can't be switched on (shown under the disabled switch). */
  reason?: string;
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  const mod = localAuth();
  if (!mod) {
    return { available: false, label: 'Face ID', reason: 'Needs the latest version of the app from the App Store.' };
  }
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      mod.hasHardwareAsync(),
      mod.isEnrolledAsync(),
      mod.supportedAuthenticationTypesAsync(),
    ]);
    const label = types.includes(mod.AuthenticationType.FACIAL_RECOGNITION)
      ? 'Face ID'
      : types.includes(mod.AuthenticationType.FINGERPRINT)
        ? Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint'
        : 'Face ID';
    if (!hasHardware) {
      return { available: false, label, reason: "This phone doesn't have Face ID or Touch ID." };
    }
    if (!enrolled) {
      return {
        available: false,
        label,
        reason: `${label} isn't set up on this phone. Set it up in the phone's Settings, then come back.`,
      };
    }
    return { available: true, label };
  } catch {
    return { available: false, label: 'Face ID', reason: "Couldn't check this phone's Face ID." };
  }
}

/**
 * Ask for Face ID / Touch ID, falling back to the phone's passcode. Resolves
 * true on success. Never throws.
 */
export async function authenticate(promptMessage = 'Unlock Morada'): Promise<boolean> {
  const mod = localAuth();
  if (!mod) return true; // Nothing to ask with: never lock someone out.
  try {
    const result = await mod.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
      // false = the passcode is offered when Face ID fails or is locked out.
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

// ── The preference ─────────────────────────────────────────────────────────
// A tiny store so the Settings switch and the lock gate stay in step without
// a context provider.

let enabled: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();

export async function loadAppLockEnabled(): Promise<boolean> {
  if (enabled !== null) return enabled;
  try {
    enabled = (await AsyncStorage.getItem(PREF_KEY)) === '1';
  } catch {
    enabled = false;
  }
  return enabled;
}

export async function setAppLockEnabled(value: boolean): Promise<void> {
  enabled = value;
  listeners.forEach(l => l(value));
  try {
    if (value) await AsyncStorage.setItem(PREF_KEY, '1');
    else await AsyncStorage.removeItem(PREF_KEY);
  } catch {
    // Storage failing only means it isn't remembered next launch.
  }
}

/** `null` until the stored preference has loaded. */
export function useAppLockEnabled(): boolean | null {
  const [value, setValue] = useState<boolean | null>(enabled);
  useEffect(() => {
    let alive = true;
    loadAppLockEnabled().then(v => { if (alive) setValue(v); });
    listeners.add(setValue);
    return () => {
      alive = false;
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

// ── Whether the cover is up right now ──────────────────────────────────────
// Read by things that would present over it: Share into Morada's modal waits
// until the app is unlocked, so it can't open on top of the cover.

let lockedNow = false;
const lockListeners = new Set<(v: boolean) => void>();

export function setAppLockedNow(value: boolean) {
  if (lockedNow === value) return;
  lockedNow = value;
  lockListeners.forEach(l => l(value));
}

export function useAppLockedNow(): boolean {
  const [value, setValue] = useState(lockedNow);
  useEffect(() => {
    setValue(lockedNow);
    lockListeners.add(setValue);
    return () => { lockListeners.delete(setValue); };
  }, []);
  return value;
}

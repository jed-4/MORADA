import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Whether this binary has the expo-widgets native module (Home Screen
 * widgets + Live Activities, added in the 1.4.0 native release).
 *
 * False on Android, in Expo Go, and on an older binary that predates
 * expo-widgets. Everything widget-related goes through this check, because
 * expo-widgets calls requireNativeModule() when it is imported and that
 * THROWS when the native side is missing.
 */
let available: boolean | undefined;

export function expoWidgetsAvailable(): boolean {
  if (available !== undefined) return available;
  available = false;
  try {
    if (Platform.OS !== 'ios') return false;
    if ((Constants.executionEnvironment as string) === 'storeClient') return false; // Expo Go
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require('expo');
    available = !!requireOptionalNativeModule?.('ExpoWidgets');
  } catch {
    available = false;
  }
  return available;
}

/**
 * Load a widget / Live Activity module (src/widgets/*) only when the native
 * side exists. Returns null instead of throwing.
 */
export function loadWidgetModule<T>(load: () => T): T | null {
  if (!expoWidgetsAvailable()) return null;
  try {
    return load();
  } catch (e) {
    console.warn('expo-widgets module failed to load:', e);
    return null;
  }
}

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { apiRequest } from './api';

let registeredToken: string | null = null;

// Show banners + play sound + update badge while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function getProjectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as any)?.eas?.projectId;
  const fromEasConfig = (Constants as any)?.easConfig?.projectId;
  return fromExtra || fromEasConfig;
}

/**
 * Request notification permission and register this device's Expo push token
 * with the backend. Safe to call multiple times (re-registration upserts).
 * Declining permission degrades gracefully — no throw, in-app notifications
 * keep working.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    // Push tokens are only available on physical devices, not simulators.
    if (!Device.isDevice) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const projectId = getProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : ({} as any),
    );
    const token = tokenResponse?.data;
    if (!token) return;

    registeredToken = token;
    await apiRequest('/api/notifications/register-device', 'POST', {
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName || undefined,
    }).catch(() => {});
  } catch (err) {
    console.warn('Push registration failed:', err);
  }
}

/**
 * Tell the backend to stop sending pushes to this device (called on logout,
 * while the session is still valid).
 */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    let token = registeredToken;
    if (!token) {
      // Best-effort: recover the token so logout still unregisters even if the
      // app restarted since registration.
      try {
        if (Device.isDevice) {
          const projectId = getProjectId();
          const resp = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : ({} as any),
          );
          token = resp?.data || null;
        }
      } catch {
        token = null;
      }
    }
    if (!token) return;
    await apiRequest('/api/notifications/unregister-device', 'POST', { token }).catch(() => {});
  } catch {
    // ignore — logout should never be blocked by push cleanup
  } finally {
    registeredToken = null;
  }
}

/** Keep the app icon badge in sync with the unread notification count. */
export async function setAppBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count || 0)));
  } catch {
    // badge updates are best-effort
  }
}

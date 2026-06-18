import { createNavigationContainerRef } from '@react-navigation/native';
import { resolveNotificationTarget } from './notificationRouting';

export const navigationRef = createNavigationContainerRef<any>();

/**
 * Navigate to the relevant screen based on a push notification's data payload.
 * Uses the same resolver as the in-app notification list so a tap lands in the
 * exact same place whether it's opened from a system banner or in-app.
 */
export function navigateFromPush(data: Record<string, any> | undefined | null) {
  if (!navigationRef.isReady() || !data) return;

  const target = resolveNotificationTarget(data);

  // The container ref's navigate is heavily overloaded; cast to a loose signature.
  const navigate = navigationRef.navigate as (name: string, params?: any) => void;

  try {
    navigate('Main', {
      screen: target.tab,
      params: target.screen
        ? { screen: target.screen, params: target.params }
        : target.params,
    });
  } catch {
    // Navigation tree may not be fully ready on cold start; safe to ignore.
  }
}

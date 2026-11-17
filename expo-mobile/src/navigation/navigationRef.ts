import { createNavigationContainerRef } from '@react-navigation/native';
import { resolveNotificationTarget } from './notificationRouting';
import { resolveClientNotificationTarget } from '../lib/clientPortal';

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

/**
 * Client mode's version of navigateFromPush: a homeowner's navigator has its
 * own screens (ClientNavigator), so the builder targets above would point at
 * tabs they don't have. Resolved by resolveClientNotificationTarget.
 */
export function navigateClientFromPush(data: Record<string, any> | undefined | null) {
  if (!navigationRef.isReady() || !data) return;
  const target = resolveClientNotificationTarget(data);
  const navigate = navigationRef.navigate as (name: string, params?: any) => void;
  try {
    navigate('Client', { screen: target.screen, params: target.params });
  } catch {
    // Navigation tree may not be fully ready on cold start; safe to ignore.
  }
}

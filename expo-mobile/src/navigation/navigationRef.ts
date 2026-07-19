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

/**
 * Land the user on the Timesheets screen (in the More stack). Used right after
 * subbie onboarding completes: refreshUser() swaps in the Main tree, which isn't
 * mounted instantly, so poll navigationRef.isReady() briefly before navigating.
 */
export function navigateToLogHours(): void {
  const go = (attempt = 0) => {
    if (navigationRef.isReady()) {
      try {
        (navigationRef.navigate as (name: string, params?: any) => void)('Main', {
          screen: 'More',
          params: { screen: 'Timesheets' },
        });
      } catch {
        // ignore — tree not ready in the expected shape
      }
    } else if (attempt < 20) {
      setTimeout(() => go(attempt + 1), 150);
    }
  };
  go();
}

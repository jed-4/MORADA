import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

/**
 * Navigate to the relevant screen based on a push notification's data payload.
 * Mirrors the in-app tap logic in NotificationsScreen so taps land in the same
 * place whether the notification is opened in-app or from a system banner.
 */
export function navigateFromPush(data: Record<string, any> | undefined | null) {
  if (!navigationRef.isReady() || !data) return;
  const type = typeof data.type === 'string' ? data.type : '';

  // The container ref's navigate is heavily overloaded; cast to a loose signature.
  const navigate = navigationRef.navigate as (name: string, params?: any) => void;

  try {
    if (type === 'task_assigned' || type === 'task_completed') {
      navigate('Main', { screen: 'More', params: { screen: 'Tasks' } });
    } else if (type === 'reminder' || type === 'reminder_due') {
      navigate('Main', { screen: 'Calendar' });
    } else if (type.startsWith('timesheet_')) {
      navigate('Main', { screen: 'More', params: { screen: 'Timesheets' } });
    } else {
      navigate('Main', { screen: 'Workspace', params: { screen: 'Notifications' } });
    }
  } catch {
    // Navigation tree may not be fully ready on cold start; safe to ignore.
  }
}

import * as Haptics from 'expo-haptics';

// Guarded haptic helpers — haptics are garnish, never let them throw.
// Usage: haptic.success() on completions, haptic.select() on toggles/pickers,
// haptic.warning() on destructive prompts, haptic.error() on failures.

const fire = (fn: () => Promise<void>) => {
  fn().catch(() => {});
};

export const haptic = {
  /** Light tick for selections, toggles, tab switches. */
  select: () => fire(() => Haptics.selectionAsync()),
  /** Soft tap for button presses that begin something. */
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium thud for drag-drop landings, sheet snaps. */
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Completion: task done, save succeeded. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Caution: destructive confirm shown. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Failure: request rejected. */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

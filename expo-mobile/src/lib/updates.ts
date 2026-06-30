// Over-the-air (OTA) update check via expo-updates / EAS Update.
//
// On a production/preview native build this checks the configured update channel
// for a newer JS bundle, downloads it in the background, and reloads the app so
// the new bundle is applied immediately.
//
// In development and Expo Go, `Updates.isEnabled` is false (there is no embedded
// updates runtime), so this is a graceful no-op and never throws.
import * as Updates from 'expo-updates';

export async function checkForOtaUpdate(): Promise<void> {
  // No-op when updates are disabled (dev client / Expo Go / `expo start`).
  if (!Updates.isEnabled) {
    return;
  }

  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Apply immediately. If this is too disruptive in future we can instead
      // let it apply on the next cold start (remove the reload call).
      await Updates.reloadAsync();
    }
  } catch {
    // Network errors, no published update, etc. — never block app startup.
  }
}

// Over-the-air (OTA) update check via expo-updates / EAS Update.
//
// On a production/preview native build this checks the configured update channel
// for a newer JS bundle, downloads it in the background, and reloads the app so
// the new bundle is applied immediately.
//
// In development and Expo Go, `Updates.isEnabled` is false (there is no embedded
// updates runtime), so this is a graceful no-op and never throws.
//
// expo-updates is an optional native dependency that isn't present in the Expo Go
// / dev environment. We stub the three symbols we use so Metro can resolve the
// module without a native build.
let Updates: {
  isEnabled: boolean;
  checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync: () => Promise<void>;
  reloadAsync: () => Promise<void>;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Updates = require('expo-updates');
} catch {
  // Not installed (Expo Go / dev) — provide a no-op stub.
  Updates = {
    isEnabled: false,
    checkForUpdateAsync: async () => ({ isAvailable: false }),
    fetchUpdateAsync: async () => {},
    reloadAsync: async () => {},
  };
}

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

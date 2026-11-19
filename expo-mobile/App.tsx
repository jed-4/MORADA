import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Sentry, reportAppStart } from './src/lib/sentry';
import { AuthProvider } from './src/contexts/AuthContext';
import { ToastProvider } from './src/components/ui/Toast';
import AppNavigator from './src/navigation/AppNavigator';
import { checkForOtaUpdate } from './src/lib/updates';
import { ShareIntentProvider } from 'expo-share-intent';
import { requireOptionalNativeModule } from 'expo';
import { AppLockGate } from './src/components/AppLockGate';

// Share into Morada (#44). Off on a binary built before the share extension
// was added (and in Expo Go) — the provider then does nothing.
const shareIntentOptions = {
  disabled: !requireOptionalNativeModule('ExpoShareIntentModule'),
};

function App() {
  // Record which native build is running before anything else can fail, then
  // check for an over-the-air (OTA) update. Both are no-ops in dev / Expo Go.
  useEffect(() => {
    reportAppStart();
    checkForOtaUpdate();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ShareIntentProvider options={shareIntentOptions}>
        <AuthProvider>
          <ToastProvider>
            {/* Face ID lock (#50): a cover over the navigator, never a remount of it. */}
            <AppLockGate>
            <BottomSheetModalProvider>
              <AppNavigator />
            </BottomSheetModalProvider>
            </AppLockGate>
          </ToastProvider>
        </AuthProvider>
        </ShareIntentProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);

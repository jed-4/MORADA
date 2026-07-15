import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Sentry } from './src/lib/sentry';
import { AuthProvider } from './src/contexts/AuthContext';
import { ToastProvider } from './src/components/ui/Toast';
import AppNavigator from './src/navigation/AppNavigator';
import { checkForOtaUpdate } from './src/lib/updates';

function App() {
  // Check for an over-the-air (OTA) update on launch. No-op in dev / Expo Go.
  useEffect(() => {
    checkForOtaUpdate();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>
            <BottomSheetModalProvider>
              <AppNavigator />
            </BottomSheetModalProvider>
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);

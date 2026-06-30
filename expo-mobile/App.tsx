import { useEffect } from 'react';
import { Sentry } from './src/lib/sentry';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { checkForOtaUpdate } from './src/lib/updates';

function App() {
  // Check for an over-the-air (OTA) update on launch. No-op in dev / Expo Go.
  useEffect(() => {
    checkForOtaUpdate();
  }, []);

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

export default Sentry.wrap(App);

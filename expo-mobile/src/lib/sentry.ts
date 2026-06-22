// Sentry initialization for the Expo mobile app.
//
// Initialization is a no-op when no DSN is provided (via EXPO_PUBLIC_SENTRY_DSN
// at build time, or app.config.js `extra.sentryDsn`), so local development
// without a DSN runs cleanly.
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn =
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  (Constants.expoConfig?.extra as any)?.sentryDsn ||
  undefined;

export const sentryEnabled = Boolean(dsn);

// Navigation/screen tracing. Registered against the NavigationContainer once it
// is ready (see AppNavigator). Created unconditionally so imports are stable,
// but only emits data when Sentry is initialized below.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

if (dsn) {
  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    release: process.env.EXPO_PUBLIC_SENTRY_RELEASE || undefined,
    // Performance tracing: sample everything in dev, a fraction in prod.
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    integrations: [navigationIntegration],
    sendDefaultPii: false,
  });
}

export { Sentry };

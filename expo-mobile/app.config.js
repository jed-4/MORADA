module.exports = {
  expo: {
    name: "Morada",
    slug: "buildpro-mobile",
    version: "1.3.0",
    scheme: "buildpro",
    // "default" so the iPhone Duo can turn sideways when unfolded. Phones are
    // still held in portrait: the expo-screen-orientation plugin below starts
    // the app locked to portrait, and src/lib/orientation.ts only unlocks it
    // on a big screen.
    orientation: "default",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/icon.png",
      resizeMode: "contain",
      backgroundColor: "#7C6B86",
    },
    // Over-the-air (OTA) updates via EAS Update. The update URL is tied to the
    // existing EAS project (extra.eas.projectId). runtimeVersion uses the
    // appVersion policy so a published update only reaches native builds whose
    // version matches — bump `version` whenever a change requires a new build.
    // 1.2.0 = Expo SDK 58 / React Native 0.88: an update built on it must never
    // reach a 1.1.x (SDK 54) binary.
    // 1.3.0 = adds expo-screen-orientation (native module, iPhone Duo).
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/d07cc13c-7e47-4be7-bea4-57c7186e65fe",
      fallbackToCacheTimeout: 0,
    },
    ios: {
      // iPhone only for now: the screens are laid out for a phone and have
      // never been tested on iPad. App Review tests on iPad when this is true.
      supportsTablet: false,
      bundleIdentifier: "com.buildpro.mobile",
      // Sign in with Apple (App Store guideline 4.8 — we also offer Google).
      usesAppleSignIn: true,
      buildNumber: "19",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#7C6B86",
      },
      package: "com.buildpro.mobile",
      versionCode: 16,
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://buildpro4.replit.app",
      googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || "",
      eas: {
        projectId: "d07cc13c-7e47-4be7-bea4-57c7186e65fe",
      },
    },
    plugins: [
      "expo-secure-store",
      "expo-web-browser",
      "expo-sharing",
      "expo-status-bar",
      ["expo-screen-orientation", { initialOrientation: "PORTRAIT_UP" }],
      "expo-font",
      "expo-notifications",
      "expo-apple-authentication",
      "@react-native-community/datetimepicker",
      [
        "expo-image-picker",
        {
          photosPermission: "Morada uses your photos so you can attach them to site diary entries, checklists, receipts, notes and messages.",
          cameraPermission: "Morada uses your camera so you can photograph site progress, checklist items and receipts.",
        },
      ],
      [
        "@sentry/react-native/expo",
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
        },
      ],
    ],
  },
};

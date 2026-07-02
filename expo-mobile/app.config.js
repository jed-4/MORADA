module.exports = {
  expo: {
    name: "Morada",
    slug: "buildpro-mobile",
    version: "1.0.1",
    scheme: "buildpro",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      backgroundColor: "#1e40af",
    },
    // Over-the-air (OTA) updates via EAS Update. The update URL is tied to the
    // existing EAS project (extra.eas.projectId). runtimeVersion uses the
    // appVersion policy so a published update only reaches native builds whose
    // version matches — bump `version` whenever a change requires a new build.
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/d07cc13c-7e47-4be7-bea4-57c7186e65fe",
      fallbackToCacheTimeout: 0,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.buildpro.mobile",
      buildNumber: "9",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1e3a5f",
      },
      package: "com.buildpro.mobile",
      versionCode: 9,
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
      "expo-font",
      "expo-notifications",
      "@react-native-community/datetimepicker",
      [
        "expo-image-picker",
        {
          photosPermission: "Morada needs access to your photos to attach images to notes.",
          cameraPermission: "Morada needs access to your camera to take photos for notes.",
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

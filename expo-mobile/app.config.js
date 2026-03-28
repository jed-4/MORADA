module.exports = {
  expo: {
    name: "Build-Pro",
    slug: "buildpro-mobile",
    version: "1.0.0",
    scheme: "buildpro",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      backgroundColor: "#1e40af",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.buildpro.mobile",
      buildNumber: "5",
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
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://buildpro4.replit.app",
      googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      eas: {
        projectId: "d07cc13c-7e47-4be7-bea4-57c7186e65fe",
      },
    },
    plugins: [
      "expo-secure-store",
      "expo-web-browser",
      "expo-font",
      "@react-native-community/datetimepicker",
      [
        "expo-image-picker",
        {
          photosPermission: "BuildPro needs access to your photos to attach images to notes.",
          cameraPermission: "BuildPro needs access to your camera to take photos for notes.",
        },
      ],
    ],
  },
};

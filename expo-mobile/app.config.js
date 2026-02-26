export default {
  expo: {
    name: "BuildPro",
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
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1e3a5f",
      },
      package: "com.buildpro.mobile",
    },
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "",
      googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      eas: {
        projectId: "",
      },
    },
    plugins: [
      "expo-secure-store",
      "expo-web-browser",
    ],
  },
};

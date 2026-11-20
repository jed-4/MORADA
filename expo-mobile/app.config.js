// One camera permission string, shared by expo-image-picker and the document
// scanner (both set NSCameraUsageDescription).
const CAMERA_PERMISSION =
  "Morada uses your camera so you can photograph site progress, checklist items and receipts, and scan receipts.";

// Face ID lock (#50) — Settings → Require Face ID. Set in ios.infoPlist and
// on the expo-local-authentication plugin so whichever writes last, it reads right.
const FACE_ID_PERMISSION = "Morada uses Face ID to unlock the app when you turn on Require Face ID in Settings.";

// Share into Morada (#44). The share extension and the app swap files through
// this App Group; both identifiers must exist in the Apple Developer account
// (EAS creates them on the next build when it manages credentials).
const IOS_BUNDLE_ID = "com.buildpro.mobile";
const IOS_APP_GROUP = `group.${IOS_BUNDLE_ID}`;
const IOS_SHARE_EXTENSION_ID = `${IOS_BUNDLE_ID}.share-extension`;

module.exports = {
  expo: {
    name: "Morada",
    slug: "buildpro-mobile",
    version: "1.4.0",
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
    // 1.4.0 = adds expo-widgets + @expo/ui (Home Screen widgets, Lock Screen
    //         clock-in Live Activity; a widget extension target + App Group).
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
      bundleIdentifier: IOS_BUNDLE_ID,
      // Sign in with Apple (App Store guideline 4.8 — we also offer Google).
      usesAppleSignIn: true,
      buildNumber: "21",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSFaceIDUsageDescription: FACE_ID_PERMISSION,
        // Clock-in timer on the Lock Screen / Dynamic Island (expo-widgets).
        NSSupportsLiveActivities: true,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#7C6B86",
      },
      package: "com.buildpro.mobile",
      versionCode: 17,
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
      // Arriving on site (#46): iOS region monitoring for up to 20 job sites.
      // Region monitoring works with "Always" permission and does NOT need the
      // continuous background-location mode, so isIosBackgroundLocationEnabled
      // stays false (no blue location pill, no UIBackgroundModes "location").
      // Android geofencing needs ACCESS_BACKGROUND_LOCATION, hence true there.
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Morada uses your location to set a job's site location when you're standing on site, and to notice when you arrive at one of your company's job sites so it can ask if you want to clock in.",
          locationAlwaysAndWhenInUsePermission:
            "Morada notices when you arrive at or leave one of your company's job sites, so it can ask if you want to clock in or out. It only records arrivals and departures at job sites, never where else you go. Only you and your timesheet approvers can see them.",
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Morada uses your photos so you can attach them to site diary entries, checklists, receipts, notes and messages.",
          cameraPermission: CAMERA_PERMISSION,
        },
      ],
      // iOS VisionKit / Android ML Kit document scanner (receipts). Native
      // module — needs a new build. Same camera text as expo-image-picker so
      // whichever plugin writes NSCameraUsageDescription last, it reads right.
      ["react-native-document-scanner-plugin", { cameraPermission: CAMERA_PERMISSION }],
      // Face ID lock (#50).
      ["expo-local-authentication", { faceIDPermission: FACE_ID_PERMISSION }],
      // Voice notes (#56): on-phone speech-to-text, no audio kept.
      [
        "expo-speech-recognition",
        {
          microphonePermission: "Morada uses the microphone when you tap the mic to dictate diary notes, defects and comments. No recording is kept.",
          speechRecognitionPermission: "Morada turns what you say into text for diary notes, defects and comments. On most iPhones this happens on the phone itself.",
        },
      ],
      // Share into Morada (#44): adds an iOS share extension ("Morada" in the
      // share sheet) for photos and files (PDFs), and Android share intents.
      // Opens the app at buildpro://dataUrl=... which useShareIntentRouting handles.
      [
        "expo-share-intent",
        {
          iosActivationRules: {
            NSExtensionActivationSupportsImageWithMaxCount: 20,
            NSExtensionActivationSupportsFileWithMaxCount: 10,
          },
          iosAppGroupIdentifier: IOS_APP_GROUP,
          iosShareExtensionBundleIdentifier: IOS_SHARE_EXTENSION_ID,
          iosShareExtensionName: "MoradaShareExtension",
          androidIntentFilters: ["image/*", "application/pdf"],
          androidMultiIntentFilters: ["image/*"],
        },
      ],
      // Home Screen + Lock Screen widgets and the clock-in Live Activity
      // (src/widgets/*, fed by src/services/widgetSnapshot.ts). Adds the
      // ExpoWidgetsTarget extension and the App Group both targets share.
      // iOS only (enableAndroid defaults to false). Live Activities are NOT
      // listed here: an entry without supportedFamilies breaks the build.
      [
        "expo-widgets",
        {
          groupIdentifier: "group.com.buildpro.mobile",
          bundleIdentifier: "com.buildpro.mobile.ExpoWidgetsTarget",
          widgets: [
            {
              name: "TodayWidget",
              displayName: "Today",
              description: "Your clocked-in job and timer, hours today and what's next on the schedule.",
              ios: {
                supportedFamilies: ["systemSmall", "systemMedium", "accessoryRectangular", "accessoryInline", "accessoryCircular"],
                initialLayout: "./src/widgets/TodayWidget.tsx",
              },
            },
            {
              name: "TasksWidget",
              displayName: "Tasks",
              description: "Up to four tasks due today.",
              ios: {
                supportedFamilies: ["systemSmall", "systemMedium", "systemLarge"],
                initialLayout: "./src/widgets/TasksWidget.tsx",
              },
            },
            {
              // #41 fallback: expo-widgets has no Control Center controls, so
              // this is a one-tap Lock Screen shortcut to Photo to diary.
              name: "DiaryPhotoWidget",
              displayName: "Diary photo",
              description: "Opens the camera for a site diary photo.",
              ios: {
                supportedFamilies: ["accessoryCircular", "accessoryInline"],
                initialLayout: "./src/widgets/DiaryPhotoWidget.tsx",
              },
            },
          ],
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

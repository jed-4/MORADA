import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

export async function getCamera() {
  if (!isNative()) {
    return {
      getPhoto: async () => {
        throw new Error("Camera is only available in the native app. Please install the BuildPro app from the App Store or Google Play.");
      },
    };
  }
  const { Camera } = await import("@capacitor/camera");
  return Camera;
}

export async function getHaptics() {
  if (!isNative()) {
    return {
      impact: async () => {},
      notification: async () => {},
      vibrate: async () => {},
      selectionStart: async () => {},
      selectionChanged: async () => {},
      selectionEnd: async () => {},
    };
  }
  const { Haptics } = await import("@capacitor/haptics");
  return Haptics;
}

export async function getShare() {
  if (!isNative()) {
    return {
      share: async (options: { title?: string; text?: string; url?: string }) => {
        if (navigator.share) {
          await navigator.share(options);
        } else {
          throw new Error("Sharing is not supported in this browser.");
        }
      },
    };
  }
  const { Share } = await import("@capacitor/share");
  return Share;
}

export async function getNetwork() {
  if (!isNative()) {
    return {
      getStatus: async () => ({
        connected: navigator.onLine,
        connectionType: "wifi",
      }),
      addListener: () => ({ remove: () => {} }),
    };
  }
  const { Network } = await import("@capacitor/network");
  return Network;
}

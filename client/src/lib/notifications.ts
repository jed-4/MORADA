import Favico from "favico.js";

// Notification preferences stored in localStorage
export interface NotificationPreferences {
  sound: boolean;
  push: boolean;
  highlights: boolean;
  mentionSound: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  sound: true,
  push: true,
  highlights: true,
  mentionSound: true,
};

// Favicon badge instance
let favicon: any = null;

// Initialize favicon badge
export function initFavicon() {
  if (!favicon) {
    favicon = new Favico({
      animation: "none",
      bgColor: "#ef4444", // red
      textColor: "#fff",
    });
  }
  return favicon;
}

// Update favicon badge with unread count
export function updateFaviconBadge(count: number) {
  const faviconInstance = initFavicon();
  if (count > 0) {
    faviconInstance.badge(count > 99 ? 99 : count);
  } else {
    faviconInstance.reset();
  }
}

// Play notification sound using Web Audio API
export function playNotificationSound() {
  const prefs = getNotificationPreferences();
  if (!prefs.sound) return;

  try {
    // Create a simple beep using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure beep sound
    oscillator.frequency.value = 800; // Hz
    oscillator.type = "sine";
    gainNode.gain.value = 0.1; // Volume

    // Play short beep
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1); // 100ms beep
  } catch (error) {
    console.warn("Error playing notification sound:", error);
  }
}

// Get notification preferences from localStorage
export function getNotificationPreferences(): NotificationPreferences {
  try {
    const stored = localStorage.getItem("notification-preferences");
    if (stored) {
      return { ...DEFAULT_PREFS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.warn("Error reading notification preferences:", error);
  }
  return DEFAULT_PREFS;
}

// Save notification preferences to localStorage
export function saveNotificationPreferences(prefs: NotificationPreferences) {
  try {
    localStorage.setItem("notification-preferences", JSON.stringify(prefs));
  } catch (error) {
    console.warn("Error saving notification preferences:", error);
  }
}

// Check if browser supports notifications
export function isNotificationSupported(): boolean {
  return "Notification" in window;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    return "denied";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return "denied";
  }
}

// Check if notifications are granted
export function areNotificationsGranted(): boolean {
  return isNotificationSupported() && Notification.permission === "granted";
}

// Show browser notification
export interface ShowNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: any;
  onClick?: () => void;
}

export function showBrowserNotification(options: ShowNotificationOptions) {
  const prefs = getNotificationPreferences();
  if (!prefs.push || !areNotificationsGranted()) {
    return null;
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || "/favicon.ico",
      tag: options.tag,
      data: options.data,
      badge: "/favicon.ico",
      requireInteraction: false,
    });

    if (options.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    return notification;
  } catch (error) {
    console.error("Error showing browser notification:", error);
    return null;
  }
}

// Show notification for new message
export function showMessageNotification(params: {
  channelName: string;
  senderName: string;
  messageContent: string;
  avatar?: string;
  isMention?: boolean;
  onClickChannel?: () => void;
}) {
  const { channelName, senderName, messageContent, avatar, isMention, onClickChannel } = params;

  // Play sound (different for mentions)
  if (isMention) {
    const prefs = getNotificationPreferences();
    if (prefs.mentionSound) {
      playNotificationSound();
      // Play twice for mentions
      setTimeout(playNotificationSound, 200);
    }
  } else {
    playNotificationSound();
  }

  // Show browser notification
  const title = isMention 
    ? `${senderName} mentioned you in #${channelName}`
    : `New message in #${channelName}`;
  
  const body = `${senderName}: ${messageContent.substring(0, 100)}${messageContent.length > 100 ? "..." : ""}`;

  showBrowserNotification({
    title,
    body,
    icon: avatar,
    tag: `channel-${channelName}`,
    onClick: onClickChannel,
  });
}

// Check if service worker is supported (for future push notifications)
export function isServiceWorkerSupported(): boolean {
  return "serviceWorker" in navigator;
}

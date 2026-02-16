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

let favicon: any = null;
let faviconInitFailed = false;
let faviconInitPromise: Promise<any> | null = null;

export async function initFavicon(): Promise<any> {
  if (favicon) return favicon;
  if (faviconInitFailed) return null;
  if (faviconInitPromise) return faviconInitPromise;

  faviconInitPromise = (async () => {
    try {
      const mod = await import("favico.js");
      const FavicoConstructor = mod.default || mod;
      if (typeof FavicoConstructor !== 'function') {
        faviconInitFailed = true;
        return null;
      }
      favicon = new FavicoConstructor({
        animation: "none",
        bgColor: "#ef4444",
        textColor: "#fff",
      });
      return favicon;
    } catch (error) {
      console.warn("Failed to initialize Favico:", error);
      faviconInitFailed = true;
      return null;
    }
  })();

  return faviconInitPromise;
}

export function updateFaviconBadge(count: number) {
  initFavicon().then((faviconInstance) => {
    try {
      if (!faviconInstance) return;
      if (count > 0) {
        faviconInstance.badge(count > 99 ? 99 : count);
      } else {
        faviconInstance.reset();
      }
    } catch (error) {
      console.warn("Failed to update favicon badge:", error);
    }
  }).catch(() => {});
}

export function playNotificationSound() {
  const prefs = getNotificationPreferences();
  if (!prefs.sound) return;

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.value = 0.1;

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (error) {
    console.warn("Error playing notification sound:", error);
  }
}

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

export function saveNotificationPreferences(prefs: NotificationPreferences) {
  try {
    localStorage.setItem("notification-preferences", JSON.stringify(prefs));
  } catch (error) {
    console.warn("Error saving notification preferences:", error);
  }
}

export function isNotificationSupported(): boolean {
  return "Notification" in window;
}

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

export function areNotificationsGranted(): boolean {
  return isNotificationSupported() && Notification.permission === "granted";
}

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

    setTimeout(() => notification.close(), 5000);

    return notification;
  } catch (error) {
    console.error("Error showing browser notification:", error);
    return null;
  }
}

export function showMessageNotification(params: {
  channelName: string;
  senderName: string;
  messageContent: string;
  avatar?: string;
  isMention?: boolean;
  onClickChannel?: () => void;
}) {
  const { channelName, senderName, messageContent, avatar, isMention, onClickChannel } = params;

  if (isMention) {
    const prefs = getNotificationPreferences();
    if (prefs.mentionSound) {
      playNotificationSound();
      setTimeout(playNotificationSound, 200);
    }
  } else {
    playNotificationSound();
  }

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

export function isServiceWorkerSupported(): boolean {
  return "serviceWorker" in navigator;
}

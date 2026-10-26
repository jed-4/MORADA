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

/**
 * One AudioContext for the life of the tab.
 *
 * This used to construct a new one per notification and never close it. Each
 * context holds an audio thread and a hardware connection, so a chatty
 * afternoon left dozens open for the sake of a few 100ms beeps. Browsers have
 * historically capped how many a page may hold, though that limit did not
 * reproduce when tested here — so this is housekeeping rather than a fix for
 * an observed failure.
 */
let audioContext: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioContext) audioContext = new Ctor();
    // Browsers suspend a context created before the user interacted with the
    // page; resuming is a no-op when it is already running.
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * One note of the notification sound.
 *
 * What changed is the SHAPE, and it is a judgement about how an alert should
 * sound rather than a bug fix. The old one was a bare 800Hz sine held at a
 * flat 0.1 for exactly 100ms: shrill, loud, and ending as abruptly as it
 * began. Worth saying plainly — it was not producing a click. 800Hz over 0.1s
 * is exactly 80 cycles, so it started and ended on zero crossings, and a
 * spectral check found no splatter to speak of. It simply sounds like an
 * alarm.
 *
 * This is lower, quieter, and decays instead of stopping, which is what makes
 * a notification read as a nudge rather than a warning.
 *
 * Ramps to 0.0001 rather than 0 because exponentialRampToValueAtTime cannot
 * reach zero; the stop() a moment later takes it the rest of the way.
 */
function playTone(ctx: AudioContext, freq: number, startAt: number, duration = 0.11) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = "sine";
  oscillator.frequency.value = freq;

  const peak = 0.06; // quieter than the old 0.1 — it is a nudge, not an alarm
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(peak, startAt + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

/**
 * A new message. One soft note, well below the old 800Hz sine.
 */
export function playNotificationSound() {
  const prefs = getNotificationPreferences();
  if (!prefs.sound) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    playTone(ctx, 660, ctx.currentTime);
  } catch (error) {
    console.warn("Error playing notification sound:", error);
  }
}

/**
 * A mention. Two notes rising a fourth, as one gesture.
 *
 * It used to be the same beep twice, 200ms apart via setTimeout — which reads
 * as the alert misfiring rather than as a different kind of alert.
 */
export function playMentionSound() {
  const prefs = getNotificationPreferences();
  if (!prefs.sound) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    playTone(ctx, 660, now);
    playTone(ctx, 880, now + 0.1);
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
      playMentionSound();
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

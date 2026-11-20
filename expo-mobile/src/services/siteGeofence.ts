/**
 * Arriving on site (#46) — the phone side.
 *
 * Imported FIRST from App.tsx so TaskManager.defineTask runs at module load:
 * iOS can relaunch the app in the background just to deliver a fence event,
 * and the task must be defined before anything else (the React tree may not
 * mount at all in that launch).
 *
 * What it does, and only this:
 *  - watches up to 20 job-site fences (iOS region monitoring — no continuous
 *    background location, no trail of positions)
 *  - on arrive/leave, tells the server (a site-visit row — never a timesheet)
 *  - then, in working hours and at most once per site per day, posts a local
 *    notification asking the person whether to clock in / out / switch.
 *    It NEVER clocks anyone in or out by itself.
 *
 * Opt-in per person (Settings → Arriving on site). The company can switch the
 * whole feature off on the web; the fence list then comes back empty and
 * monitoring stops.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import { apiFetch, apiRequest, getSessionId, loadSession, isPermanentError } from './api';
import { addToQueue } from './offlineQueue';
import {
  alreadyPrompted, arrivalPrompt, leavePrompt, markPrompted, partsInTz, regionsFor,
  isWithinWorkingHours, type PromptedMap, type SiteFencesResponse, type SitePrompt,
} from '../lib/siteGeofence';

export const GEOFENCE_TASK = 'morada-site-geofence';
const OPT_IN_KEY = 'morada_geofence_opt_in';
const FENCES_KEY = 'morada_geofence_fences';
const PROMPTED_KEY = 'morada_geofence_prompted';

// ── Background task ──────────────────────────────────────────────────────────

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<any>) => {
  if (error) {
    console.warn('[Geofence] task error', error.message);
    return;
  }
  const { eventType, region } = (data || {}) as { eventType?: Location.GeofencingEventType; region?: Location.LocationRegion };
  if (!region?.identifier) return;
  try {
    if (eventType === Location.GeofencingEventType.Enter) await handleFenceEvent('arrive', region.identifier);
    else if (eventType === Location.GeofencingEventType.Exit) await handleFenceEvent('leave', region.identifier);
  } catch (err) {
    console.warn('[Geofence] event failed', err);
  }
});

// ── Opt-in ───────────────────────────────────────────────────────────────────

export async function isGeofenceOptedIn(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OPT_IN_KEY)) === '1';
  } catch {
    return false;
  }
}

export type AlwaysStatus = 'granted' | 'when-in-use-only' | 'denied';

export async function locationPermissionStatus(): Promise<AlwaysStatus> {
  const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (!fg?.granted) return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
  return bg?.granted ? 'granted' : 'when-in-use-only';
}

/**
 * Switch it on: When-In-Use first, then Always (iOS only offers Always after
 * When-In-Use). Returns what was granted; the setting stays on either way so
 * the Settings screen can show "turn on Always in iPhone Settings".
 */
export async function enableGeofence(): Promise<AlwaysStatus> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  await AsyncStorage.setItem(OPT_IN_KEY, '1');
  await Location.requestBackgroundPermissionsAsync().catch(() => null);
  const status = await locationPermissionStatus();
  await refreshSiteFences().catch(() => {});
  return status;
}

export async function disableGeofence(): Promise<void> {
  await AsyncStorage.setItem(OPT_IN_KEY, '0');
  await stopMonitoring();
  await AsyncStorage.removeItem(FENCES_KEY).catch(() => {});
}

async function stopMonitoring() {
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch {
    // not started
  }
}

// ── Fence list ───────────────────────────────────────────────────────────────

async function readCachedFences(): Promise<SiteFencesResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(FENCES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function ensureSession(): Promise<boolean> {
  if (getSessionId()) return true;
  await loadSession();
  return !!getSessionId();
}

let refreshInFlight: Promise<SiteFencesResponse | null> | null = null;

/**
 * Re-fetch the ranked fence list and re-register the regions. Called on app
 * open, after each fence event, and after clock-in/out. Safe to call often.
 */
export function refreshSiteFences(): Promise<SiteFencesResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<SiteFencesResponse | null> {
  if (!(await isGeofenceOptedIn())) {
    await stopMonitoring();
    return null;
  }
  if (!(await ensureSession())) return readCachedFences();

  // The last known position only ranks the list on the server; it is not stored.
  let query = '';
  try {
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
    if (pos) query = `?lat=${pos.coords.latitude.toFixed(4)}&lng=${pos.coords.longitude.toFixed(4)}`;
  } catch {
    // no position — server ranks without distance
  }

  let res: SiteFencesResponse;
  try {
    res = await apiFetch<SiteFencesResponse>(`/api/mobile/site-fences${query}`);
  } catch {
    return readCachedFences(); // offline: keep the regions already registered
  }
  await AsyncStorage.setItem(FENCES_KEY, JSON.stringify(res)).catch(() => {});

  const status = await locationPermissionStatus();
  if (!res.settings?.enabled || res.fences.length === 0 || status !== 'granted') {
    await stopMonitoring();
    return res;
  }
  try {
    // Starting again with the same task name replaces the region list.
    await Location.startGeofencingAsync(GEOFENCE_TASK, regionsFor(res.fences));
  } catch (err) {
    console.warn('[Geofence] could not start monitoring', err);
  }
  return res;
}

// ── Fence events ─────────────────────────────────────────────────────────────

async function recordVisit(kind: 'arrive' | 'leave', projectId: string, at: Date) {
  const payload = { projectId, at: at.toISOString(), clientRequestId: Crypto.randomUUID() };
  const type = kind === 'arrive' ? 'site-arrive' : 'site-leave';
  try {
    if (!(await ensureSession())) throw new Error('no session yet');
    await apiRequest(`/api/site-visits/${kind}`, 'POST', payload);
  } catch (err) {
    if (isPermanentError(err)) return; // rejected (e.g. job gone) — nothing to keep
    await addToQueue({ type, payload }).catch(() => {});
  }
}

async function readPrompted(): Promise<PromptedMap> {
  try {
    const raw = await AsyncStorage.getItem(PROMPTED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function handleFenceEvent(kind: 'arrive' | 'leave', projectId: string) {
  const at = new Date();
  const before = await readCachedFences();
  if (!before?.settings?.enabled) return;

  if (before.settings.storeVisits) await recordVisit(kind, projectId, at);

  // Fresh list: who's clocked in where right now, and the next 20 fences.
  const fresh = (await refreshSiteFences().catch(() => null)) || before;
  const settings = fresh.settings || before.settings;
  if (!settings.enabled) return;
  const fence = fresh.fences.find(f => f.projectId === projectId) || before.fences.find(f => f.projectId === projectId);
  if (!fence) return;

  if (!isWithinWorkingHours(at, settings, fresh.timezone)) return;
  const today = partsInTz(at, fresh.timezone).date;
  const prompted = await readPrompted();
  if (alreadyPrompted(prompted, kind, projectId, today)) return;

  const prompt = kind === 'arrive'
    ? arrivalPrompt(fence, fresh.activeTimesheet, fresh.fences)
    : leavePrompt(fence, fresh.activeTimesheet, at, fresh.timezone);
  if (!prompt) return;

  await postSitePrompt(prompt);
  await AsyncStorage.setItem(PROMPTED_KEY, JSON.stringify(markPrompted(prompted, kind, projectId, today))).catch(() => {});
}

async function postSitePrompt(p: SitePrompt) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: p.title,
      body: p.body,
      data: p.data,
      categoryIdentifier: p.category,
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    } as Notifications.NotificationContentInput,
    trigger: null,
  });
}

/**
 * Arriving on site (#46) — the pure rules the phone applies to a fence event.
 * No React Native imports, so it runs under `npx tsx` (siteGeofence.test.ts).
 *
 * Jed's rules (2026-11-19):
 *  - Notification only. Never an automatic clock-in.
 *  - Arrive: "You're at 12 Smith St — clock in?"  [Clock in] [Open diary]
 *  - Arrive at B while clocked in at A: "Switch from A to B?"  [Switch]
 *  - Leave while clocked in there: "Left 12 Smith St at 3:42pm — clock out?" [Clock out]
 *    (the clock-out time is the tap time; the text shows the leave time)
 *  - Prompts only in the company's working hours (default 5am–7pm, weekends
 *    off), at most one per site per day (arrive and leave counted separately).
 */

export interface GeofenceSettings {
  enabled: boolean;
  storeVisits: boolean;
  hoursStart: string; // HH:MM
  hoursEnd: string;   // HH:MM
  weekends: boolean;
}

export interface SiteFence {
  projectId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  reason?: string;
}

export interface ActiveTimesheetRef {
  id: string;
  projectId: string | null;
}

/** GET /api/mobile/site-fences */
export interface SiteFencesResponse {
  settings: GeofenceSettings;
  timezone: string;
  activeTimesheet: ActiveTimesheetRef | null;
  fences: SiteFence[];
}

export const MAX_REGIONS = 20;

/** Wall-clock parts in a timezone (falls back to device time if Intl can't). */
export function partsInTz(now: Date, tz?: string | null): { date: string; minutes: number; weekday: number } {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || undefined,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
    });
    const p: Record<string, string> = {};
    for (const part of f.formatToParts(now)) p[part.type] = part.value;
    const hour = Number(p.hour) % 24;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = days.indexOf(p.weekday);
    if (p.year && p.month && p.day && Number.isFinite(hour) && weekday >= 0) {
      return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute), weekday };
    }
  } catch {
    // fall through
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    minutes: now.getHours() * 60 + now.getMinutes(),
    weekday: now.getDay(),
  };
}

const toMinutes = (hhmm: string, fallback: number) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};

export function isWithinWorkingHours(now: Date, s: Pick<GeofenceSettings, 'hoursStart' | 'hoursEnd' | 'weekends'>, tz?: string | null): boolean {
  const { minutes, weekday } = partsInTz(now, tz);
  if (!s.weekends && (weekday === 0 || weekday === 6)) return false;
  const start = toMinutes(s.hoursStart, 5 * 60);
  const end = toMinutes(s.hoursEnd, 19 * 60);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** "3:42pm" */
export function formatTime12(now: Date, tz?: string | null): string {
  const { minutes } = partsInTz(now, tz);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}

export type PromptKind = 'arrive' | 'leave';
/** { "arrive:<projectId>": "2026-11-19" } — the day each prompt last went out. */
export type PromptedMap = Record<string, string>;

export function alreadyPrompted(map: PromptedMap, kind: PromptKind, projectId: string, today: string): boolean {
  return map[`${kind}:${projectId}`] === today;
}

/** Marks a prompt as sent today and drops entries from other days. */
export function markPrompted(map: PromptedMap, kind: PromptKind, projectId: string, today: string): PromptedMap {
  const next: PromptedMap = {};
  for (const [k, v] of Object.entries(map)) if (v === today) next[k] = v;
  next[`${kind}:${projectId}`] = today;
  return next;
}

export function siteLabel(f: Pick<SiteFence, 'name' | 'address'>): string {
  const addr = (f.address || '').split(',')[0].trim();
  return addr || f.name;
}

export type SiteCategory = 'site_arrival' | 'site_leave' | 'site_switch';

export interface SitePrompt {
  category: SiteCategory;
  title: string;
  body: string;
  data: Record<string, any>;
}

/** What to show when the phone arrives at `fence`. null = nothing. */
export function arrivalPrompt(fence: SiteFence, active: ActiveTimesheetRef | null, fences: SiteFence[]): SitePrompt | null {
  const here = siteLabel(fence);
  if (active && active.projectId === fence.projectId) return null; // already clocked in here
  if (active) {
    const from = fences.find(f => f.projectId === active.projectId);
    const fromLabel = from ? siteLabel(from) : 'your current job';
    return {
      category: 'site_switch',
      title: `You're at ${here}`,
      body: `Switch from ${fromLabel} to ${here}?`,
      data: { kind: 'site_switch', projectId: fence.projectId, projectName: fence.name, fromTimesheetId: active.id, fromProjectId: active.projectId },
    };
  }
  return {
    category: 'site_arrival',
    title: `You're at ${here} — clock in?`,
    body: fence.name,
    data: { kind: 'site_arrival', projectId: fence.projectId, projectName: fence.name },
  };
}

/** What to show when the phone leaves `fence`. Only when clocked in there. */
export function leavePrompt(fence: SiteFence, active: ActiveTimesheetRef | null, leftAt: Date, tz?: string | null): SitePrompt | null {
  if (!active || active.projectId !== fence.projectId) return null;
  const here = siteLabel(fence);
  return {
    category: 'site_leave',
    title: `Left ${here} at ${formatTime12(leftAt, tz)} — clock out?`,
    body: fence.name,
    data: { kind: 'site_leave', projectId: fence.projectId, projectName: fence.name, timesheetId: active.id, leftAt: leftAt.toISOString() },
  };
}

/** Regions for Location.startGeofencingAsync — at most 20 (the iOS limit). */
export function regionsFor(fences: SiteFence[]) {
  return fences.slice(0, MAX_REGIONS).map(f => ({
    identifier: f.projectId,
    latitude: f.latitude,
    longitude: f.longitude,
    radius: f.radiusM,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));
}

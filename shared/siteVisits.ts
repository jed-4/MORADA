/**
 * Arriving on site (#46) — the pure rules, shared by the routes and the tests.
 *
 * Jed's rules (2026-11-19):
 *  - The phone watches up to 20 job sites (iOS allows 20 regions per app).
 *  - Construction-phase jobs the person can access, ranked:
 *      1. the job they are clocked in to right now
 *      2. jobs with schedule items today
 *      3. jobs they clocked in to in the last 14 days
 *      4. everything else
 *    and by distance inside each group when the phone sent its position.
 *  - Fence radius: 150 m default, adjustable per job, clamped to 100–500 m here
 *    (the site-location editor allows a wider range for the map circle).
 *  - A visit's time comes from the device: never in the future, never more
 *    than 24 hours old (the same guard as clock-in tap time, #438).
 */

export const SITE_FENCE_DEFAULT_RADIUS_M = 150;
export const SITE_FENCE_MIN_RADIUS_M = 100;
export const SITE_FENCE_MAX_RADIUS_M = 500;
export const SITE_FENCE_MAX_COUNT = 20;
export const SITE_FENCE_RECENT_DAYS = 14;
export const SITE_VISIT_RETENTION_MONTHS = 12;
export const SITE_VISIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function clampFenceRadius(radiusM: number | null | undefined): number {
  const r = typeof radiusM === "number" && Number.isFinite(radiusM) ? radiusM : SITE_FENCE_DEFAULT_RADIUS_M;
  return Math.min(SITE_FENCE_MAX_RADIUS_M, Math.max(SITE_FENCE_MIN_RADIUS_M, Math.round(r)));
}

/** Great-circle distance in metres (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type SiteFenceReason = "clocked_in" | "scheduled_today" | "recent" | "nearby";

export interface SiteFenceCandidate {
  projectId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusM: number | null;
}

export interface SiteFence extends Omit<SiteFenceCandidate, "radiusM"> {
  radiusM: number;
  reason: SiteFenceReason;
  /** Metres from the phone, when it sent its position. */
  distanceM: number | null;
}

export interface SiteFenceRankContext {
  activeProjectId?: string | null;
  scheduledTodayIds?: Iterable<string>;
  recentProjectIds?: Iterable<string>;
  position?: { lat: number; lng: number } | null;
  limit?: number;
}

const REASON_ORDER: Record<SiteFenceReason, number> = { clocked_in: 0, scheduled_today: 1, recent: 2, nearby: 3 };

export function rankSiteFences(candidates: SiteFenceCandidate[], ctx: SiteFenceRankContext = {}): SiteFence[] {
  const scheduled = new Set(ctx.scheduledTodayIds ?? []);
  const recent = new Set(ctx.recentProjectIds ?? []);
  const pos = ctx.position ?? null;
  const limit = ctx.limit ?? SITE_FENCE_MAX_COUNT;
  const seen = new Set<string>();

  const fences: SiteFence[] = [];
  for (const c of candidates) {
    if (seen.has(c.projectId)) continue;
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) continue;
    seen.add(c.projectId);
    const reason: SiteFenceReason =
      ctx.activeProjectId && c.projectId === ctx.activeProjectId ? "clocked_in"
      : scheduled.has(c.projectId) ? "scheduled_today"
      : recent.has(c.projectId) ? "recent"
      : "nearby";
    fences.push({
      ...c,
      radiusM: clampFenceRadius(c.radiusM),
      reason,
      distanceM: pos ? Math.round(distanceMetres(pos, { lat: c.latitude, lng: c.longitude })) : null,
    });
  }

  fences.sort((a, b) => {
    const r = REASON_ORDER[a.reason] - REASON_ORDER[b.reason];
    if (r !== 0) return r;
    if (a.distanceM !== null && b.distanceM !== null && a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  return fences.slice(0, Math.max(0, limit));
}

export class StaleSiteVisitTimeError extends Error {
  constructor() {
    super("That site visit time is more than 24 hours old.");
    this.name = "StaleSiteVisitTimeError";
  }
}

/**
 * The time an arrive/leave really happened, from the device.
 *  - missing / unparseable → now
 *  - in the future (clock skew) → now
 *  - more than 24h in the past → StaleSiteVisitTimeError (the route answers 400;
 *    the phone's queue drops it rather than retrying for ever)
 */
export function resolveSiteVisitTime(raw: unknown, now: Date = new Date()): Date {
  if (typeof raw !== "string" || !raw.trim()) return now;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return now;
  if (now.getTime() - parsed.getTime() > SITE_VISIT_MAX_AGE_MS) throw new StaleSiteVisitTimeError();
  return parsed.getTime() > now.getTime() ? now : parsed;
}

/** The cut-off before which visits are deleted. */
export function siteVisitRetentionCutoff(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - SITE_VISIT_RETENTION_MONTHS);
  return d;
}

/** What the phone and the web need from company_settings. */
export interface GeofenceSettings {
  enabled: boolean;
  storeVisits: boolean;
  hoursStart: string;
  hoursEnd: string;
  weekends: boolean;
}

export function geofenceSettingsOf(s: Partial<{
  geofenceEnabled: boolean | null;
  geofenceStoreVisits: boolean | null;
  geofenceHoursStart: string | null;
  geofenceHoursEnd: string | null;
  geofenceWeekends: boolean | null;
}> | null | undefined): GeofenceSettings {
  return {
    enabled: s?.geofenceEnabled === true,
    storeVisits: s?.geofenceStoreVisits !== false,
    hoursStart: s?.geofenceHoursStart || "05:00",
    hoursEnd: s?.geofenceHoursEnd || "19:00",
    weekends: s?.geofenceWeekends === true,
  };
}

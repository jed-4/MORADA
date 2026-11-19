/**
 * Arriving on site (#46): fence ranking, radius clamp, visit time bounds.
 *
 * Run with:  npx tsx server/__tests__/site-visits.test.ts
 */
import assert from "node:assert";
import {
  rankSiteFences,
  clampFenceRadius,
  distanceMetres,
  resolveSiteVisitTime,
  StaleSiteVisitTimeError,
  siteVisitRetentionCutoff,
  geofenceSettingsOf,
  SITE_FENCE_MAX_COUNT,
  type SiteFenceCandidate,
} from "../../shared/siteVisits";

// ── Radius clamp: 150 default, 100–500 ───────────────────────────────────────
assert.equal(clampFenceRadius(null), 150);
assert.equal(clampFenceRadius(undefined), 150);
assert.equal(clampFenceRadius(20), 100);
assert.equal(clampFenceRadius(5000), 500);
assert.equal(clampFenceRadius(250), 250);
assert.equal(clampFenceRadius(Number.NaN), 150);

// ── Distance sanity: ~111 km per degree of latitude ──────────────────────────
const d = distanceMetres({ lat: -33.0, lng: 151.0 }, { lat: -34.0, lng: 151.0 });
assert.ok(Math.abs(d - 111_195) < 200, `1 degree of latitude was ${d}`);
assert.equal(distanceMetres({ lat: -33.8, lng: 151.2 }, { lat: -33.8, lng: 151.2 }), 0);

// ── Ranking ──────────────────────────────────────────────────────────────────
const here = { lat: -33.87, lng: 151.21 };
const job = (id: string, dLat: number, radiusM: number | null = null): SiteFenceCandidate => ({
  projectId: id, name: `Job ${id}`, address: null, latitude: here.lat + dLat, longitude: here.lng, radiusM,
});
const candidates = [
  job("far-recent", 0.05),
  job("near", 0.001),
  job("mid", 0.01),
  job("scheduled-far", 0.2),
  job("scheduled-near", 0.02),
  job("active", 0.5),
];
const ranked = rankSiteFences(candidates, {
  activeProjectId: "active",
  scheduledTodayIds: ["scheduled-far", "scheduled-near"],
  recentProjectIds: ["far-recent", "active"],
  position: here,
});
assert.deepEqual(ranked.map((f) => f.projectId), [
  "active",                         // clocked in beats everything, even far away
  "scheduled-near", "scheduled-far", // scheduled today, nearest first
  "far-recent",                     // clocked into in the last 14 days
  "near", "mid",                    // then distance
]);
assert.deepEqual(ranked.map((f) => f.reason), ["clocked_in", "scheduled_today", "scheduled_today", "recent", "nearby", "nearby"]);
assert.ok(ranked.every((f) => f.radiusM === 150));
assert.ok(ranked[4].distanceM! < ranked[5].distanceM!);

// Without a position: groups still hold, then by name; distance is null.
const noPos = rankSiteFences(candidates, { recentProjectIds: ["mid"] });
assert.equal(noPos[0].projectId, "mid");
assert.ok(noPos.every((f) => f.distanceM === null));

// At most 20, closest kept.
const many = Array.from({ length: 30 }, (_, i) => job(`j${i}`, (30 - i) * 0.001));
const top = rankSiteFences(many, { position: here });
assert.equal(top.length, SITE_FENCE_MAX_COUNT);
assert.equal(top[0].projectId, "j29");
assert.ok(!top.some((f) => f.projectId === "j0"));

// Duplicates and bad coordinates are dropped.
const messy = rankSiteFences([job("a", 0), job("a", 0), { ...job("b", 0), latitude: Number.NaN }]);
assert.deepEqual(messy.map((f) => f.projectId), ["a"]);

// Per-job radius is clamped.
assert.equal(rankSiteFences([job("big", 0, 2000)])[0].radiusM, 500);

// ── Visit time bounds ────────────────────────────────────────────────────────
const now = new Date("2026-11-19T08:00:00.000Z");
assert.equal(resolveSiteVisitTime(undefined, now).getTime(), now.getTime());
assert.equal(resolveSiteVisitTime("nonsense", now).getTime(), now.getTime());
const earlier = new Date(now.getTime() - 3 * 3600_000);
assert.equal(resolveSiteVisitTime(earlier.toISOString(), now).getTime(), earlier.getTime());
// Future (clock skew) → now
assert.equal(resolveSiteVisitTime(new Date(now.getTime() + 600_000).toISOString(), now).getTime(), now.getTime());
// Exactly 24h is fine; older is rejected
assert.equal(resolveSiteVisitTime(new Date(now.getTime() - 24 * 3600_000).toISOString(), now).getTime(), now.getTime() - 24 * 3600_000);
assert.throws(() => resolveSiteVisitTime(new Date(now.getTime() - 24 * 3600_000 - 1000).toISOString(), now), StaleSiteVisitTimeError);

// ── Retention: 12 months ─────────────────────────────────────────────────────
assert.equal(siteVisitRetentionCutoff(now).toISOString(), "2025-11-19T08:00:00.000Z");

// ── Settings defaults: feature OFF, storing ON, 5am–7pm, weekends off ────────
assert.deepEqual(geofenceSettingsOf(null), { enabled: false, storeVisits: true, hoursStart: "05:00", hoursEnd: "19:00", weekends: false });
assert.equal(geofenceSettingsOf({ geofenceEnabled: true, geofenceStoreVisits: false }).storeVisits, false);

console.log("site-visits: all assertions passed");

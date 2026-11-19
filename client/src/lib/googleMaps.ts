/**
 * Google Maps JavaScript API — one loader for the whole app.
 *
 * Why a script tag and not @googlemaps/js-api-loader: the package isn't in the
 * repo, and all it would do for us is inject this same <script> once. Google's
 * documented "dynamic library import" bootstrap is a script URL with a callback;
 * we load it exactly once per page and share the promise.
 *
 * Why classic google.maps.Marker and not AdvancedMarkerElement: advanced
 * markers need a Map ID, which is extra Cloud Console setup per environment.
 * Classic markers work with just an API key. Google has deprecated (not
 * removed) them and logs a console warning; switching later is a contained
 * change inside the map components here.
 *
 * Geocoding runs in the browser through the Maps JS Geocoder (enable the
 * "Geocoding API" on the same key). That means no second, server-side key and
 * no extra outbound traffic from the server — the browser key's referrer
 * restriction already covers it.
 *
 * The API key comes from GET /api/maps/config (runtime env GOOGLE_MAPS_API_KEY),
 * so it can be set or rotated in Replit Secrets without a rebuild. A null key
 * means "not set up yet": every map renders <MapNotSetUp/> instead.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// The Maps JS API ships no types in this repo (@types/google.maps isn't
// installed). The surface we touch is small; keep it loosely typed here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GoogleMapsNs = any;

export interface MapsConfig {
  apiKey: string | null;
}

export const MAPS_CONFIG_KEY = ["/api/maps/config"] as const;

export function useMapsConfig() {
  return useQuery<MapsConfig>({ queryKey: MAPS_CONFIG_KEY });
}

let loadPromise: Promise<GoogleMapsNs> | null = null;
let loadedKey: string | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNs> {
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (loadPromise && loadedKey === apiKey) return loadPromise;

  loadedKey = apiKey;
  loadPromise = new Promise((resolve, reject) => {
    const cb = "__moradaGoogleMapsReady";
    w[cb] = () => {
      delete w[cb];
      resolve(w.google.maps);
    };
    // Google calls this on an invalid/unauthorised key (referrer not allowed,
    // API not enabled, billing off). The map itself then shows Google's own
    // grey "Oops" panel; we surface a readable error too.
    w.gm_authFailure = () => {
      console.error("[maps] Google Maps rejected the API key — check its referrer and API restrictions and that billing is on.");
    };
    const s = document.createElement("script");
    s.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&region=AU&callback=${cb}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loadPromise = null;
      reject(new Error("Couldn't load Google Maps (blocked or offline)."));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}

/** Address → coordinates via the Maps JS Geocoder. null = no match. */
export async function geocodeAddress(
  apiKey: string,
  address: string,
): Promise<{ lat: number; lng: number; formatted: string } | null> {
  const query = address.trim();
  if (!query) return null;
  const maps = await loadGoogleMaps(apiKey);
  const geocoder = new maps.Geocoder();
  try {
    const { results } = await geocoder.geocode({ address: query, region: "AU" });
    const first = results?.[0];
    if (!first) return null;
    const loc = first.geometry.location;
    return { lat: loc.lat(), lng: loc.lng(), formatted: first.formatted_address };
  } catch (err: any) {
    // ZERO_RESULTS is an ordinary "couldn't find that address".
    if (String(err?.code ?? err?.message ?? "").includes("ZERO_RESULTS")) return null;
    throw err;
  }
}

export function mapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** A coloured pin for classic markers — SVG path symbol, no image hosting. */
export function pinIcon(maps: GoogleMapsNs, color: string | null | undefined) {
  return {
    path: "M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z",
    fillColor: color || "#87749A",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 1.5,
    scale: 1.5,
    anchor: new maps.Point(12, 24),
    labelOrigin: new maps.Point(12, 9),
  };
}

/** Server shape of GET/PUT /api/projects/:id/site-location. */
export interface SiteLocation {
  projectId: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  source: "pin" | "on_site" | "geocoded" | null;
  setAt: string | null;
  setById: string | null;
  setByName: string | null;
  address: string | null;
}

export const siteLocationKey = (projectId: string) => ["/api/projects", projectId, "site-location"] as const;

export const SOURCE_LABEL: Record<string, string> = {
  pin: "Pin dropped",
  on_site: "Captured on site",
  geocoded: "From the address",
};

export interface SiteLocationPutResult {
  skipped: boolean;
  location: SiteLocation;
}

export async function putSiteLocation(projectId: string, body: Record<string, unknown>): Promise<SiteLocationPutResult> {
  const result = (await apiRequest(`/api/projects/${projectId}/site-location`, "PUT", body)) as SiteLocationPutResult;
  queryClient.setQueryData(siteLocationKey(projectId), result.location);
  // The Job map reads coordinates off the project list.
  queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
  return result;
}

/**
 * Geocode a project's address and save it as source 'geocoded'. The server
 * refuses to replace a pin / on-site point unless replaceManual is set, so
 * this is safe to call automatically (address save, Job map backfill).
 * Returns "saved" | "kept-manual" | "not-found".
 */
export async function geocodeAndSaveProject(
  apiKey: string,
  projectId: string,
  address: string,
  replaceManual = false,
): Promise<"saved" | "kept-manual" | "not-found"> {
  const hit = await geocodeAddress(apiKey, address);
  if (!hit) return "not-found";
  const res = await putSiteLocation(projectId, {
    latitude: hit.lat,
    longitude: hit.lng,
    source: "geocoded",
    replaceManual,
  });
  return res.skipped ? "kept-manual" : "saved";
}

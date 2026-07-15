/**
 * Site weather for the mobile dashboard.
 *
 * Geocodes a project's street address and fetches today's forecast via the
 * free Open-Meteo APIs (no API key). Results are cached in-memory per project
 * for 30 minutes so the dashboard can poll freely without hammering the API.
 */

export interface SiteWeather {
  tempMax: number;
  tempMin: number;
  description: string;
  iconKey: string;
  precipChance: number;
  /** First hour today (0-23, site-local) with >=50% rain probability, else null. */
  rainFromHour: number | null;
  locationName: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  data: SiteWeather;
  ts: number;
}

const weatherCache = new Map<string, CacheEntry>();

/** Map a WMO weather code to a short description + icon key. */
function describeWeatherCode(code: number): { description: string; iconKey: string } {
  if (code === 0) return { description: "Clear", iconKey: "clear" };
  if (code === 1) return { description: "Mostly clear", iconKey: "clear" };
  if (code === 2) return { description: "Partly cloudy", iconKey: "partly-cloudy" };
  if (code === 3) return { description: "Overcast", iconKey: "cloudy" };
  if (code === 45 || code === 48) return { description: "Fog", iconKey: "fog" };
  if (code >= 51 && code <= 57) return { description: "Drizzle", iconKey: "rain" };
  if (code >= 61 && code <= 67) return { description: "Rain", iconKey: "rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { description: "Snow", iconKey: "snow" };
  }
  if (code >= 80 && code <= 82) return { description: "Showers", iconKey: "rain" };
  if (code >= 95) return { description: "Thunderstorm", iconKey: "thunderstorm" };
  return { description: "Cloudy", iconKey: "cloudy" };
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

/**
 * Geocode an address and fetch today's forecast. Throws on any geocode or
 * forecast failure (including an address that returns no geocoding results) —
 * the route maps that to a 502.
 */
async function fetchWeatherForAddress(address: string): Promise<SiteWeather> {
  const geo = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1`
  );
  const place = geo?.results?.[0];
  if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    throw new Error("Could not geocode address");
  }

  const forecast = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
      `&hourly=precipitation_probability&timezone=auto&forecast_days=1`
  );

  const daily = forecast?.daily;
  if (!daily || !Array.isArray(daily.temperature_2m_max) || daily.temperature_2m_max.length === 0) {
    throw new Error("No forecast data");
  }

  const { description, iconKey } = describeWeatherCode(Number(daily.weather_code?.[0] ?? 3));

  // First hour today (site-local, from now onwards) with >=50% rain chance.
  const utcOffsetSeconds = Number(forecast.utc_offset_seconds ?? 0);
  const siteNow = new Date(Date.now() + utcOffsetSeconds * 1000);
  const currentHour = siteNow.getUTCHours();
  let rainFromHour: number | null = null;
  const hourlyProbs: unknown[] = Array.isArray(forecast?.hourly?.precipitation_probability)
    ? forecast.hourly.precipitation_probability
    : [];
  for (let hour = currentHour; hour < hourlyProbs.length && hour < 24; hour++) {
    const prob = Number(hourlyProbs[hour]);
    if (Number.isFinite(prob) && prob >= 50) {
      rainFromHour = hour;
      break;
    }
  }

  return {
    tempMax: Math.round(Number(daily.temperature_2m_max[0])),
    tempMin: Math.round(Number(daily.temperature_2m_min[0])),
    description,
    iconKey,
    precipChance: Math.round(Number(daily.precipitation_probability_max?.[0] ?? 0)),
    rainFromHour,
    locationName: String(place.name || address),
  };
}

/** Fetch (or return cached) weather for a project's address. */
export async function getWeatherForProject(projectId: string, address: string): Promise<SiteWeather> {
  const cached = weatherCache.get(projectId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await fetchWeatherForAddress(address);
  weatherCache.set(projectId, { data, ts: Date.now() });
  return data;
}

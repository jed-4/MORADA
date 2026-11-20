import { useCallback, useRef } from 'react';
import { apiFetch } from '../../services/api';
import { isOnline } from '../../services/offlineQueue';
import { getCached, setCached } from '../../services/cache';

// Fill a NEW diary entry's weather fields from the project's forecast.
//
// Source: GET /api/weather?projectId= (server/services/weather.ts, Open-Meteo,
// cached 30 min server-side) — the same call the home screen's weather line
// makes, and the same in-memory cache key, so a diary opened after the home
// screen costs no extra request.
//
// Only template fields that read as weather are touched ("Weather",
// "Conditions", "Temperature"). A field the person has typed in is never
// overwritten; offline or no forecast leaves the fields blank.

export interface SiteWeather {
  tempMax: number;
  tempMin: number;
  description: string;
  iconKey: string;
  precipChance: number;
  rainFromHour: number | null;
  locationName: string;
}

interface FieldLike {
  id: string;
  title: string;
  type: string;
  options?: { label: string; value: string }[];
}

/** Fetch today's site weather for a project, or null (offline / no address / failure). */
export async function fetchSiteWeather(projectId: string): Promise<SiteWeather | null> {
  const cacheKey = `weather:${projectId}`;
  const cached = getCached<SiteWeather>(cacheKey);
  if (cached) return cached;
  try {
    if (!(await isOnline())) return null;
    const data = await apiFetch<SiteWeather>(`/api/weather?projectId=${encodeURIComponent(projectId)}`);
    if (!data || typeof data.description !== 'string') return null;
    setCached(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

// Titles like "Weather delays" or "Hours lost to rain" are about the weather's
// effect, not the forecast — leave those alone.
const NOT_FORECAST = /delay|impact|lost|hours|stop|day(s)? off|notes? on/i;
const WEATHER_TITLE = /weather|conditions/i;
const TEMP_TITLE = /temp/i;

// Words a select option might use for each forecast icon.
const OPTION_WORDS: Record<string, RegExp> = {
  clear: /clear|fine|sun/i,
  'partly-cloudy': /partly|part|mostly sun|cloud/i,
  cloudy: /cloud|overcast/i,
  fog: /fog|mist/i,
  rain: /rain|shower|wet|drizzle/i,
  snow: /snow|hail/i,
  thunderstorm: /storm|thunder/i,
};

const forecastText = (w: SiteWeather) =>
  `${w.description}, ${w.tempMin}–${w.tempMax}°C` +
  (w.precipChance > 0 ? `, ${w.precipChance}% chance of rain` : '');

/** The values to put in a template's weather-type fields. */
export function weatherFieldFills(fields: FieldLike[], w: SiteWeather): Record<string, string> {
  const fills: Record<string, string> = {};
  for (const f of fields) {
    if (NOT_FORECAST.test(f.title)) continue;
    if (WEATHER_TITLE.test(f.title)) {
      if (f.type === 'text' || f.type === 'textarea') {
        fills[f.id] = forecastText(w);
      } else if (f.type === 'select') {
        const opts = f.options || [];
        const desc = w.description.toLowerCase();
        const exact = opts.find(o => o.label.toLowerCase() === desc || o.value.toLowerCase() === desc);
        const words = OPTION_WORDS[w.iconKey];
        const loose = exact || (words ? opts.find(o => words.test(o.label) || words.test(o.value)) : undefined);
        if (loose) fills[f.id] = loose.value;
      }
    } else if (TEMP_TITLE.test(f.title)) {
      if (f.type === 'number') fills[f.id] = String(w.tempMax);
      else if (f.type === 'text') fills[f.id] = `${w.tempMin}–${w.tempMax}°C`;
    }
  }
  return fills;
}

type SetValues = (updater: (prev: Record<string, any>) => Record<string, any>) => void;

/**
 * `prefill(projectId, fields)` fetches the forecast and writes it into empty
 * weather fields. A value it wrote earlier counts as empty (so changing the
 * project swaps in that site's weather); anything the person typed is kept.
 * `cancel()` drops a request still in flight — call it when the form closes.
 */
export function useDiaryWeatherPrefill(setValues: SetValues) {
  const session = useRef(0);
  const autoFilled = useRef<Record<string, string>>({});

  const cancel = useCallback(() => {
    session.current++;
    autoFilled.current = {};
  }, []);

  const prefill = useCallback(async (projectId: string | undefined, fields: FieldLike[] | undefined) => {
    const mine = ++session.current;
    if (!projectId || !fields?.length) return;
    const w = await fetchSiteWeather(projectId);
    if (!w || mine !== session.current) return;
    const fills = weatherFieldFills(fields, w);
    if (!Object.keys(fills).length) return;
    setValues(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [id, value] of Object.entries(fills)) {
        const current = prev[id];
        const untouched =
          current === undefined || current === null || String(current).trim() === '' ||
          current === autoFilled.current[id];
        if (untouched && current !== value) {
          next[id] = value;
          changed = true;
        }
        if (untouched) autoFilled.current[id] = value;
      }
      return changed ? next : prev;
    });
  }, [setValues]);

  /**
   * The form values minus anything weather filled in by itself and nobody
   * has changed since — for the "Discard changes?" check, so an untouched
   * new entry doesn't ask just because the forecast arrived.
   */
  const withoutAutoFilled = useCallback(<V extends Record<string, unknown>>(values: V): V => {
    const out: Record<string, unknown> = { ...values };
    for (const [id, value] of Object.entries(autoFilled.current)) {
      if (out[id] === value) delete out[id];
    }
    return out as V;
  }, []);

  return { prefill, cancel, withoutAutoFilled };
}

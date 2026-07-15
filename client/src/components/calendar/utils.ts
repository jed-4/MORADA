import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import type { MoradaCalendarEvent } from "./types";

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/** Pixels per hour in the week view time grid. */
export const HOUR_HEIGHT = 48;

// ---------------------------------------------------------------------------
// Colour resolution — token names or hex, rendered as translucent tints
// (StatusBadge's pastel language; theme-aware because tokens flip in .dark).
// ---------------------------------------------------------------------------

const COLOR_TOKENS = new Set(["primary", "teal", "sage", "amber", "coral", "rose"]);

export interface EventColorStyle {
  /** Translucent tinted background. */
  bg: string;
  /** Chip text colour. */
  text: string;
  /** Slightly stronger tint for borders. */
  border: string;
  /** Full-strength colour for dots and accent bars. */
  solid: string;
}

export function resolveEventColor(color?: string | null): EventColorStyle {
  if (color) {
    const c = color.trim();
    if (COLOR_TOKENS.has(c)) {
      return {
        bg: `hsl(var(--${c}) / 0.16)`,
        text: `hsl(var(--${c}))`,
        border: `hsl(var(--${c}) / 0.35)`,
        solid: `hsl(var(--${c}))`,
      };
    }
    let hex: string | null = null;
    if (/^#[0-9a-fA-F]{6}$/.test(c)) hex = c;
    else if (/^#[0-9a-fA-F]{3}$/.test(c)) hex = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    if (hex) {
      return { bg: `${hex}20`, text: hex, border: `${hex}40`, solid: hex };
    }
  }
  return {
    bg: "hsl(var(--primary) / 0.16)",
    text: "hsl(var(--primary))",
    border: "hsl(var(--primary) / 0.35)",
    solid: "hsl(var(--primary))",
  };
}

// ---------------------------------------------------------------------------
// Event classification + day bucketing
// ---------------------------------------------------------------------------

export function minutesIntoDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function isMultiDay(event: MoradaCalendarEvent): boolean {
  return !!event.end && differenceInCalendarDays(event.end, event.start) >= 1;
}

/** Timed events render in the week-view time grid; everything else goes to the all-day lane. */
export function isTimed(event: MoradaCalendarEvent): boolean {
  if (event.allDay || isMultiDay(event)) return false;
  if (minutesIntoDay(event.start) !== 0) return true;
  return !!event.end && event.end.getTime() !== event.start.getTime();
}

/** Compact Notion-style time label: "9am", "9:30am". */
export function formatChipTime(d: Date): string {
  return format(d, d.getMinutes() === 0 ? "haaa" : "h:mmaaa");
}

export function formatEventTimeRange(event: MoradaCalendarEvent): string {
  if (event.allDay || !isTimed(event)) {
    if (isMultiDay(event) && event.end) {
      return `${format(event.start, "EEE d MMM")} – ${format(event.end, "EEE d MMM")}`;
    }
    return format(event.start, "EEEE, d MMMM yyyy");
  }
  const start = `${format(event.start, "EEE d MMM")}, ${formatChipTime(event.start)}`;
  return event.end ? `${start} – ${formatChipTime(event.end)}` : start;
}

function eventSortValue(event: MoradaCalendarEvent): number {
  // All-day / multi-day events first, then by start time.
  return isTimed(event) ? minutesIntoDay(event.start) : -1;
}

/** Bucket events into yyyy-MM-dd keys across [rangeStart, rangeEnd] (multi-day events repeat per day). */
export function bucketEventsByDay(
  events: MoradaCalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): Map<string, MoradaCalendarEvent[]> {
  const map = new Map<string, MoradaCalendarEvent[]>();
  const rs = startOfDay(rangeStart).getTime();
  const re = startOfDay(rangeEnd).getTime();

  for (const event of events) {
    const first = startOfDay(event.start);
    const rawLast = startOfDay(event.end ?? event.start);
    const last = rawLast.getTime() < first.getTime() ? first : rawLast;
    // Clamp iteration to the visible range (guards against runaway spans).
    let cursor = first.getTime() < rs ? new Date(rs) : first;
    const stop = Math.min(last.getTime(), re);
    while (cursor.getTime() <= stop) {
      const key = dayKey(cursor);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
      cursor = addDays(cursor, 1);
    }
  }

  map.forEach((bucket) => {
    bucket.sort(
      (a, b) => eventSortValue(a) - eventSortValue(b) || a.title.localeCompare(b.title),
    );
  });
  return map;
}

// ---------------------------------------------------------------------------
// Week view — timed event layout (side-by-side columns per overlap cluster)
// ---------------------------------------------------------------------------

export interface PositionedEvent {
  event: MoradaCalendarEvent;
  top: number;
  height: number;
  /** Percentage offsets within the day column. */
  left: number;
  width: number;
}

export function layoutTimedEvents(
  events: MoradaCalendarEvent[],
  hourHeight: number = HOUR_HEIGHT,
): PositionedEvent[] {
  const items = events
    .map((event) => {
      const startMin = minutesIntoDay(event.start);
      const endMin = event.end
        ? Math.max(minutesIntoDay(event.end), startMin + 15)
        : startMin + 60;
      return { event, startMin, endMin: Math.min(endMin, 24 * 60) };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const positioned: PositionedEvent[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    const cols = cluster.map((it) => {
      let col = colEnds.findIndex((end) => end <= it.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(it.endMin);
      } else {
        colEnds[col] = it.endMin;
      }
      return col;
    });
    const n = colEnds.length;
    cluster.forEach((it, i) => {
      positioned.push({
        event: it.event,
        top: (it.startMin / 60) * hourHeight,
        height: Math.max(((it.endMin - it.startMin) / 60) * hourHeight - 1, 18),
        left: cols[i] * (100 / n),
        width: 100 / n,
      });
    });
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return positioned;
}

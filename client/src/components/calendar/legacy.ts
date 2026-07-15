import { isSameDay } from "date-fns";
import type { CalendarEvent } from "@/components/EnhancedCalendar";
import type { MoradaCalendarEvent, MoradaCalendarView } from "./types";

/**
 * Bridging helpers for pages migrating from EnhancedCalendar's event shape
 * (separate date + "HH:mm" time strings) onto the MoradaCalendar event model.
 */

/** Map legacy calendar modes (including "day" from saved views) onto MoradaCalendar views. */
export function toMoradaView(mode: string | undefined | null): MoradaCalendarView {
  if (mode === "month") return "month";
  if (mode === "week") return "week";
  return "agenda";
}

/** Combine a calendar date with an optional "HH:mm" time string. */
export function combineDateTime(date: Date, time?: string | null): Date {
  const combined = new Date(date);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    combined.setHours(h || 0, m || 0, 0, 0);
  }
  return combined;
}

export interface ToMoradaEventOptions {
  /** Extra chip lines shown under the title in month/all-day chips. */
  lines?: string[];
  /** Suppress the time prefix on chips. */
  hideTime?: boolean;
}

/**
 * Convert an EnhancedCalendar-shaped event into a MoradaCalendarEvent.
 * The original event is preserved at `meta.original` so page click handlers
 * keep working unchanged.
 */
export function toMoradaEvent(event: CalendarEvent, options?: ToMoradaEventOptions): MoradaCalendarEvent {
  const timed = !!event.startTime;
  const start = combineDateTime(event.startDate, event.startTime);
  const multiDay = !isSameDay(event.startDate, event.endDate);

  let end: Date | undefined;
  if (timed && event.endTime) {
    end = combineDateTime(event.endDate, event.endTime);
  } else if (multiDay) {
    end = new Date(event.endDate);
  }

  return {
    id: event.id,
    title: event.title,
    start,
    end,
    allDay: !timed,
    color: event.color || event.projectColor,
    done: !!(
      event.isCompleted ||
      event.status === "done" ||
      event.status === "completed"
    ),
    meta: {
      original: event,
      projectName: event.projectName ?? undefined,
      assigneeName: event.assigneeName ?? undefined,
      status: event.status ?? undefined,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      ...(options?.lines?.length ? { lines: options.lines } : {}),
      ...(options?.hideTime ? { hideTime: true } : {}),
    },
  };
}

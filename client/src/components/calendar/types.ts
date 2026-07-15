import type { ReactNode } from "react";

/**
 * MoradaCalendar — the app-wide calendar component.
 *
 * Design reference: Notion Calendar. Minimal, quiet, precise — hairline
 * borders, muted uppercase weekday headers, events as soft token-tinted
 * lozenges (the StatusBadge pastel language), subtle filled circle on
 * today's numeral. Light + dark themes via Morada tokens only.
 */

export type MoradaCalendarView = "month" | "week" | "agenda";

export interface MoradaCalendarEvent {
  id: string;
  title: string;
  start: Date;
  /** Optional end. Multi-day events span cells in month view and render in the all-day lane in week view. */
  end?: Date;
  allDay?: boolean;
  /**
   * Token name ("primary" | "teal" | "sage" | "amber" | "coral" | "rose")
   * or a hex colour from field settings. Rendered with the translucent-tint
   * treatment (StatusBadge's colour language).
   */
  color?: string | null;
  /** Render the chip struck-through and faded (completed tasks). */
  done?: boolean;
  /**
   * Free-form payload, returned untouched in callbacks. The default chip and
   * hover popover understand a few well-known keys:
   * - `lines`: string[] — extra truncated lines under the title (month/all-day chips)
   * - `hideTime`: boolean — suppress the time prefix on the chip
   * - `projectName` / `assigneeName` / `status` / `location` / `description`
   *   — shown in the hover details popover when present
   */
  meta?: Record<string, unknown>;
}

export interface MoradaCalendarRange {
  start: Date;
  end: Date;
  view: MoradaCalendarView;
}

export interface MoradaCalendarProps {
  events: MoradaCalendarEvent[];
  /** Controlled view. Below the md breakpoint the calendar always renders agenda. */
  view?: MoradaCalendarView;
  defaultView?: MoradaCalendarView;
  onViewChange?: (view: MoradaCalendarView) => void;
  /** Controlled focus date. */
  date?: Date;
  defaultDate?: Date;
  onDateChange?: (date: Date) => void;
  onEventClick?: (event: MoradaCalendarEvent) => void;
  /** Month cell / agenda day header click. Week-view grid clicks include the clicked time of day. */
  onDateClick?: (date: Date) => void;
  /** Fired on mount and whenever the visible date range changes (navigation or view switch). */
  onRangeChange?: (range: MoradaCalendarRange) => void;
  /** Replace the default event chip. The wrapper still handles click + hover details. */
  renderEvent?: (event: MoradaCalendarEvent, ctx: { view: MoradaCalendarView }) => ReactNode;
  /**
   * Custom per-day cell content for month view — replaces the default event
   * chips inside the cell (the date numeral stays). Designed for later waves
   * (e.g. the timesheets week grid).
   */
  cellContent?: (date: Date, events: MoradaCalendarEvent[]) => ReactNode;
  /** Hide the built-in navigation header (pages with their own toolbars). */
  hideHeader?: boolean;
  className?: string;
}

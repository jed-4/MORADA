import { useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { generateNotionColors, TYPE_COLORS_HEX } from "@/lib/taskColors";
import type { CalendarEvent } from "@shared/calendarEvent";

const HOUR_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SCROLL_TO_HOUR = 7;
/** Anything without a Morada user owner lands here rather than being dropped. */
export const UNASSIGNED_COLUMN = "__unassigned__";

export interface PeopleDayPerson {
  id: string;
  name: string;
}

export interface PeopleDayLeave {
  userId: string;
  label: string;
  color: string | null;
  /** null when away all day; otherwise the half that is off. */
  halfDayPeriod: "am" | "pm" | null;
}

interface PeopleDayViewProps {
  date: Date;
  people: PeopleDayPerson[];
  events: CalendarEvent[];
  leave: PeopleDayLeave[];
  onEventClick?: (event: CalendarEvent) => void;
  onPersonClick?: (personId: string) => void;
}

const toMinutes = (time?: string | null) => {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
};

/**
 * One day, a column per person.
 *
 * The question this answers — "who is on what today" — is the one the business
 * calendar could not answer before, and the one Business → Schedule cannot answer
 * at day granularity either: its swimlanes group *schedule items by contact* over
 * weeks, which is subbies, not the team.
 *
 * Read-only by design (D6), which is why this is its own component rather than a
 * mode inside EnhancedCalendar: none of the drag, resize, drop-target or band-lane
 * machinery applies, and threading a people axis through all of it would have been
 * a large change to a component two other surfaces depend on.
 */
export function PeopleDayView({
  date,
  people,
  events,
  leave,
  onEventClick,
  onPersonClick,
}: PeopleDayViewProps) {
  const columns = useMemo(
    () => [...people, { id: UNASSIGNED_COLUMN, name: "Unassigned" }],
    [people],
  );

  /** Events on this day, bucketed by the column they belong in. */
  const byColumn = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const column of columns) map.set(column.id, []);

    for (const event of events) {
      // Multi-day spans count on every day they cover, not just their first.
      const covers =
        isSameDay(event.startDate, date) ||
        isSameDay(event.endDate, date) ||
        (event.startDate < date && event.endDate > date);
      if (!covers) continue;

      const owners = (event.assigneeIds ?? []).filter(id => map.has(id));
      if (owners.length === 0) {
        // A task assigned only to people who are filtered out of this view still
        // has to appear somewhere, so it falls to Unassigned rather than vanishing.
        map.get(UNASSIGNED_COLUMN)!.push(event);
      } else {
        // A task assigned to three people is on all three columns: it is one
        // commitment for each of them, and hiding it from two would misreport
        // their day.
        for (const owner of owners) map.get(owner)!.push(event);
      }
    }
    return map;
  }, [columns, events, date]);

  const leaveByUser = useMemo(() => {
    const map = new Map<string, PeopleDayLeave>();
    for (const entry of leave) map.set(entry.userId, entry);
    return map;
  }, [leave]);

  const renderEvent = (event: CalendarEvent, style?: React.CSSProperties) => {
    const colors = generateNotionColors(
      event.color || event.projectColor || TYPE_COLORS_HEX.task,
    );
    const done = event.isCompleted || event.status === "done" || event.status === "completed";
    return (
      <div
        key={event.id}
        role="button"
        tabIndex={0}
        data-testid={`people-event-${event.id}`}
        onClick={() => onEventClick?.(event)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEventClick?.(event); }
        }}
        className="cursor-pointer overflow-hidden rounded px-1.5 py-0.5 text-xs"
        style={{
          backgroundColor: colors.pastelBg,
          borderLeft: `2px solid ${colors.originalHex}`,
          color: colors.darkText,
          ...style,
        }}
        title={[event.title, event.projectName].filter(Boolean).join(" — ")}
      >
        <div className={cn("truncate font-medium leading-4", done && "line-through opacity-60")}>
          {event.title}
        </div>
        {event.startTime && (
          <div className="truncate text-2xs leading-3 opacity-70">{event.startTime}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="people-day-view">
      {/* Person headers */}
      <div className="flex shrink-0 border-b border-border">
        <div className="w-14 shrink-0" />
        {columns.map(column => {
          const count = byColumn.get(column.id)?.length ?? 0;
          const away = leaveByUser.get(column.id);
          return (
            <div
              key={column.id}
              className={cn(
                "min-w-0 flex-1 border-l border-border px-2 py-1.5 text-center first-of-type:border-l-0",
                onPersonClick && column.id !== UNASSIGNED_COLUMN && "cursor-pointer hover:bg-muted/50",
              )}
              onClick={() => column.id !== UNASSIGNED_COLUMN && onPersonClick?.(column.id)}
              data-testid={`people-column-header-${column.id}`}
              title={column.id !== UNASSIGNED_COLUMN ? `Open ${column.name}'s calendar` : undefined}
            >
              <div className="truncate text-xs font-medium">{column.name}</div>
              <div className="text-data text-muted-foreground">
                {away
                  ? `${away.label}${away.halfDayPeriod ? ` (${away.halfDayPeriod.toUpperCase()})` : ""}`
                  : count === 0
                    ? "nothing on"
                    : `${count} item${count === 1 ? "" : "s"}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day row — untimed work, above the grid rather than floating in it */}
      <div className="flex shrink-0 border-b border-border">
        <div className="flex w-14 shrink-0 items-center justify-center text-label uppercase text-muted-foreground">
          All day
        </div>
        {columns.map(column => {
          const untimed = (byColumn.get(column.id) ?? []).filter(e => !e.startTime);
          return (
            <div
              key={column.id}
              className="min-w-0 flex-1 space-y-0.5 border-l border-border p-1 first-of-type:border-l-0"
              data-testid={`people-allday-${column.id}`}
            >
              {untimed.map(e => renderEvent(e))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        ref={(el) => { if (el && el.scrollTop === 0) el.scrollTop = SCROLL_TO_HOUR * HOUR_HEIGHT; }}
      >
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="relative w-14 shrink-0">
            {HOURS.filter(h => h > 0).map(hour => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-data uppercase text-muted-foreground"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {format(new Date(2000, 0, 1, hour), "haaa")}
              </div>
            ))}
          </div>

          {columns.map(column => {
            const timed = (byColumn.get(column.id) ?? [])
              .filter(e => e.startTime)
              .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
            const away = leaveByUser.get(column.id);
            return (
              <div
                key={column.id}
                className="relative min-w-0 flex-1 border-l border-border first-of-type:border-l-0"
                data-testid={`people-column-${column.id}`}
              >
                {/* Away shades the column rather than drawing a chip — leave is a
                    state the whole day (or half of it) is in. */}
                {away && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-0"
                    style={{
                      top: away.halfDayPeriod === "pm" ? 12 * HOUR_HEIGHT : 0,
                      height: away.halfDayPeriod ? 12 * HOUR_HEIGHT : "100%",
                      backgroundColor: `${away.color ?? "#9B9B9B"}1f`,
                    }}
                    data-testid={`people-away-${column.id}`}
                  />
                )}
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: hour * HOUR_HEIGHT }}
                  />
                ))}
                {timed.map(event => {
                  const start = toMinutes(event.startTime) ?? 0;
                  const end = toMinutes(event.endTime) ?? start + 60;
                  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT - 2, 18);
                  return (
                    <div
                      key={event.id}
                      className="absolute inset-x-0.5 z-10"
                      style={{ top: (start / 60) * HOUR_HEIGHT, height }}
                    >
                      {renderEvent(event, { height: "100%" })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

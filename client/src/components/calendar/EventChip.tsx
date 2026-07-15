import type { ReactNode } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { MoradaCalendarEvent, MoradaCalendarView } from "./types";
import { formatChipTime, formatEventTimeRange, isTimed, resolveEventColor } from "./utils";

interface EventChipProps {
  event: MoradaCalendarEvent;
  view: MoradaCalendarView;
  /** "row" = single-line lozenge (month cells, all-day lane); "block" = absolutely-positioned week grid block. */
  variant: "row" | "block";
  onEventClick?: (event: MoradaCalendarEvent) => void;
  renderEvent?: (event: MoradaCalendarEvent, ctx: { view: MoradaCalendarView }) => ReactNode;
}

/** Hover popover body — quiet details card shared by chips and agenda rows. */
export function EventHoverDetails({ event }: { event: MoradaCalendarEvent }) {
  const colors = resolveEventColor(event.color);
  const meta = event.meta ?? {};
  const rows: Array<[string, string]> = [];
  if (typeof meta.projectName === "string" && meta.projectName) rows.push(["Project", meta.projectName]);
  if (typeof meta.assigneeName === "string" && meta.assigneeName) rows.push(["Assignee", meta.assigneeName]);
  if (typeof meta.status === "string" && meta.status)
    rows.push(["Status", meta.status.replace(/[_-]+/g, " ")]);
  if (typeof meta.location === "string" && meta.location) rows.push(["Location", meta.location]);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: colors.solid }}
        />
        <div className="min-w-0">
          <div className={cn("text-sm font-medium leading-snug", event.done && "line-through opacity-60")}>
            {event.title}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{formatEventTimeRange(event)}</div>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-2 text-xs">
              <span className="w-16 shrink-0 uppercase tracking-wide text-data text-muted-foreground">
                {label}
              </span>
              <span className="min-w-0 truncate capitalize">{value}</span>
            </div>
          ))}
        </div>
      )}
      {typeof (event.meta ?? {}).description === "string" && (event.meta as any).description && (
        <p className="line-clamp-3 border-t border-border pt-2 text-xs text-muted-foreground">
          {(event.meta as any).description}
        </p>
      )}
    </div>
  );
}

export function EventChip({ event, view, variant, onEventClick, renderEvent }: EventChipProps) {
  const colors = resolveEventColor(event.color);
  const timed = isTimed(event);
  const hideTime = event.meta?.hideTime === true;
  const lines = Array.isArray(event.meta?.lines)
    ? (event.meta!.lines as unknown[]).filter((l): l is string => typeof l === "string" && !!l)
    : [];

  const body = renderEvent ? (
    renderEvent(event, { view })
  ) : variant === "block" ? (
    <div
      className={cn(
        "h-full w-full overflow-hidden rounded px-1.5 py-0.5 text-xs",
        event.done && "opacity-60",
      )}
      style={{ backgroundColor: colors.bg, borderLeft: `2px solid ${colors.solid}` }}
    >
      <div
        className={cn("truncate font-medium leading-4", event.done && "line-through")}
        style={{ color: colors.text }}
      >
        {event.title}
      </div>
      {!hideTime && (
        <div className="truncate text-data leading-3 opacity-70" style={{ color: colors.text }}>
          {formatChipTime(event.start)}
          {event.end ? ` – ${formatChipTime(event.end)}` : ""}
        </div>
      )}
    </div>
  ) : (
    <div
      className={cn("w-full rounded px-1.5 py-px text-xs", event.done && "opacity-60")}
      style={{ backgroundColor: colors.bg }}
    >
      <div className="flex items-center gap-1 overflow-hidden">
        {timed && !hideTime && (
          <span
            className="shrink-0 text-data tabular-nums opacity-70"
            style={{ color: colors.text }}
          >
            {formatChipTime(event.start)}
          </span>
        )}
        <span
          className={cn("min-w-0 truncate font-medium leading-5", event.done && "line-through")}
          style={{ color: colors.text }}
        >
          {event.title}
        </span>
      </div>
      {lines.map((line, i) => (
        <div
          key={i}
          className="truncate text-data leading-3 opacity-70"
          style={{ color: colors.text }}
        >
          {line}
        </div>
      ))}
    </div>
  );

  return (
    <HoverCard openDelay={400} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          data-testid={`calendar-event-${event.id}`}
          className={cn(
            "cursor-pointer transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            variant === "block" ? "h-full w-full" : "block w-full",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onEventClick?.(event);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onEventClick?.(event);
            }
          }}
        >
          {body}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 p-3" side="top" align="start">
        <EventHoverDetails event={event} />
      </HoverCardContent>
    </HoverCard>
  );
}

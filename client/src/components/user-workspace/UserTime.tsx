import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Calendar, Timer, ChevronLeft, ChevronRight, AlarmClock, Briefcase, Tag, FileText, ExternalLink } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isToday, isSameDay, parseISO, getDay } from "date-fns";
import type { User, Timesheet, Project, CostCode } from "@shared/schema";
import { useTimezone, formatInTimezone } from "@/hooks/useTimezone";
import { useWeekStartDay } from "@/hooks/useWeekStartDay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface UserTimeProps {
  user: User;
  isOwnPage: boolean;
}

const CAL_START_HOUR = 5;
const CAL_END_HOUR = 22;
const HOUR_PX = 60;
const GUTTER_W = 44;
const TOTAL_HOURS = CAL_END_HOUR - CAL_START_HOUR;

function parseHHmm(t: string | null | undefined): number | null {
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  return hh + mm / 60;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function statusDotColor(status: string): string {
  if (status === "approved") return "#22c55e";
  if (status === "submitted") return "#f59e0b";
  if (status === "rejected") return "#ef4444";
  return "transparent";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "submitted": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "rejected": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-muted text-foreground dark:bg-gray-900/30 dark:text-muted";
  }
}

function getNetHours(ts: Timesheet): number {
  const dur = parseFloat(String(ts.duration || 0));
  const brk = parseFloat(String(ts.breakDuration || 0));
  return Math.max(dur - brk, 0);
}

/**
 * Given timed entries for a single day, compute { lane, totalLanes } for each.
 * Overlapping entries are placed side-by-side rather than stacked.
 */
function computeLanes(entries: Timesheet[]): Map<string, { lane: number; totalLanes: number }> {
  // Build intervals
  const intervals = entries.map(ts => {
    const start = parseHHmm(ts.startTime) ?? CAL_START_HOUR;
    let end = parseHHmm(ts.endTime);
    if (end === null) end = start + getNetHours(ts);
    return { id: ts.id as string, start, end: Math.max(end, start + 0.25) };
  });

  // Sort by start time
  intervals.sort((a, b) => a.start - b.start);

  const result = new Map<string, { lane: number; totalLanes: number }>();

  // Sweep through and find overlapping clusters
  let i = 0;
  while (i < intervals.length) {
    // Build a cluster of all intervals that overlap with the current window
    const cluster: typeof intervals = [intervals[i]];
    let clusterEnd = intervals[i].end;
    let j = i + 1;
    while (j < intervals.length && intervals[j].start < clusterEnd) {
      clusterEnd = Math.max(clusterEnd, intervals[j].end);
      cluster.push(intervals[j]);
      j++;
    }

    // Assign lanes greedily within cluster
    const laneTails: number[] = []; // end time of the last entry placed in each lane
    cluster.forEach(iv => {
      let assignedLane = -1;
      for (let l = 0; l < laneTails.length; l++) {
        if (iv.start >= laneTails[l]) {
          assignedLane = l;
          laneTails[l] = iv.end;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = laneTails.length;
        laneTails.push(iv.end);
      }
      result.set(iv.id, { lane: assignedLane, totalLanes: 0 }); // totalLanes filled below
    });

    const totalLanes = laneTails.length;
    cluster.forEach(iv => {
      const entry = result.get(iv.id)!;
      result.set(iv.id, { lane: entry.lane, totalLanes });
    });

    i = j;
  }

  return result;
}

export default function UserTime({ user, isOwnPage }: UserTimeProps) {
  const [viewType, setViewType] = useState<"table" | "weekly">("weekly");
  const weekStartDay = useWeekStartDay();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  const { effectiveTimezone } = useTimezone();
  const [selectedTimesheet, setSelectedTimesheet] = useState<any | null>(null);
  const [, navigate] = useLocation();

  const { data: timesheets = [], isLoading } = useQuery<Timesheet[]>({
    queryKey: ["/api/timesheets", { userId: user.id }],
    queryFn: async () => {
      const response = await fetch(`/api/timesheets?userId=${user.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch timesheets");
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: costCodes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: weekStartDay });
  const daysOfWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekTimesheets = useMemo(() => {
    return timesheets.filter(ts => {
      const dk = format(parseISO(ts.date), "yyyy-MM-dd");
      const startKey = format(weekStart, "yyyy-MM-dd");
      const endKey = format(weekEnd, "yyyy-MM-dd");
      return dk >= startKey && dk <= endKey;
    });
  }, [timesheets, weekStart, weekEnd]);

  const timedSheets = useMemo(() => weekTimesheets.filter(ts => ts.startTime), [weekTimesheets]);
  const untimedSheets = useMemo(() => weekTimesheets.filter(ts => !ts.startTime), [weekTimesheets]);

  const untimedByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    untimedSheets.forEach(ts => {
      const dk = format(parseISO(ts.date), "yyyy-MM-dd");
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push(ts);
    });
    return map;
  }, [untimedSheets]);

  const totalWeekHours = useMemo(() => {
    return weekTimesheets.reduce((sum, ts) => sum + parseFloat(String(ts.duration || 0)), 0);
  }, [weekTimesheets]);

  const getProjectName = (projectId: string | null) => {
    if (!projectId) return "Business";
    return projects.find(p => p.id === projectId)?.name || "Unknown Project";
  };

  const getProjectColor = (projectId: string | null): string | null => {
    if (!projectId) return null;
    const proj = projects.find(p => p.id === projectId);
    return proj?.color || null;
  };

  const getCostCodeLabel = (ts: Timesheet): string | null => {
    const codeId = ts.costCodeId;
    if (!codeId) return null;
    const cc = costCodes.find(c => c.id === codeId);
    if (!cc) return null;
    return cc.code ? `${cc.code} — ${cc.title}` : cc.title;
  };

  if (isLoading) {
    return (
      <div className="p-4" data-testid="user-time">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-pulse flex flex-col items-center gap-2">
              <div className="h-4 w-32 bg-muted rounded" />
              <div className="h-4 w-48 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="user-time">
      {/* Header Panel */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        {/* Row 1 - Title + week total */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            {isOwnPage ? "My Timesheets" : `${user.firstName}'s Timesheets`}
          </h2>
          {viewType === "weekly" && (
            <span className="text-xs text-muted-foreground">
              Week total: <span className="font-semibold text-foreground">{totalWeekHours.toFixed(1)}h</span>
            </span>
          )}
        </div>

        {/* Row 2 - View tabs + navigation */}
        <div className="h-8 flex items-center justify-between px-3">
          <div className="flex items-center gap-1" data-testid="tabs-time-views">
            {(["table", "weekly"] as const).map((view) => {
              const Icon = view === "table" ? Clock : Calendar;
              const isActive = viewType === view;
              const label = view === "weekly" ? "Calendar" : "List";
              return (
                <button
                  key={view}
                  onClick={() => setViewType(view)}
                  className={`relative h-7 px-2 text-xs flex items-center gap-1 transition-colors ${
                    isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-${view}`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{label}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Calendar week navigation */}
          {viewType === "weekly" && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekStart(subWeeks(weekStart, 1))}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-prev-week"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: weekStartDay }))}
                className="h-6 px-2 text-[10px] border rounded-md hover-elevate active-elevate-2"
                data-testid="button-today"
              >
                Today
              </button>
              <button
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-next-week"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              <span className="text-xs text-muted-foreground ml-1">
                {formatInTimezone(weekStart, effectiveTimezone, { month: "short", day: "numeric" })} – {formatInTimezone(weekEnd, effectiveTimezone, { month: "short", day: "numeric" })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
        {viewType === "weekly" ? (
          <div className="flex flex-col">
            {/* Sticky day headers */}
            <div className="sticky top-0 z-20 flex border-b-2 border-border bg-card">
              <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="border-r border-border flex-shrink-0" />
              {daysOfWeek.map(day => {
                const today = isToday(day);
                const flex = getDay(day) === 0 ? 0.5 : 1;
                return (
                  <div
                    key={day.toISOString()}
                    style={{ flex }}
                    className={`text-center py-1.5 border-r border-border last:border-r-0 text-[11px] font-medium min-w-0 ${
                      today ? "bg-blue-50 dark:bg-blue-900/20" : "bg-muted/30 dark:bg-muted/10"
                    }`}
                  >
                    <div className={today ? "text-status-info dark:text-blue-400" : "text-muted-foreground"}>
                      {format(day, "EEE")}
                    </div>
                    <div className={`text-[13px] font-semibold ${today ? "text-status-info dark:text-blue-400" : ""}`}>
                      {format(day, "d")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Untimed "all-day" strip */}
            {untimedSheets.length > 0 && (
              <div className="flex border-b border-border" style={{ minHeight: 28 }}>
                <div
                  style={{ width: GUTTER_W, minWidth: GUTTER_W }}
                  className="border-r border-border flex-shrink-0 flex items-center justify-end pr-1"
                >
                  <span className="text-[9px] text-muted-foreground/60">all day</span>
                </div>
                {daysOfWeek.map(day => {
                  const dk = format(day, "yyyy-MM-dd");
                  const dayEntries = untimedByDay.get(dk) || [];
                  const flex = getDay(day) === 0 ? 0.5 : 1;
                  return (
                    <div
                      key={dk}
                      style={{ flex }}
                      className="border-r border-border last:border-r-0 p-0.5 min-w-0"
                    >
                      {dayEntries.map(ts => {
                        const projColor = getProjectColor(ts.projectId);
                        const dotColor = statusDotColor(ts.status);
                        return (
                          <div
                            key={ts.id}
                            onClick={() => setSelectedTimesheet(ts)}
                            className="text-[9px] px-1 py-0.5 mb-0.5 rounded cursor-pointer truncate hover-elevate relative text-foreground"
                            style={projColor
                              ? { backgroundColor: hexToRgba(projColor, 0.15), borderLeft: `2px solid ${projColor}` }
                              : { backgroundColor: "hsl(var(--muted))", borderLeft: "2px solid hsl(var(--border))" }
                            }
                            title={`${getProjectName(ts.projectId)} · ${parseFloat(String(ts.duration || 0)).toFixed(1)}h`}
                          >
                            {dotColor !== "transparent" && (
                              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: dotColor }} />
                            )}
                            <span className="font-semibold">{getProjectName(ts.projectId)}</span>
                            <span className="opacity-60 ml-1">{parseFloat(String(ts.duration || 0)).toFixed(1)}h</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Time grid */}
            <div className="flex" style={{ height: TOTAL_HOURS * HOUR_PX }}>
              {/* Hour labels */}
              <div style={{ width: GUTTER_W, minWidth: GUTTER_W }} className="relative select-none border-r border-border flex-shrink-0">
                {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                  const h = CAL_START_HOUR + i;
                  return (
                    <div
                      key={h}
                      className="absolute right-0 pr-1 text-[10px] text-muted-foreground leading-none"
                      style={{ top: i * HOUR_PX - 6 }}
                    >
                      {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
                    </div>
                  );
                })}
              </div>

              {/* Day columns */}
              {daysOfWeek.map(day => {
                const dk = format(day, "yyyy-MM-dd");
                const today = isToday(day);
                const dayTimed = timedSheets.filter(ts => format(parseISO(ts.date), "yyyy-MM-dd") === dk);
                const flex = getDay(day) === 0 ? 0.5 : 1;

                return (
                  <div
                    key={dk}
                    style={{ flex }}
                    className={`border-r border-border last:border-r-0 relative min-w-0 ${today ? "bg-blue-50/30 dark:bg-blue-900/10" : ""}`}
                  >
                    {/* Hour lines */}
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-border/40"
                        style={{ top: i * HOUR_PX }}
                      />
                    ))}
                    {/* Half-hour lines */}
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div
                        key={`h${i}`}
                        className="absolute left-0 right-0 border-t border-border/20"
                        style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                      />
                    ))}

                    {/* Timesheet blocks — with collision-aware lane placement */}
                    {(() => {
                      const lanes = computeLanes(dayTimed);
                      const INSET = 1;
                      return dayTimed.map(ts => {
                        const startDec = parseHHmm(ts.startTime);
                        if (startDec === null) return null;
                        let endDec = parseHHmm(ts.endTime);
                        if (endDec === null) endDec = startDec + getNetHours(ts);

                        const clampedStart = Math.max(startDec, CAL_START_HOUR);
                        const clampedEnd = Math.min(endDec, CAL_END_HOUR);
                        if (clampedEnd <= clampedStart) return null;

                        const top = (clampedStart - CAL_START_HOUR) * HOUR_PX;
                        const height = Math.max((clampedEnd - clampedStart) * HOUR_PX, 18);
                        const projColor = getProjectColor(ts.projectId);
                        const dotColor = statusDotColor(ts.status);

                        const laneInfo = lanes.get(ts.id) ?? { lane: 0, totalLanes: 1 };
                        const widthPct = 100 / laneInfo.totalLanes;
                        const leftPct = laneInfo.lane * widthPct;

                        return (
                          <div
                            key={ts.id}
                            onClick={() => setSelectedTimesheet(ts)}
                            className="absolute rounded text-[9px] px-1 py-0.5 cursor-pointer overflow-hidden hover-elevate text-foreground"
                            style={projColor ? {
                              top,
                              height,
                              left: `calc(${leftPct}% + ${INSET}px)`,
                              width: `calc(${widthPct}% - ${INSET * 2}px)`,
                              backgroundColor: hexToRgba(projColor, 0.15),
                              borderLeft: `3px solid ${projColor}`,
                            } : {
                              top,
                              height,
                              left: `calc(${leftPct}% + ${INSET}px)`,
                              width: `calc(${widthPct}% - ${INSET * 2}px)`,
                              backgroundColor: "hsl(var(--muted) / 0.6)",
                              borderLeft: "3px solid hsl(var(--border))",
                            }}
                            title={`${getProjectName(ts.projectId)}\n${ts.startTime}–${ts.endTime || ""} (${getNetHours(ts).toFixed(1)}h)`}
                          >
                            {dotColor !== "transparent" && (
                              <span
                                className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: dotColor }}
                              />
                            )}
                            <div className="font-semibold truncate leading-tight pr-2">
                              {getProjectName(ts.projectId)}
                            </div>
                            {height > 28 && (
                              <div className="truncate leading-tight opacity-60">
                                {ts.startTime} – {ts.endTime || ""}
                              </div>
                            )}
                            {height > 44 && getCostCodeLabel(ts) && (
                              <div className="truncate leading-tight opacity-50">
                                {getCostCodeLabel(ts)}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List / Table view */
          <ScrollArea className="h-full">
            {timesheets.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Timer className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No time entries found</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Project</th>
                    <th className="text-left p-2 font-medium">Cost Code</th>
                    <th className="text-left p-2 font-medium">Duration</th>
                    <th className="text-left p-2 font-medium">Description</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.slice(0, 50).map((ts) => {
                    const costCodeName = getCostCodeLabel(ts);
                    return (
                      <tr
                        key={ts.id}
                        className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedTimesheet(ts)}
                        data-testid={`row-timesheet-${ts.id}`}
                      >
                        <td className="p-2">{formatInTimezone(new Date(ts.date), effectiveTimezone, { year: "numeric", month: "short", day: "numeric" })}</td>
                        <td className="p-2">{getProjectName(ts.projectId)}</td>
                        <td className="p-2 text-muted-foreground">{costCodeName || <span className="text-muted-foreground/50">—</span>}</td>
                        <td className="p-2 font-medium">{parseFloat(String(ts.duration || 0)).toFixed(1)}h</td>
                        <td className="p-2 max-w-[160px] truncate text-muted-foreground">{ts.description || "—"}</td>
                        <td className="p-2">
                          <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(ts.status)}`}>
                            {ts.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ScrollArea>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selectedTimesheet} onOpenChange={(open) => { if (!open) setSelectedTimesheet(null); }}>
        <DialogContent className="max-w-md" data-testid="modal-timesheet-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Timer className="w-4 h-4" />
              Timesheet Entry
            </DialogTitle>
          </DialogHeader>
          {selectedTimesheet && (
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Date</div>
                  <div className="font-medium">
                    {formatInTimezone(new Date(selectedTimesheet.date), effectiveTimezone, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                <AlarmClock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-0.5">Time & Duration</div>
                  <div className="font-medium">{parseFloat(String(selectedTimesheet.duration || 0)).toFixed(2)} hours</div>
                  {(selectedTimesheet.startTime || selectedTimesheet.endTime) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {selectedTimesheet.startTime || "—"} → {selectedTimesheet.endTime || "—"}
                      {selectedTimesheet.breakDuration && parseFloat(String(selectedTimesheet.breakDuration)) > 0 && (
                        <span> (break: {parseFloat(String(selectedTimesheet.breakDuration)).toFixed(2)}h)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                <Briefcase className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Project</div>
                  <div className="font-medium">{getProjectName(selectedTimesheet.projectId)}</div>
                </div>
              </div>

              {getCostCodeLabel(selectedTimesheet) && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                  <Tag className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Cost Code</div>
                    <div className="font-medium">{getCostCodeLabel(selectedTimesheet)}</div>
                  </div>
                </div>
              )}

              {selectedTimesheet.description && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-md">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Description</div>
                    <div>{selectedTimesheet.description}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(selectedTimesheet.status)}`}>
                  {selectedTimesheet.status}
                </Badge>
              </div>

              {selectedTimesheet.status === "rejected" && selectedTimesheet.rejectionReason && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md text-xs text-status-danger dark:text-red-400">
                  <span className="font-medium">Rejection reason: </span>
                  {selectedTimesheet.rejectionReason}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedTimesheet(null);
                navigate("/timesheets");
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Go to Timesheets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Users, BarChart3, GanttChart } from "lucide-react";
import {
  format,
  addDays,
  addWeeks,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  differenceInDays,
  isSameDay,
  isWeekend,
  startOfDay,
} from "date-fns";

interface WorkloadItem {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  duration: number;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedToColor: string | null;
  progressPercent: number;
  type: string;
  projectId: string;
  projectName: string;
  projectColor: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  color: string;
  items: WorkloadItem[];
}

const ROW_HEIGHT = 36;
const DAY_WIDTH = 44;
const PANEL_WIDTH = 200;

function generatePastelBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

interface CompanyWorkloadProps {
  onSwitchView?: () => void;
}

export default function CompanyWorkload({ onSwitchView }: CompanyWorkloadProps) {
  const [weekStartDay] = useState(1);
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  const [weeksToShow, setWeeksToShow] = useState(4);
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  const rangeEnd = useMemo(() => addWeeks(rangeStart, weeksToShow), [rangeStart, weeksToShow]);

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: addDays(rangeEnd, -1) }),
    [rangeStart, rangeEnd]
  );

  const workloadUrl = useMemo(() => {
    const params = new URLSearchParams({
      startDate: rangeStart.toISOString(),
      endDate: rangeEnd.toISOString(),
    });
    return `/api/schedule-items/workload?${params}`;
  }, [rangeStart, rangeEnd]);

  const { data: items = [], isLoading } = useQuery<WorkloadItem[]>({
    queryKey: [workloadUrl],
  });

  const { contactRows, unassignedRow } = useMemo(() => {
    const contactMap = new Map<string, ContactRow>();
    const unassigned: WorkloadItem[] = [];

    for (const item of items) {
      if (item.status === "completed" || item.status === "cancelled") continue;

      if (!item.assignedToId || !item.assignedToName) {
        unassigned.push(item);
        continue;
      }

      let row = contactMap.get(item.assignedToId);
      if (!row) {
        row = {
          id: item.assignedToId,
          name: item.assignedToName,
          color: item.assignedToColor || "#6b7280",
          items: [],
        };
        contactMap.set(item.assignedToId, row);
      }
      row.items.push(item);
    }

    const sorted = Array.from(contactMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    return {
      contactRows: sorted,
      unassignedRow: unassigned.length > 0 ? { id: "__unassigned__", name: "Unassigned", color: "#9ca3af", items: unassigned } : null,
    };
  }, [items]);

  const allRows = useMemo(() => {
    const rows = [...contactRows];
    if (unassignedRow) rows.push(unassignedRow);
    return rows;
  }, [contactRows, unassignedRow]);

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      let count = 0;
      for (const item of items) {
        if (item.status === "completed" || item.status === "cancelled") continue;
        const itemStart = startOfDay(new Date(item.startDate));
        const itemEnd = startOfDay(new Date(item.endDate));
        if (day >= itemStart && day <= itemEnd) count++;
      }
      totals.set(key, count);
    }
    return totals;
  }, [days, items]);

  const maxDailyTotal = useMemo(() => Math.max(1, ...Array.from(dailyTotals.values())), [dailyTotals]);

  const getItemsForDay = useCallback(
    (row: ContactRow, day: Date) => {
      return row.items.filter((item) => {
        const itemStart = startOfDay(new Date(item.startDate));
        const itemEnd = startOfDay(new Date(item.endDate));
        return day >= itemStart && day <= itemEnd;
      });
    },
    []
  );

  const handleSyncScroll = useCallback((e: any) => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.target.scrollTop;
    }
  }, []);

  const navigateRange = (direction: number) => {
    setRangeStart((prev) => addWeeks(prev, direction * weeksToShow));
  };

  const goToToday = () => {
    setRangeStart(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  };

  const totalWidth = days.length * DAY_WIDTH;
  const today = new Date();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading workload...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2">
          {onSwitchView && (
            <div className="flex items-center border rounded-md overflow-hidden mr-1">
              <button
                className="h-7 px-2.5 text-xs flex items-center gap-1.5 hover-elevate"
                onClick={onSwitchView}
              >
                <GanttChart className="w-3 h-3" />
                Projects
              </button>
              <button
                className="h-7 px-2.5 text-xs flex items-center gap-1.5 bg-primary text-primary-foreground"
              >
                <Users className="w-3 h-3" />
                Workload
              </button>
            </div>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {contactRows.length} trade{contactRows.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => navigateRange(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7 px-2">
            Today
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigateRange(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-1">
            {format(rangeStart, "d MMM")} – {format(addDays(rangeEnd, -1), "d MMM yyyy")}
          </span>
          <div className="flex items-center border rounded-md overflow-hidden ml-2">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                className={`h-7 px-2 text-xs ${weeksToShow === w ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
                onClick={() => setWeeksToShow(w)}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - contact names */}
        <div
          ref={leftPanelRef}
          className="flex-shrink-0 border-r border-border overflow-hidden"
          style={{ width: PANEL_WIDTH }}
        >
          {/* Summary header */}
          <div className="h-[56px] border-b border-border flex items-end px-2 pb-1">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Daily Load</span>
            </div>
          </div>

          {/* Contact rows */}
          {allRows.map((row) => (
            <div
              key={row.id}
              style={{ height: ROW_HEIGHT }}
              className="flex items-center px-2 gap-2 border-b border-border/30"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: row.color }}
              />
              <span className="text-xs font-medium truncate flex-1">
                {row.name}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {row.items.length}
              </span>
            </div>
          ))}

          {allRows.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground text-center">
              No schedule items in this range.
            </div>
          )}
        </div>

        {/* Right panel - Timeline grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Day headers with summary bars */}
          <div className="h-[56px] border-b border-border flex-shrink-0 overflow-hidden">
            <div
              className="h-full flex"
              style={{
                width: totalWidth,
                transform: `translateX(-${timelineRef.current?.scrollLeft || 0}px)`,
              }}
            >
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const count = dailyTotals.get(key) || 0;
                const barHeight = maxDailyTotal > 0 ? Math.round((count / maxDailyTotal) * 20) : 0;
                const isWkend = isWeekend(day);
                const isToday = isSameDay(day, today);

                return (
                  <div
                    key={key}
                    className={cn(
                      "flex flex-col items-center justify-end shrink-0 border-l border-border/20 pb-1",
                      isWkend && "bg-muted/30",
                      isToday && "bg-[#bba7db]/10"
                    )}
                    style={{ width: DAY_WIDTH }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="w-5 rounded-sm mb-0.5"
                          style={{
                            height: Math.max(barHeight, count > 0 ? 3 : 0),
                            backgroundColor: count > 0 ? (count > maxDailyTotal * 0.7 ? "#ef4444" : count > maxDailyTotal * 0.4 ? "#f59e0b" : "#22c55e") : "transparent",
                            opacity: isWkend ? 0.5 : 1,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {count} item{count !== 1 ? "s" : ""} on {format(day, "EEE d MMM")}
                      </TooltipContent>
                    </Tooltip>
                    <div className={cn("text-[9px]", isToday ? "font-bold text-[#bba7db]" : isWkend ? "text-muted-foreground/50" : "text-muted-foreground")}>
                      {format(day, "EEE")}
                    </div>
                    <div className={cn("text-[9px]", isToday ? "font-bold text-[#bba7db]" : isWkend ? "text-muted-foreground/50" : "text-muted-foreground")}>
                      {format(day, "d")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid body */}
          <div
            ref={timelineRef}
            className="flex-1 overflow-auto"
            onScroll={(e) => {
              handleSyncScroll(e);
              const headerEl = (e.target as HTMLElement).previousElementSibling?.querySelector("div") as HTMLElement;
              if (headerEl) {
                headerEl.style.transform = `translateX(-${(e.target as HTMLElement).scrollLeft}px)`;
              }
            }}
          >
            <div className="relative" style={{ width: totalWidth, minHeight: allRows.length * ROW_HEIGHT }}>
              {/* Today line */}
              {days.some((d) => isSameDay(d, today)) && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-10"
                  style={{ left: differenceInDays(today, rangeStart) * DAY_WIDTH + DAY_WIDTH / 2 }}
                />
              )}

              {/* Contact rows */}
              {allRows.map((row, rowIndex) => (
                <div
                  key={row.id}
                  className="relative border-b border-border/10"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Day cells background */}
                  {days.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const isWkend = isWeekend(day);
                    const isToday = isSameDay(day, today);
                    const dayItems = getItemsForDay(row, day);
                    const dayIdx = differenceInDays(day, rangeStart);

                    return (
                      <div
                        key={key}
                        className={cn(
                          "absolute top-0 h-full border-l border-border/10",
                          isWkend && "bg-muted/20",
                          isToday && "bg-[#bba7db]/5"
                        )}
                        style={{ left: dayIdx * DAY_WIDTH, width: DAY_WIDTH }}
                      >
                        {dayItems.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="absolute inset-1 flex flex-col justify-center gap-px overflow-hidden">
                                {dayItems.slice(0, 3).map((item) => (
                                  <div
                                    key={item.id}
                                    className="h-2 rounded-sm w-full"
                                    style={{
                                      backgroundColor: item.projectColor || row.color,
                                      opacity: 0.7,
                                    }}
                                  />
                                ))}
                                {dayItems.length > 3 && (
                                  <div className="text-[7px] text-center text-muted-foreground">
                                    +{dayItems.length - 3}
                                  </div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px]">
                              <div className="text-xs font-medium mb-1">{row.name} - {format(day, "EEE d MMM")}</div>
                              {dayItems.map((item) => (
                                <div key={item.id} className="flex items-center gap-1.5 py-0.5">
                                  <div
                                    className="w-2 h-2 rounded-sm shrink-0"
                                    style={{ backgroundColor: item.projectColor || "#6b7280" }}
                                  />
                                  <span className="text-[10px] truncate">{item.projectName}: {item.name}</span>
                                </div>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

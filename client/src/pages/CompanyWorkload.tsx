import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Users, BarChart3, GanttChart, Filter, Calendar, ExternalLink, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import {
  format,
  addDays,
  startOfWeek,
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
  scheduleCategory: string | null;
  teamId?: string | null;
  teamName?: string | null;
}

interface Team {
  id: string;
  name: string;
  color: string;
}

interface ContactRow {
  id: string;
  name: string;
  color: string;
  items: WorkloadItem[];
}

interface BarLayout {
  item: WorkloadItem;
  lane: number;
  leftPx: number;
  widthPx: number;
}

const BAR_HEIGHT = 20;
const BAR_GAP = 2;
const ROW_PADDING = 4;
const DAY_WIDTH = 44;
const WEEKEND_DAY_WIDTH = 22;
const PANEL_WIDTH = 200;
const NAV_STEP_DAYS = 7;
const MIN_ROW_HEIGHT = 36;
const OVERLOAD_THRESHOLD = 3;

function getDayWidth(day: Date): number {
  return isWeekend(day) ? WEEKEND_DAY_WIDTH : DAY_WIDTH;
}

function assignLanes(items: WorkloadItem[]): { layouts: BarLayout[]; laneCount: number } {
  const sorted = [...items].sort((a, b) => {
    const aStart = new Date(a.startDate).getTime();
    const bStart = new Date(b.startDate).getTime();
    if (aStart !== bStart) return aStart - bStart;
    return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
  });

  const lanes: { end: number }[] = [];
  const layouts: BarLayout[] = [];

  for (const item of sorted) {
    const itemStart = startOfDay(new Date(item.startDate)).getTime();
    const itemEnd = startOfDay(new Date(item.endDate)).getTime();

    let assignedLane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].end < itemStart) {
        assignedLane = i;
        break;
      }
    }

    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push({ end: itemEnd });
    } else {
      lanes[assignedLane].end = itemEnd;
    }

    layouts.push({
      item,
      lane: assignedLane,
      leftPx: 0,
      widthPx: 0,
    });
  }

  return { layouts, laneCount: Math.max(lanes.length, 1) };
}

interface CompanyWorkloadProps {
  onSwitchView?: () => void;
  className?: string;
}

export default function CompanyWorkload({ onSwitchView, className }: CompanyWorkloadProps) {
  const [, navigate] = useLocation();
  const [selectedItem, setSelectedItem] = useState<WorkloadItem | null>(null);
  const [weekStartDay] = useState(1);
  const [rangeStart, setRangeStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  const [windowWeeks, setWindowWeeks] = useState<2 | 4 | 6>(4);
  const [visibleDays, setVisibleDays] = useState(28);
  const [hiddenAssignees, setHiddenAssignees] = useState<Set<string>>(new Set());
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());
  const [hideUnassigned, setHideUnassigned] = useState(false);
  const [showBusiness, setShowBusiness] = useState(true);
  const [showSuppliers, setShowSuppliers] = useState(true);
  const [hidePreconstructionSchedule, setHidePreconstructionSchedule] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: user } = useQuery<any>({ queryKey: ["/api/user"] });

  const toggleRowExpanded = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const headerTimelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleDays(windowWeeks * 7);
  }, [windowWeeks]);

  const rangeEnd = useMemo(() => addDays(rangeStart, visibleDays), [rangeStart, visibleDays]);

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: addDays(rangeEnd, -1) }),
    [rangeStart, rangeEnd]
  );

  const workloadUrl = useMemo(() => {
    // Fetch a wide window (1 year back, 2 years forward) so all assigned items are included
    const fetchStart = addDays(new Date(), -365);
    const fetchEnd = addDays(new Date(), 730);
    const params = new URLSearchParams({
      startDate: fetchStart.toISOString(),
      endDate: fetchEnd.toISOString(),
    });
    return `/api/schedule-items/workload?${params}`;
  }, []);

  const { data: items = [], isLoading } = useQuery<WorkloadItem[]>({
    queryKey: [workloadUrl],
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const [hiddenTeams, setHiddenTeams] = useState<Set<string>>(new Set());

  const toggleTeam = useCallback((id: string) => {
    setHiddenTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const item of items) {
      const isLegacyCompany = item.assignedToId?.startsWith("company:");
      if (item.assignedToId && item.assignedToName && !isLegacyCompany) {
        if (!map.has(item.assignedToId)) {
          map.set(item.assignedToId, {
            id: item.assignedToId,
            name: item.assignedToName,
            color: item.assignedToColor || "#6b7280",
          });
        }
      } else if ((!item.assignedToId || isLegacyCompany) && item.assignedToName) {
        const bizKey = `biz:${item.assignedToName}`;
        if (!map.has(bizKey)) {
          map.set(bizKey, {
            id: bizKey,
            name: item.assignedToName,
            color: item.assignedToColor || "#6b7280",
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const allProjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const item of items) {
      if (!map.has(item.projectId)) {
        map.set(item.projectId, {
          id: item.projectId,
          name: item.projectName,
          color: item.projectColor || "#6b7280",
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const toggleAssignee = useCallback((id: string) => {
    setHiddenAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleProject = useCallback((id: string) => {
    setHiddenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const activeFilterCount = hiddenAssignees.size + hiddenProjects.size + (hideUnassigned ? 1 : 0) + (hidePreconstructionSchedule ? 1 : 0);

  const { companyRow, contactRows, unassignedRow } = useMemo(() => {
    const contactMap = new Map<string, ContactRow>();
    const unassigned: WorkloadItem[] = [];

    for (const item of items) {
      if (item.status === "completed" || item.status === "cancelled") continue;
      if (hiddenProjects.has(item.projectId)) continue;
      if (hidePreconstructionSchedule && item.scheduleCategory === "preconstruction") continue;

      // Only skip parent items when they are unassigned (assigned parent items are valid workload)
      if (item.type === "parent" && !item.assignedToId && !item.assignedToName) continue;

      if (!item.assignedToId && !item.assignedToName) {
        unassigned.push(item);
        continue;
      }

      // Legacy data: assignedToId may still contain "company:UUID" (before the server
      // was fixed to null it out). Treat those the same as null so they land in the company row.
      const isLegacyCompanyId = item.assignedToId?.startsWith("company:");
      const effectiveAssignedToId = isLegacyCompanyId ? null : item.assignedToId;
      const rowKey = effectiveAssignedToId || `biz:${item.assignedToName}`;

      if (hiddenAssignees.has(rowKey)) continue;

      let row = contactMap.get(rowKey);
      if (!row) {
        const fallbackName = item.assignedToName ||
          ((item as any).assignedToFirstName
            ? `${(item as any).assignedToFirstName} ${(item as any).assignedToLastName || ""}`.trim()
            : "Unknown");
        row = {
          id: rowKey,
          name: fallbackName,
          color: item.assignedToColor || "#6b7280",
          items: [],
        };
        contactMap.set(rowKey, row);
      }
      row.items.push(item);
    }

    // Separate company row (rowKey is "biz:CompanyName" when server nulls assignedToId) from supplier/people rows
    let companyRow: ContactRow | null = null;
    const supplierRows: ContactRow[] = [];
    for (const row of contactMap.values()) {
      if (row.id.startsWith("biz:")) {
        companyRow = row;
      } else {
        supplierRows.push(row);
      }
    }
    const sorted = supplierRows.sort((a, b) => a.name.localeCompare(b.name));
    return {
      companyRow,
      contactRows: sorted,
      unassignedRow: unassigned.length > 0 ? { id: "__unassigned__", name: "Unassigned", color: "#9ca3af", items: unassigned } : null,
    };
  }, [items, hiddenAssignees, hiddenProjects, hidePreconstructionSchedule]);

  // Business label: prefer the actual company name stored on the schedule items,
  // fall back to user's companyNickname from /api/user, then generic "Business"
  const businessLabel = companyRow?.name || user?.companyNickname || "Business";

  // Build team rows from items with teamId
  const teamRows = useMemo(() => {
    const teamMap = new Map<string, ContactRow>();
    for (const item of items) {
      if (!item.teamId || !item.teamName) continue;
      if (item.status === "completed" || item.status === "cancelled") continue;
      if (item.type === "parent") continue;
      if (hiddenProjects.has(item.projectId)) continue;
      if (hidePreconstructionSchedule && item.scheduleCategory === "preconstruction") continue;
      if (hiddenTeams.has(item.teamId)) continue;
      let row = teamMap.get(item.teamId);
      if (!row) {
        const team = teams.find((t) => t.id === item.teamId);
        row = { id: `team:${item.teamId}`, name: item.teamName, color: team?.color || "#6b7280", items: [] };
        teamMap.set(item.teamId, row);
      }
      row.items.push(item);
    }
    return Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, teams, hiddenTeams, hiddenProjects, hidePreconstructionSchedule]);

  const allRows = useMemo(() => {
    const rows: ContactRow[] = [];
    // Company row always at top (when visible)
    if (companyRow && showBusiness) rows.push(companyRow);
    // Supplier/people rows (teams + individual contacts)
    if (showSuppliers) rows.push(...teamRows, ...contactRows);
    // Unassigned at bottom
    if (unassignedRow && !hideUnassigned) rows.push(unassignedRow);
    return rows;
  }, [companyRow, teamRows, contactRows, unassignedRow, hideUnassigned, showBusiness, showSuppliers]);

  const dayOffsets = useMemo(() => {
    const offsets: number[] = [];
    let x = 0;
    for (const day of days) {
      offsets.push(x);
      x += getDayWidth(day);
    }
    return { offsets, totalWidth: x };
  }, [days]);

  const totalWidth = dayOffsets.totalWidth;

  const rowBarLayouts = useMemo(() => {
    const result = new Map<string, { layouts: BarLayout[]; laneCount: number; rowHeight: number }>();
    for (const row of allRows) {
      const { layouts, laneCount } = assignLanes(row.items);

      const rangeStartTime = startOfDay(rangeStart).getTime();
      const msPerDay = 86400000;
      const offsets = dayOffsets.offsets;
      const tw = dayOffsets.totalWidth;

      for (const layout of layouts) {
        const itemStart = startOfDay(new Date(layout.item.startDate));
        const itemEnd = startOfDay(new Date(layout.item.endDate));

        const startIdx = Math.round((itemStart.getTime() - rangeStartTime) / msPerDay);
        const endIdx = Math.round((itemEnd.getTime() - rangeStartTime) / msPerDay);

        const clampedStartIdx = Math.max(startIdx, 0);
        const clampedEndIdx = Math.min(endIdx, days.length - 1);

        const leftPx = clampedStartIdx < offsets.length ? offsets[clampedStartIdx] : tw;
        const rightPx = clampedEndIdx + 1 < offsets.length
          ? offsets[clampedEndIdx + 1]
          : (clampedEndIdx < offsets.length ? offsets[clampedEndIdx] + getDayWidth(days[clampedEndIdx]) : tw);

        layout.leftPx = leftPx;
        layout.widthPx = Math.max(rightPx - leftPx, 4);
      }

      const isExpanded = expandedRows.has(row.id);
      const effectiveRows = isExpanded ? row.items.length : laneCount;
      const rowHeight = Math.max(MIN_ROW_HEIGHT, effectiveRows * (BAR_HEIGHT + BAR_GAP) + ROW_PADDING * 2);
      result.set(row.id, { layouts, laneCount, rowHeight });
    }
    return result;
  }, [allRows, rangeStart, visibleDays, days, dayOffsets, expandedRows]);

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      let count = 0;
      for (const item of items) {
        if (item.status === "completed" || item.status === "cancelled") continue;
        if (hiddenProjects.has(item.projectId)) continue;
        const itemStart = startOfDay(new Date(item.startDate));
        const itemEnd = startOfDay(new Date(item.endDate));
        if (day >= itemStart && day <= itemEnd) count++;
      }
      totals.set(key, count);
    }
    return totals;
  }, [days, items, hiddenProjects]);

  const maxDailyTotal = useMemo(() => Math.max(1, ...Array.from(dailyTotals.values())), [dailyTotals]);

  const assigneeOverloads = useMemo(() => {
    const result = new Map<string, { isOverloaded: boolean; maxConcurrent: number; overloadedDays: Set<string> }>();
    for (const row of allRows) {
      const overloadedDays = new Set<string>();
      let maxConcurrent = 0;
      for (const day of days) {
        const dayStart = startOfDay(day);
        let count = 0;
        for (const item of row.items) {
          const itemStart = startOfDay(new Date(item.startDate));
          const itemEnd = startOfDay(new Date(item.endDate));
          if (dayStart >= itemStart && dayStart <= itemEnd) count++;
        }
        if (count > maxConcurrent) maxConcurrent = count;
        if (count >= OVERLOAD_THRESHOLD) {
          overloadedDays.add(format(day, "yyyy-MM-dd"));
        }
      }
      result.set(row.id, {
        isOverloaded: maxConcurrent >= OVERLOAD_THRESHOLD,
        maxConcurrent,
        overloadedDays,
      });
    }
    return result;
  }, [allRows, days]);

  const handleSyncScroll = useCallback((e: any) => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.target.scrollTop;
    }
    if (headerTimelineRef.current) {
      headerTimelineRef.current.scrollLeft = e.target.scrollLeft;
    }
  }, []);

  const navigateRange = (direction: number) => {
    setRangeStart((prev) => addDays(prev, direction * NAV_STEP_DAYS));
  };

  const goToToday = () => {
    setRangeStart(startOfWeek(new Date(), { weekStartsOn: weekStartDay }));
  };

  const today = new Date();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-muted-foreground">Loading workload...</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col h-full${className ? ` ${className}` : ''}`}>
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
          {/* Business / Suppliers / Unassigned toggles */}
          <div className="flex items-center border rounded-md overflow-hidden">
            <button
              className={`h-7 px-2.5 text-xs ${showBusiness ? "bg-primary text-primary-foreground" : "hover-elevate text-muted-foreground"}`}
              onClick={() => setShowBusiness((v) => !v)}
            >
              {businessLabel}
            </button>
            <button
              className={`h-7 px-2.5 text-xs border-l ${showSuppliers ? "bg-primary text-primary-foreground" : "hover-elevate text-muted-foreground"}`}
              onClick={() => setShowSuppliers((v) => !v)}
            >
              Suppliers
            </button>
            <button
              className={`h-7 px-2.5 text-xs border-l ${!hideUnassigned ? "bg-primary text-primary-foreground" : "hover-elevate text-muted-foreground"}`}
              onClick={() => setHideUnassigned((v) => !v)}
            >
              Unassigned
            </button>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-7 w-7 relative">
                <Filter className="w-3 h-3" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <div className="max-h-80 overflow-y-auto">
                {allAssignees.length > 0 && (
                  <div className="p-3 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assignees</span>
                      {hiddenAssignees.size > 0 && (
                        <button
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => setHiddenAssignees(new Set())}
                        >
                          Show all
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {allAssignees.map((a) => (
                        <label
                          key={a.id}
                          className="flex items-center gap-2 py-1 px-1 rounded cursor-pointer hover-elevate"
                        >
                          <Checkbox
                            checked={!hiddenAssignees.has(a.id)}
                            onCheckedChange={() => toggleAssignee(a.id)}
                          />
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: a.color }}
                          />
                          <span className="text-xs truncate">{a.name}</span>
                        </label>
                      ))}
                    </div>
                    {unassignedRow && (
                      <label className="flex items-center gap-2 py-1 px-1 rounded cursor-pointer hover-elevate mt-1 border-t border-border/50 pt-2">
                        <Checkbox
                          checked={!hideUnassigned}
                          onCheckedChange={() => setHideUnassigned((prev) => !prev)}
                        />
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-muted-foreground/40" />
                        <span className="text-xs truncate text-muted-foreground">Unassigned</span>
                      </label>
                    )}
                  </div>
                )}
                <div className="p-3 pt-2 border-t border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schedule Type</span>
                    {hidePreconstructionSchedule && (
                      <button
                        className="text-[10px] text-primary hover:underline"
                        onClick={() => setHidePreconstructionSchedule(false)}
                      >
                        Show all
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 py-1 px-1 rounded cursor-pointer hover-elevate">
                      <Checkbox
                        checked={!hidePreconstructionSchedule}
                        onCheckedChange={() => setHidePreconstructionSchedule((prev) => !prev)}
                      />
                      <span className="text-xs truncate">Pre-construction</span>
                    </label>
                  </div>
                </div>
                {allProjects.length > 0 && (
                  <div className="p-3 pt-1 border-t border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Projects</span>
                      {hiddenProjects.size > 0 && (
                        <button
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => setHiddenProjects(new Set())}
                        >
                          Show all
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {allProjects.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 py-1 px-1 rounded cursor-pointer hover-elevate"
                        >
                          <Checkbox
                            checked={!hiddenProjects.has(p.id)}
                            onCheckedChange={() => toggleProject(p.id)}
                          />
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="text-xs truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {allAssignees.length === 0 && allProjects.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No items to filter
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md overflow-hidden">
            {([2, 4, 6] as const).map((w) => (
              <button
                key={w}
                className={`h-7 px-2.5 text-xs ${windowWeeks === w ? 'bg-primary text-primary-foreground' : 'hover-elevate'}`}
                onClick={() => setWindowWeeks(w)}
              >
                {w}w
              </button>
            ))}
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
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={leftPanelRef}
          className="flex-shrink-0 border-r border-border overflow-hidden"
          style={{ width: PANEL_WIDTH }}
        >
          <div className="h-[56px] border-b border-border flex items-end px-2 pb-1">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Daily Load</span>
            </div>
          </div>

          {allRows.map((row, rowIdx) => {
            const barData = rowBarLayouts.get(row.id);
            const rowHeight = barData?.rowHeight || MIN_ROW_HEIGHT;
            const isExpanded = expandedRows.has(row.id);
            const hasMultipleItems = row.items.length > 1;
            const isCompanyRow = row.id.startsWith("biz:");
            // Half-row gap separator after the company row
            const isLastBeforeSuppliers = isCompanyRow && allRows[rowIdx + 1] && !allRows[rowIdx + 1].id.startsWith("biz:");
            return (
              <div key={row.id}>
                <div
                  style={{ height: rowHeight }}
                  className={cn(
                    "flex items-start px-2 gap-1.5 border-b pt-2",
                    isCompanyRow ? "border-border/60 bg-muted/30" : "border-border/30"
                  )}
                >
                  {hasMultipleItems ? (
                    <button
                      className="shrink-0 mt-px p-0.5 rounded hover-elevate"
                      onClick={() => toggleRowExpanded(row.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronRightIcon className="w-3 h-3 text-muted-foreground" />
                      )}
                    </button>
                  ) : (
                    <div className="w-4 shrink-0" />
                  )}
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: row.color }}
                  />
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <span className={cn("text-xs truncate", isCompanyRow ? "font-bold" : "font-medium")}>
                      {row.name}
                    </span>
                    {row.id.startsWith("team:") && (
                      <span className="shrink-0 text-[9px] px-1 py-px rounded bg-muted text-muted-foreground font-medium uppercase tracking-wide">
                        Team
                      </span>
                    )}
                  </div>
                  {assigneeOverloads.get(row.id)?.isOverloaded && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="shrink-0">
                          <AlertTriangle className={cn(
                            "w-3.5 h-3.5",
                            (assigneeOverloads.get(row.id)?.maxConcurrent ?? 0) >= OVERLOAD_THRESHOLD + 2
                              ? "text-red-500"
                              : "text-amber-500"
                          )} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-gray-900 text-gray-100 text-[10px] px-1.5 py-0.5 border-0">
                        Up to {assigneeOverloads.get(row.id)?.maxConcurrent} concurrent items
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {row.items.length}
                  </span>
                </div>
                {/* Half-row gap after company row */}
                {isLastBeforeSuppliers && (
                  <div style={{ height: MIN_ROW_HEIGHT / 2 }} className="border-b border-border/20" />
                )}
              </div>
            );
          })}

          {allRows.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground text-center">
              No schedule items in this range.
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <div ref={headerTimelineRef} className="h-[56px] border-b border-border flex-shrink-0 overflow-hidden">
            <div
              className="h-full flex"
              style={{ minWidth: totalWidth, width: '100%' }}
            >
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const count = dailyTotals.get(key) || 0;
                const barHeight = maxDailyTotal > 0 ? Math.round((count / maxDailyTotal) * 20) : 0;
                const isWkend = isWeekend(day);
                const isToday = isSameDay(day, today);
                const colWidth = getDayWidth(day);
                const barW = isWkend ? 10 : 20;

                return (
                  <div
                    key={key}
                    className={cn(
                      "flex flex-col items-center justify-end shrink-0 border-l border-border/20 pb-1",
                      isWkend && "bg-[#f3f4f6] dark:bg-muted/50",
                      isToday && "bg-[#bba7db]/10"
                    )}
                    style={{ width: colWidth }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="rounded-sm mb-0.5"
                          style={{
                            width: barW,
                            height: Math.max(barHeight, count > 0 ? 3 : 0),
                            backgroundColor: count > 0 ? (count > maxDailyTotal * 0.7 ? "#ef4444" : count > maxDailyTotal * 0.4 ? "#f59e0b" : "#22c55e") : "transparent",
                            opacity: isWkend ? 0.5 : 1,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-gray-900 text-gray-100 text-[10px] px-1.5 py-0.5 border-0">
                        {count} item{count !== 1 ? "s" : ""} on {format(day, "EEE d MMM")}
                      </TooltipContent>
                    </Tooltip>
                    <div className={cn("text-[9px]", isToday ? "font-bold text-[#bba7db]" : isWkend ? "text-muted-foreground/50" : "text-muted-foreground")}>
                      {isWkend ? format(day, "EEEEE") : format(day, "EEE")}
                    </div>
                    <div className={cn("text-[9px]", isToday ? "font-bold text-[#bba7db]" : isWkend ? "text-muted-foreground/50" : "text-muted-foreground")}>
                      {format(day, "d")}
                    </div>
                  </div>
                );
              })}
              <div className="flex-1 border-l border-border/20" />
            </div>
          </div>

          <div
            ref={timelineRef}
            className="flex-1 overflow-y-auto overflow-x-auto"
            onScroll={(e) => {
              handleSyncScroll(e);
            }}
          >
            <div className="relative" style={{ minWidth: totalWidth, width: '100%' }}>
              {(() => {
                const todayIdx = days.findIndex((d) => isSameDay(d, today));
                if (todayIdx === -1) return null;
                return (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-[#bba7db] pointer-events-none z-10"
                    style={{ left: dayOffsets.offsets[todayIdx] + getDayWidth(days[todayIdx]) / 2 }}
                  />
                );
              })()}

              {allRows.map((row, rowIdx) => {
                const barData = rowBarLayouts.get(row.id);
                const rowHeight = barData?.rowHeight || MIN_ROW_HEIGHT;
                const layouts = barData?.layouts || [];
                const isExpanded = expandedRows.has(row.id);
                const isCompanyRow = row.id.startsWith("biz:");
                const isLastBeforeSuppliers = isCompanyRow && allRows[rowIdx + 1] && !allRows[rowIdx + 1].id.startsWith("biz:");

                const sortedItemsForExpanded = isExpanded
                  ? [...row.items].sort((a, b) => {
                      const aStart = new Date(a.startDate).getTime();
                      const bStart = new Date(b.startDate).getTime();
                      if (aStart !== bStart) return aStart - bStart;
                      return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
                    })
                  : [];
                const expandedItemIndexMap = new Map<string, number>();
                sortedItemsForExpanded.forEach((item, idx) => expandedItemIndexMap.set(item.id, idx));

                return (
                  <div key={row.id}>
                  <div
                    className={cn("relative border-b", isCompanyRow ? "border-border/40 bg-muted/10" : "border-border/10")}
                    style={{ height: rowHeight }}
                  >
                    {days.map((day, dayIdx) => {
                      const key = format(day, "yyyy-MM-dd");
                      const isWkend = isWeekend(day);
                      const isToday = isSameDay(day, today);
                      const colWidth = getDayWidth(day);
                      const isOverloadedDay = assigneeOverloads.get(row.id)?.overloadedDays.has(key) ?? false;

                      return (
                        <div
                          key={key}
                          className={cn(
                            "absolute top-0 h-full border-l border-border/10",
                            isWkend && "bg-[#f3f4f6] dark:bg-muted/50",
                            isToday && "bg-[#bba7db]/5",
                            isOverloadedDay && "bg-red-500/8"
                          )}
                          style={{ left: dayOffsets.offsets[dayIdx], width: colWidth }}
                        />
                      );
                    })}

                    {isExpanded && sortedItemsForExpanded.length > 1 && sortedItemsForExpanded.map((_, idx) => {
                      if (idx === 0) return null;
                      const y = ROW_PADDING + idx * (BAR_HEIGHT + BAR_GAP) - 1;
                      return (
                        <div
                          key={`sep-${idx}`}
                          className="absolute left-0 right-0 border-t border-border/5"
                          style={{ top: y }}
                        />
                      );
                    })}

                    {layouts.map((barLayout) => {
                      const { item, lane, leftPx, widthPx } = barLayout;
                      const rowIdx = isExpanded ? (expandedItemIndexMap.get(item.id) ?? lane) : lane;
                      const topPx = ROW_PADDING + rowIdx * (BAR_HEIGHT + BAR_GAP);
                      const barColor = row.color;
                      const showLabel = widthPx > 60;

                      return (
                        <Tooltip key={item.id}>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute rounded-sm cursor-pointer flex items-center overflow-hidden z-[5] transition-opacity hover:opacity-100"
                              style={{
                                left: leftPx,
                                width: widthPx,
                                top: topPx,
                                height: BAR_HEIGHT,
                                backgroundColor: barColor,
                                opacity: 0.85,
                              }}
                              onClick={() => setSelectedItem(item)}
                            >
                              {showLabel && (
                                <span
                                  className="text-[10px] font-medium truncate px-1.5 leading-none"
                                  style={{ color: "#fff" }}
                                >
                                  {item.name}
                                </span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-gray-900 text-gray-100 border-0 max-w-[240px]">
                            <div className="text-[10px]">
                              <div className="font-medium">{item.name}</div>
                              <div className="text-gray-400 mt-0.5">{item.projectName}</div>
                              <div className="text-gray-400 mt-0.5">
                                {format(new Date(item.startDate), "d MMM")} – {format(new Date(item.endDate), "d MMM yyyy")}
                              </div>
                              {item.progressPercent > 0 && (
                                <div className="text-gray-400 mt-0.5">{item.progressPercent}% complete</div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                  {/* Half-row gap after company row in timeline */}
                  {isLastBeforeSuppliers && (
                    <div style={{ height: MIN_ROW_HEIGHT / 2 }} className="border-b border-border/20" />
                  )}
                  </div>
                );
              })}

            </div>
          </div>
        </div>
      </div>
      <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{selectedItem.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 bg-muted-foreground/40"
                  />
                  <span className="text-sm">{selectedItem.projectName}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Start Date</div>
                    <div className="text-sm flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      {format(new Date(selectedItem.startDate), "d MMM yyyy")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">End Date</div>
                    <div className="text-sm flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      {format(new Date(selectedItem.endDate), "d MMM yyyy")}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Status</div>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {selectedItem.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Duration</div>
                    <div className="text-sm">{selectedItem.duration} day{selectedItem.duration !== 1 ? "s" : ""}</div>
                  </div>
                </div>

                {selectedItem.progressPercent > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Progress</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${selectedItem.progressPercent}%`,
                            backgroundColor: "hsl(var(--muted-foreground) / 0.4)",
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{selectedItem.progressPercent}%</span>
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Assignee</div>
                  <div className="text-sm flex items-center gap-1.5">
                    {selectedItem.assignedToName ? (
                      <>
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: selectedItem.assignedToColor || "#6b7280" }}
                        />
                        {selectedItem.assignedToName}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-1.5"
                    onClick={() => {
                      navigate(`/projects/${selectedItem.projectId}/schedule`);
                      setSelectedItem(null);
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View in Project Schedule
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

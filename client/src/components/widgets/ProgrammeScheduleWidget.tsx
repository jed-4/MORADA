import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  startOfWeek,
  startOfDay,
  addDays,
  isSameDay,
  isToday,
  format,
  differenceInDays,
  eachWeekOfInterval,
} from "date-fns";
import type { ScheduleItem, Note } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  WidgetSkeleton,
  WidgetEmpty,
  WidgetError,
} from "@/components/ui/widget-states";

type ViewMode = "week" | "gantt";
type GanttZoom = "2w" | "4w" | "6w";
type GanttGroupBy = "none" | "phase" | "trade";
type ColourBy = "type" | "trade" | "status" | "assignee";

const STATUS_COLORS: Record<string, string> = {
  not_started: "hsl(var(--bp-muted))",
  in_progress: "hsl(var(--bp-purple))",
  completed: "hsl(var(--bp-green))",
  on_hold: "hsl(var(--bp-amber))",
  cancelled: "hsl(var(--bp-coral))",
};

const TYPE_COLORS: Record<string, string> = {
  task: "hsl(var(--bp-purple))",
  milestone: "hsl(var(--bp-amber))",
  inspection: "hsl(var(--bp-teal))",
  delivery: "hsl(var(--bp-green))",
  meeting: "hsl(var(--bp-coral))",
};

function getItemColor(item: ScheduleItem, colourBy: ColourBy): string {
  if (colourBy === "status")
    return STATUS_COLORS[item.status] ?? "hsl(var(--bp-muted))";
  if (colourBy === "trade")
    return item.assignedToColor ?? "hsl(var(--bp-muted))";
  if (colourBy === "assignee")
    return item.assignedToColor ?? "hsl(var(--bp-purple))";
  return item.color ?? TYPE_COLORS[item.type] ?? "hsl(var(--bp-purple))";
}

function packIntoRows<
  T extends { startDate: Date | string; endDate: Date | string },
>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (const item of items) {
    const start = new Date(item.startDate);
    const end = new Date(item.endDate);
    let placed = false;
    for (const row of rows) {
      const overlaps = row.some((r) => {
        const rs = new Date(r.startDate);
        const re = new Date(r.endDate);
        return start <= re && end >= rs;
      });
      if (!overlaps) {
        row.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([item]);
  }
  return rows;
}

export default function ProgrammeScheduleWidget({
  widget,
  onUpdate,
  isConfiguring,
  onCloseConfig,
}: WidgetProps) {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const config = {
    viewMode: (widget.config?.viewMode as ViewMode) ?? "week",
    ganttZoom: (widget.config?.ganttZoom as GanttZoom) ?? "4w",
    showSchedule: widget.config?.showSchedule ?? true,
    showTasks: widget.config?.showTasks ?? true,
    filterStatuses: (widget.config?.filterStatuses as string[]) ?? [],
    filterAssignee: (widget.config?.filterAssignee as string) ?? "",
    showWeekends: widget.config?.showWeekends ?? true,
    colourBy: (widget.config?.colourBy as ColourBy) ?? "type",
    compactMode: widget.config?.compactMode ?? false,
    ganttGroupBy:
      (widget.config?.ganttGroupBy as GanttGroupBy) ?? "none",
    defaultCurrentWeek: widget.config?.defaultCurrentWeek ?? true,
  };

  const updateConfig = (key: string, value: any) =>
    onUpdate?.({
      ...widget,
      config: { ...widget.config, [key]: value },
    });

  const itemsQ = useQuery<ScheduleItem[]>({
    queryKey: ["/api/projects", projectId, "schedule-items"],
    queryFn: () =>
      apiRequest(`/api/projects/${projectId}/schedule-items`, "GET"),
    enabled: !!projectId,
  });

  const tasksQ = useQuery<Note[]>({
    queryKey: ["/api/tasks", projectId],
    queryFn: () => apiRequest(`/api/tasks?projectId=${projectId}`, "GET"),
    enabled:
      !!projectId && config.showTasks && config.viewMode === "week",
  });

  const scheduleItems = itemsQ.data ?? [];
  const tasks = (tasksQ.data ?? []).filter((t) => t.type === "task");

  const filteredItems = useMemo(() => {
    let items = scheduleItems;
    if (config.showSchedule === false) items = [];
    if (config.filterStatuses.length > 0)
      items = items.filter((i) =>
        config.filterStatuses.includes(i.status),
      );
    if (config.filterAssignee) {
      const q = config.filterAssignee.toLowerCase();
      items = items.filter(
        (i) =>
          i.assignedToName?.toLowerCase().includes(q) ||
          i.teamName?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [
    scheduleItems,
    config.showSchedule,
    config.filterStatuses,
    config.filterAssignee,
  ]);

  const [weekStart, setWeekStartState] = useState(() => {
    const current = startOfWeek(new Date(), { weekStartsOn: 1 });
    if (config.defaultCurrentWeek) return current;
    const saved = widget.config?.lastWeekStartIso as string | undefined;
    return saved ? startOfDay(new Date(saved)) : current;
  });
  const setWeekStart = (updater: (w: Date) => Date) => {
    setWeekStartState((prev) => {
      const next = updater(prev);
      if (!config.defaultCurrentWeek) {
        updateConfig("lastWeekStartIso", next.toISOString());
      }
      return next;
    });
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const visibleDays = config.showWeekends ? days : days.slice(0, 5);
  const COL_COUNT = visibleDays.length;
  const weekEnd = addDays(weekStart, 6);
  const visibleStart = visibleDays[0];
  const visibleEnd = visibleDays[visibleDays.length - 1];

  const weekItems = useMemo(
    () =>
      filteredItems.filter((item) => {
        const s = new Date(item.startDate);
        const e = new Date(item.endDate);
        return s <= visibleEnd && e >= visibleStart;
      }),
    [filteredItems, visibleStart, visibleEnd],
  );
  const packedRows = useMemo(() => packIntoRows(weekItems), [weekItems]);

  const ganttDays =
    config.ganttZoom === "2w" ? 14 : config.ganttZoom === "6w" ? 42 : 28;
  const ganttStart = startOfDay(new Date());
  const ganttEnd = addDays(ganttStart, ganttDays - 1);

  const groupedItems = useMemo(() => {
    if (config.ganttGroupBy === "none")
      return [{ label: null as string | null, items: filteredItems }];
    const key =
      config.ganttGroupBy === "phase" ? "groupName" : "costCodeTitle";
    const map = new Map<string, ScheduleItem[]>();
    filteredItems.forEach((item) => {
      const g = ((item as any)[key] as string | null) ?? "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    });
    return Array.from(map.entries()).map(([label, items]) => ({
      label,
      items,
    }));
  }, [filteredItems, config.ganttGroupBy]);

  if (!currentProject) {
    return <WidgetEmpty message="Select a project to view its programme" />;
  }

  if (isConfiguring) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-[12px]">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            View
          </p>
          <div className="flex gap-2">
            {(["week", "gantt"] as const).map((v) => (
              <button
                key={v}
                onClick={() => updateConfig("viewMode", v)}
                className={cn(
                  "px-3 py-1.5 rounded-md border text-[11px] font-medium",
                  config.viewMode === v
                    ? "bg-[hsl(var(--bp-purple))] text-white border-transparent"
                    : "border-border text-muted-foreground hover:border-[hsl(var(--bp-purple))]",
                )}
                data-testid={`config-view-${v}`}
              >
                {v === "week" ? "Week calendar" : "Gantt"}
              </button>
            ))}
          </div>
        </section>

        {config.viewMode === "gantt" && (
          <>
            <section>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Gantt zoom
              </p>
              <div className="flex gap-2">
                {[
                  { v: "2w", l: "2 weeks" },
                  { v: "4w", l: "4 weeks" },
                  { v: "6w", l: "6 weeks" },
                ].map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => updateConfig("ganttZoom", v)}
                    className={cn(
                      "px-3 py-1.5 rounded-md border text-[11px]",
                      config.ganttZoom === v
                        ? "bg-[hsl(var(--bp-purple))] text-white border-transparent"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Group by
              </p>
              <select
                value={config.ganttGroupBy}
                onChange={(e) =>
                  updateConfig("ganttGroupBy", e.target.value)
                }
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
              >
                <option value="none">None</option>
                <option value="phase">Phase / Group</option>
                <option value="trade">Trade (cost code)</option>
              </select>
            </section>
          </>
        )}

        {config.viewMode === "week" && (
          <>
            <section>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Show
              </p>
              {[
                { key: "showSchedule", label: "Schedule items" },
                { key: "showTasks", label: "Tasks (due date markers)" },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 py-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={
                      config[
                        key as keyof typeof config
                      ] as boolean
                    }
                    onChange={(e) =>
                      updateConfig(key, e.target.checked)
                    }
                    className="accent-[hsl(var(--bp-purple))]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </section>
            <section>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Default week
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.defaultCurrentWeek}
                  onChange={(e) =>
                    updateConfig("defaultCurrentWeek", e.target.checked)
                  }
                  className="accent-[hsl(var(--bp-purple))]"
                />
                <span>Always open on current week</span>
              </label>
            </section>
          </>
        )}

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Filter by status
          </p>
          {[
            "not_started",
            "in_progress",
            "completed",
            "on_hold",
            "cancelled",
          ].map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 py-1 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={
                  config.filterStatuses.length === 0 ||
                  config.filterStatuses.includes(s)
                }
                onChange={(e) => {
                  const cur =
                    config.filterStatuses.length === 0
                      ? [
                          "not_started",
                          "in_progress",
                          "completed",
                          "on_hold",
                          "cancelled",
                        ]
                      : [...config.filterStatuses];
                  updateConfig(
                    "filterStatuses",
                    e.target.checked
                      ? Array.from(new Set([...cur, s]))
                      : cur.filter((x) => x !== s),
                  );
                }}
                className="accent-[hsl(var(--bp-purple))]"
              />
              <span className="capitalize">{s.replace("_", " ")}</span>
            </label>
          ))}
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Filter by assignee
          </p>
          <input
            type="text"
            placeholder="Type a name..."
            value={config.filterAssignee}
            onChange={(e) =>
              updateConfig("filterAssignee", e.target.value)
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
          />
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Display
          </p>
          <div className="space-y-1">
            {[
              { key: "showWeekends", label: "Show weekends" },
              { key: "compactMode", label: "Compact mode" },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 py-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={
                    config[key as keyof typeof config] as boolean
                  }
                  onChange={(e) =>
                    updateConfig(key, e.target.checked)
                  }
                  className="accent-[hsl(var(--bp-purple))]"
                />
                <span>{label}</span>
              </label>
            ))}
            <div className="pt-1">
              <p className="text-muted-foreground mb-1">Colour bars by</p>
              <select
                value={config.colourBy}
                onChange={(e) => updateConfig("colourBy", e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
              >
                <option value="type">Item type</option>
                <option value="trade">Trade / assignee colour</option>
                <option value="status">Status</option>
                <option value="assignee">Assignee</option>
              </select>
            </div>
          </div>
        </section>

        <div className="pt-2">
          <button
            onClick={() => onCloseConfig?.()}
            className="w-full py-2 rounded-md bg-[hsl(var(--bp-purple))] text-white text-[11px] font-medium"
            data-testid="config-done"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (itemsQ.isLoading) return <WidgetSkeleton />;
  if (itemsQ.isError)
    return <WidgetError onRetry={() => itemsQ.refetch()} />;

  const rowH = config.compactMode ? "h-6" : "h-8";

  return (
    <div className="flex flex-col h-full -mt-1" data-testid="widget-programme">
      {/* Body */}
      {config.viewMode === "week" ? (
        <>
          <div className="flex items-center justify-end gap-1 px-1 py-0 text-[10px] text-muted-foreground">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="px-1 rounded hover-elevate"
              data-testid="week-prev"
              aria-label="Previous week"
            >
              ‹
            </button>
            <span className="font-medium text-foreground">
              {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM yyyy")}
            </span>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="px-1 rounded hover-elevate"
              data-testid="week-next"
              aria-label="Next week"
            >
              ›
            </button>
          </div>
          <div
            className="grid border-b border-[hsl(var(--bp-border))] bg-[hsl(var(--bp-subtle))]"
            style={{
              gridTemplateColumns: `repeat(${COL_COUNT}, 1fr)`,
            }}
          >
            {visibleDays.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-center gap-1 py-0.5 text-center border-r last:border-r-0 border-[hsl(var(--bp-border))]",
                  isToday(day) && "bg-[hsl(var(--bp-purple)/0.06)]",
                )}
              >
                <span className="text-[9px] text-muted-foreground uppercase">
                  {format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isToday(day)
                      ? "text-[hsl(var(--bp-purple))] font-semibold"
                      : i >= 5
                        ? "text-muted-foreground"
                        : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {packedRows.length === 0 ? (
              <WidgetEmpty message="No schedule items this week" />
            ) : (
              packedRows.map((row, ri) => (
                <div
                  key={ri}
                  className={cn(
                    "grid relative border-b border-[hsl(var(--bp-border))]",
                    rowH,
                  )}
                  style={{
                    gridTemplateColumns: `repeat(${COL_COUNT}, 1fr)`,
                  }}
                >
                  {visibleDays.map((_, ci) => (
                    <div
                      key={ci}
                      className={cn(
                        "border-r last:border-r-0 border-[hsl(var(--bp-border))]",
                        isToday(visibleDays[ci]) &&
                          "bg-[hsl(var(--bp-purple)/0.03)]",
                      )}
                    />
                  ))}
                  {row.map((item) => {
                    const itemStart = new Date(item.startDate);
                    const itemEnd = new Date(item.endDate);
                    const clampedStart =
                      itemStart < weekStart ? weekStart : itemStart;
                    const clampedEnd =
                      itemEnd > weekEnd ? weekEnd : itemEnd;
                    const startCol = visibleDays.findIndex((d) =>
                      isSameDay(d, clampedStart),
                    );
                    const endCol = visibleDays.findIndex((d) =>
                      isSameDay(d, clampedEnd),
                    );
                    if (startCol < 0 && endCol < 0) return null;
                    const sc = startCol >= 0 ? startCol : 0;
                    const ec =
                      endCol >= 0 ? endCol : COL_COUNT - 1;
                    const color = getItemColor(item, config.colourBy);
                    const isMultiDay = sc !== ec;
                    return (
                      <div
                        key={item.id}
                        title={`${item.name}${
                          item.assignedToName
                            ? ` · ${item.assignedToName}`
                            : ""
                        }`}
                        className={cn(
                          "absolute top-1 bottom-1 flex items-center px-2 rounded-md text-[9px] font-medium cursor-pointer overflow-hidden",
                          isMultiDay ? "text-white" : "border",
                        )}
                        style={{
                          left: `calc(${(sc / COL_COUNT) * 100}% + 2px)`,
                          right: `calc(${
                            ((COL_COUNT - ec - 1) / COL_COUNT) * 100
                          }% + 2px)`,
                          backgroundColor: isMultiDay
                            ? color
                            : "transparent",
                          borderColor: isMultiDay
                            ? "transparent"
                            : color,
                          color: isMultiDay ? "white" : color,
                          borderLeftWidth: isMultiDay ? 0 : 3,
                        }}
                        data-testid={`week-item-${item.id}`}
                      >
                        <span className="truncate">{item.name}</span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}

            {config.showTasks &&
              tasks.filter((t) => t.dueDate).length > 0 && (
                <div
                  className={cn(
                    "grid relative border-b border-[hsl(var(--bp-border))]",
                    rowH,
                  )}
                  style={{
                    gridTemplateColumns: `repeat(${COL_COUNT}, 1fr)`,
                  }}
                >
                  {visibleDays.map((day, ci) => {
                    const dayTasks = tasks.filter(
                      (t) =>
                        t.dueDate &&
                        isSameDay(new Date(t.dueDate), day),
                    );
                    return (
                      <div
                        key={ci}
                        className="border-r last:border-r-0 border-[hsl(var(--bp-border))] flex items-center justify-center gap-0.5 flex-wrap px-1"
                      >
                        {dayTasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            title={t.title}
                            className="w-2 h-2 rounded-sm bg-[hsl(var(--bp-amber))] opacity-80"
                          />
                        ))}
                        {dayTasks.length > 3 && (
                          <span className="text-[8px] text-muted-foreground">
                            +{dayTasks.length - 3}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </>
      ) : (
        <>
          <div className="flex border-b border-[hsl(var(--bp-border))] bg-[hsl(var(--bp-subtle))]">
            {eachWeekOfInterval({
              start: ganttStart,
              end: ganttEnd,
            }).map((week) => (
              <div
                key={week.toISOString()}
                className="border-r border-[hsl(var(--bp-border))] px-2 py-1 text-[9px] text-muted-foreground"
                style={{ width: `${(7 / ganttDays) * 100}%` }}
              >
                {format(week, "d MMM")}
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <WidgetEmpty message="No schedule items to display" />
            ) : (
              groupedItems.map((group, gi) => (
                <div key={gi}>
                  {group.label && (
                    <div className="px-3 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wide bg-[hsl(var(--bp-subtle))] border-b border-[hsl(var(--bp-border))]">
                      {group.label}
                    </div>
                  )}
                  {group.items.map((item) => {
                    const s = new Date(item.startDate);
                    const e = new Date(item.endDate);
                    const clampS = s < ganttStart ? ganttStart : s;
                    const clampE = e > ganttEnd ? ganttEnd : e;
                    if (clampS > ganttEnd || clampE < ganttStart)
                      return null;
                    const left =
                      (differenceInDays(clampS, ganttStart) /
                        ganttDays) *
                      100;
                    const width = Math.max(
                      ((differenceInDays(clampE, clampS) + 1) /
                        ganttDays) *
                        100,
                      1,
                    );
                    const color = getItemColor(item, config.colourBy);
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "relative border-b border-[hsl(var(--bp-border))]",
                          rowH,
                        )}
                        data-testid={`gantt-item-${item.id}`}
                      >
                        <div
                          className="absolute inset-y-1.5 rounded-md flex items-center px-2 text-[9px] font-medium text-white overflow-hidden"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: color,
                          }}
                          title={`${item.name}${
                            item.assignedToName
                              ? ` · ${item.assignedToName}`
                              : ""
                          }`}
                        >
                          <span className="truncate">{item.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </>
      )}

    </div>
  );
}

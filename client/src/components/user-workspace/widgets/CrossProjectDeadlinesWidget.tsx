import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, AlertCircle, Folder, ChevronDown, ChevronRight } from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { WidgetSkeleton } from "@/components/ui/WidgetSkeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import { useLocation } from "wouter";
import { differenceInCalendarDays } from "date-fns";

/** One deadline, whatever it came from. Shape is set by `GET /api/deadlines`. */
interface Deadline {
  id: string;
  kind: DeadlineKind;
  title: string;
  dueDate: string;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  href: string;
}

type DeadlineKind =
  | "task" | "milestone" | "inspection" | "selection"
  | "rfq" | "variation" | "review" | "checklist";

/** Label shown on each row's type badge, and the config's source toggles. */
const KIND_LABEL: Record<DeadlineKind, string> = {
  task: "task",
  milestone: "milestone",
  inspection: "inspection",
  selection: "selection",
  rfq: "RFQ",
  variation: "variation",
  review: "review",
  checklist: "checklist",
};

const KIND_ORDER: DeadlineKind[] = [
  "task", "milestone", "inspection", "selection", "rfq", "variation", "review", "checklist",
];

function daysLabel(dueDate: string, today: Date): { label: string; className: string } {
  const d = differenceInCalendarDays(new Date(dueDate), today);
  if (d < 0) return { label: `${Math.abs(d)}d overdue`, className: "text-bp-coral bg-bp-coral/10" };
  if (d === 0) return { label: "Today", className: "text-bp-amber bg-bp-amber/10" };
  if (d === 1) return { label: "Tomorrow", className: "text-bp-teal bg-bp-teal/10" };
  return { label: `${d}d`, className: "text-bp-muted bg-bp-subtle" };
}

export default function CrossProjectDeadlinesWidget({
  widget, onUpdate, isConfiguring, onCloseConfig, onSetTitleAction, userId,
}: WidgetProps) {
  const maxItems = widget.config?.maxItems || 10;
  const daysAhead = widget.config?.daysAhead || 14;
  const hiddenKinds = (widget.config?.hiddenKinds as DeadlineKind[] | undefined) ?? [];
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxItems, setConfigMaxItems] = useState(maxItems);
  const [configDaysAhead, setConfigDaysAhead] = useState(daysAhead);
  const [configHiddenKinds, setConfigHiddenKinds] = useState<DeadlineKind[]>(hiddenKinds);
  const [showOverdue, setShowOverdue] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxItems(widget.config?.maxItems || 10);
    setConfigDaysAhead(widget.config?.daysAhead || 14);
    setConfigHiddenKinds((widget.config?.hiddenKinds as DeadlineKind[] | undefined) ?? []);
  }, [widget.title, widget.config]);

  useEffect(() => {
    onSetTitleAction?.({ label: "Business calendar", onClick: () => setLocation("/business/calendar") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, isError } = useQuery<{ overdue: Deadline[]; upcoming: Deadline[] }>({
    queryKey: ["/api/deadlines", daysAhead],
    queryFn: () => apiRequest(`/api/deadlines?days=${daysAhead}`, "GET"),
    enabled: !!userId,
  });

  // Stable per-day value: a new Date() every render re-ran every memo below.
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const visible = (list: Deadline[]) => list.filter(d => !hiddenKinds.includes(d.kind));
  const upcoming = visible(data?.upcoming ?? []);
  const overdue = visible(data?.overdue ?? []);

  /** Grouped by project, preserving the server's date ordering within each. */
  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; projectName: string; color?: string; items: Deadline[] }>();
    upcoming.slice(0, maxItems).forEach(d => {
      const key = d.projectId ?? "no-project";
      if (!map.has(key)) {
        map.set(key, {
          key,
          projectName: d.projectName ?? "No project",
          color: d.projectColor ?? undefined,
          items: [],
        });
      }
      map.get(key)!.items.push(d);
    });
    return Array.from(map.values());
  }, [data, maxItems, hiddenKinds.join(",")]);

  if (isConfiguring) {
    const handleSaveConfig = () => {
      onUpdate?.({
        ...widget,
        title: editingTitle,
        config: {
          ...widget.config,
          maxItems: configMaxItems,
          daysAhead: configDaysAhead,
          hiddenKinds: configHiddenKinds,
        },
      });
      onCloseConfig?.();
    };

    const toggleKind = (kind: DeadlineKind, show: boolean) =>
      setConfigHiddenKinds(prev => (show ? prev.filter(k => k !== kind) : [...prev, kind]));

    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Deadlines</h4>

        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        <div className="flex gap-3">
          <div className="space-y-2">
            <Label className="text-xs">Days Ahead</Label>
            <Input
              type="number" min={1} max={90}
              value={configDaysAhead}
              onChange={(e) => setConfigDaysAhead(parseInt(e.target.value) || 14)}
              className="h-7 text-xs w-20"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Max Items</Label>
            <Input
              type="number" min={1} max={30}
              value={configMaxItems}
              onChange={(e) => setConfigMaxItems(parseInt(e.target.value) || 10)}
              className="h-7 text-xs w-20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Include</Label>
          <div className="space-y-1.5">
            {KIND_ORDER.map(kind => (
              <label key={kind} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={!configHiddenKinds.includes(kind)}
                  onCheckedChange={(checked) => toggleKind(kind, !!checked)}
                />
                <span className="text-xs capitalize">{KIND_LABEL[kind]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={onCloseConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) return <WidgetSkeleton rows={3} />;
  if (isError) return <WidgetEmpty icon={AlertCircle} message="Couldn't load deadlines" />;

  const renderRow = (item: Deadline) => {
    const info = daysLabel(item.dueDate, today);
    return (
      <div
        key={item.id}
        className="p-2 border border-bp-border rounded-md hover-elevate cursor-pointer"
        onClick={() => setLocation(item.href)}
        data-testid={`deadline-${item.id}`}
      >
        <div className="flex items-start gap-2">
          {new Date(item.dueDate) < today
            ? <AlertCircle className="h-3 w-3 text-bp-coral mt-0.5 flex-shrink-0" />
            : <Calendar className="h-3 w-3 text-bp-muted mt-0.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate leading-tight">{item.title}</p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <Badge className={`${info.className} text-data px-1 py-0 h-4 border-transparent`}>
                {info.label}
              </Badge>
              <Badge variant="outline" className="text-data px-1 py-0 h-4">
                {KIND_LABEL[item.kind]}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Overdue is deliberately a separate, folded section. Left in the main
          list it filled the widget — the original had no lower date bound at
          all, so a task overdue since March outranked everything due this week. */}
      {overdue.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowOverdue(v => !v)}
            className="flex w-full items-center gap-1.5 px-1 py-0.5 rounded hover-elevate"
            data-testid="deadlines-overdue-toggle"
            aria-expanded={showOverdue}
          >
            {showOverdue
              ? <ChevronDown className="h-3 w-3 text-bp-coral flex-shrink-0" />
              : <ChevronRight className="h-3 w-3 text-bp-coral flex-shrink-0" />}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-bp-coral">
              {overdue.length} overdue
            </span>
          </button>
          {showOverdue && <div className="space-y-1">{overdue.map(renderRow)}</div>}
        </div>
      )}

      <div className="text-[11px] text-bp-muted px-1">
        {upcoming.length} due in the next {daysAhead} days
      </div>

      {grouped.length === 0 ? (
        <WidgetEmpty icon={Calendar} message={`Nothing due in the next ${daysAhead} days`} />
      ) : (
        <div className="space-y-2">
          {grouped.map(group => (
            <div key={group.key} className="space-y-1">
              <div className="flex items-center gap-1.5 px-1">
                {group.color
                  ? <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                  : <Folder className="h-3 w-3 text-bp-muted flex-shrink-0" />}
                <span className="text-[10px] font-semibold uppercase tracking-wide text-bp-muted truncate">
                  {group.projectName}
                </span>
                <span className="text-[10px] tabular-nums text-bp-muted opacity-70">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-1">{group.items.map(renderRow)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

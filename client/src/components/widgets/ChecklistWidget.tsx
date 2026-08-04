import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  X,
  Check,
  Circle,
  Calendar,
  ExternalLink,
  CheckCircle2,
  EyeOff,
  ArrowRight,
  AlertCircle
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type ChecklistInstance, type ChecklistInstanceGroup, type ChecklistInstanceItem } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { format } from "date-fns";

interface ChecklistInstanceWithCounts extends ChecklistInstance {
  completedCount: number;
  totalCount: number;
}

interface ChecklistGroupWithItems extends ChecklistInstanceGroup {
  items?: ChecklistInstanceItem[];
  completedCount?: number;
  totalCount?: number;
}

type StatusFilter = "all" | "active" | "in_progress" | "completed" | "actionable";

const COLLAPSED_STATE_KEY = "checklist-widget-collapsed";

function getStoredCollapsedState(projectId: string): { checklists: string[]; groups: string[] } {
  try {
    const stored = localStorage.getItem(`${COLLAPSED_STATE_KEY}-${projectId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { checklists: [], groups: [] };
}

function saveCollapsedState(projectId: string, checklists: string[], groups: string[]) {
  try {
    localStorage.setItem(`${COLLAPSED_STATE_KEY}-${projectId}`, JSON.stringify({ checklists, groups }));
  } catch {}
}

// Stable fallback: a literal [] default in the query destructure creates a
// new array identity every render while the query loads, which re-fires the
// header-actions effect and loops the dashboard into "maximum update depth".
const EMPTY_CHECKLISTS: ChecklistInstanceWithCounts[] = [];

// Due-date chip: nothing when unset, muted normally, amber within 2 days,
// coral when overdue (completed things never alarm).
function DueChip({ date, completed }: { date: Date | string | null | undefined; completed: boolean }) {
  if (!date) return null;
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

  let style: React.CSSProperties | undefined;
  let className = "bg-muted text-muted-foreground";
  if (!completed && diffDays < 0) {
    className = "";
    style = { backgroundColor: "hsl(var(--coral-light))", color: "hsl(11 52% 38%)" };
  } else if (!completed && diffDays <= 2) {
    className = "";
    style = { backgroundColor: "hsl(var(--amber-light))", color: "hsl(42 45% 30%)" };
  }

  return (
    <span
      className={`flex items-center gap-0.5 text-2xs font-medium px-1 py-px rounded-full flex-shrink-0 tabular-nums ${className}`}
      style={style}
    >
      <Calendar className="h-2.5 w-2.5" />
      {format(new Date(date), "MMM d")}
    </span>
  );
}

function getStatusBadgeTone(status: string): StatusTone {
  const tones: Record<string, StatusTone> = {
    'active': 'info',
    'in_progress': 'warning',
    'completed': 'success',
    'cancelled': 'neutral',
  };
  return tones[status] || tones.active;
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    'active': 'Upcoming',
    'in_progress': 'Action',
    'completed': 'Done',
    'cancelled': 'Cancelled',
  };
  return labels[status] || 'Upcoming';
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Shared data hooks — the drawer and the inline accordion read the same groups
// query and tick items through the same optimistic mutation.
// ---------------------------------------------------------------------------

function useInstanceGroups(instanceId: string) {
  return useQuery<ChecklistGroupWithItems[]>({
    queryKey: ["/api/checklist-instances", instanceId, "groups"],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instances/${instanceId}/groups`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch groups");
      const data = await response.json();
      // Authored order, with name as the tie-break for legacy rows.
      return data.sort((a: ChecklistGroupWithItems, b: ChecklistGroupWithItems) =>
        (a.order ?? 0) - (b.order ?? 0) || (a.name || '').localeCompare(b.name || ''));
    },
  });
}

type ToggleItemVars = { itemId: string; groupId: string | null; data: Record<string, any> };

// Optimistic toggle: the tick flips instantly and every progress count that
// shows it — the item list, the group row, the instance row — follows in the
// same pass, so the ~400ms Neon round trip settles in the background.
// `itemsKey` is whichever item cache the caller reads from: the drawer's
// per-group list, or the inline accordion's whole-instance list.
function useChecklistItemToggle({
  itemsKey,
  instanceId,
  projectId,
}: {
  itemsKey: unknown[];
  instanceId: string;
  projectId: string;
}) {
  return useMutation({
    mutationFn: async ({ itemId, data }: ToggleItemVars) => {
      return apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", data);
    },
    onMutate: async ({ itemId, groupId, data }) => {
      const groupsKey = ["/api/checklist-instances", instanceId, "groups"];
      const instancesKey = ["/api/checklist-instances", projectId];
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const prevItems = queryClient.getQueryData<ChecklistInstanceItem[]>(itemsKey);
      const prevGroups = queryClient.getQueryData<ChecklistGroupWithItems[]>(groupsKey);
      const prevInstances = queryClient.getQueryData<ChecklistInstanceWithCounts[]>(instancesKey);

      const oldItem = prevItems?.find(i => i.id === itemId);
      const wasDone = oldItem?.status === "completed" || oldItem?.status === "na";
      const isDone = data.status === "completed" || data.status === "na";
      const delta = isDone === wasDone ? 0 : isDone ? 1 : -1;

      queryClient.setQueryData<ChecklistInstanceItem[]>(itemsKey, old =>
        (old || []).map(i => (i.id === itemId ? { ...i, ...data } : i)),
      );
      if (delta !== 0) {
        queryClient.setQueryData<ChecklistGroupWithItems[]>(groupsKey, old =>
          old?.map(g => g.id === groupId && g.completedCount != null
            ? { ...g, completedCount: g.completedCount + delta }
            : g),
        );
        queryClient.setQueryData<ChecklistInstanceWithCounts[]>(instancesKey, old =>
          old?.map(c => c.id === instanceId
            ? { ...c, completedCount: c.completedCount + delta }
            : c),
        );
      }
      return { prevItems, prevGroups, prevInstances, itemsKey, groupsKey, instancesKey };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevItems) queryClient.setQueryData(ctx.itemsKey, ctx.prevItems);
      if (ctx.prevGroups) queryClient.setQueryData(ctx.groupsKey, ctx.prevGroups);
      if (ctx.prevInstances) queryClient.setQueryData(ctx.instancesKey, ctx.prevInstances);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: itemsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances"] });
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-items"
      });
    },
  });
}

// The tick payload, shared so the drawer and the inline rows write identical rows.
function toggleItemPayload(
  item: ChecklistInstanceItem,
  currentUser?: { id: string; name?: string | null } | null,
): ToggleItemVars {
  const isCompleting = item.status !== "completed";
  return {
    itemId: item.id,
    groupId: item.groupId,
    data: {
      status: isCompleting ? "completed" : "pending",
      completedAt: isCompleting ? new Date().toISOString() : null,
      completedBy: isCompleting ? currentUser?.id : null,
      completedByName: isCompleting ? currentUser?.name : null,
    },
  };
}

export default function ChecklistWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions }: WidgetProps) {
  const { user: currentUser } = useAuth();
  const maxChecklists = widget.config?.maxChecklists || 10;
  const wrapText = widget.config?.wrapText || false;
  const savedStatusFilter = (widget.config?.statusFilter as StatusFilter) || "all";
  const savedAssigneeFilter = widget.config?.assigneeFilter || "all";
  const savedHideCompletedGroups = widget.config?.hideCompletedGroups || false;
  const savedHideCompletedChecklists = widget.config?.hideCompletedChecklists || false;
  const savedHideCompletedItems = widget.config?.hideCompletedItems || false;

  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxChecklists, setConfigMaxChecklists] = useState(maxChecklists);
  const [configWrapText, setConfigWrapText] = useState(wrapText);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(savedStatusFilter);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(savedAssigneeFilter);
  const [hideCompletedGroups, setHideCompletedGroups] = useState<boolean>(savedHideCompletedGroups);
  const [hideCompletedChecklists, setHideCompletedChecklists] = useState<boolean>(savedHideCompletedChecklists);
  const [hideCompletedItems, setHideCompletedItems] = useState<boolean>(savedHideCompletedItems);
  const [hideMenuOpen, setHideMenuOpen] = useState(false);

  // Side drawer: open/closed, and which checklist group it shows (null = list)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Inline accordion in the widget body. Deliberately not persisted — a
  // dashboard should come back collapsed, unlike the drawer's saved state.
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());

  const { currentProject } = useProject();
  const [, setLocation] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxChecklists(widget.config?.maxChecklists || 10);
    setConfigWrapText(widget.config?.wrapText || false);
  }, [widget.title, widget.config]);

  useEffect(() => {
    if (currentProject?.id) {
      const stored = getStoredCollapsedState(currentProject.id);
      setExpandedGroups(new Set(stored.groups));
    }
  }, [currentProject?.id]);

  const { data: checklists = EMPTY_CHECKLISTS, isLoading, isError, refetch } = useQuery<ChecklistInstanceWithCounts[]>({
    queryKey: ["/api/checklist-instances", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/checklist-instances?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });

  const uniqueAssignees = useMemo(() => {
    const assigneeMap = new Map<string, { id: string; name: string }>();
    checklists.forEach(c => {
      if (c.assigneeId && c.assigneeName) {
        assigneeMap.set(c.assigneeId, { id: c.assigneeId, name: c.assigneeName });
      }
    });
    return Array.from(assigneeMap.values());
  }, [checklists]);

  const filteredChecklists = useMemo(() => {
    return checklists
      .filter(checklist => {
        if (statusFilter === "actionable") {
          if (checklist.status !== "in_progress" && checklist.status !== "active") return false;
        } else if (statusFilter !== "all" && checklist.status !== statusFilter) {
          return false;
        }
        // Hide completed groups (top level instances)
        if (hideCompletedGroups && checklist.status === "completed") return false;
        if (assigneeFilter !== "all" && checklist.assigneeId !== assigneeFilter) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [checklists, statusFilter, assigneeFilter, hideCompletedGroups]);

  const displayChecklists = useMemo(
    () => (maxChecklists > 0 ? filteredChecklists.slice(0, maxChecklists) : filteredChecklists),
    [filteredChecklists, maxChecklists],
  );

  const activeInstance = activeInstanceId
    ? checklists.find(c => c.id === activeInstanceId)
    : undefined;

  const openDetail = (id: string) => {
    setActiveInstanceId(id);
    setDrawerOpen(true);
  };
  const openList = () => {
    setActiveInstanceId(null);
    setDrawerOpen(true);
  };

  const toggleInstance = (instanceId: string) => {
    setExpandedInstances(prev => {
      const next = new Set(prev);
      if (next.has(instanceId)) next.delete(instanceId);
      else next.add(instanceId);
      return next;
    });
  };

  const handleToggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, [], Array.from(next));
      }
      return next;
    });
  };

  const anyHideActive = hideCompletedGroups || hideCompletedChecklists || hideCompletedItems;
  const stageHide = (key: string, value: boolean) => {
    onUpdate?.({ ...widget, config: { ...widget.config, [key]: value } });
  };

  // Header row: hide-completed menu + hover arrow opening the drawer
  useEffect(() => {
    onSetHeaderActions?.(
      currentProject ? (
        <>
          <Popover open={hideMenuOpen} onOpenChange={setHideMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-6 w-6 ${anyHideActive ? "text-primary" : ""}`}
                    data-testid="checklist-widget-toggle-hide-completed"
                    aria-label="Hide completed"
                  >
                    {anyHideActive ? <EyeOff className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Hide completed</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-48 p-2" align="end">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Hide completed
              </p>
              <div className="space-y-1">
                {([
                  { key: "hideCompletedGroups", label: "Groups", value: hideCompletedGroups, set: setHideCompletedGroups },
                  { key: "hideCompletedChecklists", label: "Checklists", value: hideCompletedChecklists, set: setHideCompletedChecklists },
                  { key: "hideCompletedItems", label: "Items", value: hideCompletedItems, set: setHideCompletedItems },
                ] as const).map(opt => (
                  <div
                    key={opt.key}
                    className="flex items-center gap-2 py-1 px-1 rounded hover-elevate cursor-pointer"
                    onClick={() => { opt.set(!opt.value); stageHide(opt.key, !opt.value); }}
                  >
                    <Checkbox checked={opt.value} className="h-3.5 w-3.5 pointer-events-none" />
                    <span className="text-xs">{opt.label}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                onClick={openList}
                data-testid="checklist-widget-view-all"
                aria-label="Open checklists"
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">All checklists</TooltipContent>
          </Tooltip>
        </>
      ) : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id, hideMenuOpen, hideCompletedGroups, hideCompletedChecklists, hideCompletedItems]);

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view checklists
      </div>
    );
  }

  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: {
            ...widget.config,
            maxChecklists: configMaxChecklists,
            wrapText: configWrapText,
            statusFilter: statusFilter,
            assigneeFilter: assigneeFilter,
            hideCompletedGroups: hideCompletedGroups,
            hideCompletedChecklists: hideCompletedChecklists,
            hideCompletedItems: hideCompletedItems,
          }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxChecklists(widget.config?.maxChecklists || 10);
      setConfigWrapText(widget.config?.wrapText || false);
      onCloseConfig?.();
    };

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="checklist-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Filters
          </p>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 text-xs" data-testid="checklist-config-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="actionable">Actionable</SelectItem>
              <SelectItem value="active">Upcoming</SelectItem>
              <SelectItem value="in_progress">Action</SelectItem>
              <SelectItem value="completed">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 text-xs" data-testid="checklist-config-assignee-filter">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {uniqueAssignees.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Display
          </p>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Limit checklists shown</Label>
            <Switch
              checked={configMaxChecklists > 0}
              onCheckedChange={(checked) => setConfigMaxChecklists(checked ? 10 : 0)}
            />
          </div>
          {configMaxChecklists > 0 && (
            <Input
              type="number"
              min={1}
              max={50}
              value={configMaxChecklists}
              onChange={(e) => setConfigMaxChecklists(parseInt(e.target.value) || 10)}
              className="h-8 text-xs w-20"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Wrap long text</Label>
            <Switch checked={configWrapText} onCheckedChange={setConfigWrapText} />
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Hide completed
          </p>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Items</Label>
            <Switch checked={hideCompletedItems} onCheckedChange={setHideCompletedItems} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Checklists</Label>
            <Switch checked={hideCompletedChecklists} onCheckedChange={setHideCompletedChecklists} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-normal">Groups</Label>
            <Switch checked={hideCompletedGroups} onCheckedChange={setHideCompletedGroups} />
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-7 px-3 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  const instanceRow = (checklist: ChecklistInstanceWithCounts, inDrawer: boolean) => {
    const progressPercent = checklist.totalCount > 0
      ? Math.round((checklist.completedCount / checklist.totalCount) * 100)
      : 0;
    // In the widget body the row is an accordion header; in the drawer list it
    // still opens the detail pane, which is the only thing it can do there.
    const isExpanded = !inDrawer && expandedInstances.has(checklist.id);
    const row = (
      <div
        className={`group/row flex items-center gap-2 rounded-md hover:bg-muted/60 cursor-pointer ${inDrawer ? "px-2 py-2" : "px-1.5 py-1.5"}`}
        data-testid={`checklist-widget-item-${checklist.id}`}
        onClick={() => (inDrawer ? openDetail(checklist.id) : toggleInstance(checklist.id))}
        aria-expanded={inDrawer ? undefined : isExpanded}
      >
        {!inDrawer && (
          <ChevronRight
            className={`h-3 w-3 text-muted-foreground flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        )}

        <TaskTooltip content={checklist.name}>
          <span className={`text-sm flex-1 min-w-0 ${wrapText && !inDrawer ? "" : "truncate"}`}>
            {checklist.name}
          </span>
        </TaskTooltip>

        <StatusBadge
          status={checklist.status}
          tone={getStatusBadgeTone(checklist.status)}
          label={getStatusLabel(checklist.status)}
          className="flex-shrink-0 no-default-hover-elevate no-default-active-elevate"
        />

        <DueChip date={checklist.dueDate} completed={checklist.status === "completed"} />

        {checklist.assigneeName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-4 w-4 flex-shrink-0">
                <AvatarFallback className="text-2xs bg-primary/10 text-primary">
                  {getInitials(checklist.assigneeName)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{checklist.assigneeName}</p>
            </TooltipContent>
          </Tooltip>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          <Progress value={progressPercent} className="h-1.5 w-12" />
          <span className="text-data text-muted-foreground tabular-nums">
            {checklist.completedCount}/{checklist.totalCount}
          </span>
        </div>

        {/* The drawer used to be a plain row click; now the row expands, so the
            detail pane moves to a hover affordance. */}
        {!inDrawer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 flex-shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); openDetail(checklist.id); }}
                data-testid={`checklist-widget-open-${checklist.id}`}
                aria-label={`Open ${checklist.name}`}
              >
                <ArrowRight className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Open</TooltipContent>
          </Tooltip>
        )}
      </div>
    );

    if (inDrawer) return <div key={checklist.id}>{row}</div>;

    return (
      <div key={checklist.id}>
        {row}
        {isExpanded && (
          <InlineInstanceContent
            instanceId={checklist.id}
            projectId={currentProject.id}
            wrapText={wrapText}
            hideCompletedChecklists={hideCompletedChecklists}
            hideCompletedItems={hideCompletedItems}
            currentUser={currentUser as { id: string; name?: string | null } | null}
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-0.5">
        {isLoading ? (
          <div className="space-y-1.5 py-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-2 px-1 py-1.5">
                <div className="h-3.5 bg-muted rounded flex-1" />
                <div className="h-3.5 bg-muted rounded w-10" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Couldn't load checklists
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : displayChecklists.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            {(statusFilter !== "all" || assigneeFilter !== "all") ? "No checklists match filters" : "No checklists yet"}
          </div>
        ) : (
          displayChecklists.map((checklist) => instanceRow(checklist, false))
        )}
      </div>

      {/* Right-hand drawer: all checklist groups, or one group in detail */}
      <Sheet open={drawerOpen} onOpenChange={open => { setDrawerOpen(open); if (!open) setActiveInstanceId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          {!activeInstance ? (
            <>
              <SheetHeader className="px-5 pt-5 pb-2">
                <SheetTitle className="flex items-center justify-between text-base">
                  <span>Checklists</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 mr-6"
                        onClick={() => setLocation(`/projects/${currentProject.id}/checklists`)}
                        aria-label="Open checklists page"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Checklists page</TooltipContent>
                  </Tooltip>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {filteredChecklists.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    No checklists yet
                  </div>
                ) : (
                  filteredChecklists.map((checklist) => instanceRow(checklist, true))
                )}
              </div>
            </>
          ) : (
            <InstanceDetail
              instance={activeInstance}
              projectId={currentProject.id}
              onBack={() => setActiveInstanceId(null)}
              expandedGroups={expandedGroups}
              onToggleGroup={handleToggleGroup}
              hideCompletedChecklists={hideCompletedChecklists}
              hideCompletedItems={hideCompletedItems}
              currentUser={currentUser as { id: string; name?: string | null } | null}
              onOpenPage={() => setLocation(`/projects/${currentProject.id}/checklists/${activeInstance.id}`)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Inline accordion body: the expanded contents of one instance, rendered in
// the widget itself. Both queries are lazy — this only mounts once its row is
// expanded, so a collapsed dashboard still fetches nothing but the counts.
// One request covers every item in the instance, rather than the drawer's
// request-per-checklist.
// ---------------------------------------------------------------------------
function InlineInstanceContent({
  instanceId,
  projectId,
  wrapText,
  hideCompletedChecklists,
  hideCompletedItems,
  currentUser,
}: {
  instanceId: string;
  projectId: string;
  wrapText: boolean;
  hideCompletedChecklists: boolean;
  hideCompletedItems: boolean;
  currentUser?: { id: string; name?: string | null } | null;
}) {
  const { data: groups = [] } = useInstanceGroups(instanceId);

  const itemsKey = useMemo(
    () => ["/api/checklist-instances", instanceId, "items"],
    [instanceId],
  );

  const { data: items = [], isLoading, isError, refetch } = useQuery<ChecklistInstanceItem[]>({
    queryKey: itemsKey,
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instances/${instanceId}/items`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    },
  });

  const updateItemMutation = useChecklistItemToggle({ itemsKey, instanceId, projectId });

  // Items arrive already ordered by groupOrder then order, so bucketing by
  // group preserves the authored sequence. Rows whose group is missing (legacy
  // items, or ones filed straight on the instance) fall back to the copied
  // group name and sit after the real groups.
  const sections = useMemo(() => {
    const known = new Map(groups.map(g => [g.id, g]));
    const buckets = new Map<string, { key: string; name: string; items: ChecklistInstanceItem[] }>();

    for (const item of items) {
      const group = item.groupId ? known.get(item.groupId) : undefined;
      const key = group ? group.id : `orphan:${item.groupName || ""}`;
      const bucket = buckets.get(key)
        ?? { key, name: group?.name ?? item.groupName ?? "", items: [] };
      bucket.items.push(item);
      buckets.set(key, bucket);
    }

    // Real groups first, in authored order, then whatever's left over.
    const ordered = groups
      .map(g => buckets.get(g.id))
      .filter((b): b is NonNullable<typeof b> => !!b);
    const leftovers = Array.from(buckets.values()).filter(b => !known.has(b.key));

    return [...ordered, ...leftovers].filter(section => {
      if (!hideCompletedChecklists) return true;
      return known.get(section.key)?.status !== "completed";
    });
  }, [groups, items, hideCompletedChecklists]);

  const toggleItemComplete = (item: ChecklistInstanceItem) => {
    updateItemMutation.mutate(toggleItemPayload(item, currentUser));
  };

  return (
    <div
      className="ml-3 pl-2.5 border-l border-border space-y-1 py-1"
      data-testid={`checklist-widget-expanded-${instanceId}`}
    >
      {isLoading ? (
        <div className="text-2xs text-muted-foreground py-1 animate-pulse">Loading…</div>
      ) : isError ? (
        <button
          className="text-2xs text-muted-foreground hover:text-foreground py-1"
          onClick={() => refetch()}
        >
          Couldn't load — tap to retry
        </button>
      ) : sections.length === 0 ? (
        <div className="text-2xs text-muted-foreground py-1">No items</div>
      ) : (
        sections.map(section => {
          const done = section.items.filter(i => i.status === "completed" || i.status === "na").length;
          const visible = section.items.filter(
            item => !hideCompletedItems || (item.status !== "completed" && item.status !== "na"),
          );
          if (visible.length === 0) return null;
          return (
            <div key={section.key} data-testid={`checklist-widget-section-${section.key}`}>
              {section.name && (
                <div className="flex items-center gap-1.5 px-1 pt-0.5">
                  <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide truncate">
                    {section.name}
                  </span>
                  <span className="text-2xs text-muted-foreground tabular-nums flex-shrink-0 ml-auto">
                    {done}/{section.items.length}
                  </span>
                </div>
              )}
              {visible.map(item => (
                <div
                  key={item.id}
                  className="group/item flex items-start gap-1.5 px-1 py-0.5 rounded hover:bg-muted/50"
                  data-testid={`checklist-widget-inline-item-${item.id}`}
                >
                  <button
                    onClick={() => toggleItemComplete(item)}
                    className="flex-shrink-0 mt-px hover:scale-110 transition-transform"
                    data-testid={`checklist-widget-inline-toggle-${item.id}`}
                    aria-label={item.status === "completed" ? `Untick ${item.description}` : `Tick ${item.description}`}
                  >
                    {item.status === "completed" ? (
                      <Check className="h-3 w-3 text-status-success" />
                    ) : item.status === "na" ? (
                      <X className="h-3 w-3 text-muted" />
                    ) : (
                      <Circle className="h-3 w-3 text-muted-foreground group-hover/item:text-primary" />
                    )}
                  </button>
                  <span
                    className={`text-xs leading-snug flex-1 min-w-0 ${wrapText ? "" : "truncate"} ${
                      item.status === "completed" ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {item.description}
                  </span>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer detail: one checklist group with its checklists and items
// ---------------------------------------------------------------------------
function InstanceDetail({
  instance,
  projectId,
  onBack,
  expandedGroups,
  onToggleGroup,
  hideCompletedChecklists,
  hideCompletedItems,
  currentUser,
  onOpenPage,
}: {
  instance: ChecklistInstanceWithCounts;
  projectId: string;
  onBack: () => void;
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  hideCompletedChecklists: boolean;
  hideCompletedItems: boolean;
  currentUser?: { id: string; name?: string | null } | null;
  onOpenPage: () => void;
}) {
  const progressPercent = instance.totalCount > 0
    ? Math.round((instance.completedCount / instance.totalCount) * 100)
    : 0;

  const {
    data: groups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    refetch: refetchGroups,
  } = useInstanceGroups(instance.id);

  return (
    <>
      <div className="flex items-center justify-between px-3 pt-3">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onBack}>
          <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
          Checklists
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 mr-6"
              onClick={onOpenPage}
              aria-label="Open on checklists page"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open full page</TooltipContent>
        </Tooltip>
      </div>

      <div className="px-5 pt-2 pb-3 border-b">
        <h3 className="text-base font-semibold leading-snug">{instance.name}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          <StatusBadge
            status={instance.status}
            tone={getStatusBadgeTone(instance.status)}
            label={getStatusLabel(instance.status)}
            className="no-default-hover-elevate no-default-active-elevate"
          />
          <DueChip date={instance.dueDate} completed={instance.status === "completed"} />
          {instance.assigneeName && (
            <span className="text-xs text-muted-foreground">{instance.assigneeName}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2.5">
          <Progress value={progressPercent} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {instance.completedCount}/{instance.totalCount}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {groupsLoading ? (
          <div className="text-xs text-muted-foreground text-center py-4 animate-pulse">Loading…</div>
        ) : groupsError ? (
          <button className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-4" onClick={() => refetchGroups()}>
            Couldn't load — tap to retry
          </button>
        ) : groups.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            No checklists in this group
          </div>
        ) : (
          groups
            .filter(group => !hideCompletedChecklists || group.status !== "completed")
            .map(group => (
              <DrawerChecklist
                key={group.id}
                group={group}
                instanceId={instance.id}
                projectId={projectId}
                isExpanded={expandedGroups.has(group.id)}
                onToggle={() => onToggleGroup(group.id)}
                hideCompletedItems={hideCompletedItems}
                currentUser={currentUser}
              />
            ))
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Drawer checklist: collapsible, items tick optimistically, due date editable
// ---------------------------------------------------------------------------
function DrawerChecklist({
  group,
  instanceId,
  projectId,
  isExpanded,
  onToggle,
  hideCompletedItems,
  currentUser,
}: {
  group: ChecklistGroupWithItems;
  instanceId: string;
  projectId: string;
  isExpanded: boolean;
  onToggle: () => void;
  hideCompletedItems: boolean;
  currentUser?: { id: string; name?: string | null } | null;
}) {
  const [dateOpen, setDateOpen] = useState(false);

  const dueDateMutation = useMutation({
    mutationFn: async (dueDate: string | null) =>
      apiRequest(`/api/checklist-instance-groups/${group.id}`, "PATCH", { dueDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", instanceId, "groups"] });
      setDateOpen(false);
    },
  });

  const itemsKey = useMemo(
    () => ["/api/checklist-instance-groups", group.id, "items"],
    [group.id],
  );

  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<ChecklistInstanceItem[]>({
    queryKey: itemsKey,
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instance-groups/${group.id}/items`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch items");
      const data = await response.json();
      // Authored order, with description as the tie-break for legacy rows.
      return data.sort((a: ChecklistInstanceItem, b: ChecklistInstanceItem) =>
        (a.order ?? 0) - (b.order ?? 0) || (a.description || '').localeCompare(b.description || ''));
    },
    enabled: isExpanded,
  });

  const completedCount = items.filter(i => i.status === "completed" || i.status === "na").length;
  const totalCount = items.length;

  const updateItemMutation = useChecklistItemToggle({ itemsKey, instanceId, projectId });

  const hasLoadedItems = isExpanded && items.length > 0;
  const progressTotal = hasLoadedItems ? items.length : (group.totalCount ?? 0);
  const progressDone = hasLoadedItems
    ? items.filter(i => i.status === "completed" || i.status === "na").length
    : (group.completedCount ?? 0);

  const toggleItemComplete = (item: ChecklistInstanceItem) => {
    updateItemMutation.mutate(toggleItemPayload(item, currentUser));
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div
          className="group/chk flex items-center gap-1.5 py-1.5 px-2 rounded-md hover:bg-muted/60 cursor-pointer"
          data-testid={`checklist-group-${group.id}`}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          )}

          <TaskTooltip content={group.name}>
            <span className="text-sm flex-1 min-w-0 truncate">{group.name}</span>
          </TaskTooltip>

          {/* Counts come from the server, so progress shows while collapsed;
              once expanded the loaded items drive it so an optimistic tick
              moves the number straight away. */}
          {progressTotal > 0 && (
            <span className="text-2xs text-muted-foreground tabular-nums flex-shrink-0">
              {progressDone}/{progressTotal}
            </span>
          )}

          <StatusBadge
            status={group.status}
            tone={getStatusBadgeTone(group.status)}
            label={getStatusLabel(group.status)}
            className="text-2xs flex-shrink-0 no-default-hover-elevate no-default-active-elevate"
          />

          {/* Due date: chip when set, hover calendar to add; editable here in the drawer */}
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className={`flex-shrink-0 rounded ${group.dueDate ? "" : "opacity-0 group-hover/chk:opacity-100 transition-opacity p-0.5 hover:bg-muted"}`}
                aria-label="Set due date"
                data-testid={`checklist-group-due-${group.id}`}
              >
                {group.dueDate
                  ? <DueChip date={group.dueDate} completed={group.status === "completed"} />
                  : <Calendar className="h-3 w-3 text-muted-foreground" />}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="end" onClick={(e) => e.stopPropagation()}>
              <input
                type="date"
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                value={group.dueDate ? format(new Date(group.dueDate), "yyyy-MM-dd") : ""}
                onChange={(e) => {
                  if (e.target.value) dueDateMutation.mutate(new Date(e.target.value).toISOString());
                }}
                data-testid={`checklist-group-due-input-${group.id}`}
              />
              {group.dueDate && (
                <button
                  className="block w-full mt-1.5 text-[11px] text-muted-foreground hover:text-foreground text-center"
                  onClick={() => dueDateMutation.mutate(null)}
                >
                  Clear due date
                </button>
              )}
            </PopoverContent>
          </Popover>

          {group.assigneeName && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-4 w-4 flex-shrink-0">
                  <AvatarFallback className="text-2xs bg-primary/10 text-primary">
                    {getInitials(group.assigneeName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{group.assigneeName}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {isExpanded && totalCount > 0 && (
            <span className="text-2xs text-muted-foreground tabular-nums flex-shrink-0">
              {completedCount}/{totalCount}
            </span>
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 pl-2.5 border-l border-muted space-y-0.5 py-1">
          {itemsLoading ? (
            <div className="text-xs text-muted-foreground py-1 animate-pulse">Loading…</div>
          ) : itemsError ? (
            <button className="text-xs text-muted-foreground hover:text-foreground py-1" onClick={() => refetchItems()}>
              Couldn't load — tap to retry
            </button>
          ) : items.length === 0 ? (
            <div className="text-xs text-muted-foreground py-1">No items</div>
          ) : (
            items
              .filter(item => !hideCompletedItems || (item.status !== "completed" && item.status !== "na"))
              .map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 py-1 group"
                data-testid={`checklist-item-${item.id}`}
              >
                <button
                  onClick={() => toggleItemComplete(item)}
                  className="flex-shrink-0 mt-0.5 hover:scale-110 transition-transform"
                  data-testid={`checklist-item-toggle-${item.id}`}
                >
                  {item.status === "completed" ? (
                    <Check className="h-3.5 w-3.5 text-status-success" />
                  ) : item.status === "na" ? (
                    <X className="h-3.5 w-3.5 text-muted" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                  )}
                </button>

                <span className={`text-sm flex-1 leading-snug ${
                  item.status === "completed" ? "line-through text-muted-foreground" : ""
                }`}>
                  {item.description}
                </span>
                {item.assigneeName && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Avatar className="h-4 w-4 flex-shrink-0 mt-0.5">
                        <AvatarFallback className="text-2xs bg-primary/20 text-primary">
                          {getInitials(item.assigneeName)}
                        </AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{item.assigneeName}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

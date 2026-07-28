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
    return (
      <div
        key={checklist.id}
        className={`flex items-center gap-2 rounded-md hover:bg-muted/60 cursor-pointer ${inDrawer ? "px-2 py-2" : "px-1.5 py-1.5"}`}
        data-testid={`checklist-widget-item-${checklist.id}`}
        onClick={() => openDetail(checklist.id)}
      >
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

  const { data: groups = [], isLoading: groupsLoading, isError: groupsError, refetch: refetchGroups } = useQuery<ChecklistGroupWithItems[]>({
    queryKey: ["/api/checklist-instances", instance.id, "groups"],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instances/${instance.id}/groups`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch groups");
      const data = await response.json();
      return data.sort((a: ChecklistGroupWithItems, b: ChecklistGroupWithItems) => (a.name || '').localeCompare(b.name || ''));
    },
  });

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

  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<ChecklistInstanceItem[]>({
    queryKey: ["/api/checklist-instance-groups", group.id, "items"],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instance-groups/${group.id}/items`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch items");
      const data = await response.json();
      return data.sort((a: ChecklistInstanceItem, b: ChecklistInstanceItem) => (a.description || '').localeCompare(b.description || ''));
    },
    enabled: isExpanded,
  });

  const completedCount = items.filter(i => i.status === "completed" || i.status === "na").length;
  const totalCount = items.length;

  // Optimistic toggle: tick flips instantly and progress counts follow;
  // the ~400ms Neon round trip settles in the background.
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Record<string, any> }) => {
      return apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", data);
    },
    onMutate: async ({ itemId, data }) => {
      const itemsKey = ["/api/checklist-instance-groups", group.id, "items"];
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
          old?.map(g => g.id === group.id && g.completedCount != null
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
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instance-groups", group.id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", instanceId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances"] });
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "/api/checklist-items"
      });
    },
  });

  const toggleItemComplete = (item: ChecklistInstanceItem) => {
    const isCompleting = item.status !== "completed";
    const newStatus = isCompleting ? "completed" : "pending";
    updateItemMutation.mutate({
      itemId: item.id,
      data: {
        status: newStatus,
        completedAt: isCompleting ? new Date().toISOString() : null,
        completedBy: isCompleting ? currentUser?.id : null,
        completedByName: isCompleting ? currentUser?.name : null,
      }
    });
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

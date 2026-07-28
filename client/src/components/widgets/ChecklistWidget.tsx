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
import { 
  ChevronRight,
  ChevronDown,
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

// Stable fallback: a literal [] default in the query destructure creates a
// new array identity every render while the query loads, which re-fires the
// header-actions effect and loops the dashboard into "maximum update depth".
const EMPTY_CHECKLISTS: ChecklistInstanceWithCounts[] = [];

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
  const [expandedChecklists, setExpandedChecklists] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const { currentProject } = useProject();
  
  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxChecklists(widget.config?.maxChecklists || 10);
    setConfigWrapText(widget.config?.wrapText || false);
  }, [widget.title, widget.config]);

  useEffect(() => {
    if (currentProject?.id) {
      const stored = getStoredCollapsedState(currentProject.id);
      setExpandedChecklists(new Set(stored.checklists));
      setExpandedGroups(new Set(stored.groups));
    }
  }, [currentProject?.id]);
  const [, setLocation] = useLocation();
  
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

  // Memoized so the header-actions effect (which depends on it) doesn't
  // fire on every render — a fresh array identity each render caused an
  // infinite update loop with the parent's header-actions state.
  const displayChecklists = useMemo(
    () => (maxChecklists > 0 ? filteredChecklists.slice(0, maxChecklists) : filteredChecklists),
    [filteredChecklists, maxChecklists],
  );


  const toggleChecklist = (id: string) => {
    setExpandedChecklists(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, Array.from(next), Array.from(expandedGroups));
      }
      return next;
    });
  };

  const handleToggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, Array.from(expandedChecklists), Array.from(next));
      }
      return next;
    });
  };

  const getStatusBadgeTone = (status: string): StatusTone => {
    const tones: Record<string, StatusTone> = {
      'active': 'info',
      'in_progress': 'warning',
      'completed': 'success',
      'cancelled': 'neutral',
    };
    return tones[status] || tones.active;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'active': 'Upcoming',
      'in_progress': 'Action',
      'completed': 'Done',
      'cancelled': 'Cancelled',
    };
    return labels[status] || 'Upcoming';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const allExpanded = displayChecklists.length > 0 && displayChecklists.every(c => expandedChecklists.has(c.id));

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedChecklists(new Set());
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, [], Array.from(expandedGroups));
      }
    } else {
      const allIds = new Set(displayChecklists.map(c => c.id));
      setExpandedChecklists(allIds);
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, Array.from(allIds), Array.from(expandedGroups));
      }
    }
  };

  const anyHideActive = hideCompletedGroups || hideCompletedChecklists || hideCompletedItems;
  const stageHide = (key: string, value: boolean) => {
    onUpdate?.({ ...widget, config: { ...widget.config, [key]: value } });
  };

  // Header row: hide-completed menu, expand/collapse all, hover arrow → checklists page
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
                className="h-6 w-6"
                onClick={toggleAll}
                data-testid="checklist-widget-toggle-all"
                aria-label={allExpanded ? "Collapse all" : "Expand all"}
              >
                {allExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{allExpanded ? "Collapse all" : "Expand all"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                onClick={() => setLocation(`/projects/${currentProject.id}/checklists`)}
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
  }, [currentProject?.id, hideMenuOpen, hideCompletedGroups, hideCompletedChecklists, hideCompletedItems, allExpanded, displayChecklists, expandedGroups]);

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

  return (
    <div className="space-y-1">
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse border rounded-md p-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-muted rounded" />
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                    <div className="h-2 bg-muted rounded w-1/2" />
                  </div>
                </div>
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
          displayChecklists.map((checklist) => (
            <ChecklistAccordionItem
              key={checklist.id}
              checklist={checklist}
              isExpanded={expandedChecklists.has(checklist.id)}
              onToggle={() => toggleChecklist(checklist.id)}
              wrapText={wrapText}
              projectId={currentProject.id}
              getStatusBadgeTone={getStatusBadgeTone}
              getStatusLabel={getStatusLabel}
              getInitials={getInitials}
              expandedGroups={expandedGroups}
              onToggleGroup={handleToggleGroup}
              hideCompletedChecklists={hideCompletedChecklists}
              hideCompletedItems={hideCompletedItems}
              currentUser={currentUser}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChecklistAccordionItem({
  checklist,
  isExpanded,
  onToggle,
  wrapText,
  projectId,
  getStatusBadgeTone,
  getStatusLabel,
  getInitials,
  expandedGroups,
  onToggleGroup,
  hideCompletedChecklists,
  hideCompletedItems,
  currentUser,
}: {
  checklist: ChecklistInstanceWithCounts;
  isExpanded: boolean;
  onToggle: () => void;
  wrapText: boolean;
  projectId: string;
  getStatusBadgeTone: (status: string) => StatusTone;
  getStatusLabel: (status: string) => string;
  getInitials: (name: string) => string;
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
  hideCompletedChecklists: boolean;
  hideCompletedItems: boolean;
  currentUser?: { id: string; name?: string | null } | null;
}) {
  const [, setLocation] = useLocation();
  const progressPercent = checklist.totalCount > 0 
    ? Math.round((checklist.completedCount / checklist.totalCount) * 100) 
    : 0;

  const { data: groups = [], isLoading: groupsLoading, isError: groupsError, refetch: refetchGroups } = useQuery<ChecklistGroupWithItems[]>({
    queryKey: ["/api/checklist-instances", checklist.id, "groups"],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instances/${checklist.id}/groups`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch groups");
      const data = await response.json();
      return data.sort((a: ChecklistGroupWithItems, b: ChecklistGroupWithItems) => (a.name || '').localeCompare(b.name || ''));
    },
    enabled: isExpanded,
  });

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-md overflow-hidden">
        <CollapsibleTrigger asChild>
          <div 
            className="flex items-center gap-2 py-1.5 px-2 hover-elevate cursor-pointer pt-[0px] pb-[0px]"
            data-testid={`checklist-widget-item-${checklist.id}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            
            <TaskTooltip content={checklist.name}>
              <span className={`text-xs font-medium flex-1 min-w-0 ${wrapText ? '' : 'truncate'}`}>
                {checklist.name}
              </span>
            </TaskTooltip>
            
            <StatusBadge
              status={checklist.status}
              tone={getStatusBadgeTone(checklist.status)}
              label={getStatusLabel(checklist.status)}
              className="flex-shrink-0 no-default-hover-elevate no-default-active-elevate"
            />
            
            {checklist.dueDate && (
              <div className="flex items-center gap-0.5 text-data text-muted-foreground flex-shrink-0">
                <Calendar className="h-2.5 w-2.5" />
                {format(new Date(checklist.dueDate), "MMM d")}
              </div>
            )}
            
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
              <span className="text-data text-muted-foreground">
                {checklist.completedCount}/{checklist.totalCount}
              </span>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setLocation(`/projects/${projectId}/checklists/${checklist.id}`);
              }}
              data-testid={`checklist-open-${checklist.id}`}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border-t bg-muted/30 px-2 py-1 space-y-0.5">
            {groupsLoading ? (
              <div className="text-data text-muted-foreground text-center py-1 animate-pulse">
                Loading…
              </div>
            ) : groupsError ? (
              <button className="w-full text-data text-muted-foreground hover:text-foreground text-center py-1" onClick={() => refetchGroups()}>
                Couldn't load — tap to retry
              </button>
            ) : groups.length === 0 ? (
              <div className="text-data text-muted-foreground text-center py-1">
                No groups in this checklist
              </div>
            ) : (
              [...groups]
                .filter(group => !hideCompletedChecklists || group.status !== "completed")
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((group) => (
                  <ChecklistGroupItem
                    key={group.id}
                    group={group}
                    checklistId={checklist.id}
                    projectId={projectId}
                    wrapText={wrapText}
                    isExpanded={expandedGroups.has(group.id)}
                    onToggle={() => onToggleGroup(group.id)}
                    getStatusBadgeTone={getStatusBadgeTone}
                    getStatusLabel={getStatusLabel}
                    getInitials={getInitials}
                    hideCompletedItems={hideCompletedItems}
                    currentUser={currentUser}
                  />
                ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ChecklistGroupItem({
  group,
  checklistId,
  projectId,
  wrapText,
  isExpanded,
  onToggle,
  getStatusBadgeTone,
  getStatusLabel,
  getInitials,
  hideCompletedItems,
  currentUser,
}: {
  group: ChecklistGroupWithItems;
  checklistId: string;
  projectId: string;
  wrapText: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusBadgeTone: (status: string) => StatusTone;
  getStatusLabel: (status: string) => string;
  getInitials: (name: string) => string;
  hideCompletedItems: boolean;
  currentUser?: { id: string; name?: string | null } | null;
}) {
  const [, setLocation] = useLocation();

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
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Optimistic toggle: tick flips instantly and progress counts follow;
  // the ~400ms Neon round trip settles in the background.
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Record<string, any> }) => {
      return apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", data);
    },
    onMutate: async ({ itemId, data }) => {
      const itemsKey = ["/api/checklist-instance-groups", group.id, "items"];
      const groupsKey = ["/api/checklist-instances", checklistId, "groups"];
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
          old?.map(c => c.id === checklistId
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
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId, "groups"] });
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
          className="flex items-center gap-1 py-0.5 px-1 rounded hover-elevate cursor-pointer"
          data-testid={`checklist-group-${group.id}`}
        >
          {isExpanded ? (
            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
          )}
          
          <TaskTooltip content={group.name}>
            <span className={`text-data flex-1 min-w-0 pt-[1px] pb-[1px] ${wrapText ? '' : 'truncate'}`}>
              {group.name}
            </span>
          </TaskTooltip>

          <StatusBadge
            status={group.status}
            tone={getStatusBadgeTone(group.status)}
            label={getStatusLabel(group.status)}
            className="text-2xs px-0.5 h-3 flex-shrink-0 no-default-hover-elevate no-default-active-elevate"
          />

          {group.assigneeName && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-3 w-3 flex-shrink-0">
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
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Progress value={progressPercent} className="h-0.5 w-8" />
              <span className="text-2xs text-muted-foreground">
                {completedCount}/{totalCount}
              </span>
            </div>
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 pl-2 border-l border-muted space-y-0.5 py-1">
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
                className="flex items-center gap-2 py-0.5 group"
                data-testid={`checklist-item-${item.id}`}
              >
                <button
                  onClick={() => toggleItemComplete(item)}
                  className="flex-shrink-0 hover:scale-110 transition-transform"
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
                
                <TaskTooltip content={item.description}>
                  <span className={`text-xs flex-1 ${wrapText ? '' : 'truncate'} ${
                    item.status === "completed" ? "line-through text-muted-foreground" : ""
                  }`}>
                    {item.description}
                  </span>
                </TaskTooltip>
                {item.assigneeName && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Avatar className="h-4 w-4 flex-shrink-0">
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
